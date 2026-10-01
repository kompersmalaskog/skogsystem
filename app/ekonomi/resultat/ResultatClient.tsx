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
// Ordning: totalt (hero + in/ut) → PER MASKIN-tabell (vem bär sig, vem går
// back — summaraden ÄR totalen) → kvartalsgraf (trend) → kostnader uppdelat
// bakom ETT klick. Summan är summan av det som visas: tabellens rader
// avrundas FÖRST och hero/In-ut räknas ur samma rader — hela vyn
// kontrollräknar mot sig själv. Färg är aldrig ensam bärare — signerade
// tal bär +/− i texten.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { g15Sek } from '@/lib/g15';
import { type PeriodType, getPeriodDates, getPeriodLabel, fetchAllRows } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, SektionsTitel,
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
// Per maskin-tabellen: Maskin · Intäkt · Kostnad · Resultat
const MASKIN_KOLUMNER = 'minmax(0, 1.6fr) repeat(3, minmax(0, 1fr))';

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function fmtSign(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function resFarg(n: number) { return n >= 0 ? FARG.gron : FARG.rod; }

// Per maskin-tabellens rader: maskiner + övriga kostnadsställen + utan CC —
// ALLA tre, annars kan summaraden aldrig kontrollräkna mot företagstotalen
// (varje bokförd rad landar i exakt en av dem). Avrunda per rad FÖRST,
// resultat = visad intäkt − visad kostnad, nollrader (inget bokfört i
// perioden) filtreras, sorterad på resultat fallande — bäst överst.
export function maskinTabell(
  maskiner: Pick<MaskinResult, 'maskin_id' | 'maskin_namn' | 'kostnadsstalle' | 'kostnadsstallen' | 'intakter' | 'kostnader'>[],
  ovriga: OvrigtCc[],
  utanKost: Sammanfattning | null,
) {
  const rader = [
    ...maskiner.map(m => ({
      key: m.maskin_id,
      namn: m.maskin_namn,
      koder: (m.kostnadsstallen && m.kostnadsstallen.length > 0 ? m.kostnadsstallen : [m.kostnadsstalle]).map(cc => cc.kod).join(' ') || null,
      intakt: Math.round(m.intakter || 0),
      kostnad: Math.round(m.kostnader?.total || 0),
    })),
    ...ovriga.map(o => ({
      key: `cc-${o.kod}`,
      namn: o.namn || o.kod,
      koder: o.namn ? o.kod : null,
      intakt: Math.round(o.intakter),
      kostnad: Math.round(o.kostnader.total),
    })),
    ...(utanKost ? [{
      key: 'utan-cc',
      namn: 'Utan kostnadsställe',
      koder: null,
      intakt: Math.round(utanKost.intakter),
      kostnad: Math.round(utanKost.kostnader.total),
    }] : []),
  ]
    .map(r => ({ ...r, resultat: r.intakt - r.kostnad }))
    .filter(r => r.intakt !== 0 || r.kostnad !== 0)
    .sort((a, b) => b.resultat - a.resultat);
  return {
    rader,
    summa: {
      intakt: rader.reduce((s, r) => s + r.intakt, 0),
      kostnad: rader.reduce((s, r) => s + r.kostnad, 0),
      resultat: rader.reduce((s, r) => s + r.resultat, 0),
    },
  };
}

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
  const [kostOpen, setKostOpen] = useState(false); // kostnadsuppdelningen bakom ETT klick
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
  const sheetH = { ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs } as const;

  const { start: periodStart } = getPeriodDates(period, periodOffset);
  const visatAr = Number(periodStart.slice(0, 4));
  const visatKvartal = period === 'K' ? Math.floor((Number(periodStart.slice(5, 7)) - 1) / 3) + 1 : null;

  // ── Summan är summan av det som visas — och det som visas är per maskin-
  // tabellen: hero, In/Ut och tabellens summarad räknas ALLA ur samma
  // avrundade rader, så hela vyn kontrollräknar mot sig själv exakt.
  // API-totalen används aldrig direkt i någon visad summa.
  const tabell = maskinTabell(maskiner, ovriga, utanKost);
  const visadIntakt = tabell.summa.intakt;
  const visadKostTotal = tabell.summa.kostnad;
  const visatResultat = tabell.summa.resultat;

  // Kostnadsuppdelningen (expandern): varje kategori avrundas för sig.
  // Ingen egen totalrad där — kategorierna och tabellen är två olika
  // partitioner av samma rådata, och två avrundade "totaler" bredvid
  // varandra kan skilja någon krona. Totalen bor i In/Ut och tabellen.
  const visadeKost = KATEGORIER.map(([nyckel, namn]) => ({ nyckel, namn, kr: Math.round(tot?.kostnader[nyckel] || 0) }));
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
  const maskGrid = gridRad(MASKIN_KOLUMNER);

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

          {/* PER MASKIN — vyns viktigaste tabell: vem bär sig, vem går back.
              Raderna = maskiner + övriga kostnadsställen + utan CC (varje
              bokförd rad i exakt en), så summaraden ÄR totalen — hero och
              In/Ut ovanför räknas ur samma rader. Rätt maskin per radens
              datum (PR 611:s giltighetsfilter) ligger i API:t. */}
          {tabell.rader.length > 0 && (
            <>
              <SektionsTitel>Per maskin</SektionsTitel>
              <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
                <div style={{ ...maskGrid, padding: `${AVSTAND.s}px 0` }}>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Maskin / kostnadsställe</div>
                  <div style={rubrikCell}>Intäkt kr</div>
                  <div style={rubrikCell}>Kostnad kr</div>
                  <div style={rubrikCell}>Resultat kr</div>
                </div>
                {tabell.rader.map(r => (
                  <div key={r.key} style={{ ...maskGrid, padding: `${AVSTAND.m}px 0` }}>
                    <div style={{ ...TYP.text, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.namn}{r.koder && <span style={{ ...TYP.meta, color: FARG.text3 }}> · {r.koder}</span>}
                    </div>
                    <div style={talCell}>{r.intakt.toLocaleString('sv-SE')}</div>
                    <div style={talCell}>{r.kostnad.toLocaleString('sv-SE')}</div>
                    <div style={{ ...talCell, color: resFarg(r.resultat) }}>{fmtSign(r.resultat)}</div>
                  </div>
                ))}
                <div style={{ ...maskGrid, padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
                  <div style={{ ...TYP.text, fontWeight: VIKT.halvfet, color: FARG.text }}>Totalt</div>
                  <div style={{ ...talCell, fontWeight: VIKT.halvfet }}>{tabell.summa.intakt.toLocaleString('sv-SE')}</div>
                  <div style={{ ...talCell, fontWeight: VIKT.halvfet }}>{tabell.summa.kostnad.toLocaleString('sv-SE')}</div>
                  <div style={{ ...talCell, fontWeight: VIKT.halvfet, color: resFarg(tabell.summa.resultat) }}>{fmtSign(tabell.summa.resultat)}</div>
                </div>
              </Lista>
            </>
          )}

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

          {/* Kostnader uppdelat — bakom ETT klick så vyn hålls ren. Varje
              kategori avrundad för sig, stapeln = andel av största posten.
              INGEN egen totalrad: kategorierna och per maskin-tabellen är
              två olika partitioner av samma rådata och två avrundade
              totaler bredvid varandra kan skilja någon krona — totalen bor
              i In/Ut och tabellens summarad. */}
          <Lista style={{ marginTop: AVSTAND.sektion }}>
            <div onClick={() => setKostOpen(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, cursor: 'pointer',
            }}>
              <span style={{ ...TYP.meta, color: FARG.text2, flex: 1 }}>Kostnader uppdelat</span>
              <span style={{ ...TYP.meta, color: FARG.text2, transform: kostOpen ? 'rotate(90deg)' : 'none' }}>›</span>
            </div>
            {kostOpen && (
              <div style={{ borderTop: `1px solid ${FARG.linje}`, paddingBottom: AVSTAND.m }}>
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
                {/* Värdeminskningen är en KALKYL — orange rakt igenom,
                    UTANFÖR de bokförda kategorierna. Ingen stapel. */}
                {sumVm > 0 && (
                  <div style={{ ...kostGrid, padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
                    <div style={{ ...TYP.text, color: FARG.orange }}>
                      Värdeminskning<span style={{ ...TYP.meta, color: FARG.orange }}> · kalkyl, ej bokförd</span>
                    </div>
                    <div />
                    <div style={{ ...talCell, color: FARG.orange }}>{sumVm.toLocaleString('sv-SE')}</div>
                  </div>
                )}
                {dubbelRisk && (
                  <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.s, textAlign: 'center', lineHeight: 1.5 }}>
                    Bokförd avskrivning (78xx) finns i perioden — den och värdeminskningen (kalkyl) mäter samma sak. Räkna inte båda.
                  </div>
                )}
              </div>
            )}
          </Lista>

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
                <div style={sheetH}>Per maskin-tabellen</div>
                Varje maskin är mappad till sina Fortnox-kostnadsställen (Inställningar), och varje bokförd rad räknas till den maskin som ägde kostnadsstället på radens datum. Kostnadsställen som inte är maskiner och rader utan kostnadsställe visas som egna rader i samma tabell — så att inget belopp försvinner tyst och summaraden alltid är totalen. Sorterad på resultat: bäst överst.
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
