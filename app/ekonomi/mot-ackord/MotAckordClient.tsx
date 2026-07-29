'use client';

// Mot ackord — jämför vad avräknade objekt gav på ackord mot vad samma
// arbete hade gett på timpeng. Bara intäktssida, ingen kostnad.
//
// ALL beräkning bor i lib/ekonomi/objektJamforelse (delad med
// /ekonomi/per-klass som grupperar samma rader per medelstamklass) —
// vyn hämtar och renderar, räknar inget själv.
//
// TRE FÄRGER, TRE BETYDELSER: grön = över timpeng, röd = under timpeng,
// bärnsten = preliminärt/manuellt. Allt annat neutralt.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  hamtaObjektJamforelse, OSAKER_TIM, MAX_SKOTAD_M3_PER_G15H,
  type ObjektRad,
} from '@/lib/ekonomi/objektJamforelse';
import { type PeriodType, getPeriodDates, getPeriodLabel } from '@/lib/ekonomi/period';
import EkonomiBottomNav from '../EkonomiBottomNav';

const GRON = '90,255,140';
const ROD = '255,90,90';
const BARNSTEN = '240,178,76';

type MaskinAgg = {
  maskin_id: string;
  ackord: number;
  timpeng: number;
  timmar: number;
};

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function fmtDiff(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function fmtTim(n: number) { return n.toFixed(1).replace('.', ','); }
function diffColor(n: number) { return n >= 0 ? `rgba(${GRON},0.9)` : `rgba(${ROD},0.9)`; }

export default function MotAckordClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objektRader, setObjektRader] = useState<ObjektRad[]>([]);
  const [vantarNamn, setVantarNamn] = useState<string[]>([]);       // prel: vårt moment kvar
  const [timpengAntal, setTimpengAntal] = useState(0);              // timpeng-objekt avräknade i perioden
  const [ejJamforbara, setEjJamforbara] = useState<{ namn: string; orsak: string }[]>([]);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, { namn: string; typ: string | null }>>({});
  const [sheetObjekt, setSheetObjekt] = useState<ObjektRad | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [vantarOpen, setVantarOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      const data = await hamtaObjektJamforelse(start, end);
      setObjektRader(data.rader);
      setEjJamforbara(data.ejJamforbara);
      setVantarNamn(data.vantarNamn);
      setTimpengAntal(data.timpengAntal);
      setMaskinNamnMap(data.maskinNamnMap);
    } catch (err: any) {
      console.error('MotAckord: fetch error', err);
      setError(err?.message || String(err));
      setObjektRader([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Aggregat ──
  const sumDiff = objektRader.reduce((s2, o) => s2 + o.diff, 0);

  const maskinAgg: MaskinAgg[] = (() => {
    const agg: Record<string, MaskinAgg> = {};
    for (const o of objektRader) for (const d of o.maskiner) {
      (agg[d.maskin_id] ||= { maskin_id: d.maskin_id, ackord: 0, timpeng: 0, timmar: 0 });
      agg[d.maskin_id].ackord += d.ackord;
      agg[d.maskin_id].timpeng += d.timpeng;
      agg[d.maskin_id].timmar += d.timmar;
    }
    return Object.values(agg).sort((a, b) => (b.ackord - b.timpeng) - (a.ackord - a.timpeng));
  })();

  // Namnvisning — rollparentesen bort; maskin_id skiljer dubbletter (två H8E)
  const rensaNamn = (namn: string) => namn.replace(/\s*\((skördare|skotare)\)\s*$/i, '');
  const visaMaskin = (mid: string) => {
    const namn = rensaNamn(maskinNamnMap[mid]?.namn || mid);
    const dubblett = Object.entries(maskinNamnMap).some(([id, m]) => id !== mid && rensaNamn(m.namn) === namn);
    return { namn, id: dubblett ? mid : null };
  };

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

  const sheetShell = (onClose: () => void, children: React.ReactNode) => (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#1a1a18', borderRadius: '20px 20px 0 0',
        padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto',
        borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
        fontFamily: "'Geist', system-ui, sans-serif", color: '#e8e8e4',
      }}>
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '4px auto 18px' }} />
        {children}
        <button onClick={onClose} style={{
          marginTop: 22, width: '100%', background: '#000', color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
          padding: '12px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}>Stäng</button>
      </div>
    </>
  );

  return (
    <div style={s.page}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&display=swap" />

      {/* Bara Månad/Kvartal/År — inget objekt avräknas på en dag */}
      <div style={s.filterBar}>
        {(['M', 'K', 'A'] as PeriodType[]).map(p => (
          <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            onClick={() => { setPeriod(p); setPeriodOffset(0); }}>
            {p === 'M' ? 'Månad' : p === 'K' ? 'Kvartal' : 'År'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.arrow} aria-label="Föregående period" onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
        <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
        <button style={s.arrow} aria-label="Nästa period" onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
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
          {objektRader.length === 0 ? (
            /* Ärligt tomt — inte +0 kr som ser ut som fakta */
            <div style={{ textAlign: 'center', padding: '56px 16px 8px' }}>
              <div style={{ fontSize: 13, color: '#7a7a72' }}>
                Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
              </div>
            </div>
          ) : (
            /* Hero — periodens totala överskott mot timpeng */
            <div style={{ textAlign: 'center', padding: '56px 8px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#7a7a72' }}>
                {sumDiff >= 0 ? 'Över timpeng' : 'Under timpeng'}
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 44, lineHeight: 1.1, fontWeight: 500, color: diffColor(sumDiff), marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                {fmtDiff(sumDiff)} kr
              </div>
              <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 10 }}>
                {objektRader.length} objekt avräknade
              </div>
            </div>
          )}

          {/* Preliminärt — bärnsten, aldrig i talen */}
          {vantarNamn.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                background: `rgba(${BARNSTEN},0.10)`, color: `rgba(${BARNSTEN},0.85)`,
                fontSize: 11, fontWeight: 500,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: `rgba(${BARNSTEN},0.8)`, flexShrink: 0 }} />
                {vantarNamn.length} preliminär{vantarNamn.length === 1 ? 't' : 'a'} objekt ej med
              </div>
            </div>
          )}

          {/* Halt jämförelse — nedtonat, utanför talen (annars byter heron tecken) */}
          {ejJamforbara.length > 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 8px', lineHeight: 1.6, textAlign: 'center' }}>
              {ejJamforbara.map((o, i) => (
                <div key={i}>{o.namn} — {o.orsak}. Kan inte jämföras ärligt — står utanför talen.</div>
              ))}
            </div>
          )}

          {objektRader.length > 0 && (
            <>
              {/* Per objekt */}
              <div style={s.sectionTitle}>Per objekt</div>
              <div style={{ ...s.card, padding: '0 16px' }}>
                {objektRader.map((o, i) => (
                  <div key={o.objekt_id} onClick={() => setSheetObjekt(o)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', cursor: 'pointer',
                    borderBottom: i < objektRader.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.namn}</div>
                      <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>
                        {Math.round(o.volym).toLocaleString('sv-SE')} m³fub · {formatKr(o.ackord)} ackord{o.egenSkotning && ' · egen skotning'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: diffColor(o.diff), fontVariantNumeric: 'tabular-nums' }}>
                        {o.krPerM3 != null ? `${fmtDiff(o.krPerM3)} kr/m³` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{fmtDiff(o.diff)} kr</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Per maskin */}
              <div style={s.sectionTitle}>Per maskin</div>
              <div style={{ ...s.card, padding: '0 16px' }}>
                {maskinAgg.map((m, i) => {
                  const v = visaMaskin(m.maskin_id);
                  const diff = m.ackord - m.timpeng;
                  const krPerTim = m.timmar > 0 ? m.ackord / m.timmar : null;
                  const osaker = m.timmar < OSAKER_TIM;
                  return (
                    <div key={m.maskin_id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0',
                      borderBottom: i < maskinAgg.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.namn}{v.id && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {v.id}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>
                          {krPerTim != null
                            ? <>ackord motsv. {Math.round(krPerTim).toLocaleString('sv-SE')} kr/tim · {fmtTim(m.timmar)} tim{osaker && ' — osäkert'}</>
                            : 'inga G15-timmar registrerade'}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: diffColor(diff), fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {fmtDiff(diff)} kr
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Timpeng-objekt — ingen jämförelse */}
          {timpengAntal > 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 4px', textAlign: 'center' }}>
              {timpengAntal} objekt avräknade på timpeng i perioden — ingen ackordjämförelse.
            </div>
          )}

          {/* Väntar på avräkning — EN nedtonad rad, expanderbar. Aldrig i talen. */}
          {vantarNamn.length > 0 && (
            <div style={{ ...s.card, marginTop: 24, padding: '0 16px' }}>
              <div onClick={() => setVantarOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13, color: '#7a7a72', flex: 1 }}>Väntar på avräkning</span>
                <span style={{ fontSize: 13, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>{vantarNamn.length}</span>
                <span style={{ fontSize: 11, color: '#7a7a72', transform: vantarOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
              </div>
              {vantarOpen && (
                <div style={{ paddingBottom: 10, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                  {vantarNamn.map((n, i) => (
                    <div key={i} style={{ padding: '9px 0 0', fontSize: 12, color: '#7a7a72' }}>{n}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Objekt-detalj-sheet */}
      {sheetObjekt && sheetShell(() => setSheetObjekt(null), (() => {
        const o = sheetObjekt;
        const skordAckord = o.maskiner.filter(d => d.roll === 'skördare').reduce((x, d) => x + d.ackord, 0);
        const skotAckord = o.maskiner.filter(d => d.roll === 'skotare').reduce((x, d) => x + d.ackord, 0);
        const tot = skordAckord + skotAckord;
        return (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 2 }}>{o.namn}</div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 16 }}>
              {formatKr(o.ackord)} ackord · {formatKr(o.timpeng)} timpeng · <span style={{ color: diffColor(o.diff) }}>{fmtDiff(o.diff)} kr</span>
            </div>

            {tot > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={s.sheetH}>Fördelning av ackordet</div>
                <div style={{ fontSize: 13, color: '#bfcab9' }}>
                  {o.egenSkotning
                    ? <>Skördare 100 % — egen skotning, markägaren skotar själv. Noll skotad volym är korrekt, ingen skotardel finns i affären.</>
                    : <>Skördare {Math.round(skordAckord / tot * 100)} % · Skotare {Math.round(skotAckord / tot * 100)} %</>}
                </div>
              </div>
            )}

            {/* ACKORDGRUND — läsläge. Mätt i benvitt, manuellt/uppskattat i
                bärnsten: man ska se vad som är mätt och vad som är ihopskrivet
                INNAN man går och rättar. Redigering sker i /redigering. */}
            <div style={{ marginBottom: 18 }}>
              <div style={s.sheetH}>Ackordgrund</div>
              {o.grund.map((g, gi) => (
                <div key={gi} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
                  padding: '7px 0', borderBottom: gi < o.grund.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                }}>
                  <span style={{ fontSize: 12, color: '#7a7a72' }}>{g.label}</span>
                  <span style={{
                    fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                    color: g.manuell ? `rgba(${BARNSTEN},0.9)` : '#e8e8e4',
                  }}>{g.text}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 6 }}>
                Benvitt = mätt ur maskindata · <span style={{ color: `rgba(${BARNSTEN},0.85)` }}>bärnsten</span> = manuellt eller uppskattat
              </div>
            </div>

            <div style={s.sheetH}>Per maskin — timpeng mot ackord i kr/tim</div>
            {o.maskiner.map(d => {
              const v = visaMaskin(d.maskin_id);
              const krPerTim = d.timmar > 0 ? d.ackord / d.timmar : null;
              const osaker = d.timmar < OSAKER_TIM;
              return (
                <div key={d.maskin_id} style={{ padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {v.namn}{v.id && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {v.id}</span>}
                    <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {d.roll}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 3 }}>
                    {krPerTim != null ? (
                      <>timpeng {Math.round(d.timpris).toLocaleString('sv-SE')} → ackord motsv. <span style={{ color: diffColor(krPerTim - d.timpris) }}>{Math.round(krPerTim).toLocaleString('sv-SE')}</span> kr/tim</>
                    ) : (
                      <>inga G15-timmar — kr/tim kan inte räknas</>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>
                    {fmtTim(d.timmar)} tim{d.manuellTid && <span style={{ color: `rgba(${BARNSTEN},0.85)` }}> · manuell</span>}{osaker && d.timmar > 0 && ' — osäkert'} · {formatKr(d.ackord)} ackord
                  </div>
                </div>
              );
            })}

            {/* Ett redigeringsställe: allt rättande sker i /redigering */}
            <Link href={`/redigering?objekt=${encodeURIComponent(o.objekt_id)}`} style={{
              display: 'block', textAlign: 'center', marginTop: 18,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#e8e8e4', borderRadius: 10, padding: '12px 14px',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              Öppna i redigering
            </Link>
          </>
        );
      })())}

      {/* (i)-sheet */}
      {infoOpen && sheetShell(() => setInfoOpen(false), (
        <>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Mot ackord — hur räknas det?</div>
          <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>Vad avräknade objekt gav på ackord, mot vad samma arbete hade gett på timpeng.</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#bfcab9', display: 'grid', gap: 14 }}>
            <div>
              <div style={s.sheetH}>Bara avräknade objekt</div>
              Ett objekt räknas när BÅDE skördning och skotning är avslutade, i den period skotningen avslutades. Hela objektet räknas då — allt arbete, oavsett när det utfördes. Objekt med <em>egen skotning</em> (markägaren skotar själv) avräknas när skördningen är avslutad, i skördningens period — bara skördardelen jämförs, noll skotad volym är korrekt. Preliminära objekt (vårt moment kvar) står nedtonade under &quot;Väntar på avräkning&quot; och ingår aldrig i talen.
            </div>
            <div>
              <div style={s.sheetH}>Ackord</div>
              Skördad volym × skördarpris och skotad volym × skotarpris per närmaste medelstam, plus trakt-, sortiment-, skotningsavstånds- och terrängtillägg. Kvalitetssäkring/ForestLink ingår alltid (taxa ur prislistan, kr/m³ per maskindel). 3-meters massaved och manuella poster (snittsling m.m.) ingår inte — flyttersättning redovisas separat. OBS: per-objekt-fliken har ännu inte kvalitets-/terrängtilläggen.
            </div>
            <div>
              <div style={s.sheetH}>Timpeng-jämförelsen</div>
              G15-timmar (processing + terräng) × maskinens timpris. Grönt = ackordet gav mer än timpeng, rött = mindre. Objektets kr/m³ = (ackord − timpeng) / skördad volym (skotad volym när skördardata saknas, t.ex. GROT).
            </div>
            <div>
              <div style={s.sheetH}>Osäkert-märkningen</div>
              kr/tim delar på timmar — under {OSAKER_TIM} G15-timmar är talet brus och märks &quot;osäkert&quot;. Gallring och timpeng-flaggade objekt körs redan på timpeng och har ingen jämförelse.
            </div>
            <div>
              <div style={s.sheetH}>Skotad volym</div>
              FPR-lassen är ofullständiga på flera objekt — där en manuell skotad volym är satt (redigeringsvyn) används den som skotarens ackordvolym, fördelad över skotarens registrerade tid. Skotningsavståndstillägget kan bara räknas ur faktiska lass och är underskattat för korrigerade objekt.
            </div>
            <div>
              <div style={s.sheetH}>Kan inte jämföras</div>
              Objekt står utanför talen när jämförelsen är halt: G15-timmar utan giltigt timpris (t.ex. arbete före prislistans start), eller när skotarvolym och skotartid inte hör ihop — implicerad prestanda över {MAX_SKOTAD_M3_PER_G15H} m³/G15h (normal skotare gör 15–40) betyder att tiden är ofullständig, inte att skotningen var övermänsklig. Tröskeln är en heuristik — objekten som fångas listas med orsak:
              {ejJamforbara.length > 0 ? (
                <div style={{ marginTop: 6 }}>
                  {ejJamforbara.map((o, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#7a7a72', marginTop: 3 }}>{o.namn} — {o.orsak}</div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 6 }}>Inga objekt fångade i den här perioden.</div>
              )}
            </div>
          </div>
        </>
      ))}

      <EkonomiBottomNav />
    </div>
  );
}
