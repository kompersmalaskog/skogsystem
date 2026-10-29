// HYTTSPÅRENS RITSTIL — en källa för körvyns lager (egen/hist/andras) OCH planeringsvyns lager (planspar-*).
//
// Apple-Maps-look: färgad kärna + LJUS casing (vit) som lyfter linjen från busig bakgrund (raster, gränser, basvägar). Casing ~2,5 px bredare än linjen.
// Zoom-interpolerad bredd (Martin: 2 px @ z13, 4 px @ z15, 6 px @ z17) med floors vid låg/hög zoom så bredden aldrig extrapolerar till noll/negativt.
// ABSOLUTA rollfärger (Martin): skotare = turkos, skördare = lila — SAMMA i alla vyer, oberoende av vem som tittar.
//
// SKÖRDARENS LINJE (Martin 2026-10-08): jämn bredd ~3 px, full färg, ALLA dagar och i alla lager. Skotaren följer stråken — den måste vara lika tydlig
// vare sig man ser den som eget spår (skördar-körvyn), tidigare dagar, den andres spår (skotar-körvyn, där den förut tonades ned till 55 %) eller i
// planeringsvyn. Skotarens linje är OFÖRÄNDRAD (zoom-bredd, eget spår 0,95 / den andres 0,55).

export const HYTTSPAR_CASING_COLOR = '#ffffff';
export const HYTTSPAR_LINE_WIDTH: any = ['interpolate', ['linear'], ['zoom'], 11, 1.5, 13, 2, 15, 4, 17, 6, 19, 8];
export const HYTTSPAR_CASING_WIDTH: any = ['interpolate', ['linear'], ['zoom'], 11, 4, 13, 4.5, 15, 6.5, 17, 8.5, 19, 10.5];
// Historiken (tidigare dagars eget-spår i körvyn) något smalare + dämpad casing-opacitet.
export const HYTTSPAR_HIST_LINE_WIDTH: any = ['interpolate', ['linear'], ['zoom'], 11, 1, 13, 1.5, 15, 3, 17, 4.5, 19, 6];
export const HYTTSPAR_HIST_CASING_WIDTH: any = ['interpolate', ['linear'], ['zoom'], 11, 3, 13, 3.5, 15, 5, 17, 6.5, 19, 8];

// Skotaren turkos (Martin 2026-10-29): grönt krockade med granhögarna och hänsynsytornas gröna kant; turkos är ledig i kartans färgspråk.
export const ROLLFARG_SKOTARE = '#64d2ff';
export const ROLLFARG_SKORDARE = '#bf5af2';
export const rollFarg = (roll: 'skordare' | 'skotare' | null | undefined): string =>
  roll === 'skotare' ? ROLLFARG_SKOTARE : ROLLFARG_SKORDARE;

/** Skördarens linje: jämn bredd (px), full opacitet. Casing +2,5 px (samma som resten av appens hyttspår), ljus. */
export const SKORDARSPAR_LINJE_BREDD = 3;
export const SKORDARSPAR_LINJE_OPACITET = 1;
export const SKORDARSPAR_CASING_BREDD = 5.5;
export const SKORDARSPAR_CASING_OPACITET = 0.8;

export type SparRoll = 'skordare' | 'skotare';
/** egen = dagens eget spår (live) · hist = eget spår tidigare dagar · andras = den andra maskinens spår (körvy) · plan = planeringsvyns lager */
export type SparArt = 'egen' | 'hist' | 'andras' | 'plan';

export interface SparStil {
  farg: string;
  linjeBredd: any; linjeOpacitet: number;
  casingBredd: any; casingOpacitet: number;
}

/** Stilen för en rolls spår i ett lager. Skördare: samma jämna 3 px full färg överallt. Skotare: som förut. */
export function sparStil(roll: SparRoll, art: SparArt): SparStil {
  if (roll === 'skordare') {
    return {
      farg: ROLLFARG_SKORDARE,
      linjeBredd: SKORDARSPAR_LINJE_BREDD, linjeOpacitet: SKORDARSPAR_LINJE_OPACITET,
      casingBredd: SKORDARSPAR_CASING_BREDD, casingOpacitet: SKORDARSPAR_CASING_OPACITET,
    };
  }
  const farg = ROLLFARG_SKOTARE;
  switch (art) {
    case 'hist': return { farg, linjeBredd: HYTTSPAR_HIST_LINE_WIDTH, linjeOpacitet: 0.95, casingBredd: HYTTSPAR_HIST_CASING_WIDTH, casingOpacitet: 0.45 };
    case 'andras': return { farg, linjeBredd: HYTTSPAR_LINE_WIDTH, linjeOpacitet: 0.55, casingBredd: HYTTSPAR_CASING_WIDTH, casingOpacitet: 0.5 };
    case 'egen':
    case 'plan':
    default: return { farg, linjeBredd: HYTTSPAR_LINE_WIDTH, linjeOpacitet: 0.95, casingBredd: HYTTSPAR_CASING_WIDTH, casingOpacitet: 0.8 };
  }
}

// ── SPÅREN PÅ PLANERINGSKARTAN (Martin 2026-10-26 dämpade, 2026-10-27 för svaga → tydligare) ─────────────────────────────────────────────────────────
// Spåren är underlag, men de får inte bli grå och döda mot flygfotot: rollernas egna färger (ROLLFARG_*: skördare lila, skotare turkos), 3 px skördare och 2,5 px skotare,
// dagens spår med opacitet ~0,9, och en smal mörk kant under (som vägarna, VAG_KANT_FARG) så linjen bär mot både flygfoto och vit karta. Många passeringar blir ändå
// tätare, inte klumpigare, eftersom linjen är tunn. Äldre dagar bleknar med åldern (`alder`, dagar sedan spåret kördes, sätts på featuren av den som läser raderna) men
// golvet är högt (~0,45) så en vecka gammalt spår fortfarande syns. Lagerordningen är orörd: spår under vägar, linjer och symboler (lib/lagerOrdning).
// ROLLFARG_* är rollernas identitetsfärger överallt (Uppföljning, objektkartan, A4-rapporten) — spåret använder dem nu också. `SPAR_DAMPAD_FARG` (de dämpade nyanserna från
// 2026-10-26) används inte längre av kartan och finns kvar bara som referens i testet.
export const SPAR_DAMPAD_FARG: Readonly<Record<SparRoll, string>> = { skordare: '#b093c9', skotare: '#7fae8d' };
/** Efter så här många dagar har ett spår bleknat helt ner till sin lägsta opacitet. */
export const SPAR_BLEKNA_DAGAR = 14;
/** Den smala mörka kanten under spåret — samma som vägarnas (lib/kartstil VAG_KANT_FARG; testet håller dem lika). */
export const SPAR_KANT_FARG = 'rgba(0,0,0,0.9)';
/** Kanten sticker ut en pixel på vardera sidan om linjen. */
export const SPAR_KANT_EXTRA_PX = 2;

export interface DampatSpar {
  farg: string;
  /** Linjebredd i px: ett uttryck på zoom som är tunt på översiktsnivå och 3 (skördare) / 2,5 (skotare) när man arbetar nära. */
  bredd: any[];
  /** Ett tal, eller (för tidigare dagar) ett uttryck på featurens `alder`. */
  opacitet: number | any[];
  /** Den mörka kanten under linjen: färg, bredd (linjen + 2 px) och opacitet (som linjens, något svagare) — syns först när man zoomat in (SPAR_KANT_FRAN_ZOOM). */
  kantFarg: string;
  kantBredd: any[];
  kantOpacitet: any[];
}

/**
 * Tunna spår på översiktsnivå (Martin 2026-10-27: inne i trakten ska flygfotot synas i full skärpa). Spårens bredd är pixlar, inte meter — på översiktsnivå
 * betyder en fast bredd att många passeringar tillsammans täcker trakten och gråar ner fotot, så linjen tunnas ut med zoom och den mörka kanten (som gör
 * linjen läsbar mot ljus mark) kommer först när man är nära nog att se enskilda spår.
 */
export const SPAR_ZOOM_FRAN = 13;       // under så här: tunnast
export const SPAR_ZOOM_TILL = 17;       // från så här: full bredd
export const SPAR_KANT_FRAN_ZOOM = 15.5;   // under så här: ingen kant alls
export const SPAR_KANT_FULL_ZOOM = 17;     // från så här: full kant
const sparBredd = (full: number): any[] => ['interpolate', ['linear'], ['zoom'], SPAR_ZOOM_FRAN, 1, 15, Math.max(1, full - 0.5), SPAR_ZOOM_TILL, full];
/** Kantens bredd: linjens + 2 px, på samma zoomsteg. */
const sparKantBredd = (full: number): any[] => ['interpolate', ['linear'], ['zoom'], SPAR_ZOOM_FRAN, 1 + SPAR_KANT_EXTRA_PX, 15, Math.max(1, full - 0.5) + SPAR_KANT_EXTRA_PX, SPAR_ZOOM_TILL, full + SPAR_KANT_EXTRA_PX];
/** Opaciteten på kanten: 0 på översiktsnivå, sedan upp till `op` (tal eller uttryck på `alder`). */
const sparKantOp = (op: number | any[]): any[] => ['interpolate', ['linear'], ['zoom'], SPAR_KANT_FRAN_ZOOM, 0, SPAR_KANT_FULL_ZOOM, op];

/** Opaciteten för ett spår som är `idag` (alder 0) och bleknar till `aldst` efter SPAR_BLEKNA_DAGAR dagar. Utan `alder` på featuren räknas den som dagens. */
export function sparBlekning(idag: number, aldst: number): any[] {
  return ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'alder']], 0], 0, idag, SPAR_BLEKNA_DAGAR, aldst];
}

/** Dagar mellan spårets datum (YYYY-MM-DD) och idag (YYYY-MM-DD), aldrig negativt. Saknas datumet gäller dagens (0): vi gissar inte att något är gammalt. */
export function sparAlder(datum: string | null | undefined, idagIso: string): number {
  const a = Date.parse(`${String(datum ?? '').slice(0, 10)}T00:00:00Z`), b = Date.parse(`${idagIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Stilen för en rolls spår i ett lager.
 *   skördare: 3 px, dagens 0,9 (planering/den andres 0,9 → 0,45 efter 14 dagar, historik 0,85 → 0,45)
 *   skotare : 2,5 px, samma värden
 * Eget spår idag (live) är alltid dagens värde. Kanten är linjen + 2 px i VAG_KANT_FARG med 80 % av linjens opacitet.
 */
export function dampatSpar(roll: SparRoll, art: SparArt): DampatSpar {
  const farg = roll === 'skordare' ? ROLLFARG_SKORDARE : ROLLFARG_SKOTARE;
  const full = roll === 'skordare' ? 3 : 2.5;
  const ut = (opacitet: number | any[], kantOpacitet: number | any[]): DampatSpar => ({ farg, bredd: sparBredd(full), opacitet, kantFarg: SPAR_KANT_FARG, kantBredd: sparKantBredd(full), kantOpacitet: sparKantOp(kantOpacitet) });
  const blek = (idag: number, aldst: number) => ut(sparBlekning(idag, aldst), sparBlekning(idag * 0.8, aldst * 0.8));
  switch (art) {
    case 'hist': return blek(0.85, 0.45);
    case 'andras':
    case 'plan': return blek(0.9, 0.45);
    default: return ut(0.9, 0.72);
  }
}
