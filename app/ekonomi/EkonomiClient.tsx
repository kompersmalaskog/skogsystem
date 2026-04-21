'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type PeriodType = 'D' | 'V' | 'M' | 'K' | 'A';

type AcordPris = { medelstam: number; pris_total: number; pris_skordare: number; pris_skotare: number; giltig_fran: string | null; giltig_till: string | null };
type MaskinTimpris = { maskin_id: string; maskin_namn: string | null; timpris: number; giltig_fran: string | null; giltig_till: string | null };
type ObjektMeta = { objekt_id: string; object_name: string | null; vo_nummer: string | null; huvudtyp: string | null; atgard: string | null; timpeng: boolean | null };
type MaskinMeta = { maskin_id: string; modell: string | null; maskin_typ: string | null };

type DagRad = {
  datum: string;
  maskin_id: string;
  maskin_namn: string;
  objekt_id: string;
  objekt_namn: string;
  volym: number;
  medelstam: number;
  pris_total: number;
  intakt: number;
  timmar: number;
  timpris: number;
  timpeng_belopp: number;
  diff: number;
};

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getPeriodDates(p: PeriodType, offset: number) {
  const now = new Date();
  if (p === 'D') {
    const d = new Date(now); d.setDate(now.getDate() + offset);
    const s = fmtDate(d);
    return { start: s, end: s };
  }
  if (p === 'V') {
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: fmtDate(mon), end: fmtDate(sun) };
  }
  if (p === 'K') {
    const cq = Math.floor(now.getMonth() / 3);
    const tq = now.getFullYear() * 4 + cq + offset;
    const y = Math.floor(tq / 4);
    const qi = ((tq % 4) + 4) % 4;
    const qs = new Date(y, qi * 3, 1);
    const qe = new Date(y, qi * 3 + 3, 0);
    return { start: fmtDate(qs), end: fmtDate(qe) };
  }
  if (p === 'A') {
    const y = now.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtDate(ms), end: fmtDate(me) };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function getPeriodLabel(p: PeriodType, offset: number) {
  const { start } = getPeriodDates(p, offset);
  const d = new Date(start);
  if (p === 'D') return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (p === 'V') {
    const oj = new Date(d.getFullYear(), 0, 1);
    const wn = Math.ceil(((d.getTime() - oj.getTime()) / 86400000 + oj.getDay() + 1) / 7);
    return `V${wn} ${d.getFullYear()}`;
  }
  if (p === 'M') return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (p === 'K') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return `${d.getFullYear()}`;
}

async function fetchAllRows(queryFn: (from: number, to: number) => Promise<{ data: any[] | null }>): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await queryFn(offset, offset + PAGE - 1);
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function lookupAcordPris(medelstam: number, acord: AcordPris[]): AcordPris | null {
  if (!acord.length) return null;
  let best = acord[0];
  let bestDiff = Math.abs(acord[0].medelstam - medelstam);
  for (const p of acord) {
    const d = Math.abs(p.medelstam - medelstam);
    if (d < bestDiff) { bestDiff = d; best = p; }
  }
  return best;
}

function isValidOn(d: string, giltig_fran: string | null, giltig_till: string | null) {
  if (giltig_fran && d < giltig_fran) return false;
  if (giltig_till && d > giltig_till) return false;
  return true;
}

function formatKr(n: number) {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

export default function EkonomiClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rader, setRader] = useState<DagRad[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [prodRows, tidRows, objRes, maskinRes, acordRes, timprisRes] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_produktion')
            .select('datum, maskin_id, objekt_id, stammar, volym_m3sub')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, objekt_id, engine_time_sek, processing_sek')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, atgard, timpeng'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
      ]);

      const objMap: Record<string, ObjektMeta> = {};
      for (const o of (objRes.data || [])) objMap[o.objekt_id] = o;

      const maskinMap: Record<string, MaskinMeta> = {};
      for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;

      const timprisList: MaskinTimpris[] = timprisRes.data || [];
      const acord: AcordPris[] = acordRes.data || [];

      // Aggregate prod per (datum, maskin, objekt)
      type Key = string;
      type ProdAgg = { datum: string; maskin_id: string; objekt_id: string; volym: number; stammar: number };
      const prodMap: Record<Key, ProdAgg> = {};
      for (const r of prodRows) {
        const key = `${r.datum}|${r.maskin_id}|${r.objekt_id}`;
        if (!prodMap[key]) prodMap[key] = { datum: r.datum, maskin_id: r.maskin_id, objekt_id: r.objekt_id, volym: 0, stammar: 0 };
        prodMap[key].volym += r.volym_m3sub || 0;
        prodMap[key].stammar += r.stammar || 0;
      }

      // Aggregate tid per (datum, maskin) — engine_time in seconds
      type TidAgg = { timmar: number };
      const tidMap: Record<string, TidAgg> = {};
      for (const r of tidRows) {
        const key = `${r.datum}|${r.maskin_id}`;
        if (!tidMap[key]) tidMap[key] = { timmar: 0 };
        const sek = (r.engine_time_sek || r.processing_sek || 0);
        tidMap[key].timmar += sek / 3600;
      }

      // Build rows — one per (datum, maskin, objekt) where there is production
      const rader: DagRad[] = Object.values(prodMap)
        .filter(p => p.volym > 0 && p.stammar > 0)
        .map(p => {
          const obj = objMap[p.objekt_id];
          const maskin = maskinMap[p.maskin_id];
          const timpris = timprisList.find(t =>
            t.maskin_id === p.maskin_id && isValidOn(p.datum, t.giltig_fran, t.giltig_till)
          );
          const medelstam = p.volym / p.stammar;
          const acordOnDate = acord.filter(a => isValidOn(p.datum, a.giltig_fran, a.giltig_till));
          const acordPris = lookupAcordPris(medelstam, acordOnDate);
          const pris_total = acordPris?.pris_total || 0;
          const intakt = p.volym * pris_total;

          // Hours allocated proportionally to this machine's day — since tid is per (datum, maskin),
          // we split among objects on that day by volume share.
          const dayMaskinKey = `${p.datum}|${p.maskin_id}`;
          const totVolDay = Object.values(prodMap)
            .filter(x => x.datum === p.datum && x.maskin_id === p.maskin_id)
            .reduce((s, x) => s + x.volym, 0);
          const andel = totVolDay > 0 ? p.volym / totVolDay : 0;
          const timmar = (tidMap[dayMaskinKey]?.timmar || 0) * andel;
          const timprisKr = timpris?.timpris || 0;
          const timpeng_belopp = timmar * timprisKr;

          return {
            datum: p.datum,
            maskin_id: p.maskin_id,
            maskin_namn: timpris?.maskin_namn || maskin?.modell || p.maskin_id,
            objekt_id: p.objekt_id,
            objekt_namn: obj?.object_name || obj?.vo_nummer || p.objekt_id || '—',
            volym: p.volym,
            medelstam: parseFloat(medelstam.toFixed(3)),
            pris_total,
            intakt,
            timmar: parseFloat(timmar.toFixed(2)),
            timpris: timprisKr,
            timpeng_belopp,
            diff: intakt - timpeng_belopp,
          };
        })
        .sort((a, b) => a.datum === b.datum ? a.maskin_namn.localeCompare(b.maskin_namn) : a.datum.localeCompare(b.datum));

      setRader(rader);
    } catch (err) {
      console.error('Ekonomi: fetch error', err);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sumIntakt = rader.reduce((s, r) => s + r.intakt, 0);
  const sumTimpeng = rader.reduce((s, r) => s + r.timpeng_belopp, 0);
  // Kostnad: lönekostnad ej implementerat ännu — använd timpeng som proxy
  const sumKostnad = sumTimpeng;
  const sumVinst = sumIntakt - sumKostnad;
  const diffVsTimpeng = sumIntakt - sumTimpeng;

  // Build per-day aggregation for chart
  const perDag = useMemo(() => {
    const m: Record<string, { datum: string; intakt: number; timpeng: number }> = {};
    for (const r of rader) {
      if (!m[r.datum]) m[r.datum] = { datum: r.datum, intakt: 0, timpeng: 0 };
      m[r.datum].intakt += r.intakt;
      m[r.datum].timpeng += r.timpeng_belopp;
    }
    return Object.values(m).sort((a, b) => a.datum.localeCompare(b.datum));
  }, [rader]);

  // Styles — matches affarsuppfoljning / app-wide convention
  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 24, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 120, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 } as const,
    kpiVal: { fontFamily: "'Fraunces', serif", fontSize: 26, lineHeight: 1, fontWeight: 500 },
    kpiLabel: { fontSize: 10, color: '#7a7a72', marginTop: 3, textTransform: 'uppercase' as const, letterSpacing: 0.6, fontWeight: 600 },
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 20, padding: '0 4px' } as const,
    th: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.6, color: '#7a7a72', textAlign: 'left' as const, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
    td: { fontSize: 12, color: '#e8e8e4', padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' as const },
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Ekonomi</div>
          <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 2 }}>Intäkt · kostnad · vinst. Acord vs timpeng.</div>
        </div>
        <Link href="/ekonomi/installningar" style={{ textDecoration: 'none' }} aria-label="Prisinställningar">
          <button style={{
            width: 40, height: 40, borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
            color: '#bfcab9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>settings</span>
          </button>
        </Link>
      </div>

      {/* Period picker */}
      <div style={{ ...s.filterBar, marginTop: 16 }}>
        {(['D', 'V', 'M', 'K', 'A'] as PeriodType[]).map(p => (
          <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            onClick={() => { setPeriod(p); setPeriodOffset(0); }}>
            {p === 'D' ? 'Dag' : p === 'V' ? 'Vecka' : p === 'M' ? 'Månad' : p === 'K' ? 'Kvartal' : 'År'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.arrow} onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
        <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
        <button style={s.arrow} onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && (
        <div style={{ padding: '0 16px' }}>
          {/* Summary card */}
          <div style={{ ...s.card, margin: '16px 0' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(90,255,140,0.95)' }}>{formatKr(sumIntakt)}</div>
                <div style={s.kpiLabel}>Intäkt</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(255,179,64,0.95)' }}>{formatKr(sumKostnad)}</div>
                <div style={s.kpiLabel}>Kostnad</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: sumVinst >= 0 ? '#e8e8e4' : 'rgba(255,90,90,0.9)' }}>{formatKr(sumVinst)}</div>
                <div style={s.kpiLabel}>Vinst</div>
              </div>
            </div>
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)',
              fontSize: 12, color: '#bfcab9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ color: '#7a7a72', fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' }}>Vs timpeng</span>
              <span style={{ fontWeight: 600, color: diffVsTimpeng >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)' }}>
                {diffVsTimpeng >= 0 ? '+' : ''}{formatKr(diffVsTimpeng)}
                <span style={{ color: '#7a7a72', fontWeight: 400, marginLeft: 6 }}>
                  ({diffVsTimpeng >= 0 ? 'acord lönar sig' : 'timpeng lönar sig'})
                </span>
              </span>
            </div>
          </div>

          {/* Chart */}
          {perDag.length > 0 && (
            <>
              <div style={s.sectionTitle}>Intäkt vs timpeng per dag</div>
              <div style={{ ...s.card, padding: 14 }}>
                <LineChart perDag={perDag} />
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#bfcab9' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 2, background: 'rgba(90,255,140,0.8)' }} /> Intäkt (acord)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 2, background: 'rgba(255,179,64,0.8)' }} /> Timpeng
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Daily table */}
          <div style={s.sectionTitle}>Per dag · maskin · objekt</div>
          <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Datum</th>
                    <th style={s.th}>Maskin</th>
                    <th style={s.th}>Objekt</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>m³</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Intäkt</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Timpeng</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {rader.map((r, i) => {
                    const d = new Date(r.datum);
                    const datumLabel = `${d.getDate()} ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
                    const diffColor = r.diff >= 0 ? 'rgba(90,255,140,0.9)' : 'rgba(255,90,90,0.9)';
                    return (
                      <tr key={i}>
                        <td style={s.td}>{datumLabel}</td>
                        <td style={s.td}>{r.maskin_namn}</td>
                        <td style={s.td}>{r.objekt_namn}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.volym).toLocaleString('sv-SE')}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatKr(r.intakt)}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{formatKr(r.timpeng_belopp)}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diffColor, fontWeight: 600 }}>
                          {r.diff >= 0 ? '+' : ''}{formatKr(r.diff)}
                        </td>
                      </tr>
                    );
                  })}
                  {rader.length === 0 && (
                    <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#7a7a72', padding: '32px 10px' }}>Ingen data för vald period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 12, padding: '0 4px', lineHeight: 1.5 }}>
            Priser slås upp per närmaste medelstam i <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>acord_priser</code>.
            Timmar fördelas per maskin &amp; dag proportionellt mot volym per objekt.
            Lönekostnad ej implementerad — kostnadssiffran använder timpeng som proxy.
          </div>
        </div>
      )}
    </div>
  );
}

function LineChart({ perDag }: { perDag: { datum: string; intakt: number; timpeng: number }[] }) {
  const W = 640, H = 180, P = { t: 12, r: 12, b: 24, l: 48 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const maxY = Math.max(1, ...perDag.map(d => Math.max(d.intakt, d.timpeng)));
  const yTick = (maxY / 3);

  const xOf = (i: number) => P.l + (perDag.length <= 1 ? iw / 2 : (i / (perDag.length - 1)) * iw);
  const yOf = (v: number) => P.t + ih - (v / maxY) * ih;

  const path = (key: 'intakt' | 'timpeng') =>
    perDag.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {/* Y gridlines */}
      {[0, 1, 2, 3].map(t => {
        const v = t * yTick;
        const y = yOf(v);
        return (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
            <text x={P.l - 8} y={y + 3} fill="#7a7a72" fontSize="9" textAnchor="end" fontFamily="inherit">
              {Math.round(v / 1000)}k
            </text>
          </g>
        );
      })}
      {/* X labels — first, middle, last */}
      {perDag.length > 0 && [0, Math.floor(perDag.length / 2), perDag.length - 1].filter((v, i, arr) => arr.indexOf(v) === i).map(i => {
        const d = new Date(perDag[i].datum);
        return (
          <text key={i} x={xOf(i)} y={H - 6} fill="#7a7a72" fontSize="9" textAnchor="middle" fontFamily="inherit">
            {d.getDate()} {MONTH_NAMES[d.getMonth()].toLowerCase()}
          </text>
        );
      })}
      {/* Paths */}
      <path d={path('timpeng')} stroke="rgba(255,179,64,0.8)" strokeWidth="1.5" fill="none" />
      <path d={path('intakt')} stroke="rgba(90,255,140,0.9)" strokeWidth="1.5" fill="none" />
      {/* Points */}
      {perDag.map((d, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(d.timpeng)} r="2" fill="rgba(255,179,64,0.9)" />
          <circle cx={xOf(i)} cy={yOf(d.intakt)} r="2" fill="rgba(90,255,140,0.95)" />
        </g>
      ))}
    </svg>
  );
}
