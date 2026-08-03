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
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, ListRad, EnhetsFot, SektionsTitel,
  Laddar, FelRuta, Tomt, BARNSTEN, GRON, ROD,
} from '../delade/mall';

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
  const [ejJamfOpen, setEjJamfOpen] = useState(false);    // "utan jämförelse" uppfälld
  const [maskinOpen, setMaskinOpen] = useState(false);    // per maskin-sektionen uppfälld

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
    <EkonomiSida>
      {/* Bara Månad/Kvartal/År — inget objekt avräknas på en dag */}
      <Periodvaxlare
        perioder={['M', 'K', 'A']}
        period={period}
        offset={periodOffset}
        onPeriod={p => { setPeriod(p); setPeriodOffset(0); }}
        onOffset={setPeriodOffset}
        onInfo={() => setInfoOpen(true)}
      />

      {loading && <Laddar />}

      {!loading && error && (
        <FelRuta titel="Kunde inte läsa ackordsdata" fel={error} onRetry={fetchData} />
      )}

      {!loading && !error && (
        <div style={{ padding: '0 16px' }}>
          {objektRader.length === 0 ? (
            /* Ärligt tomt — inte +0 kr som ser ut som fakta */
            <Tomt>
              Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
            </Tomt>
          ) : (
            /* Hero — periodens totala överskott mot timpeng (signerat tal → färg) */
            <Hero
              etikett={sumDiff >= 0 ? 'Över timpeng' : 'Under timpeng'}
              varde={`${fmtDiff(sumDiff)} kr`}
              vardeFarg={diffColor(sumDiff)}
              under={
                <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 10 }}>
                  {objektRader.length} objekt avräknade
                </div>
              }
            />
          )}

          {/* Metarad — prel i bärnsten; utan jämförelse/timpeng dämpat.
              Detaljerna bor i de uppfällbara raderna längst ner. */}
          <MetaRad delar={[
            vantarNamn.length > 0 && { text: `${vantarNamn.length} preliminär${vantarNamn.length === 1 ? 't' : 'a'} ej med`, barnsten: true },
            ejJamforbara.length > 0 && { text: `${ejJamforbara.length} utan jämförelse` },
            timpengAntal > 0 && { text: `${timpengAntal} på timpeng` },
          ]} />

          {objektRader.length > 0 && (
            <>
              {/* Per objekt — EN historia per rad: namn, dämpad detalj, ETT tal.
                  Enheten står EN gång under listan; kr-beloppet bor i sheeten. */}
              <SektionsTitel>Per objekt</SektionsTitel>
              <Lista>
                {objektRader.map((o, i) => (
                  <ListRad key={o.objekt_id}
                    rubrik={o.namn}
                    detalj={<>
                      {Math.round(o.volym).toLocaleString('sv-SE')} m³fub · {formatKr(o.ackord)} ackord{o.egenSkotning && ' · egen skotning'}
                    </>}
                    tal={o.krPerM3 != null ? fmtDiff(o.krPerM3) : '—'}
                    talFarg={diffColor(o.diff)}
                    onClick={() => setSheetObjekt(o)}
                    sista={i === objektRader.length - 1}
                  />
                ))}
              </Lista>
              <EnhetsFot>kr/m³ mot timpeng — tryck på ett objekt för detaljer</EnhetsFot>

              {/* Per maskin — kollapsad sektion, inte en andra lista i samma scroll */}
              <Lista style={{ marginTop: 24 }}>
                <div onClick={() => setMaskinOpen(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 13, color: '#7a7a72', flex: 1 }}>Per maskin</span>
                  <span style={{ fontSize: 13, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>{maskinAgg.length}</span>
                  <span style={{ fontSize: 11, color: '#7a7a72', transform: maskinOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                </div>
                {maskinOpen && (
                  <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                    {maskinAgg.map((m, i) => {
                      const v = visaMaskin(m.maskin_id);
                      const diff = m.ackord - m.timpeng;
                      const krPerTim = m.timmar > 0 ? m.ackord / m.timmar : null;
                      const osaker = m.timmar < OSAKER_TIM;
                      return (
                        <ListRad key={m.maskin_id}
                          rubrik={<>{v.namn}{v.id && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {v.id}</span>}</>}
                          detalj={krPerTim != null
                            ? <>ackord motsv. {Math.round(krPerTim).toLocaleString('sv-SE')} kr/tim · {fmtTim(m.timmar)} tim{osaker && ' — osäkert'}</>
                            : 'inga G15-timmar registrerade'}
                          tal={fmtDiff(diff)}
                          talFarg={diffColor(diff)}
                          sista={i === maskinAgg.length - 1}
                        />
                      );
                    })}
                    <div style={{ fontSize: 11, color: '#7a7a72', textAlign: 'center', padding: '0 0 14px' }}>kr mot timpeng</div>
                  </div>
                )}
              </Lista>
            </>
          )}

          {/* Utan jämförelse — halt underlag, utanför talen. EN kollapsad rad;
              orsakerna (granskningsbara) i uppfällningen, inte som textvägg i vyn. */}
          {ejJamforbara.length > 0 && (
            <Lista style={{ marginTop: 24 }}>
              <div onClick={() => setEjJamfOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13, color: '#7a7a72', flex: 1 }}>Utan jämförelse</span>
                <span style={{ fontSize: 13, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>{ejJamforbara.length}</span>
                <span style={{ fontSize: 11, color: '#7a7a72', transform: ejJamfOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
              </div>
              {ejJamfOpen && (
                <div style={{ paddingBottom: 12, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                  {ejJamforbara.map((o, i) => (
                    <div key={i} style={{ padding: '9px 0 0' }}>
                      <div style={{ fontSize: 12, color: '#e8e8e4' }}>{o.namn}</div>
                      <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{o.orsak} — står utanför talen.</div>
                    </div>
                  ))}
                </div>
              )}
            </Lista>
          )}

          {/* Väntar på avräkning — EN nedtonad rad, expanderbar. Aldrig i talen. */}
          {vantarNamn.length > 0 && (
            <Lista style={{ marginTop: 24 }}>
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
            </Lista>
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
    </EkonomiSida>
  );
}
