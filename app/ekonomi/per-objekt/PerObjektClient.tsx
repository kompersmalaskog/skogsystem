'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import EkonomiBottomNav from '../EkonomiBottomNav';

type PeriodType = 'D' | 'V' | 'M' | 'K' | 'A';

type MaskinTimpris = { maskin_id: string; maskin_namn: string | null; timpris: number; giltig_fran: string | null; giltig_till: string | null };

type MaskinDel = { maskin_id: string; maskin_namn: string; maskin_typ: string | null; timmar: number; timpeng: number };
type ObjektRad = {
  objekt_id: string;
  objekt_namn: string;
  vo_nummer: string | null;
  huvudtyp: string | null;
  timmar: number;
  timpeng: number;
  acord: number;            // summa från fortnox_invoice_rows
  acord_rader: number;      // antal fakturarader
  skillnad: number;         // acord − timpeng
  volym_m3fub: number;
  maskiner: MaskinDel[];
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getPeriodDates(p: PeriodType, offset: number) {
  const now = new Date();
  if (p === 'D') {
    const d = new Date(now); d.setDate(now.getDate() + offset);
    return { start: fmtDate(d), end: fmtDate(d) };
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
    return { start: fmtDate(new Date(y, qi * 3, 1)), end: fmtDate(new Date(y, qi * 3 + 3, 0)) };
  }
  if (p === 'A') {
    const y = now.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtDate(ms), end: fmtDate(me) };
}

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

function isValidOn(d: string, giltig_fran: string | null, giltig_till: string | null) {
  if (giltig_fran && d < giltig_fran) return false;
  if (giltig_till && d > giltig_till) return false;
  return true;
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

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function formatTim(n: number) { return `${n.toFixed(1)} h`; }

export default function PerObjektClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rader, setRader] = useState<ObjektRad[]>([]);
  const [expandedObjektId, setExpandedObjektId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [tidRows, prodRows, invoiceRows, objRes, maskinRes, timprisRes] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, objekt_id, engine_time_sek, processing_sek')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_produktion')
            .select('datum, maskin_id, objekt_id, volym_m3sub')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fortnox_invoice_rows')
            .select('invoice_date, total, matched_objekt_id, manual_objekt_id')
            .gte('invoice_date', start).lte('invoice_date', end)
            .range(from, to)
        ),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, atgard'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
      ]);

      const objMap: Record<string, any> = {};
      for (const o of (objRes.data || [])) objMap[o.objekt_id] = o;
      const maskinMap: Record<string, any> = {};
      for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;
      const timprisList: MaskinTimpris[] = timprisRes.data || [];

      // Aggregera timmar/timpeng per (objekt, maskin)
      type Key = string;
      type Agg = { objekt_id: string; maskin_id: string; timmar: number; timpeng: number };
      const aggMap: Record<Key, Agg> = {};
      for (const r of tidRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!aggMap[key]) aggMap[key] = { objekt_id: r.objekt_id, maskin_id: r.maskin_id, timmar: 0, timpeng: 0 };
        const sek = r.engine_time_sek || 0;
        const t = sek / 3600;
        aggMap[key].timmar += t;
        const tp = timprisList.find(p => p.maskin_id === r.maskin_id && isValidOn(r.datum, p.giltig_fran, p.giltig_till));
        aggMap[key].timpeng += t * (tp?.timpris || 0);
      }

      // Volym per objekt från produktion
      const volPerObjekt: Record<string, number> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        volPerObjekt[r.objekt_id] = (volPerObjekt[r.objekt_id] || 0) + (r.volym_m3sub || 0);
      }

      // Acord per objekt från fakturarader (manual_objekt_id har företräde)
      const acordPerObjekt: Record<string, { total: number; antal: number }> = {};
      for (const r of invoiceRows) {
        const oid = r.manual_objekt_id || r.matched_objekt_id;
        if (!oid) continue;
        if (!acordPerObjekt[oid]) acordPerObjekt[oid] = { total: 0, antal: 0 };
        acordPerObjekt[oid].total += Number(r.total) || 0;
        acordPerObjekt[oid].antal += 1;
      }

      // Bygg per-objekt-rader
      type ObjAgg = { timmar: number; timpeng: number; maskiner: MaskinDel[] };
      const objAgg: Record<string, ObjAgg> = {};
      for (const a of Object.values(aggMap)) {
        if (!objAgg[a.objekt_id]) objAgg[a.objekt_id] = { timmar: 0, timpeng: 0, maskiner: [] };
        const obj = objAgg[a.objekt_id];
        obj.timmar += a.timmar;
        obj.timpeng += a.timpeng;
        const tp = timprisList.find(p => p.maskin_id === a.maskin_id);
        const maskinInfo = maskinMap[a.maskin_id];
        obj.maskiner.push({
          maskin_id: a.maskin_id,
          maskin_namn: tp?.maskin_namn || maskinInfo?.modell || a.maskin_id,
          maskin_typ: maskinInfo?.maskin_typ || null,
          timmar: a.timmar,
          timpeng: a.timpeng,
        });
      }

      // Ta med objekt som har timmar ELLER acord
      const allaObjektIds = new Set<string>([...Object.keys(objAgg), ...Object.keys(acordPerObjekt)]);

      const list: ObjektRad[] = Array.from(allaObjektIds)
        .map(objekt_id => {
          const v = objAgg[objekt_id] || { timmar: 0, timpeng: 0, maskiner: [] };
          const a = acordPerObjekt[objekt_id] || { total: 0, antal: 0 };
          const o = objMap[objekt_id];
          return {
            objekt_id,
            objekt_namn: o?.object_name || o?.vo_nummer || objekt_id,
            vo_nummer: o?.vo_nummer || null,
            huvudtyp: o?.huvudtyp || null,
            timmar: v.timmar,
            timpeng: v.timpeng,
            acord: a.total,
            acord_rader: a.antal,
            skillnad: a.total - v.timpeng,
            volym_m3fub: volPerObjekt[objekt_id] || 0,
            maskiner: v.maskiner.sort((x, y) => y.timpeng - x.timpeng),
          };
        })
        .filter(r => r.timmar > 0 || r.acord > 0)
        .sort((x, y) => Math.abs(y.skillnad) - Math.abs(x.skillnad));

      setRader(list);
    } catch (err) {
      console.error('PerObjekt: fetch error', err);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalTimmar = rader.reduce((s, r) => s + r.timmar, 0);
  const totalTimpeng = rader.reduce((s, r) => s + r.timpeng, 0);
  const totalAcord = rader.reduce((s, r) => s + r.acord, 0);
  const totalSkillnad = totalAcord - totalTimpeng;
  const finnsAcordData = rader.some(r => r.acord > 0);

  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 16, paddingBottom: 130, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 120, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 } as const,
    kpiVal: { fontFamily: "'Fraunces', serif", fontSize: 26, lineHeight: 1, fontWeight: 500 },
    kpiLabel: { fontSize: 10, color: '#7a7a72', marginTop: 3, textTransform: 'uppercase' as const, letterSpacing: 0.6, fontWeight: 600 },
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 20, padding: '0 4px' } as const,
    pill: { display: 'inline-block', fontSize: 9, padding: '2px 8px', borderRadius: 999, fontWeight: 600, letterSpacing: 0.3 } as const,
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Per objekt</div>
        <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 2 }}>Timpeng (G15h × timpris) mot acord (fakturerat per VO).</div>
      </div>

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
          {/* Sammanfattning */}
          <div style={{ ...s.card, margin: '16px 0' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(90,255,140,0.95)' }}>{formatKr(totalTimpeng)}</div>
                <div style={s.kpiLabel}>Timpeng</div>
                <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 2 }}>{formatTim(totalTimmar)} G15h</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: finnsAcordData ? 'rgba(91,143,255,0.95)' : '#4a4a44' }}>
                  {finnsAcordData ? formatKr(totalAcord) : '—'}
                </div>
                <div style={s.kpiLabel}>Acord</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  ...s.kpiVal,
                  color: !finnsAcordData ? '#4a4a44'
                    : totalSkillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)',
                }}>
                  {finnsAcordData ? `${totalSkillnad >= 0 ? '+' : ''}${formatKr(totalSkillnad)}` : '—'}
                </div>
                <div style={s.kpiLabel}>Skillnad</div>
              </div>
            </div>
            {!finnsAcordData && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#7a7a72', lineHeight: 1.5 }}>
                Ingen faktura-data hittad för denna period. Kör <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>POST /api/fortnox/sync-invoices?full=1</code>. Omappade rader hanteras i Inställningar.
              </div>
            )}
          </div>

          {/* Lista */}
          {rader.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72', fontSize: 13 }}>
              Ingen tidsdata för vald period.
            </div>
          )}

          {rader.map(r => {
            const isExpanded = expandedObjektId === r.objekt_id;
            const typeBadge = r.huvudtyp ? (
              <span style={{
                ...s.pill,
                color: r.huvudtyp === 'Slutavverkning' ? 'rgba(90,255,140,0.85)' : 'rgba(255,179,64,0.9)',
                background: r.huvudtyp === 'Slutavverkning' ? 'rgba(90,255,140,0.08)' : 'rgba(255,179,64,0.08)',
              } as any}>
                {r.huvudtyp === 'Slutavverkning' ? 'SLUT' : r.huvudtyp.toUpperCase()}
              </span>
            ) : null;
            return (
              <div key={r.objekt_id} style={{ ...s.card, marginBottom: 10, cursor: 'pointer' }}
                onClick={() => setExpandedObjektId(isExpanded ? null : r.objekt_id)}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      {typeBadge}
                      <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.objekt_namn}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#7a7a72' }}>
                      {r.vo_nummer ? `VO ${r.vo_nummer}` : ''}
                      {r.volym_m3fub > 0 && <span>{r.vo_nummer ? ' · ' : ''}{Math.round(r.volym_m3fub).toLocaleString('sv-SE')} m³</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {r.acord > 0 ? (
                      <>
                        <div style={{
                          fontFamily: "'Fraunces', serif", fontSize: 20,
                          color: r.skillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)',
                        }}>
                          {r.skillnad >= 0 ? '+' : ''}{formatKr(r.skillnad)}
                        </div>
                        <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Skillnad</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: 'rgba(90,255,140,0.95)' }}>{formatKr(r.timpeng)}</div>
                        <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Timpeng</div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
                  <Metric label="G15h" value={formatTim(r.timmar)} color="#e8e8e4" />
                  <Metric label="Timpeng" value={formatKr(r.timpeng)} color="#e8e8e4" />
                  <Metric label="Acord" value={r.acord > 0 ? formatKr(r.acord) : '—'} color={r.acord > 0 ? 'rgba(91,143,255,0.95)' : '#4a4a44'} />
                  <Metric
                    label="Skillnad"
                    value={r.acord > 0 ? `${r.skillnad >= 0 ? '+' : ''}${formatKr(r.skillnad)}` : '—'}
                    color={r.acord === 0 ? '#4a4a44'
                      : r.skillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)'}
                  />
                </div>
                {isExpanded && r.maskiner.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Per maskin</div>
                    {r.maskiner.map(m => (
                      <div key={m.maskin_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            ...s.pill,
                            color: m.maskin_typ === 'Harvester' ? 'rgba(90,255,140,0.85)' : 'rgba(91,143,255,0.9)',
                            background: m.maskin_typ === 'Harvester' ? 'rgba(90,255,140,0.08)' : 'rgba(91,143,255,0.1)',
                          } as any}>
                            {m.maskin_typ === 'Harvester' ? 'SKÖRD' : m.maskin_typ === 'Forwarder' ? 'SKOT' : 'MASK'}
                          </span>
                          <span>{m.maskin_namn}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>{formatTim(m.timmar)}</span>
                          <span style={{ marginLeft: 12, fontVariantNumeric: 'tabular-nums' }}>{formatKr(m.timpeng)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 12, padding: '0 4px', lineHeight: 1.5 }}>
            G15h = <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>engine_time_sek</code> summerat per (datum, maskin, objekt).
            Timpris hämtas från <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>maskin_timpris</code> med temporal uppslagning per rad-datum.
          </div>
        </div>
      )}
      <EkonomiBottomNav />
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: "'Fraunces', serif", color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
