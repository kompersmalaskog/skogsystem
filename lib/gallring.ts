// Gallringsuppföljning — EN plats där gallringens siffror definieras.
//
// Vyerna under /gallring räknar ingenting själva. Ändras en definition ändras
// den här filen, och listan och objektvyn följer med. Det är hela poängen med
// vyn: manuell gallringsuppföljning blir sällan av, och när den blir av mäter
// olika förare olika. Det här räknar likadant varje gång.
//
// ── VILKEN KÄLLA SÄGER VAD ────────────────────────────────────────────────
//
//  m³fub, stammar, datum, maskin, förare, trädslag → fakt_produktion (MOM)
//  sortimentsfördelning                            → fakt_sortiment (HPR)
//  diameter (Dgv, histogram)                       → detalj_stam.dbh_mm
//
// fakt_produktion och fakt_tid joinas ALDRIG direkt (fakt_produktion har många
// rader per dag) — den här filen rör inte fakt_tid alls, men regeln gäller om
// någon bygger vidare.
//
// fakt_produktion är sanningen om ANTALET stammar. detalj_stam är en rad per
// enskild stam och har LUCKOR: på Sjöaryd löper stam_key 489741–490139 (399
// platser) men bara 379 rader finns — 20 nycklar mitt i en löpande serie
// saknas. Det är INTE ett urval och ska inte behandlas som ett. Hål i en
// löpande nyckelserie är samma mönster som MOM-importbuggarna (se STATUS.md),
// alltså sannolikt tappad data vid import — orsaken är outredd.
//
// Två följder:
//  1. `stammar` är alltid MOM:s tal, aldrig antalet stamrader.
//  2. Diametermåtten redovisar öppet hur många stammar de bygger på
//     (`matta` av `stammar`), så en lucka syns i vyn i stället för att
//     tyst ändra Dgv. Objekt helt utan stamrader får `diameter: null` —
//     aldrig en uträknad siffra ur tomma händer.
//
// BLOCKERARE FÖR STEG 2: trädpositionerna kommer ur detalj_stam. Varje saknad
// stam blir ett falskt hål i kartan. Luckorna måste utredas innan steg 2 byggs.
//
// ── VAD SOM MEDVETET SAKNAS ───────────────────────────────────────────────
//
// Stickvägsandel, gallringskvot och skattat kvarvarande bestånd finns inte här
// och ska inte läggas till. Alla tre bygger på att stickvägsträden
// representerar beståndet före gallring. Verifierat på Hålabäck att det inte
// håller för beståndsgående drivning: maskinen kör inne i beståndet, och de
// träd metoden skulle klassa som stickvägsträd är klenare och står längre från
// maskinen än övriga. En siffra som bygger på ett falskt antagande är värre än
// ingen siffra.
//
// Areal skattas ALDRIG ur rutnät eller körspår. Finns ingen uppmätt areal visas
// antal stammar utan per-hektar-tal.

import { supabase } from './supabase';
import { fetchAllRows } from './ekonomi/period';
import { harledTyp } from './objekt/typ';
// Trädslagens namn och färger bor i lib/tradslag.ts — EN palett för hela
// appen. Gallringsvyn definierar inga egna.
import { tradslagLabel } from './tradslag';

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type TradslagAndel = {
  namn: string;
  stammar: number;
  volym: number;
};

export type SortimentAndel = {
  namn: string;
  grupp: string | null;
  stockar: number;
  volym: number;
};

export type DagUttag = {
  datum: string;
  stammar: number;
  volym: number;
};

export type DiameterKlass = {
  franMm: number;
  /** null = översta öppna klassen ("28 cm +") */
  tillMm: number | null;
  antal: number;
};

/** Diametermått ur detalj_stam. Finns bara när det finns stamrader att mäta. */
export type Diametermatt = {
  /** Antal stammar med mätt diameter — jämförs mot radens `stammar`. */
  matta: number;
  /** Grundytevägd medeldiameter, Σd³/Σd² (mm). */
  dgvMm: number;
  medelMm: number;
  medianMm: number;
  minMm: number;
  maxMm: number;
  /** Uttagen grundyta, Σ(π·d²/4) i m². Samma Σd² som Dgv bygger på — grundytan
   *  är alltså gratis här och kräver ingen extra läsning av detalj_stam.
   *  OBS: bygger på `matta` stammar, inte alla. detalj_stam har luckor, så
   *  talet är en UNDERSKATTNING när matta < stammar. Anropare som visar det
   *  måste skriva ut vilket underlag det står på. */
  grundytaM2: number;
  klasser: DiameterKlass[];
};

export type GallringRad = {
  /** Grupperingsnyckel. Objektnamn skiljer sig mellan objekt och dim_objekt —
   *  vo_nummer är det enda som håller ihop dem. */
  vo: string;
  namn: string;
  /** Alla dim_objekt-rader som delar VO (skördare + skotare ligger på samma). */
  objektIds: string[];
  maskiner: string[];
  forare: string[];
  forstaDatum: string | null;
  sistaDatum: string | null;
  /** Antal dagar med uttag — inte kalenderdagar mellan första och sista. */
  antalDagar: number;
  volymM3fub: number;
  stammar: number;
  tradslag: TradslagAndel[];
  /** Uppmätt areal, aldrig skattad. null = visa inget per-hektar-tal. */
  arealHa: number | null;
  /** dim_objekt.skordning_avslutad — maskinens eget slutdatum ur StanForD.
   *  Gäller SKÖRDNINGEN; skotningen kan pågå. null = inte avslutad.
   *
   *  objekt.avslutad_timestamp vore det naturliga valet men är satt på NOLL av
   *  34 gallringstrakter (2026-08-22) — en grind på det fältet stänger allt. */
  skordningAvslutad: string | null;
  diameter: Diametermatt | null;
};

export type GallringDetalj = GallringRad & {
  sortiment: SortimentAndel[];
  dagar: DagUttag[];
};

// ---------------------------------------------------------------------------
// Diameterklasser
// ---------------------------------------------------------------------------

// 2 cm-klasser, det gallringsförarna redan tänker i. Understa klassen fångar
// allt under 60 mm, översta allt från 280 mm — så histogrammet aldrig tappar
// stammar i kanterna.
const KLASS_FRAN = 60;
const KLASS_TILL = 280;
const KLASS_BREDD = 20;

function byggKlasser(diametrar: number[]): DiameterKlass[] {
  const klasser: DiameterKlass[] = [];
  for (let f = KLASS_FRAN; f < KLASS_TILL; f += KLASS_BREDD) {
    klasser.push({ franMm: f, tillMm: f + KLASS_BREDD, antal: 0 });
  }
  klasser.push({ franMm: KLASS_TILL, tillMm: null, antal: 0 });

  for (const d of diametrar) {
    if (d >= KLASS_TILL) {
      klasser[klasser.length - 1].antal++;
      continue;
    }
    const i = Math.max(0, Math.floor((d - KLASS_FRAN) / KLASS_BREDD));
    klasser[Math.min(i, klasser.length - 2)].antal++;
  }

  // Klipp tomma klasser i kanterna — men aldrig hål inuti, de säger något.
  let start = 0;
  let slut = klasser.length - 1;
  while (start < slut && klasser[start].antal === 0) start++;
  while (slut > start && klasser[slut].antal === 0) slut--;
  return klasser.slice(start, slut + 1);
}

/** Grundytevägd medeldiameter: Σ(d·g)/Σg med g = πd²/4, alltså Σd³/Σd². */
export function beraknaDiametermatt(diametrar: number[]): Diametermatt | null {
  const d = diametrar.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (d.length === 0) return null;

  let s2 = 0;
  let s3 = 0;
  let summa = 0;
  for (const x of d) {
    s2 += x * x;
    s3 += x * x * x;
    summa += x;
  }
  const mitt = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;

  return {
    matta: d.length,
    dgvMm: s3 / s2,
    medelMm: summa / d.length,
    medianMm: mitt,
    minMm: d[0],
    maxMm: d[d.length - 1],
    // π·Σd²/4, från mm² till m².
    grundytaM2: (Math.PI * s2) / 4 / 1e6,
    klasser: byggKlasser(d),
  };
}

// ---------------------------------------------------------------------------
// Hämtning
// ---------------------------------------------------------------------------

type DimObjektRad = {
  objekt_id: string;
  object_name: string | null;
  vo_nummer: string | null;
  huvudtyp: string | null;
  risskotning: boolean | null;
  areal_ha: number | null;
  skordning_avslutad: string | null;
};

/** Fel kastas alltid vidare. En tyst tom lista skulle se ut som "inga
 *  gallringar", och då tror planeraren att det inte finns något att följa upp. */
function kasta(steg: string, error: { message: string } | null | undefined) {
  if (error) throw new Error(`${steg}: ${error.message}`);
}

/** Gallringsobjekten ur dim_objekt. Typen härleds med appens enda typregel —
 *  huvudtyp är fältet, och saknas det är objektet ofullständigt, inte gallring. */
async function hamtaGallringsobjekt(): Promise<DimObjektRad[]> {
  const rader = (await fetchAllRows((from, to) =>
    supabase
      .from('dim_objekt')
      .select('objekt_id, object_name, vo_nummer, huvudtyp, risskotning, areal_ha, skordning_avslutad')
      .order('objekt_id')
      .range(from, to),
  )) as DimObjektRad[];

  return rader.filter((o) => harledTyp(o.risskotning, o.huvudtyp) === 'gallring');
}

/** Uppmätt areal per VO. objekt.areal är den enda ifyllda källan idag —
 *  dim_objekt.areal_ha står på 0 för samtliga gallringsobjekt, och 0 betyder
 *  "inte ifyllt", inte "noll hektar". */
async function hamtaArealer(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('objekt').select('vo_nummer, areal');
  kasta('areal', error);
  const ut = new Map<string, number>();
  for (const r of data ?? []) {
    const areal = Number(r.areal);
    if (r.vo_nummer && Number.isFinite(areal) && areal > 0) ut.set(String(r.vo_nummer), areal);
  }
  return ut;
}

async function hamtaNamnkartor() {
  const [tradslag, operatorer] = await Promise.all([
    supabase.from('dim_tradslag').select('tradslag_id, namn'),
    supabase.from('dim_operator').select('operator_id, operator_namn'),
  ]);
  kasta('trädslag', tradslag.error);
  kasta('förare', operatorer.error);
  return {
    tradslag: new Map((tradslag.data ?? []).map((t) => [t.tradslag_id, t.namn as string | null])),
    operatorer: new Map(
      (operatorer.data ?? []).map((o) => [o.operator_id, o.operator_namn as string | null]),
    ),
  };
}

type ProdRad = {
  objekt_id: string;
  datum: string;
  maskin_id: string | null;
  operator_id: string | null;
  tradslag_id: string | null;
  stammar: number | null;
  volym_m3sub: number | null;
};

async function hamtaProduktion(objektIds: string[]): Promise<ProdRad[]> {
  if (objektIds.length === 0) return [];
  // .order() är inte kosmetik — utan stabil sortering kan .range()-sidorna
  // överlappa eller hoppa över rader, och summan blir tyst fel.
  return (await fetchAllRows((from, to) =>
    supabase
      .from('fakt_produktion')
      .select('objekt_id, datum, maskin_id, operator_id, tradslag_id, stammar, volym_m3sub')
      .in('objekt_id', objektIds)
      .order('objekt_id')
      .order('datum')
      .range(from, to),
  )) as ProdRad[];
}

/** Diametrar per objekt_id. Egen hämtning eftersom detalj_stam är en rad per
 *  stam — tiotusentals rader. Listan renderar färdigt utan den och fyller i
 *  Dgv när den kommit. */
async function hamtaDiametrar(objektIds: string[]): Promise<Map<string, number[]>> {
  const ut = new Map<string, number[]>();
  if (objektIds.length === 0) return ut;

  const rader = (await fetchAllRows((from, to) =>
    supabase
      .from('detalj_stam')
      .select('objekt_id, dbh_mm')
      .in('objekt_id', objektIds)
      .order('objekt_id')
      .order('id')
      .range(from, to),
  )) as { objekt_id: string; dbh_mm: number | null }[];

  for (const r of rader) {
    const d = Number(r.dbh_mm);
    if (!Number.isFinite(d) || d <= 0) continue;
    const lista = ut.get(r.objekt_id) ?? [];
    lista.push(d);
    ut.set(r.objekt_id, lista);
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Aggregering
// ---------------------------------------------------------------------------

function unikt(varden: (string | null | undefined)[]): string[] {
  return Array.from(new Set(varden.filter((v): v is string => !!v)));
}

function byggRader(
  objekt: DimObjektRad[],
  prod: ProdRad[],
  namn: { tradslag: Map<string, string | null>; operatorer: Map<string, string | null> },
  arealer: Map<string, number>,
): GallringRad[] {
  // Gruppera på VO — ett fysiskt objekt kan ligga som flera dim_objekt-rader
  // (en per maskin) med samma vo_nummer men olika object_name.
  const perVo = new Map<string, DimObjektRad[]>();
  const objektTillVo = new Map<string, string>();
  for (const o of objekt) {
    const vo = o.vo_nummer?.trim();
    if (!vo) continue;
    const lista = perVo.get(vo);
    if (lista) lista.push(o);
    else perVo.set(vo, [o]);
    objektTillVo.set(o.objekt_id, vo);
  }

  const prodPerVo = new Map<string, ProdRad[]>();
  for (const r of prod) {
    const vo = objektTillVo.get(r.objekt_id);
    if (!vo) continue;
    const lista = prodPerVo.get(vo);
    if (lista) lista.push(r);
    else prodPerVo.set(vo, [r]);
  }

  const rader: GallringRad[] = [];
  for (const [vo, objektRader] of Array.from(perVo.entries())) {
    const p = prodPerVo.get(vo) ?? [];
    if (p.length === 0) continue; // Inget uttag — inget att följa upp ännu.

    let volym = 0;
    let stammar = 0;
    const datum = new Set<string>();
    const perTradslag = new Map<string, TradslagAndel>();

    for (const r of p) {
      const v = Number(r.volym_m3sub) || 0;
      const st = Number(r.stammar) || 0;
      volym += v;
      stammar += st;
      if (r.datum) datum.add(r.datum);

      const label = tradslagLabel(r.tradslag_id ? namn.tradslag.get(r.tradslag_id) : null);
      const t = perTradslag.get(label) ?? { namn: label, stammar: 0, volym: 0 };
      t.stammar += st;
      t.volym += v;
      perTradslag.set(label, t);
    }

    const sorteradeDatum = Array.from(datum).sort();
    rader.push({
      vo,
      // Objektnamnet kan skilja mellan raderna i gruppen; ta det första ifyllda.
      namn: objektRader.map((o) => o.object_name).find((n) => !!n) ?? `VO ${vo}`,
      objektIds: objektRader.map((o) => o.objekt_id),
      // Maskin och förare läses ur produktionen, inte ur dim_objekt.maskin_id —
      // det fältet pekar på flera gallringsobjekt ut en skotare (A030353), och
      // den som körde uttaget är den som faktiskt står på raderna.
      maskiner: unikt(p.map((r) => r.maskin_id)),
      forare: unikt(p.map((r) => (r.operator_id ? namn.operatorer.get(r.operator_id) : null))),
      forstaDatum: sorteradeDatum[0] ?? null,
      sistaDatum: sorteradeDatum[sorteradeDatum.length - 1] ?? null,
      antalDagar: sorteradeDatum.length,
      volymM3fub: volym,
      stammar,
      tradslag: Array.from(perTradslag.values()).sort((a, b) => b.volym - a.volym),
      arealHa: arealer.get(vo) ?? null,
      // Senaste avslutsdatum i VO-gruppen. Ett fysiskt objekt kan ligga som
      // flera dim_objekt-rader; är någon av dem oavslutad är trakten det.
      skordningAvslutad:
        objektRader.every((o) => !!o.skordning_avslutad)
          ? objektRader
              .map((o) => o.skordning_avslutad!)
              .sort()
              .slice(-1)[0]
          : null,
      diameter: null,
    });
  }

  // Senaste överst.
  return rader.sort((a, b) => (b.sistaDatum ?? '').localeCompare(a.sistaDatum ?? ''));
}

// ---------------------------------------------------------------------------
// Publika hämtare
// ---------------------------------------------------------------------------

/** Nivå 1 utan diametrar — det som gör att listan kan ritas direkt. */
export async function hamtaGallringar(): Promise<GallringRad[]> {
  const objekt = await hamtaGallringsobjekt();
  const [namn, arealer, prod] = await Promise.all([
    hamtaNamnkartor(),
    hamtaArealer(),
    hamtaProduktion(objekt.map((o) => o.objekt_id)),
  ]);
  return byggRader(objekt, prod, namn, arealer);
}

/** Andra passet: fyller på Dgv. Returnerar NYA rader — muterar inte listan
 *  vyn redan visar. Objekt utan stamrader behåller diameter: null. */
export async function fyllDiametrar(rader: GallringRad[]): Promise<GallringRad[]> {
  const diametrar = await hamtaDiametrar(rader.flatMap((r) => r.objektIds));
  return rader.map((r) => {
    const alla = r.objektIds.flatMap((id) => diametrar.get(id) ?? []);
    return { ...r, diameter: beraknaDiametermatt(alla) };
  });
}

/** Nivå 2 — ett objekt, allt på en gång. */
export async function hamtaGallring(vo: string): Promise<GallringDetalj | null> {
  const objekt = (await hamtaGallringsobjekt()).filter((o) => o.vo_nummer?.trim() === vo);
  if (objekt.length === 0) return null;

  const objektIds = objekt.map((o) => o.objekt_id);
  const [namn, arealer, prod, diametrar, sortiment] = await Promise.all([
    hamtaNamnkartor(),
    hamtaArealer(),
    hamtaProduktion(objektIds),
    hamtaDiametrar(objektIds),
    hamtaSortiment(objektIds),
  ]);

  const rad = byggRader(objekt, prod, namn, arealer)[0];
  if (!rad) return null;

  const perDag = new Map<string, DagUttag>();
  for (const r of prod) {
    if (!r.datum) continue;
    const d = perDag.get(r.datum) ?? { datum: r.datum, stammar: 0, volym: 0 };
    d.stammar += Number(r.stammar) || 0;
    d.volym += Number(r.volym_m3sub) || 0;
    perDag.set(r.datum, d);
  }

  return {
    ...rad,
    diameter: beraknaDiametermatt(objektIds.flatMap((id) => diametrar.get(id) ?? [])),
    sortiment,
    dagar: Array.from(perDag.values()).sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}

/** Sortiment per objekt-total ur fakt_sortiment. Datumfilter vore fel
 *  användning: fördelningen är en egenskap hos trakten, inte hos en period. */
async function hamtaSortiment(objektIds: string[]): Promise<SortimentAndel[]> {
  if (objektIds.length === 0) return [];

  const rader = (await fetchAllRows((from, to) =>
    supabase
      .from('fakt_sortiment')
      .select('sortiment_id, stockar, volym_m3sub')
      .in('objekt_id', objektIds)
      .order('sortiment_id')
      .range(from, to),
  )) as { sortiment_id: string | null; stockar: number | null; volym_m3sub: number | null }[];

  const { data: dim, error } = await supabase.from('dim_sortiment').select('sortiment_id, namn');
  kasta('sortiment', error);
  const namnkarta = new Map((dim ?? []).map((s) => [s.sortiment_id, s.namn as string | null]));

  // Samma sortiment ligger på flera rader (per dag och per maskin) — slå ihop
  // på namn, annars visas "Massa: BmavFall_V3" två gånger i listan.
  const per = new Map<string, SortimentAndel>();
  for (const r of rader) {
    const fullt = (r.sortiment_id ? namnkarta.get(r.sortiment_id) : null) ?? 'Okänt sortiment';
    const delar = fullt.split(':');
    const grupp = delar.length > 1 ? delar[0].trim() : null;
    const namn = delar.length > 1 ? delar.slice(1).join(':').trim() : fullt;
    const s = per.get(fullt) ?? { namn, grupp, stockar: 0, volym: 0 };
    s.stockar += Number(r.stockar) || 0;
    s.volym += Number(r.volym_m3sub) || 0;
    per.set(fullt, s);
  }
  return Array.from(per.values()).sort((a, b) => b.volym - a.volym);
}

// ---------------------------------------------------------------------------
// Årsavgränsning
// ---------------------------------------------------------------------------

// Listan visar ETT år. Ett huvudtal som summerar allt någonsin växer för
// alltid och går inte att förhålla sig till.
//
// Regeln: en trakt hör till året då dess SISTA uttagsdatum ligger, och den
// bär hela sin volym dit. Kompermåla Ga kördes 22 dec 2025 – 8 jan 2026 och
// räknas alltså i sin helhet (384,1 m³fub) på 2026, inte uppdelad.
//
// Varför hellre så än dagexakt: rubriken MÅSTE gå att kontrollräkna mot
// raderna. Ett dagexakt årstal (5 916,9) är sannare om man frågar "hur mycket
// kapades under 2026", men det blir inte summan av det man ser i listan, och
// ett huvudtal som inte går att addera sig fram till underminerar hela vyn.
// Priset är känt och litet: 636,6 m³fub kördes i december 2025 men räknas på
// 2026 genom de två trakter som spänner över årsskiftet.
//
// ORDVAL: "sista uttag", inte "avslutad". `avslutad` betyder redan något annat
// i appen — objekt.avslutad_timestamp, satt när någon TRYCKER "Avsluta
// objekt", och det är den flaggan egenkontrollen väntar på. En trakt vars
// sista uttag ligger i år kan mycket väl fortfarande pågå.

/** Innevarande år enligt lokal tid. Aldrig via toISOString() — den räknar i
 *  UTC och kan ge fel år under nyårsnatten i svensk tid. */
export function aktuelltAr(): number {
  return new Date().getFullYear();
}

/** Summan av traktlistan, räknad på de VISADE talen.
 *
 *  Varje rad visas med en decimal. Summerar man råvärdena och avrundar en
 *  gång i slutet hamnar rubriken 0,1 fel mot raderna (6 553,5 mot 6 553,6 på
 *  2026) — små avrundningar åt samma håll adderas. Rubriken ska gå att
 *  kontrollräkna med en miniräknare mot det som faktiskt står i listan, så
 *  avrunda FÖRST och summera sedan. */
export function summeraVisad(rader: GallringRad[]): number {
  return rader.reduce((s, r) => s + Math.round(r.volymM3fub * 10) / 10, 0);
}

/** Trakterna vars sista uttagsdatum ligger i året, med hela sin volym. */
export function traktarForAr(rader: GallringRad[], ar: number): GallringRad[] {
  const prefix = `${ar}-`;
  return rader.filter((r) => !!r.sistaDatum && r.sistaDatum.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Formatering
// ---------------------------------------------------------------------------

/** Volym med en decimal. Ett värde som finns men avrundas till 0,0 skrivs
 *  "<0,1" — annars ser en stock på 9 liter ut som ingenting alls. */
export function fmtVolym(v: number): string {
  if (v > 0 && v < 0.05) return '<0,1';
  return v.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Decimaltal med svenskt komma. Rå JS-formatering ger punkt, och blandade
 *  separatorer i samma vy läser sig som ett fel. */
export function fmtDecimal(v: number, decimaler: number): string {
  return v.toLocaleString('sv-SE', {
    minimumFractionDigits: decimaler,
    maximumFractionDigits: decimaler,
  });
}

/** Andel i procent. Ett trädslag som finns men avrundas till 0 % skrivs
 *  "<1 %" — "Tall 0 %" påstår att tallen inte finns. */
export function fmtAndel(del: number, helhet: number): string {
  if (helhet <= 0 || del <= 0) return '0 %';
  const p = Math.round((del / helhet) * 100);
  return p === 0 ? '<1 %' : `${p} %`;
}

export function fmtAntal(n: number): string {
  return n.toLocaleString('sv-SE');
}

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function kortDatum(iso: string | null): string {
  if (!iso) return '—';
  const [ar, man, dag] = iso.slice(0, 10).split('-');
  return `${Number(dag)} ${MAN[Number(man) - 1] ?? '?'} ${ar}`;
}

/** Datumspann. Ett enda uttagsdatum skrivs som ett datum, inte "X–X". */
export function datumspann(rad: {
  forstaDatum: string | null;
  sistaDatum: string | null;
}): string {
  if (!rad.forstaDatum || !rad.sistaDatum) return 'Datum saknas';
  if (rad.forstaDatum === rad.sistaDatum) return kortDatum(rad.forstaDatum);
  return `${kortDatum(rad.forstaDatum)} – ${kortDatum(rad.sistaDatum)}`;
}

/** Diameterklassens etikett i cm, som förarna läser den. */
export function klassLabel(k: DiameterKlass): string {
  if (k.tillMm === null) return `${k.franMm / 10}+`;
  return `${k.franMm / 10}–${k.tillMm / 10}`;
}
