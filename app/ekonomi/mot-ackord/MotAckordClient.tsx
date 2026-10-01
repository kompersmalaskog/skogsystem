'use client';

// Mot ackord — vad gav avräknade objekt på ackord mot vad samma arbete
// hade gett på timpeng, och var ligger pengarna? Datorvy (Martin vid
// skärm): kolumntabell i Apple-stil som Per klass — luft skiljer rader,
// tabulära siffror i raka kolumner, färg bara på signerade tal och
// alltid med +/− i texten.
//
// ALL beräkning bor i lib/ekonomi/objektJamforelse (delad med
// /ekonomi/per-klass) — vyn hämtar och renderar, räknar inget själv.
// Tabellmatten (avrunda först, Totalt = skillnad × volym, exakta
// summor) delas med Per klass via delade/tabell.ts. Heron visar
// tabellsummans Totalt — den kontrollräknar alltid mot raderna.
//
// PERIODER: M/K/Å BEHÅLLS (till skillnad från Per klass som bara har
// K/Å). Mätning 2026: 0–10 avräknade objekt per månad (juni 0). För
// Per klass blir det slump — klassSNITT på 0–1 objekt är inget mönster.
// Här är varje rad ett HELT objekt: två rader i juli är en sann
// reskontra ("de här avräknades då"), och tomma månader visas ärligt
// tomma. Månaden är dessutom den operativa frågan efter en avräkning.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  hamtaObjektJamforelse, OSAKER_TIM, MAX_SKOTAD_M3_PER_G15H,
  type ObjektRad,
} from '@/lib/ekonomi/objektJamforelse';
import { type PeriodType, getPeriodDates, getPeriodLabel } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, SektionsTitel,
  Laddar, FelRuta, Tomt, MAXBREDD_BRED,
} from '../delade/mall';
import { FARG, TYP, VIKT, AVSTAND, RADIE, KNAPP, TRAFFYTA } from '@/lib/design/tokens';
import { beraknaTabell, tabellRad, rubrikCell, talCell, gridRad } from '../delade/tabell';

type MaskinAgg = {
  maskin_id: string;
  ackord: number;
  timpeng: number;
  timmar: number;
};

// Signerade tal bär ALLTID sitt tecken i texten (+/−) — färgen förstärker
// bara (skillen: rött i solljus är brunt, färg aldrig ensam bärare).
function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function fmtDiff(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function fmtHeltal(n: number) { return Math.round(n).toLocaleString('sv-SE'); }
function fmtTim(n: number) { return n.toFixed(1).replace('.', ','); }
function diffColor(n: number) { return n >= 0 ? FARG.gron : FARG.rod; }

// Objektnamnet behöver mer plats än Per klass-numret — annars samma sex
// kolumner. Maskintabellen har fem.
const OBJEKT_KOLUMNER = 'minmax(0, 1.6fr) repeat(4, minmax(0, 1fr)) minmax(0, 1.2fr)';
const MASKIN_KOLUMNER = 'minmax(0, 1.6fr) repeat(4, minmax(0, 1fr))';

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

  // ── Presentation — delad tabellmatte (avrunda först, sortera på Totalt) ──
  const tabell = beraknaTabell(objektRader);

  const maskinAgg: MaskinAgg[] = (() => {
    const agg: Record<string, MaskinAgg> = {};
    for (const o of objektRader) for (const d of o.maskiner) {
      (agg[d.maskin_id] ||= { maskin_id: d.maskin_id, ackord: 0, timpeng: 0, timmar: 0 });
      agg[d.maskin_id].ackord += d.ackord;
      agg[d.maskin_id].timpeng += d.timpeng;
      agg[d.maskin_id].timmar += d.timmar;
    }
    return Object.values(agg);
  })();
  // Maskinraden visar kr/G15-tim, varje tal avrundat för sig — skillnaden
  // är diffen av de VISADE talen så raden alltid kontrollräknar.
  const maskinTal = (m: MaskinAgg) => {
    if (!(m.timmar > 0)) return { tim: null as number | null, ack: null as number | null, skillnad: 0 };
    const tim = Math.round(m.timpeng / m.timmar);
    const ack = Math.round(m.ackord / m.timmar);
    return { tim, ack, skillnad: ack - tim };
  };
  const maskinRader = maskinAgg
    .map(m => ({ m, ...maskinTal(m) }))
    .sort((a, b) => b.skillnad - a.skillnad);
  const harOsakraMaskiner = maskinRader.some(r => r.m.timmar < OSAKER_TIM);

  // Namnvisning — rollparentesen bort; maskin_id skiljer dubbletter (två H8E)
  const rensaNamn = (namn: string) => namn.replace(/\s*\((skördare|skotare)\)\s*$/i, '');
  const visaMaskin = (mid: string) => {
    const namn = rensaNamn(maskinNamnMap[mid]?.namn || mid);
    const dubblett = Object.entries(maskinNamnMap).some(([id, m]) => id !== mid && rensaNamn(m.namn) === namn);
    return { namn, id: dubblett ? mid : null };
  };

  const sheetH = { ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs } as const;
  const objektGrid = gridRad(OBJEKT_KOLUMNER);
  const maskinGrid = gridRad(MASKIN_KOLUMNER);
  // Kollapsrubrik — klickbar, därför full träffyta
  const kollapsRubrik = {
    display: 'flex', alignItems: 'center', gap: AVSTAND.s, cursor: 'pointer',
    minHeight: TRAFFYTA.min,
  } as const;

  const sheetShell = (onClose: () => void, children: React.ReactNode) => (
    <>
      {/* Overlay-dim saknar token (lint-känd literal) — samma värde som appens övriga sheets */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`,
        padding: `${AVSTAND.m}px ${AVSTAND.xl}px calc(${AVSTAND.sektion}px + env(safe-area-inset-bottom))`,
        maxHeight: '80vh', overflowY: 'auto',
        borderTop: `1px solid ${FARG.linje}`, fontFamily: 'inherit', color: FARG.text,
      }}>
        <div style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xs, background: FARG.fyllning, borderRadius: RADIE.stapel, margin: `${AVSTAND.xs}px auto ${AVSTAND.l}px` }} />
        {children}
        {/* Stäng = avbryter → KNAPP.lank (skillen: blå text bara för navigerar/avbryter) */}
        <button onClick={onClose} style={{ ...KNAPP.lank, marginTop: AVSTAND.xl, width: '100%' }}>Stäng</button>
      </div>
    </>
  );

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      {/* Månad behålls här (till skillnad från Per klass) — se filhuvudet */}
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
        <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
          {tabell.rader.length === 0 ? (
            /* Ärligt tomt — inte +0 kr som ser ut som fakta */
            <Tomt>
              Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
            </Tomt>
          ) : (
            /* Hero — periodens överskott mot timpeng = tabellsummans Totalt,
               så det stora talet alltid kontrollräknar mot raderna nedanför */
            <Hero
              etikett={tabell.summa.totalt >= 0 ? 'Över timpeng' : 'Under timpeng'}
              varde={`${fmtDiff(tabell.summa.totalt)} kr`}
              vardeFarg={diffColor(tabell.summa.totalt)}
              under={
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>
                  {tabell.rader.length} objekt avräknade
                </div>
              }
            />
          )}

          {/* Metarad — prel i orange, resten dämpat. Detaljer längst ner. */}
          <MetaRad delar={[
            vantarNamn.length > 0 && { text: `${vantarNamn.length} preliminär${vantarNamn.length === 1 ? 't' : 'a'} ej med`, barnsten: true },
            ejJamforbara.length > 0 && { text: `${ejJamforbara.length} utan jämförelse` },
            timpengAntal > 0 && { text: `${timpengAntal} på timpeng` },
          ]} />

          {tabell.rader.length > 0 && (
            <>
              <SektionsTitel>Per objekt — ackord mot timpeng</SektionsTitel>

              {/* Rubrikrad */}
              <div style={{ ...objektGrid, marginBottom: AVSTAND.s }}>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Objekt</div>
                <div style={rubrikCell}>Volym m³fub</div>
                <div style={rubrikCell}>Ackord kr/m³</div>
                <div style={rubrikCell}>Timpeng kr/m³</div>
                <div style={rubrikCell}>Skillnad kr/m³</div>
                <div style={rubrikCell}>Totalt kr</div>
              </div>

              {/* Objektrader — luft skiljer dem, inga linjer. Klick öppnar
                  ackordgrund-detaljen. */}
              {tabell.rader.map(r => {
                const o = r.post;
                return (
                  <div key={o.objekt_id} onClick={() => setSheetObjekt(o)}
                    style={{ ...objektGrid, padding: `${AVSTAND.m}px 0`, cursor: 'pointer' }}>
                    <div style={{ ...TYP.listtitel, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.namn}
                      {o.egenSkotning && <span style={{ ...TYP.meta, color: FARG.text2 }}> · egen skotning</span>}
                    </div>
                    <div style={talCell}>{fmtHeltal(r.volym)}</div>
                    <div style={talCell}>{r.ackord ?? '—'}</div>
                    <div style={talCell}>{r.timpeng ?? '—'}</div>
                    <div style={{ ...talCell, color: diffColor(r.skillnad) }}>{fmtDiff(r.skillnad)}</div>
                    <div style={{ ...talCell, color: diffColor(r.totalt) }}>{fmtDiff(r.totalt)}</div>
                  </div>
                );
              })}

              {/* Summarad — EN hårfin linje + luft; Volym och Totalt är exakta
                  summor av raderna, skillnaden volymvägd (Totalt ÷ volym). */}
              <div style={{ ...objektGrid, borderTop: `0.5px solid ${FARG.linje}`, marginTop: AVSTAND.s, paddingTop: AVSTAND.m }}>
                <div style={{ ...TYP.listtitel, color: FARG.text }}>Totalt</div>
                <div style={{ ...talCell, fontWeight: VIKT.halvfet }}>{fmtHeltal(tabell.summa.volym)}</div>
                <div style={talCell} />
                <div style={talCell} />
                <div style={{ ...talCell, fontWeight: VIKT.halvfet, color: diffColor(tabell.summa.skillnadVagd) }}>{fmtDiff(tabell.summa.skillnadVagd)}</div>
                <div style={{ ...talCell, fontWeight: VIKT.halvfet, color: diffColor(tabell.summa.totalt) }}>{fmtDiff(tabell.summa.totalt)}</div>
              </div>
              <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>
                Skillnaden på summaraden är volymvägd (Totalt ÷ volym). Klicka på ett objekt för ackordgrund och detaljer.
              </div>

              {/* Per maskin — kollapsad sektion med liten tabell i samma stil.
                  kr/G15-tim, varje tal avrundat för sig. */}
              <Lista style={{ marginTop: AVSTAND.sektion }}>
                <div onClick={() => setMaskinOpen(v => !v)} style={kollapsRubrik}>
                  <span style={{ ...TYP.meta, color: FARG.text2, flex: 1 }}>Per maskin</span>
                  <span style={{ ...TYP.meta, color: FARG.text2 }}>{maskinRader.length}</span>
                  <span style={{ ...TYP.meta, color: FARG.text2, transform: maskinOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                </div>
                {maskinOpen && (
                  <div style={{ borderTop: `1px solid ${FARG.linje}`, paddingBottom: AVSTAND.l }}>
                    <div style={{ ...maskinGrid, marginTop: AVSTAND.m, marginBottom: AVSTAND.s }}>
                      <div style={{ ...rubrikCell, textAlign: 'left' }}>Maskin</div>
                      <div style={rubrikCell}>G15-tim</div>
                      <div style={rubrikCell}>Timpeng kr/tim</div>
                      <div style={rubrikCell}>Ackord kr/tim</div>
                      <div style={rubrikCell}>Skillnad kr/tim</div>
                    </div>
                    {maskinRader.map(r => {
                      const v = visaMaskin(r.m.maskin_id);
                      return (
                        <div key={r.m.maskin_id} style={{ ...maskinGrid, padding: `${AVSTAND.s}px 0` }}>
                          <div style={{ ...TYP.text, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.namn}{v.id && <span style={{ ...TYP.meta, color: FARG.text2 }}> · {v.id}</span>}
                            {r.m.timmar < OSAKER_TIM && <span style={{ color: FARG.text3 }}> *</span>}
                          </div>
                          <div style={talCell}>{fmtTim(r.m.timmar)}</div>
                          <div style={talCell}>{r.tim ?? '—'}</div>
                          <div style={talCell}>{r.ack ?? '—'}</div>
                          <div style={{ ...talCell, color: r.tim != null ? diffColor(r.skillnad) : FARG.text2 }}>
                            {r.tim != null ? fmtDiff(r.skillnad) : '—'}
                          </div>
                        </div>
                      );
                    })}
                    {harOsakraMaskiner && (
                      <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>
                        * Få timmar ({'<'} {OSAKER_TIM} G15-h) — kr/tim är brus, inte mönster.
                      </div>
                    )}
                  </div>
                )}
              </Lista>
            </>
          )}

          {/* Utan jämförelse — halt underlag, utanför talen. EN kollapsad rad;
              orsakerna (granskningsbara) i uppfällningen, inte som textvägg. */}
          {ejJamforbara.length > 0 && (
            <Lista style={{ marginTop: AVSTAND.sektion }}>
              <div onClick={() => setEjJamfOpen(v => !v)} style={kollapsRubrik}>
                <span style={{ ...TYP.meta, color: FARG.text2, flex: 1 }}>Utan jämförelse</span>
                <span style={{ ...TYP.meta, color: FARG.text2 }}>{ejJamforbara.length}</span>
                <span style={{ ...TYP.meta, color: FARG.text2, transform: ejJamfOpen ? 'rotate(90deg)' : 'none' }}>›</span>
              </div>
              {ejJamfOpen && (
                <div style={{ paddingBottom: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
                  {ejJamforbara.map((o, i) => (
                    <div key={i} style={{ paddingTop: AVSTAND.s }}>
                      <div style={{ ...TYP.meta, color: FARG.text }}>{o.namn}</div>
                      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{o.orsak} — står utanför talen.</div>
                    </div>
                  ))}
                </div>
              )}
            </Lista>
          )}

          {/* Väntar på avräkning — EN nedtonad rad, expanderbar. Aldrig i talen. */}
          {vantarNamn.length > 0 && (
            <Lista style={{ marginTop: AVSTAND.sektion }}>
              <div onClick={() => setVantarOpen(v => !v)} style={kollapsRubrik}>
                <span style={{ ...TYP.meta, color: FARG.text2, flex: 1 }}>Väntar på avräkning</span>
                <span style={{ ...TYP.meta, color: FARG.text2 }}>{vantarNamn.length}</span>
                <span style={{ ...TYP.meta, color: FARG.text2, transform: vantarOpen ? 'rotate(90deg)' : 'none' }}>›</span>
              </div>
              {vantarOpen && (
                <div style={{ paddingBottom: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
                  {vantarNamn.map((n, i) => (
                    <div key={i} style={{ paddingTop: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>{n}</div>
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
            <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.xs }}>{o.namn}</div>
            <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>
              {formatKr(o.ackord)} ackord · {formatKr(o.timpeng)} timpeng · <span style={{ color: diffColor(o.diff) }}>{fmtDiff(o.diff)} kr</span>
            </div>

            {tot > 0 && (
              <div style={{ marginBottom: AVSTAND.l }}>
                <div style={sheetH}>Fördelning av ackordet</div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>
                  {o.egenSkotning
                    ? <>Skördare 100 % — egen skotning, markägaren skotar själv. Noll skotad volym är korrekt, ingen skotardel finns i affären.</>
                    : <>Skördare {Math.round(skordAckord / tot * 100)} % · Skotare {Math.round(skotAckord / tot * 100)} %</>}
                </div>
              </div>
            )}

            {/* ACKORDGRUND — läsläge. Mätt i vitt, manuellt/uppskattat i
                orange: man ska se vad som är mätt och vad som är ihopskrivet
                INNAN man går och rättar. Redigering sker i /redigering. */}
            <div style={{ marginBottom: AVSTAND.l }}>
              <div style={sheetH}>Ackordgrund</div>
              {o.grund.map((g, gi) => (
                <div key={gi} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.m,
                  padding: `${AVSTAND.s}px 0`, borderBottom: gi < o.grund.length - 1 ? `1px solid ${FARG.linje}` : 'none',
                }}>
                  <span style={{ ...TYP.meta, color: FARG.text2 }}>{g.label}</span>
                  <span style={{
                    ...TYP.meta, ...{ fontVariantNumeric: 'tabular-nums' as const }, textAlign: 'right' as const,
                    color: g.manuell ? FARG.orange : FARG.text,
                  }}>{g.text}</span>
                </div>
              ))}
              <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
                Vitt = mätt ur maskindata · <span style={{ color: FARG.orange }}>orange</span> = manuellt eller uppskattat
              </div>
            </div>

            <div style={sheetH}>Per maskin — timpeng mot ackord i kr/tim</div>
            {o.maskiner.map(d => {
              const v = visaMaskin(d.maskin_id);
              const krPerTim = d.timmar > 0 ? d.ackord / d.timmar : null;
              const osaker = d.timmar < OSAKER_TIM;
              return (
                <div key={d.maskin_id} style={{ padding: `${AVSTAND.s}px 0`, borderBottom: `1px solid ${FARG.linje}` }}>
                  <div style={{ ...TYP.meta, fontWeight: VIKT.halvfet, color: FARG.text }}>
                    {v.namn}{v.id && <span style={{ fontWeight: VIKT.normal, color: FARG.text2 }}> · {v.id}</span>}
                    <span style={{ fontWeight: VIKT.normal, color: FARG.text2 }}> · {d.roll}</span>
                  </div>
                  <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                    {krPerTim != null ? (
                      <>timpeng {fmtHeltal(d.timpris)} → ackord motsv. <span style={{ color: diffColor(krPerTim - d.timpris) }}>{fmtHeltal(krPerTim)}</span> kr/tim</>
                    ) : (
                      <>inga G15-timmar — kr/tim kan inte räknas</>
                    )}
                  </div>
                  <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                    {fmtTim(d.timmar)} tim{d.manuellTid && <span style={{ color: FARG.orange }}> · manuell</span>}{osaker && d.timmar > 0 && ' — osäkert'} · {formatKr(d.ackord)} ackord
                  </div>
                </div>
              );
            })}

            {/* Ett redigeringsställe: allt rättande sker i /redigering */}
            <Link href={`/redigering?objekt=${encodeURIComponent(o.objekt_id)}`}
              style={{ ...KNAPP.sekundar, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: AVSTAND.l, textDecoration: 'none' }}>
              Öppna i redigering
            </Link>
          </>
        );
      })())}

      {/* (i)-sheet */}
      {infoOpen && sheetShell(() => setInfoOpen(false), (
        <>
          <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.xs }}>Mot ackord — hur räknas det?</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>Vad avräknade objekt gav på ackord, mot vad samma arbete hade gett på timpeng.</div>
          <div style={{ ...TYP.meta, lineHeight: 1.6, color: FARG.text2, display: 'grid', gap: AVSTAND.l }}>
            <div>
              <div style={sheetH}>Bara avräknade objekt</div>
              Ett objekt räknas när BÅDE skördning och skotning är avslutade, i den period skotningen avslutades. Hela objektet räknas då — allt arbete, oavsett när det utfördes. Objekt med <em>egen skotning</em> (markägaren skotar själv) avräknas när skördningen är avslutad, i skördningens period — bara skördardelen jämförs, noll skotad volym är korrekt. Preliminära objekt (vårt moment kvar) står nedtonade under &quot;Väntar på avräkning&quot; och ingår aldrig i talen.
            </div>
            <div>
              <div style={sheetH}>Ackord</div>
              Skördad volym × skördarpris och skotad volym × skotarpris per närmaste medelstam, plus trakt-, sortiment-, skotningsavstånds-, terräng- och kvalitetssäkringstillägg (taxor ur prislistan). 3-meters massaved och manuella poster (snittsling m.m.) ingår inte — flyttersättning redovisas separat.
            </div>
            <div>
              <div style={sheetH}>Kolumnerna</div>
              Ackord och Timpeng är objektets kr/m³fub, var för sig avrundade. Skillnad = de två visade talen rakt av. Totalt kr = skillnaden × objektets volym — var pengarna ligger. Tabellen sorteras på Totalt, och heron är summaradens Totalt, så allt kontrollräknar. Plus = ackordet gav mer än timpeng (färgen förstärker bara tecknet).
            </div>
            <div>
              <div style={sheetH}>Timpeng-jämförelsen</div>
              G15-timmar (processing + terräng + övrigt arbete) × maskinens timpris. Objektets kr/m³ räknas på skördad volym (skotad när skördardata saknas, t.ex. GROT).
            </div>
            <div>
              <div style={sheetH}>Osäkert-märkningen</div>
              kr/tim delar på timmar — under {OSAKER_TIM} G15-timmar är talet brus och märks med *. Gallring och timpeng-flaggade objekt körs redan på timpeng och har ingen jämförelse.
            </div>
            <div>
              <div style={sheetH}>Skotad volym</div>
              FPR-lassen är ofullständiga på flera objekt — där en manuell skotad volym är satt (redigeringsvyn) används den som skotarens ackordvolym, fördelad över skotarens registrerade tid. Skotningsavståndstillägget kan bara räknas ur faktiska lass och är underskattat för korrigerade objekt.
            </div>
            <div>
              <div style={sheetH}>Kan inte jämföras</div>
              Objekt står utanför talen när jämförelsen är halt: G15-timmar utan giltigt timpris (t.ex. arbete före prislistans start), eller när skotarvolym och skotartid inte hör ihop — implicerad prestanda över {MAX_SKOTAD_M3_PER_G15H} m³/G15h (normal skotare gör 15–40) betyder att tiden är ofullständig, inte att skotningen var övermänsklig. Tröskeln är en heuristik — objekten som fångas listas med orsak:
              {ejJamforbara.length > 0 ? (
                <div style={{ marginTop: AVSTAND.s }}>
                  {ejJamforbara.map((o, i) => (
                    <div key={i} style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xs }}>{o.namn} — {o.orsak}</div>
                  ))}
                </div>
              ) : (
                <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>Inga objekt fångade i den här perioden.</div>
              )}
            </div>
          </div>
        </>
      ))}
    </EkonomiSida>
  );
}
