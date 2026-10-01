'use client';

// Resultat — BOKFÖRD vinst ur Fortnox i Apple-tabellstil för dator
// (samma språk som Per klass/Mot ackord, MAXBREDD_BRED).
//
// TVÅ resultattal, tydligt åtskilda (ärlighetskravet):
//   1. Bokfört resultat = Fortnox-intäkt − bokförd kostnad (78xx-avskrivning
//      är 0 under året, bokas vid bokslut). Hero, grön/röd.
//   2. Efter verklig värdeminskning = bokfört − kr/G15-tim-kalkylen
//      (vardeminskningPeriod × periodens faktiska G15-timmar). Den sanna
//      ägarekonomin — ALLTID märkt kalkyl i orange, aldrig som bokförd.
//
// Bara Kvartal/År (default År) — bokföringen landar i klumpar, en månads-
// eller dagsvinst vore brus. Trenden visas i stället som stapelgraf per
// kvartal; ett kvartal där bokföringen inte nått kvartalets slut märks
// "ofullständigt bokfört" i stället för att en låg stapel läses som fakta.
//
// Summan är summan av det som visas: varje kategori avrundas FÖRST, totalen
// summerar de visade raderna, heron = visad intäkt − visad kostnad.
// Färg är aldrig ensam bärare — signerade tal bär +/− i texten.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { g15Sek } from '@/lib/g15';
import { type PeriodType, getPeriodDates, getPeriodLabel, fetchAllRows } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, ListRad, SektionsTitel,
  Laddar, FelRuta, Tomt, MAXBREDD_BRED,
} from '../delade/mall';
import { rubrikCell, talCell, gridRad } from '../delade/tabell';
import { vardeminskningPeriod, type MaskinVardeminskning } from '@/lib/ekonomi/vardeminskning';
import { FARG, TYP, TNUM, VIKT, AVSTAND, RADIE, KNAPP, TRAFFYTA } from '@/lib/design/tokens';

type Kostnader = { drivmedel: number; drift_service: number; loner: number; avskrivning: number; ovrigt: number; total: number };

type MaskinResult = {
  maskin_id: string;
  maskin_namn: string;
  maskin_typ: string | null;
  kostnadsstalle: { kod: string; namn?: string };
  kostnadsstallen?: { kod: string; namn?: string }[];
  ok: boolean;
  fel?: string;
  intakter?: number;
  kostnader?: Kostnader;
  resultat?: number;
  vardeminskning_grund?: MaskinVardeminskning;  // rådata — helpern räknar
};

type Sammanfattning = { ok: boolean; intakter: number; kostnader: Kostnader; resultat: number };

type OvrigtCc = { kod: string; namn?: string; intakter: number; kostnader: Kostnader; resultat: number };

type Kvartal = { kvartal: number; intakter: number; kostnader_total: number; resultat: number; antal_rader: number };

const KATEGORIER: [keyof Kostnader, string][] = [
  ['drivmedel', 'Drivmedel'],
  ['drift_service', 'Drift & service'],
  ['loner', 'Lön'],
  ['avskrivning', 'Avskrivning'],
  ['ovrigt', 'Övrigt'],
];

// Kostnadstabellen: Kategori · andel av största posten (stapel) · Kr
const KOST_KOLUMNER = 'minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 0.8fr)';

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function fmtSign(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function resFarg(n: number) { return n >= 0 ? FARG.gron : FARG.rod; }

export default function ResultatClient() {
  // Bara Kvartal/År — bokföringen landar inte finare än så. Default År.
  const [period, setPeriod] = useState<PeriodType>('A');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskiner, setMaskiner] = useState<MaskinResult[]>([]);
  const [foretagetTotalt, setForetagetTotalt] = useState<Sammanfattning | null>(null);
  const [utanKost, setUtanKost] = useState<Sammanfattning | null>(null);
  const [ovriga, setOvriga] = useState<OvrigtCc[]>([]);
  const [antalRader, setAntalRader] = useState(0);   // ärligt tomt: 0 bokförda rader ≠ 0 kr vinst
  const [serie, setSerie] = useState<Kvartal[]>([]); // årets kvartal — trendgrafen
  const [maxDatum, setMaxDatum] = useState<string | null>(null); // sista bokförda dag i ÅRET
  const [ccOpen, setCcOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Periodens G15-timmar per maskin (fakt_tid via g15Sek) — grunden för
  // värdeminskningen. null = kunde inte läsas (ärligt: ingen värdeminskning
  // visas då, aldrig en gissad nolla).
  const [g15PerMaskin, setG15PerMaskin] = useState<Record<string, number> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      const ar = start.slice(0, 4);
      // Tre parallella hämtningar: periodens rapport (hero/kostnader/CC),
      // HELA ÅRETS rapport (kvartalsserien + sista bokförda dag — i årsläget
      // är det samma anrop), och periodens G15-timmar. Timmarna får inte
      // fälla vyn — fel där ger null (värdeminskningen visas inte) medan
      // bokföringen renderas som vanligt.
      const arSamma = period === 'A';
      const [r, rAr, g15Res] = await Promise.all([
        fetch(`/api/fortnox/result-per-costcenter?fromdate=${start}&todate=${end}`, { cache: 'no-store' }),
        arSamma ? null : fetch(`/api/fortnox/result-per-costcenter?fromdate=${ar}-01-01&todate=${ar}-12-31`, { cache: 'no-store' }),
        (async () => {
          try {
            const rows = await fetchAllRows((from, to) =>
              supabase.from('fakt_tid')
                .select('maskin_id, processing_sek, terrain_sek, other_work_sek')
                .gte('datum', start).lte('datum', end)
                .order('id')  // unik tiebreaker — .range() kräver total ordning
                .range(from, to)
            );
            const agg: Record<string, number> = {};
            for (const rad of rows) {
              agg[rad.maskin_id] = (agg[rad.maskin_id] || 0)
                + g15Sek(rad.processing_sek, rad.terrain_sek, rad.other_work_sek) / 3600;
            }
            return agg;
          } catch {
            return null;
          }
        })(),
      ]);
      setG15PerMaskin(g15Res);
      const body = await r.json();
      if (!r.ok || !body.ok) {
        setMaskiner([]); setForetagetTotalt(null); setUtanKost(null); setOvriga([]);
        setAntalRader(0); setSerie([]); setMaxDatum(null);
        setError(body.meddelande || `HTTP ${r.status}`);
        return;
      }
      setMaskiner(body.maskiner || []);
      setForetagetTotalt(body.foretaget_totalt || null);
      setUtanKost(body.utan_kostnadsstalle || null);
      setOvriga(body.ovriga_kostnadsstallen || []);
      setAntalRader(Number(body.antal_rader_i_period) || 0);
      // Kvartalsserien ur årsanropet (eller periodanropet i årsläget).
      // Fel i det extra årsanropet fäller inte vyn — grafen visas bara inte.
      const arBody = arSamma ? body : (rAr && rAr.ok ? await rAr.json() : null);
      setSerie(arBody?.ok ? (arBody.kvartalsserie || []) : []);
      setMaxDatum(arBody?.ok ? (arBody.max_transaction_date || null) : null);
    } catch (e: any) {
      setError(e?.message || String(e));
      setMaskiner([]); setForetagetTotalt(null); setUtanKost(null); setOvriga([]);
      setAntalRader(0); setSerie([]); setMaxDatum(null);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tot = foretagetTotalt;
  const harData = tot != null && antalRader > 0;
  const utanKostAktiv = utanKost != null && (utanKost.intakter !== 0 || utanKost.kostnader.total !== 0);
  const ccAntal = maskiner.length + ovriga.length + (utanKostAktiv ? 1 : 0);
  const sheetH = { ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs } as const;

  const { start: periodStart } = getPeriodDates(period, periodOffset);
  const visatAr = Number(periodStart.slice(0, 4));
  const visatKvartal = period === 'K' ? Math.floor((Number(periodStart.slice(5, 7)) - 1) / 3) + 1 : null;

  // ── Summan är summan av det som visas: kategorier avrundas FÖRST,
  // totalen summerar de visade raderna, heron = visad intäkt − visad
  // kostnad. API-totalen används aldrig direkt i någon visad summa.
  const visadeKost = KATEGORIER.map(([nyckel, namn]) => ({ nyckel, namn, kr: Math.round(tot?.kostnader[nyckel] || 0) }));
  const visadKostTotal = visadeKost.reduce((s, k) => s + k.kr, 0);
  const visadIntakt = Math.round(tot?.intakter || 0);
  const visatResultat = visadIntakt - visadKostTotal;
  const storstaKost = Math.max(...visadeKost.map(k => k.kr), 1);

  // ── Verklig värdeminskning (KALKYL — alltid orange, aldrig som en
  // Fortnox-siffra). Kr/G15-tim × maskinens FAKTISKA G15-timmar i perioden.
  // Avrundas per maskin och summeras — samma kontrollräkningsregel.
  const vmForMaskin = (m: MaskinResult): number | null => {
    if (g15PerMaskin == null) return null;
    const v = vardeminskningPeriod(m.vardeminskning_grund || {}, g15PerMaskin[m.maskin_id] || 0, visatAr);
    return v == null ? null : Math.round(v);
  };
  const sumVm = maskiner.reduce((s, m) => s + (vmForMaskin(m) || 0), 0);
  // Dubbelräkningsvakt: bokförs 78xx (vid bokslut) mäter den SAMMA sak som
  // kalkylen — båda samtidigt vore dubbel kostnad. Varna, räkna aldrig ihop.
  const dubbelRisk = sumVm > 0 && Math.abs(visadeKost.find(k => k.nyckel === 'avskrivning')?.kr || 0) > 0;

  // ── Kvartalsgrafen: skala på största visade stapeln i året. Kvartalets
  // sista dag som sträng (mars/dec = 31, juni/sep = 30) — märkningen
  // "ofullständigt bokfört" gäller kvartalet där bokföringen tagit slut.
  const serieMax = Math.max(...serie.map(q => Math.max(q.intakter, q.kostnader_total)), 1);
  const kvartalSlut = (q: number) => `${visatAr}-${String(q * 3).padStart(2, '0')}-${q === 2 || q === 3 ? '30' : '31'}`;
  const kvartalStart = (q: number) => `${visatAr}-${String(q * 3 - 2).padStart(2, '0')}-01`;
  const ofullstandigt = (q: Kvartal) =>
    q.antal_rader > 0 && maxDatum != null && maxDatum < kvartalSlut(q.kvartal) && maxDatum >= kvartalStart(q.kvartal);

  const kostGrid = gridRad(KOST_KOLUMNER);

  // En rad i per kostnadsställe-uppfällningen — maskin, övrigt CC eller utan CC
  const ccRad = (key: string, rubrik: React.ReactNode, koder: string | null, intakter: number, kostnader: number, resultat: number, vmPeriod: number | null, sista: boolean) => (
    <ListRad key={key}
      rubrik={<>{rubrik}{koder && <span style={{ color: FARG.text3, fontWeight: VIKT.normal }}> · {koder}</span>}</>}
      detalj={<>
        intäkt {formatKr(intakter)} · kostnad {formatKr(kostnader)}
        {vmPeriod != null && <span style={{ color: FARG.orange }}> · värdeminskning {formatKr(vmPeriod)} (kalkyl)</span>}
      </>}
      tal={`${fmtSign(resultat)} kr`}
      talFarg={resFarg(resultat)}
      undertal={vmPeriod != null ? <span style={{ color: FARG.orange }}>{fmtSign(Math.round(resultat) - vmPeriod)} efter värdem.</span> : undefined}
      sista={sista}
    />
  );

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      <Periodvaxlare
        perioder={['K', 'A']}
        period={period}
        offset={periodOffset}
        onPeriod={p => { setPeriod(p); setPeriodOffset(0); }}
        onOffset={setPeriodOffset}
        onInfo={() => setInfoOpen(true)}
      />

      {loading && <Laddar />}

      {!loading && error && (
        <>
          <FelRuta titel="Kunde inte hämta resultat" fel={error} onRetry={fetchData} />
          {(error.includes('costcenter') || error.toLowerCase().includes('404')) && (
            <div style={{ margin: `0 ${AVSTAND.sidmarginal}px`, ...TYP.meta, color: FARG.text3, lineHeight: 1.5 }}>
              Kontrollera att Fortnox är anslutet (Admin → Lönesystem) och att kostnadsställe-mappningen är ifylld i Inställningar.
            </div>
          )}
        </>
      )}

      {!loading && !error && !harData && (
        /* Ärligt tomt — inga bokförda rader i perioden är inte "0 kr vinst" */
        <Tomt>Ingen bokförd data i {getPeriodLabel(period, periodOffset)}</Tomt>
      )}

      {!loading && !error && harData && tot && (
        <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
          {/* Hero — BOKFÖRT resultat. Direkt under: den sanna ägarekonomin
              efter verklig värdeminskning — kalkyl-ordet i orange så den
              aldrig läses som bokförd. */}
          <Hero
            etikett={visatResultat >= 0 ? 'Vinst (bokfört)' : 'Förlust (bokfört)'}
            varde={`${fmtSign(visatResultat)} kr`}
            vardeFarg={resFarg(visatResultat)}
            under={sumVm > 0 ? (
              <div style={{ ...TYP.text, ...TNUM, marginTop: AVSTAND.m }}>
                <span style={{ color: resFarg(visatResultat - sumVm) }}>{fmtSign(visatResultat - sumVm)} kr</span>
                <span style={{ color: FARG.text2 }}> efter verklig värdeminskning</span>
                <span style={{ color: FARG.orange }}> · kalkyl</span>
              </div>
            ) : undefined}
          />
          <MetaRad delar={[{ text: 'bokfört ur Fortnox — inte samma tal som Översiktens "vi körde in"' }]} />

          {/* In mot ut — intäkt och total kostnad sida vid sida */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: AVSTAND.sektion, textAlign: 'center' }}>
            <div>
              <div style={{ ...TYP.micro, color: FARG.text2 }}>Intäkt</div>
              <div style={{ ...TYP.rubrik, ...TNUM, marginTop: AVSTAND.xs }}>{formatKr(visadIntakt)}</div>
            </div>
            <div>
              <div style={{ ...TYP.micro, color: FARG.text2 }}>Kostnad</div>
              <div style={{ ...TYP.rubrik, ...TNUM, marginTop: AVSTAND.xs }}>{formatKr(visadKostTotal)}</div>
            </div>
          </div>

          {/* Trend per kvartal — intäkt mot kostnad. Kvartal stabilare än
              månad när bokföringen landar i klumpar. Tomt kvartal = streck
              (ärligt tomt), kvartal där bokföringen inte nått kvartalets
              slut märks "ofullständigt bokfört". */}
          {serie.length > 0 && (
            <>
              <SektionsTitel>{visatAr} per kvartal</SektionsTitel>
              <Lista style={{ padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px` }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: AVSTAND.l }}>
                  {serie.map(q => {
                    const tomt = q.antal_rader === 0;
                    const aktivt = visatKvartal === q.kvartal;
                    const hInt = Math.round((q.intakter / serieMax) * AVSTAND.xxl * 3);
                    const hKost = Math.round((q.kostnader_total / serieMax) * AVSTAND.xxl * 3);
                    return (
                      <div key={q.kvartal} style={{ textAlign: 'center' }}>
                        <div style={{ height: AVSTAND.xxl * 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: AVSTAND.xs }}>
                          {!tomt && <div style={{ width: AVSTAND.xl, height: Math.max(hInt, 1), background: FARG.text2, borderRadius: RADIE.stapel }} />}
                          {!tomt && <div style={{ width: AVSTAND.xl, height: Math.max(hKost, 1), background: FARG.fyllning, borderRadius: RADIE.stapel }} />}
                        </div>
                        <div style={{ ...TYP.meta, fontWeight: aktivt ? VIKT.halvfet : VIKT.normal, color: aktivt ? FARG.text : FARG.text2, marginTop: AVSTAND.s }}>
                          Q{q.kvartal}
                        </div>
                        <div style={{ ...TYP.micro, ...TNUM, marginTop: AVSTAND.xs, color: tomt ? FARG.text3 : resFarg(q.resultat) }}>
                          {tomt ? '—' : `${fmtSign(q.resultat)} kr`}
                        </div>
                        {ofullstandigt(q) && (
                          <div style={{ ...TYP.micro, color: FARG.orange, marginTop: AVSTAND.xs }}>
                            ofullständigt bokfört
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.l, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: AVSTAND.s }}>
                  <span style={{ width: AVSTAND.s, height: AVSTAND.s, background: FARG.text2, borderRadius: RADIE.stapel, display: 'inline-block' }} />
                  intäkt
                  <span style={{ width: AVSTAND.s, height: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.stapel, display: 'inline-block', marginLeft: AVSTAND.m }} />
                  kostnad
                </div>
              </Lista>
            </>
          )}

          {/* Kostnader per kategori — kolumntabell. Varje rad avrundad
              FÖRST, summaraden summerar de visade raderna exakt. Stapeln =
              andel av största posten, jämförbar rad mot rad. */}
          <SektionsTitel>Kostnader {getPeriodLabel(period, periodOffset)}</SektionsTitel>
          <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
            <div style={{ ...kostGrid, padding: `${AVSTAND.s}px 0` }}>
              <div style={{ ...rubrikCell, textAlign: 'left' }}>Kategori</div>
              <div />
              <div style={rubrikCell}>Kr</div>
            </div>
            {visadeKost.map(k => (
              <div key={k.nyckel} style={{ ...kostGrid, padding: `${AVSTAND.m}px 0` }}>
                <div style={{ ...TYP.text, color: FARG.text }}>{k.namn}</div>
                <div style={{ alignSelf: 'center' }}>
                  <div style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, width: `${Math.max(0, Math.min(1, k.kr / storstaKost)) * 100}%`, background: FARG.fyllning }} />
                </div>
                <div style={talCell}>{k.kr.toLocaleString('sv-SE')}</div>
              </div>
            ))}
            <div style={{ ...kostGrid, padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
              <div style={{ ...TYP.text, fontWeight: VIKT.halvfet, color: FARG.text }}>Totalt</div>
              <div />
              <div style={{ ...talCell, fontWeight: VIKT.halvfet }}>{visadKostTotal.toLocaleString('sv-SE')}</div>
            </div>
            {/* Värdeminskningen är en KALKYL — orange rakt igenom, UTANFÖR
                den bokförda totalen ovan. Ingen stapel. */}
            {sumVm > 0 && (
              <div style={{ ...kostGrid, padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
                <div style={{ ...TYP.text, color: FARG.orange }}>
                  Värdeminskning<span style={{ ...TYP.meta, color: FARG.orange }}> · kalkyl, ej bokförd</span>
                </div>
                <div />
                <div style={{ ...talCell, color: FARG.orange }}>{sumVm.toLocaleString('sv-SE')}</div>
              </div>
            )}
          </Lista>
          {dubbelRisk && (
            <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m, textAlign: 'center', lineHeight: 1.5 }}>
              Bokförd avskrivning (78xx) finns i perioden — den och värdeminskningen (kalkyl) mäter samma sak. Räkna inte båda.
            </div>
          )}

          {/* Per kostnadsställe — kollapsad sektion, samma mönster som
              Mot ackords "Per maskin". Maskiner + övriga CC + utan CC.
              Datumfiltret (rätt maskin per period) ligger i API:t. */}
          {ccAntal > 0 && (
            <Lista style={{ marginTop: AVSTAND.sektion }}>
              <div onClick={() => setCcOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, cursor: 'pointer',
              }}>
                <span style={{ ...TYP.meta, color: FARG.text2, flex: 1 }}>Per kostnadsställe</span>
                <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{ccAntal}</span>
                <span style={{ ...TYP.meta, color: FARG.text2, transform: ccOpen ? 'rotate(90deg)' : 'none' }}>›</span>
              </div>
              {ccOpen && (
                <div style={{ borderTop: `1px solid ${FARG.linje}` }}>
                  {maskiner.map((m, i) => ccRad(
                    m.maskin_id,
                    m.maskin_namn,
                    (m.kostnadsstallen && m.kostnadsstallen.length > 0 ? m.kostnadsstallen : [m.kostnadsstalle]).map(cc => cc.kod).join(' '),
                    m.intakter || 0,
                    m.kostnader?.total || 0,
                    m.resultat || 0,
                    vmForMaskin(m),
                    i === maskiner.length - 1 && ovriga.length === 0 && !utanKostAktiv,
                  ))}
                  {ovriga.map((o, i) => ccRad(
                    o.kod,
                    o.namn || o.kod,
                    o.namn ? o.kod : null,
                    o.intakter,
                    o.kostnader.total,
                    o.resultat,
                    null,
                    i === ovriga.length - 1 && !utanKostAktiv,
                  ))}
                  {utanKostAktiv && utanKost && ccRad(
                    'utan-cc',
                    'Utan kostnadsställe',
                    null,
                    utanKost.intakter,
                    utanKost.kostnader.total,
                    utanKost.resultat,
                    null,
                    true,
                  )}
                </div>
              )}
            </Lista>
          )}

          {maskiner.length === 0 && (
            <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.l, textAlign: 'center', lineHeight: 1.5 }}>
              Inga kostnadsställe-mappningar — lägg till i Inställningar → Kostnadsställe per maskin.
            </div>
          )}
        </div>
      )}

      {/* (i)-sheet — vad talen är och inte är */}
      {infoOpen && (
        <>
          {/* Overlay-dim saknar token (lint-känd literal) — samma värde som appens övriga sheets */}
          <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`,
            padding: `${AVSTAND.m}px ${AVSTAND.xl}px calc(${AVSTAND.sektion}px + env(safe-area-inset-bottom))`,
            maxHeight: '80vh', overflowY: 'auto',
            borderTop: `1px solid ${FARG.linje}`, fontFamily: 'inherit', color: FARG.text,
          }}>
            <div style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xs, background: FARG.fyllning, borderRadius: RADIE.stapel, margin: `${AVSTAND.xs}px auto ${AVSTAND.l}px` }} />
            <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.xs }}>Resultat — hur räknas det?</div>
            <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>Bokförd vinst ur Fortnox för perioden.</div>
            <div style={{ ...TYP.meta, lineHeight: 1.6, color: FARG.text2, display: 'grid', gap: AVSTAND.l }}>
              <div>
                <div style={sheetH}>Bokfört — inte producerat</div>
                Talet är Fortnox-fakturerad intäkt minus bokförda kostnader. Översiktens &quot;vi körde in&quot; är något annat: producerad ackordintäkt räknad på volym, innan fakturering. De två talen mäter olika saker och ska inte stämma överens — fakturering släpar efter produktionen.
              </div>
              <div>
                <div style={sheetH}>Två resultattal</div>
                &quot;Vinst (bokfört)&quot; är bokföringens tal — där är avskrivningen 0 under året, den bokas som skattepost vid bokslut. &quot;Efter verklig värdeminskning&quot; drar dessutom av vår kr/G15-tim-kalkyl — den sanna ägarekonomin, tillgänglig löpande. Kalkylen är alltid orangemärkt och blandas aldrig in i de bokförda talen.
              </div>
              <div>
                <div style={sheetH}>Kostnadskategorierna (BAS-plan)</div>
                Intäkter = 3xxx · Drivmedel = 56xx · Drift &amp; service = 50–55 + 57–59 · Lön = 7xxx utom 78 · Avskrivning = 78xx · Övrigt = 4/6/8xxx. Varje kategori avrundas först — totalen är summan av raderna som visas.
              </div>
              <div>
                <div style={sheetH}>Kvartal och år — inte månad</div>
                Kostnader bokförs i klumpar, inte per dag — en månadsvinst vore brus. Trenden visas i stället per kvartal; ett kvartal där bokföringen inte nått kvartalets sista dag märks &quot;ofullständigt bokfört&quot; så en låg stapel aldrig läses som fakta.
              </div>
              <div>
                <div style={sheetH}>Per kostnadsställe</div>
                Varje maskin är mappad till sina Fortnox-kostnadsställen (Inställningar), och varje bokförd rad räknas till den maskin som ägde kostnadsstället på radens datum. Rader utan kostnadsställe och kostnadsställen som inte är maskiner visas som egna rader så att inget belopp försvinner tyst.
              </div>
              <div>
                <div style={{ ...sheetH, color: FARG.orange }}>Verklig värdeminskning — kalkyl</div>
                Bokförd avskrivning (78xx) är skattestyrd och bokas vid bokslut — en maskin kan stå nedskriven till nästan noll fast den är värd miljoner. Värdeminskningen här är vår egen kalkyl med maskinsäljarens modell: kr per G15-timme (sätts per maskin i Inställningar) × maskinens faktiskt körda G15-timmar i perioden. Självjusterande — mer körning betyder mer slitage, en stillastående maskin kostar inget. Sålda maskiner bär ingen värdeminskning framåt. Skulle bokförd avskrivning dyka upp i en period varnar vyn — de två mäter samma sak och får aldrig räknas ihop.
              </div>
            </div>
            {/* Stäng = avbryter → KNAPP.lank (skillen: blå text bara för navigerar/avbryter) */}
            <button onClick={() => setInfoOpen(false)} style={{ ...KNAPP.lank, marginTop: AVSTAND.xl, width: '100%' }}>Stäng</button>
          </div>
        </>
      )}
    </EkonomiSida>
  );
}
