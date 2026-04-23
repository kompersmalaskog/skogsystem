'use client';

import { useEffect, useState, useCallback } from 'react';
import EkonomiBottomNav from '../EkonomiBottomNav';

type PeriodType = 'D' | 'V' | 'M' | 'K' | 'A';

type MaskinResult = {
  maskin_id: string;
  maskin_namn: string;
  maskin_typ: string | null;
  kostnadsstalle: { kod: string; namn?: string };
  kostnadsstallen?: { kod: string; namn?: string }[];
  ok: boolean;
  fel?: string;
  intakter?: number;
  kostnader?: { drivmedel: number; drift_service: number; loner: number; ovrigt: number; total: number };
  resultat?: number;
};

type Sammanfattning = {
  ok: boolean;
  intakter: number;
  kostnader: { drivmedel: number; drift_service: number; loner: number; ovrigt: number; total: number };
  resultat: number;
};

type OvrigtCc = {
  kod: string;
  namn?: string;
  intakter: number;
  kostnader: { drivmedel: number; drift_service: number; loner: number; ovrigt: number; total: number };
  resultat: number;
};

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

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }

export default function ResultatClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskiner, setMaskiner] = useState<MaskinResult[]>([]);
  const [foretagetTotalt, setForetagetTotalt] = useState<Sammanfattning | null>(null);
  const [utanKost, setUtanKost] = useState<Sammanfattning | null>(null);
  const [ovriga, setOvriga] = useState<OvrigtCc[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      const r = await fetch(`/api/fortnox/result-per-costcenter?fromdate=${start}&todate=${end}`, { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) {
        setMaskiner([]);
        setForetagetTotalt(null);
        setUtanKost(null);
        setOvriga([]);
        setError(body.meddelande || `HTTP ${r.status}`);
        return;
      }
      setMaskiner(body.maskiner || []);
      setForetagetTotalt(body.foretaget_totalt || null);
      setUtanKost(body.utan_kostnadsstalle || null);
      setOvriga(body.ovriga_kostnadsstallen || []);
    } catch (e: any) {
      setError(e?.message || String(e));
      setMaskiner([]);
      setForetagetTotalt(null);
      setUtanKost(null);
      setOvriga([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    pill: { display: 'inline-block', fontSize: 10, color: '#7a7a72', padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 999, fontWeight: 600, letterSpacing: 0.3 } as const,
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Resultat</div>
        <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 2 }}>Per kostnadsställe från Fortnox. Mappning görs i Inställningar.</div>
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

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar från Fortnox...</div>}

      {!loading && error && (
        <div style={{ margin: '16px', padding: 14, background: 'rgba(255,90,90,0.08)', border: '1px solid rgba(255,90,90,0.3)', color: 'rgba(255,160,160,0.95)', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Kunde inte hämta resultat</div>
          <div>{error}</div>
          {error.includes('costcenter') || error.toLowerCase().includes('404') ? (
            <div style={{ marginTop: 8, color: 'rgba(255,200,200,0.75)' }}>
              Tips: Kontrollera att Fortnox är anslutet (Admin → Lönesystem) och att kostnadsställe-mappningen är ifylld i Inställningar.
            </div>
          ) : null}
        </div>
      )}

      {!loading && !error && (
        <div style={{ padding: '0 16px' }}>
          {/* Företaget totalt — alla rader i perioden oavsett kostnadsställe */}
          <div style={s.sectionTitle}>Företaget totalt</div>
          <div style={{ ...s.card, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(90,255,140,0.95)' }}>{formatKr(foretagetTotalt?.intakter || 0)}</div>
                <div style={s.kpiLabel}>Intäkter</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(255,179,64,0.95)' }}>{formatKr(foretagetTotalt?.kostnader.total || 0)}</div>
                <div style={s.kpiLabel}>Kostnader</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: (foretagetTotalt?.resultat || 0) >= 0 ? '#e8e8e4' : 'rgba(255,90,90,0.9)' }}>{formatKr(foretagetTotalt?.resultat || 0)}</div>
                <div style={s.kpiLabel}>Resultat</div>
              </div>
            </div>
          </div>

          {maskiner.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72', fontSize: 13 }}>
              Inga kostnadsställe-mappningar hittades. Lägg till i <strong>Inställningar → Kostnadsställe per maskin</strong>.
            </div>
          )}

          {/* Per maskin */}
          {maskiner.length > 0 && <div style={s.sectionTitle}>Per maskin</div>}
          {maskiner.map(m => (
            <div key={m.maskin_id} style={{ ...s.card, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{m.maskin_namn}</div>
                  <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(m.kostnadsstallen && m.kostnadsstallen.length > 0 ? m.kostnadsstallen : [m.kostnadsstalle]).map(cc => (
                      <span key={cc.kod} style={s.pill} title={cc.namn || ''}>{cc.kod}</span>
                    ))}
                    {m.kostnadsstalle.namn && (!m.kostnadsstallen || m.kostnadsstallen.length <= 1) && <span style={{ fontSize: 11, color: '#7a7a72' }}>{m.kostnadsstalle.namn}</span>}
                    {m.maskin_typ && (
                      <span style={{ ...s.pill, color: m.maskin_typ === 'Harvester' ? 'rgba(90,255,140,0.85)' : 'rgba(91,143,255,0.9)', background: m.maskin_typ === 'Harvester' ? 'rgba(90,255,140,0.08)' : 'rgba(91,143,255,0.1)' }}>
                        {m.maskin_typ === 'Harvester' ? 'SKÖRD' : 'SKOT'}
                      </span>
                    )}
                  </div>
                </div>
                {m.ok ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: (m.resultat || 0) >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)' }}>
                      {formatKr(m.resultat || 0)}
                    </div>
                    <div style={{ fontSize: 10, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Resultat</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'rgba(255,160,160,0.9)', maxWidth: 200, textAlign: 'right' }}>
                    {m.fel}
                  </div>
                )}
              </div>
              {m.ok && m.kostnader && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, fontSize: 12 }}>
                  <Kpi label="Intäkter" value={m.intakter || 0} color="rgba(90,255,140,0.9)" />
                  <Kpi label="Drivmedel" value={m.kostnader.drivmedel} color="#bfcab9" />
                  <Kpi label="Drift & service" value={m.kostnader.drift_service} color="#bfcab9" />
                  <Kpi label="Löner" value={m.kostnader.loner} color="#bfcab9" />
                  <Kpi label="Övrigt" value={m.kostnader.ovrigt} color="#bfcab9" />
                </div>
              )}
            </div>
          ))}

          {/* Övriga kostnadsställen — finns i Fortnox men är inte maskin (M8 Lastbil, TRA VM Trailer, EWA osv). */}
          {ovriga.length > 0 && (
            <>
              <div style={s.sectionTitle}>Övriga kostnadsställen</div>
              {ovriga.map(o => (
                <div key={o.kod} style={{ ...s.card, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{o.namn || o.kod}</div>
                      <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={s.pill}>{o.kod}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: o.resultat >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)' }}>
                        {formatKr(o.resultat)}
                      </div>
                      <div style={{ fontSize: 10, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Resultat</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, fontSize: 12 }}>
                    <Kpi label="Intäkter" value={o.intakter} color="rgba(90,255,140,0.9)" />
                    <Kpi label="Drivmedel" value={o.kostnader.drivmedel} color="#bfcab9" />
                    <Kpi label="Drift & service" value={o.kostnader.drift_service} color="#bfcab9" />
                    <Kpi label="Löner" value={o.kostnader.loner} color="#bfcab9" />
                    <Kpi label="Övrigt" value={o.kostnader.ovrigt} color="#bfcab9" />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Utan kostnadsställe — rader som saknar CC. Ofta lastbil/löner/OH. */}
          {utanKost && (utanKost.intakter !== 0 || utanKost.kostnader.total !== 0) && (
            <>
              <div style={s.sectionTitle}>Utan kostnadsställe</div>
              <div style={{ ...s.card, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#7a7a72' }}>Rader där costcenter saknas i Fortnox</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: (utanKost.resultat || 0) >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)' }}>
                      {formatKr(utanKost.resultat)}
                    </div>
                    <div style={{ fontSize: 10, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Resultat</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, fontSize: 12 }}>
                  <Kpi label="Intäkter" value={utanKost.intakter} color="rgba(90,255,140,0.9)" />
                  <Kpi label="Drivmedel" value={utanKost.kostnader.drivmedel} color="#bfcab9" />
                  <Kpi label="Drift & service" value={utanKost.kostnader.drift_service} color="#bfcab9" />
                  <Kpi label="Löner" value={utanKost.kostnader.loner} color="#bfcab9" />
                  <Kpi label="Övrigt" value={utanKost.kostnader.ovrigt} color="#bfcab9" />
                </div>
              </div>
            </>
          )}

          <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 12, padding: '0 4px', lineHeight: 1.5 }}>
            Kategori-gruppering (BAS-plan): intäkter = 3xxx · drivmedel = 56xx · drift &amp; service = 50–55 + 57–59 · löner = 7xxx · övrigt = 4/6/8xxx.
          </div>
        </div>
      )}
      <EkonomiBottomNav />
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: "'Fraunces', serif", color, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value).toLocaleString('sv-SE')} kr
      </div>
    </div>
  );
}
