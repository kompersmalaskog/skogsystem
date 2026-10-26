// HYTTSPÅRENS RITSTIL — en källa för körvyns lager (egen/hist/andras) OCH planeringsvyns lager (planspar-*).
//
// Apple-Maps-look: färgad kärna + LJUS casing (vit) som lyfter linjen från busig bakgrund (raster, gränser, basvägar). Casing ~2,5 px bredare än linjen.
// Zoom-interpolerad bredd (Martin: 2 px @ z13, 4 px @ z15, 6 px @ z17) med floors vid låg/hög zoom så bredden aldrig extrapolerar till noll/negativt.
// ABSOLUTA rollfärger (Martin): skotare = grönt, skördare = lila — SAMMA i alla vyer, oberoende av vem som tittar.
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

export const ROLLFARG_SKOTARE = '#34c759';
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

// ── DÄMPADE SPÅR på planeringskartan (Martin 2026-10-26) ──────────────────────────────────────────────────────────────────────────────────────────────
// Kartan är full av annat man inte får köra på eller fälla mot, och spåren är bara underlag. Tunna linjer (2–3 px), EN dämpad färg per roll, låg opacitet och ingen
// ljus kant: många passeringar blir naturligt tätare (varje linje lägger till sin del), aldrig en neongrön klump. Äldre dagar bleknar med åldern (`alder`, dagar sedan
// spåret kördes, sätts på featuren av den som läser raderna). Skördarens spår syns tydligare än skotarens — skotaren följer stråken — men ligger under basvägen
// (lib/lagerOrdning). ROLLFARG_* ovan är rollernas IDENTITETSfärger (Uppföljning, objektkartan, A4-rapporten) och rörs inte: det här är bara hur spåret ritas på kartan.
export const SPAR_DAMPAD_FARG: Readonly<Record<SparRoll, string>> = { skordare: '#b093c9', skotare: '#7fae8d' };
/** Efter så här många dagar har ett spår bleknat helt ner till sin lägsta opacitet. */
export const SPAR_BLEKNA_DAGAR = 14;

export interface DampatSpar {
  farg: string;
  /** Linjebredd i px (2–3). */
  bredd: number;
  /** Ett tal, eller (för tidigare dagar) ett uttryck på featurens `alder`. */
  opacitet: number | any[];
  /** Den ljusa kanten är borta: den gjorde varje spår till en vit-grön klump. */
  casingOpacitet: 0;
}

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
 *   skördare: 3 px, 0,6 (planering 0,6 → 0,2, historik 0,55 → 0,15 efter 14 dagar) — den andres (skotarens syn) 0,65 → 0,2: synligt men under basvägen
 *   skotare : 2 px, 0,5 (planering 0,5 → 0,12, historik 0,4 → 0,1) — den andres 0,4 → 0,1
 * Eget spår idag (live) är alltid dagens värde.
 */
export function dampatSpar(roll: SparRoll, art: SparArt): DampatSpar {
  const farg = SPAR_DAMPAD_FARG[roll];
  if (roll === 'skordare') {
    switch (art) {
      case 'hist': return { farg, bredd: 3, opacitet: sparBlekning(0.55, 0.15), casingOpacitet: 0 };
      case 'andras': return { farg, bredd: 3, opacitet: sparBlekning(0.65, 0.2), casingOpacitet: 0 };
      case 'plan': return { farg, bredd: 3, opacitet: sparBlekning(0.6, 0.2), casingOpacitet: 0 };
      default: return { farg, bredd: 3, opacitet: 0.6, casingOpacitet: 0 };
    }
  }
  switch (art) {
    case 'hist': return { farg, bredd: 2, opacitet: sparBlekning(0.4, 0.1), casingOpacitet: 0 };
    case 'andras': return { farg, bredd: 2, opacitet: sparBlekning(0.4, 0.1), casingOpacitet: 0 };
    case 'plan': return { farg, bredd: 2, opacitet: sparBlekning(0.5, 0.12), casingOpacitet: 0 };
    default: return { farg, bredd: 2, opacitet: 0.5, casingOpacitet: 0 };
  }
}
