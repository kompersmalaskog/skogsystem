'use client';

// Per klass — i vilken medelstamklass lönar sig ackordet bäst mot timpeng?
// Svarar på "vilken sorts skog tjänar vi mest på".
//
// INGEN EGEN RÄKNING: samma per-objekt-rader som /ekonomi/mot-ackord
// (lib/ekonomi/objektJamforelse — delad funktion, vyerna kan inte drifta
// isär), här bara GRUPPERADE per medelstamklass (prisuppslagets närmaste
// acord_priser-klass). En klass total = summan av dess objekt i Mot ackord.
//
// TRE FÄRGER: grön = över timpeng, röd = under, bärnsten = preliminärt.

import { useEffect, useState, useCallback } from 'react';
import {
  hamtaObjektJamforelse, OSAKER_TIM,
  type ObjektRad, type MaskinDel,
} from '@/lib/ekonomi/objektJamforelse';
import { type PeriodType, getPeriodDates, getPeriodLabel } from '@/lib/ekonomi/period';
import EkonomiBottomNav from '../EkonomiBottomNav';

const GRON = '90,255,140';
const ROD = '255,90,90';
const BARNSTEN = '240,178,76';

type DelAgg = { ackord: number; timpeng: number; volym: number };
type KlassAgg = {
  klass: number;
  antal: number;
  volym: number;          // objektvolym (skördad, skotad som fallback)
  ackord: number;
  timpeng: number;
  diff: number;
  timmar: number;         // alla maskindelars G15-timmar — osäkert-märkningen
  skord: DelAgg;
  skot: DelAgg;
};

function fmtDiff(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function fmtKlass(k: number) { return k.toFixed(2).replace('.', ',').replace(/0$/, ''); }
function diffColor(n: number) { return n >= 0 ? `rgba(${GRON},0.9)` : `rgba(${ROD},0.9)`; }

export default function PerKlassClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rader, setRader] = useState<ObjektRad[]>([]);
  const [vantarAntal, setVantarAntal] = useState(0);
  const [timpengAntal, setTimpengAntal] = useState(0);
  const [ejJamforbara, setEjJamforbara] = useState<{ namn: string; orsak: string }[]>([]);
  const [oppenKlass, setOppenKlass] = useState<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      const data = await hamtaObjektJamforelse(start, end);
      setRader(data.rader);
      setVantarAntal(data.vantarNamn.length);
      setTimpengAntal(data.timpengAntal);
      setEjJamforbara(data.ejJamforbara);
    } catch (err: any) {
      console.error('PerKlass: fetch error', err);
      setError(err?.message || String(err));
      setRader([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Gruppering per medelstamklass — bara summering, ingen räkning ──
  const klasser: KlassAgg[] = (() => {
    const agg: Record<string, KlassAgg> = {};
    const del = (): DelAgg => ({ ackord: 0, timpeng: 0, volym: 0 });
    for (const o of rader) {
      if (o.klass == null) continue;
      const k = (agg[String(o.klass)] ||= {
        klass: o.klass, antal: 0, volym: 0, ackord: 0, timpeng: 0, diff: 0, timmar: 0,
        skord: del(), skot: del(),
      });
      k.antal += 1;
      k.volym += o.volym;
      k.ackord += o.ackord;
      k.timpeng += o.timpeng;
      k.diff += o.diff;
      for (const d of o.maskiner as MaskinDel[]) {
        k.timmar += d.timmar;
        const sida = d.roll === 'skördare' ? k.skord : k.skot;
        sida.ackord += d.ackord;
        sida.timpeng += d.timpeng;
        sida.volym += d.volym;
      }
    }
    return Object.values(agg).sort((a, b) => (b.diff / (b.volym || 1)) - (a.diff / (a.volym || 1)));
  })();

  const krPerM3 = (k: { diff: number; volym: number }) => k.volym > 0 ? k.diff / k.volym : 0;
  const maxAbs = klasser.reduce((mx, k) => Math.max(mx, Math.abs(krPerM3(k))), 0);
  const bast = klasser[0];
  const arOsaker = (k: KlassAgg) => k.timmar < OSAKER_TIM;

  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 24, paddingBottom: 120, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(255,255,255,0.12)', color: '#e8e8e4' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 104, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 32, padding: '0 4px' } as const,
    sheetH: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 } as const,
  };

  return (
    <div style={s.page}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&display=swap" />

      {/* Bara Månad/Kvartal/År — inget objekt avräknas på en dag */}
      <div style={s.filterBar}>
        {(['M', 'K', 'A'] as PeriodType[]).map(p => (
          <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            onClick={() => { setPeriod(p); setPeriodOffset(0); setOppenKlass(null); }}>
            {p === 'M' ? 'Månad' : p === 'K' ? 'Kvartal' : 'År'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.arrow} aria-label="Föregående period" onClick={() => { setPeriodOffset(o => o - 1); setOppenKlass(null); }}>&#8249;</button>
        <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
        <button style={s.arrow} aria-label="Nästa period" onClick={() => { setPeriodOffset(o => o + 1); setOppenKlass(null); }}>&#8250;</button>
        <button aria-label="Om beräkningen" onClick={() => setInfoOpen(true)} style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#7a7a72',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic', lineHeight: 1,
        }}>i</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && error && (
        <div style={{ margin: 16, padding: 14, background: `rgba(${ROD},0.08)`, border: `1px solid rgba(${ROD},0.3)`, color: 'rgba(255,160,160,0.95)', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Kunde inte läsa ackordsdata</div>
          <div>{error}</div>
          <button onClick={fetchData} style={{ marginTop: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e8e8e4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>Försök igen</button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ padding: '0 16px' }}>
          {klasser.length === 0 ? (
            /* Ärligt tomt — inte en tom lista som ser trasig ut */
            <div style={{ textAlign: 'center', padding: '56px 16px 8px' }}>
              <div style={{ fontSize: 13, color: '#7a7a72' }}>
                Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
              </div>
            </div>
          ) : (
            /* Hero — klassen som går bäst mot timpeng */
            <div style={{ textAlign: 'center', padding: '56px 8px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#7a7a72' }}>
                Bäst mot timpeng
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 40, lineHeight: 1.1, fontWeight: 500, color: diffColor(krPerM3(bast)), marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                {fmtKlass(bast.klass)}-klassen
              </div>
              <div style={{ fontSize: 15, color: diffColor(krPerM3(bast)), marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDiff(krPerM3(bast))} kr/m³ mot timpeng
              </div>
              <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 8 }}>
                {klasser.length} klasser · {rader.length} objekt avräknade{arOsaker(bast) && ' · bästa klassen vilar på få timmar — osäkert'}
              </div>
            </div>
          )}

          {vantarAntal > 0 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                background: `rgba(${BARNSTEN},0.10)`, color: `rgba(${BARNSTEN},0.85)`,
                fontSize: 11, fontWeight: 500,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: `rgba(${BARNSTEN},0.8)`, flexShrink: 0 }} />
                {vantarAntal} preliminär{vantarAntal === 1 ? 't' : 'a'} objekt ej med
              </div>
            </div>
          )}

          {ejJamforbara.length > 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 8px', lineHeight: 1.6, textAlign: 'center' }}>
              {ejJamforbara.map((o, i) => (
                <div key={i}>{o.namn} — {o.orsak}. Kan inte jämföras ärligt — står utanför talen.</div>
              ))}
            </div>
          )}

          {klasser.length > 0 && (
            <>
              <div style={s.sectionTitle}>Per medelstamklass</div>
              <div style={{ ...s.card, padding: '0 16px' }}>
                {klasser.map((k, i) => {
                  const kr = krPerM3(k);
                  const andel = maxAbs > 0 ? Math.abs(kr) / maxAbs : 0;
                  const oppen = oppenKlass === k.klass;
                  const delKr = (d: DelAgg) => d.volym > 0 ? (d.ackord - d.timpeng) / d.volym : null;
                  return (
                    <div key={k.klass} style={{
                      padding: '16px 0',
                      borderBottom: i < klasser.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                    }}>
                      <div onClick={() => setOppenKlass(oppen ? null : k.klass)} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e4' }}>
                              {fmtKlass(k.klass)}
                              <span style={{ color: '#7a7a72', fontWeight: 400, fontSize: 12 }}> medelstam</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>
                              ackord {k.volym > 0 ? Math.round(k.ackord / k.volym) : '—'} · timpeng {k.volym > 0 ? Math.round(k.timpeng / k.volym) : '—'} kr/m³
                              {' · '}{Math.round(k.volym).toLocaleString('sv-SE')} m³fub · {k.antal} objekt
                              {arOsaker(k) && ' · få timmar — osäkert'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: diffColor(kr), fontVariantNumeric: 'tabular-nums' }}>
                              {fmtDiff(kr)} kr/m³
                            </div>
                            <span style={{ fontSize: 11, color: '#7a7a72', transform: oppen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                          </div>
                        </div>
                        {/* |kr/m³| relativt största klassen — på RADENS bredd så
                            längderna är jämförbara mellan rader */}
                        <div style={{ marginTop: 8, height: 3, borderRadius: 2, width: `${andel * 100}%`, background: 'rgba(122,122,114,0.5)' }} />
                      </div>
                      {oppen && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid rgba(255,255,255,0.07)', display: 'grid', gap: 6 }}>
                          {([['Skördare', k.skord], ['Skotare', k.skot]] as [string, DelAgg][]).map(([namn, d]) => (
                            <div key={namn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                              <span style={{ color: '#7a7a72' }}>{namn} · {Math.round(d.volym).toLocaleString('sv-SE')} m³fub</span>
                              {delKr(d) != null ? (
                                <span style={{ color: diffColor(delKr(d)!), fontVariantNumeric: 'tabular-nums' }}>{fmtDiff(delKr(d)!)} kr/m³</span>
                              ) : (
                                <span style={{ color: '#7a7a72' }}>—</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {timpengAntal > 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 4px', textAlign: 'center' }}>
              {timpengAntal} objekt avräknade på timpeng i perioden — ingen ackordjämförelse.
            </div>
          )}
        </div>
      )}

      {/* (i)-sheet */}
      {infoOpen && (
        <>
          <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: '#1a1a18', borderRadius: '20px 20px 0 0',
            padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
            fontFamily: "'Geist', system-ui, sans-serif", color: '#e8e8e4',
          }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '4px auto 18px' }} />
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Per klass — hur räknas det?</div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>I vilken medelstamklass lönar sig ackordet bäst mot timpeng.</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#bfcab9', display: 'grid', gap: 14 }}>
              <div>
                <div style={s.sheetH}>Samma tal som Mot ackord</div>
                Exakt samma per-objekt-jämförelse (ackord med alla tillägg mot timpeng, bara avräknade objekt, samma ärlighetsregler) — här grupperad per medelstamklass. En klass total är summan av dess objekt i Mot ackord; skiljer de sig är det en bugg.
              </div>
              <div>
                <div style={s.sheetH}>Klassningen</div>
                Varje objekt klassas på sin medelstam (volym / stammar, manuellt värde när satt) till närmaste klass i ackordprislistan — samma avrundning som prisuppslaget använder.
              </div>
              <div>
                <div style={s.sheetH}>Talet</div>
                Klassens (ackord − timpeng) / volym, i kr/m³fub. Grönt = ackordet ger mer än timpeng i den skogen, rött = mindre. Uppfällningen visar skördare och skotare var för sig eftersom de prissätts olika per klass.
              </div>
              <div>
                <div style={s.sheetH}>Osäkert-märkningen</div>
                En klass som vilar på färre än {OSAKER_TIM} G15-timmar är brus, inte mönster — den märks &quot;få timmar — osäkert&quot;.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{
              marginTop: 22, width: '100%', background: '#000', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            }}>Stäng</button>
          </div>
        </>
      )}

      <EkonomiBottomNav />
    </div>
  );
}
