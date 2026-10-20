// Egenkontrollens kartlager (PR 8a): vilka som finns, vad de heter, när de går att tända och vad som står på en rad som inte går.
//
// RENA FUNKTIONER. Ingen DOM, ingen MapLibre, ingen Supabase - sa att varje text och varje regel gar att prova i vitest.
//
// TRE REGLER SOM INTE FAR GLIDA:
//
//   1. STANDARDEN LAGGER INGET NYTT PA KARTAN. Kontrollpunkter, provytor och observationer ar tanda (det rundan handlar om); planens vagar i
//      full styrka, hyttspar, Vidas traktgrans och stammoln ar slackta. Den nedtonade kontexten (diken, stickvagar, basvagar som inte ar
//      kontrollpunkter) ritas som den alltid gjort - att ta bort nagot som syns idag vore en regression. Raden "Basvag och stickvagar (plan)"
//      LYFTER vagarna till full styrka, den tar inte fram dem.
//
//   2. INGET LAGER TANDS ELLER SLACKS AV SIG SJALVT. Lagret ar tandt for att nagon tryckt pa en rad i menyn eller pa knappen "Visa hyttsparet"
//      i radens rubrikrad - och bada skriver SAMMA varden, sa menyn kan aldrig sta pa "av" medan lagret ar pa. (Ett tillfalligt lyft vid val av
//      Basvag-brickan skulle gora just det: menyn ljuger.)
//
//   3. EN RAD SOM INTE GAR SAGER VARFOR. En gra rad med en mening ("Inget hyttspar for det har objektet") slar en rad som ser trasig ut. Raden
//      finns alltid, aven nar lagret saknas - tystnad lasar man som ett fel.
//
// VALET SPARAS PER ENHET (localStorage), inte per objekt: det ar ett arbetssatt, inte en objektfraga. Och det far aldrig vara nagot vyn BEROR
// pa - kommer lagringen tillbaka tom, privat eller trasig galler standarden.

import type { VidaGrans } from './egenkontrollOrigo';
import { arVagTyp } from './backvag';
import { kontextUtanKontrollpunkter } from './egenkontrollkarta';
import type { SparRoll } from './sparStil';

export type { SparRoll };

// ---------------------------------------------------------------------------
// Nycklarna, standarden och det som sparas
// ---------------------------------------------------------------------------

/** Lagrens nycklar. De fyra forsta fanns innan 8a; id:na ar kontrakt mot lagermenyn, kartan och det sparade valet. */
export const LAGER_NYCKLAR = [
  'ekPunkter', 'ekProvytor', 'ekObservationer',
  'ekPlanVagar', 'ekSparSkordare', 'ekSparSkotare', 'ekVidaGrans', 'ekStammar',
] as const;
export type LagerNyckel = (typeof LAGER_NYCKLAR)[number];
export type LagerVarden = Record<LagerNyckel, boolean>;

/** Standarden: det rundan handlar om ar tant, allt som ar underlag ar slackt. */
export const LAGER_STANDARD: Readonly<LagerVarden> = {
  ekPunkter: true, ekProvytor: true, ekObservationer: true,
  ekPlanVagar: false, ekSparSkordare: false, ekSparSkotare: false, ekVidaGrans: false, ekStammar: false,
};

/** localStorage-nyckeln. Per enhet. */
export const LAGER_LAGRING = 'egenkontroll_lager_v1';

/**
 * Det sparade valet -> varden. Tala bara om det som ar giltigt: en okand nyckel kastas, ett varde som inte ar true/false gar tillbaka till standarden
 * for just den nyckeln, och allt som inte ar ett objekt (trasig JSON, null, en lista) ger standarden. Kastar aldrig.
 */
export function tolkaLagerVal(raw: string | null | undefined): LagerVarden {
  const ut: LagerVarden = { ...LAGER_STANDARD };
  if (typeof raw !== 'string' || raw === '') return ut;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return ut; }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return ut;
  const rad = data as Record<string, unknown>;
  for (const k of LAGER_NYCKLAR) {
    if (typeof rad[k] === 'boolean') ut[k] = rad[k] as boolean;
  }
  return ut;
}

/** Varden -> det som sparas. Bara kanda nycklar, bara true/false. */
export function lagerValTillRaw(v: Record<string, boolean>): string {
  const ut: Record<string, boolean> = {};
  for (const k of LAGER_NYCKLAR) ut[k] = typeof v[k] === 'boolean' ? v[k] : LAGER_STANDARD[k];
  return JSON.stringify(ut);
}

// ---------------------------------------------------------------------------
// Planens vagar
// ---------------------------------------------------------------------------

export type PlanVagar = {
  /** Alla basvagar planeraren ritat: kontrollpunkter OCH kontext. */
  basvagar: number;
  /** Stickvagar (rod, gul, bla). De ar aldrig kontrollpunkter. */
  stickvagar: number;
  /** Hur manga vagar som ligger i den nedtonade kontexten - det raden "lyfter". 0 = inget att lyfta. */
  ikontext: number;
};

type Markering = { data?: unknown; marker_id?: string | null };
type PunktRad = { markering_marker_id: string | null; punkt_typ: string | null };

const arBasvag = (typ: unknown) => typ === 'mainRoad';

function harSparbarLinje(data: unknown): boolean {
  return typeof data === 'object' && data !== null
    && Array.isArray((data as { path?: unknown }).path) && ((data as { path: unknown[] }).path.length >= 2);
}

/**
 * Raknar planens vagar ur samma underlag som kartan ritar: kontextmarkeringarna (utan dem som redan ar kontrollpunkter - de ritas pa full styrka
 * ur sin snapshot) plus kontrollpunkternas basvagar. En markering utan giltig linje raknas inte: den ritas inte heller.
 */
export function raknaPlanVagar(kontext: Markering[], punkter: PunktRad[]): PlanVagar {
  let basvagar = 0;
  let stickvagar = 0;
  let ikontext = 0;
  for (const m of kontextUtanKontrollpunkter(kontext, punkter)) {
    const d = m?.data as { lineType?: unknown } | undefined;
    if (!d || !arVagTyp(d.lineType) || !harSparbarLinje(d)) continue;
    ikontext += 1;
    if (arBasvag(d.lineType)) basvagar += 1; else stickvagar += 1;
  }
  for (const p of punkter) if (arBasvag(p.punkt_typ)) basvagar += 1;
  return { basvagar, stickvagar, ikontext };
}

// ---------------------------------------------------------------------------
// Hyttsparet
// ---------------------------------------------------------------------------


/**
 * Lasningen av hyttspar. null = inte begard an (laddas forst nar menyn oppnas, Basvag-brickan markeras eller ett sparlager ar tandt - ett
 * helt objekts hyttspar ar inget man hamtar i onodan). 'fel' ar ett fel, aldrig "inget spar".
 */
export type SparLasning =
  | { typ: 'laddar' }
  | { typ: 'fel' }
  | { typ: 'ok'; roller: Partial<Record<SparRoll, { dagar: number }>> };

export const SPAR_ROLLER: readonly SparRoll[] = ['skordare', 'skotare'];
export const SPAR_NYCKEL: Record<SparRoll, LagerNyckel> = { skordare: 'ekSparSkordare', skotare: 'ekSparSkotare' };
export const SPAR_ORD: Record<SparRoll, string> = { skordare: 'skördare', skotare: 'skotare' };

/** Lasningen av `hamtaHyttspar` -> det lagermenyn behover veta. Rader utan linjer raknas inte. */
export function sparLasningUr(rader: { roll: SparRoll; linjer: unknown[]; dagar?: number }[]): SparLasning {
  const roller: Partial<Record<SparRoll, { dagar: number }>> = {};
  for (const r of rader) {
    if (!SPAR_ROLLER.includes(r.roll) || r.linjer.length === 0) continue;
    roller[r.roll] = { dagar: typeof r.dagar === 'number' && r.dagar > 0 ? r.dagar : 1 };
  }
  return { typ: 'ok', roller };
}

// ---------------------------------------------------------------------------
// Raderna i menyn
// ---------------------------------------------------------------------------

/** Samma form som EgetLager i components/KartLagerMeny.tsx (de ar strukturellt lika; lib importerar aldrig en komponent). */
export type LagerRad = {
  id: LagerNyckel;
  namn: string;
  beskrivning: string;
  /** Lagret finns inte for det har objektet / gar inte att lasa: raden ar gra, visar "av" och gar inte att trycka pa. beskrivning sager varfor. */
  avstangd?: boolean;
  grupp: string;
  /** Rollfarg for en spar-rad: sa man ser vilken farg som ar vilken maskin. Farg ar aldrig ensam - namnet star pa raden. */
  farg?: string;
};

export type LagerIndata = {
  /** Origot som markeringarna laser med ar betrott (beslutaOrigo). Annars ritas inga markeringar alls. */
  origoOk: boolean;
  kontextStatus: 'laddar' | 'ok' | 'fel';
  planVagar: PlanVagar;
  spar: SparLasning | null;
  vida: VidaGrans;
  /** Stammolnets rad sager sitt eget tillstand (page.tsx: stamBeskrivning). */
  stammarText: string;
  /** Rollfargerna (lib/sparStil). Skickas in sa den har filen inte beror pa kartstilen. */
  rollFarg: Record<SparRoll, string>;
};

export const GRUPP_RUNDAN = 'Egenkontrollen';
export const GRUPP_PLAN = 'Plan och körning';

/** Texterna pa raderna som inte gar. En kalla sa att testet och menyn aldrig kan se olika ut. */
export const LAGER_TEXT = {
  planOrigo: 'Basvägen går inte att placera säkert på kartan',
  planLaddar: 'Läser planens vägar …',
  planFel: 'Planens vägar kunde inte läsas',
  planIngen: 'Planen har ingen basväg eller stickväg för det här objektet',
  planRedanFull: 'Basvägarna ligger redan i full styrka bland kontrollpunkterna',
  sparLaddar: 'Läser hyttspåret …',
  sparFel: 'Kunde inte läsas – öppna menyn igen för att försöka på nytt',
  sparIngen: 'Inget hyttspår för det här objektet',
  vidaLaddar: 'Läser Vidas traktgräns …',
  vidaFel: 'Kunde inte läsas – ladda om sidan',
  vidaIngen: 'Vida har ingen traktgräns för det här objektet',
} as const;

const antal = (n: number, en: string, flera: string) => `${n.toLocaleString('sv-SE')} ${n === 1 ? en : flera}`;

function planRad(i: LagerIndata): LagerRad {
  const bas = { id: 'ekPlanVagar' as const, namn: 'Basväg och stickvägar (plan)', grupp: GRUPP_PLAN };
  const av = (beskrivning: string): LagerRad => ({ ...bas, beskrivning, avstangd: true });
  // Origot forst: utan det finns ingen kontext att lyfta, och det ar det enda skal vi inte kan se pa plats.
  if (!i.origoOk) return av(LAGER_TEXT.planOrigo);
  if (i.kontextStatus === 'laddar') return av(LAGER_TEXT.planLaddar);
  if (i.kontextStatus === 'fel') return av(LAGER_TEXT.planFel);
  const { basvagar, stickvagar, ikontext } = i.planVagar;
  if (ikontext > 0) {
    const delar = [
      basvagar > 0 ? antal(basvagar, 'basväg', 'basvägar') : null,
      stickvagar > 0 ? antal(stickvagar, 'stickväg', 'stickvägar') : null,
    ].filter(Boolean).join(' · ');
    return { ...bas, beskrivning: `${delar} – ritas utan nedtoning` };
  }
  return av(basvagar > 0 ? LAGER_TEXT.planRedanFull : LAGER_TEXT.planIngen);
}

function sparRader(i: LagerIndata): LagerRad[] {
  const grupp = GRUPP_PLAN;
  // En gemensam rad nar det inte finns nagot att dela upp: laddar, fel, eller inget spar alls.
  const gemensam = (beskrivning: string): LagerRad[] =>
    [{ id: 'ekSparSkordare', namn: 'Hyttspår', beskrivning, avstangd: true, grupp }];
  if (i.spar === null || i.spar.typ === 'laddar') return gemensam(LAGER_TEXT.sparLaddar);
  if (i.spar.typ === 'fel') return gemensam(LAGER_TEXT.sparFel);
  const roller = i.spar.roller;
  if (SPAR_ROLLER.every((r) => !roller[r])) return gemensam(LAGER_TEXT.sparIngen);
  return SPAR_ROLLER.map((roll) => {
    const finns = roller[roll];
    const rad: LagerRad = {
      id: SPAR_NYCKEL[roll], namn: `Hyttspår · ${SPAR_ORD[roll]}`, grupp, farg: i.rollFarg[roll],
      beskrivning: finns
        ? antal(finns.dagar, 'dag', 'dagar')
        : `Inget hyttspår från ${SPAR_ORD[roll]}n på det här objektet`,
    };
    return finns ? rad : { ...rad, avstangd: true };
  });
}

function vidaRad(i: LagerIndata): LagerRad {
  const bas = { id: 'ekVidaGrans' as const, namn: 'Vidas traktgräns', grupp: GRUPP_PLAN };
  const av = (beskrivning: string): LagerRad => ({ ...bas, beskrivning, avstangd: true });
  if (i.vida.typ === 'laddar') return av(LAGER_TEXT.vidaLaddar);
  if (i.vida.typ === 'fel') return av(LAGER_TEXT.vidaFel);
  if (i.vida.typ === 'saknas') return av(LAGER_TEXT.vidaIngen);
  // Ok men inga ytringar (t.ex. bara linjer i lagret): det finns inget att rita, och det sags.
  if (!i.vida.ringar || i.vida.ringar.length === 0) return av(LAGER_TEXT.vidaIngen);
  const n = i.vida.ringar.length;
  return { ...bas, beskrivning: n === 1 ? 'Traktgränsen ur Vidas leverans' : `${n} traktdelar ur Vidas leverans` };
}

/** Alla rader i menyn, i den ordning de ritas. Gruppen "Egenkontrollen" forst: det rundan handlar om. */
export function lagerRader(i: LagerIndata): LagerRad[] {
  return [
    { id: 'ekPunkter', namn: 'Kontrollpunkter', beskrivning: 'Punkterna ur planen, färgade efter svar', grupp: GRUPP_RUNDAN },
    { id: 'ekProvytor', namn: 'Provytor', beskrivning: 'Lottade ytor, mätta och omätta', grupp: GRUPP_RUNDAN },
    { id: 'ekObservationer', namn: 'Observationer', beskrivning: 'Det du själv noterat ute på rundan', grupp: GRUPP_RUNDAN },
    planRad(i),
    ...sparRader(i),
    vidaRad(i),
    { id: 'ekStammar', namn: 'Avverkade stammar', beskrivning: i.stammarText, grupp: GRUPP_PLAN },
  ];
}

/**
 * Vilka lager som GAR att tanda for det har objektet just nu: raderna som inte ar avstangda, plus alla som alltid finns. Ett lager som inte
 * gar att tanda ar inte tandt - aven om det sparade valet sager ja (valet ligger kvar och galler nar lagret finns igen, pa ett annat objekt).
 */
export function lagerTillgangliga(i: LagerIndata): Record<LagerNyckel, boolean> {
  const ut = { ...LAGER_STANDARD } as Record<LagerNyckel, boolean>;
  for (const k of LAGER_NYCKLAR) ut[k] = true;
  for (const rad of lagerRader(i)) if (rad.avstangd) ut[rad.id] = false;
  // Spar-raden delas inte alltid upp: ar den gemensam (laddar/fel/inget) ar BADA rollerna otillgangliga, inte bara den som har raden.
  const s = i.spar;
  if (s === null || s.typ !== 'ok') { ut.ekSparSkordare = false; ut.ekSparSkotare = false; }
  else for (const roll of SPAR_ROLLER) if (!s.roller[roll]) ut[SPAR_NYCKEL[roll]] = false;
  return ut;
}

/** Det som ritas: valet och att lagret finns. */
export function effektivaLager(val: Record<string, boolean>, till: Record<LagerNyckel, boolean>): Record<LagerNyckel, boolean> {
  const ut = {} as Record<LagerNyckel, boolean>;
  for (const k of LAGER_NYCKLAR) ut[k] = val[k] === true && till[k];
  return ut;
}

// ---------------------------------------------------------------------------
// Knappen "Visa hyttsparet" i radens rubrikrad (Basvag-brickan)
// ---------------------------------------------------------------------------

/** En basvag-punkt: planens basvag (mainRoad) eller utforandets "Risning av basvag". Det ar dem knappen visas pa. */
export function arBasvagPunkt(punktTyp: string | null | undefined): boolean {
  return punktTyp === 'mainRoad' || punktTyp === 'risning_basvag';
}

export type SparKnapp =
  | { typ: 'visa' | 'dolj'; etikett: string }
  /** Inget att visa: en dampad text i stallet for en knapp. */
  | { typ: 'ingen'; etikett: string };

/** Rollerna som har spar. null = okant an (laddar eller inte begart): da raknas bada som mojliga, trycket tander dem och kartan ritar de som finns. */
function rollerMedSpar(i: LagerIndata): SparRoll[] | null {
  if (i.spar === null || i.spar.typ !== 'ok') return null;
  const roller = i.spar.roller;
  return SPAR_ROLLER.filter((r) => !!roller[r]);
}

/**
 * Knappen i Basvag-brickans rubrikrad. EN knapp som skriver samma varden som menyn (spar for de roller som finns + planens vagar i full styrka);
 * ar allt redan tant star "Dolj hyttsparet" och trycket slacker det igen. Okant (laddar) ar en vanlig knapp - trycket tander lagren och
 * lagret ritas nar spåret kommit.
 */
export function sparKnapp(i: LagerIndata, val: Record<string, boolean>): SparKnapp {
  if (i.spar !== null && i.spar.typ === 'fel') return { typ: 'ingen', etikett: 'Spåret kunde inte läsas' };
  const finns = rollerMedSpar(i);
  if (finns !== null && finns.length === 0) return { typ: 'ingen', etikett: 'Inget hyttspår' };
  const roller = finns ?? SPAR_ROLLER;
  const till = lagerTillgangliga(i);
  const sparPa = roller.every((r) => val[SPAR_NYCKEL[r]] === true);
  const planPa = !till.ekPlanVagar || val.ekPlanVagar === true;
  return sparPa && planPa
    ? { typ: 'dolj', etikett: 'Dölj hyttspåret' }
    : { typ: 'visa', etikett: 'Visa hyttspåret' };
}

/** Trycket pa knappen: nya varden. Ror bara spar- och planlagren - allt annat i valet lamnas som det ar. */
export function tillampaSparKnapp(i: LagerIndata, val: Record<string, boolean>): Record<string, boolean> {
  const k = sparKnapp(i, val);
  if (k.typ === 'ingen') return val;
  const pa = k.typ === 'visa';
  const ut = { ...val };
  for (const r of rollerMedSpar(i) ?? SPAR_ROLLER) ut[SPAR_NYCKEL[r]] = pa;
  if (lagerTillgangliga(i).ekPlanVagar) ut.ekPlanVagar = pa;
  return ut;
}
