import { FARG } from './design/tokens';

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

// ── SKOTARLÄGET (Martin 2026-11-01): skotarens eget spår ser ut som skördarens — heldraget, samma bredd — skördarens lite svagare ──────────────
/** Skotarens streck i skotarläget: inget (heldraget, "så det ser ut som ett spår, samma på skördaren"). */
export const SKOTARSPAR_STRECK: readonly number[] | null = null;
/** Skotarens spårband i skotarläget: tydligt redan på översiktsnivå och bredare än vägarna (basvägen ~4–6 px) när man är nära. */
export const SKOTARSPAR_BAND_BREDD: readonly any[] = ['interpolate', ['linear'], ['zoom'], 13, 2, 15, 5, 17, 8, 19, 11];
export const SKOTARSPAR_BAND_KANT: readonly any[] = ['interpolate', ['linear'], ['zoom'], 13, 4, 15, 7, 17, 10, 19, 13];
/** Skördarens spår i skotarläget får så här mycket av sin vanliga opacitet. */
export const SKORDARSPAR_SVAGARE = 0.7;

export interface SkotarlageSpar extends DampatSpar { streck: readonly number[] | null }

/**
 * Stilen i skotarläget: skotarens eget spår (idag och tidigare dagar) får skördarens bredd (3 px) och opacitet men behåller sin turkos och är heldraget;
 * skördarens spår (den andres) är som vanligt men svagare. Allt annat är `dampatSpar`.
 */
export function skotarlageSpar(roll: SparRoll, art: SparArt): SkotarlageSpar {
  if (roll === 'skotare' && (art === 'egen' || art === 'hist')) {
    // Ett BAND, inte en tråd (Martin 2026-11-01, Skälviken: "jag har ju kört där i 4 dagar"): skotaren kör på basvägen och stickvägarna, och
    // vägarna ligger över spåren (lib/lagerOrdning) — en linje lika smal som vägen försvann under den. Bandet är bredare än vägen så den
    // körda vägen ligger i turkos, och historiken bleknar inte (de senaste dagarnas skotning är det skotaren behöver se).
    return {
      farg: ROLLFARG_SKOTARE,
      bredd: SKOTARSPAR_BAND_BREDD as any[],
      opacitet: art === 'egen' ? 0.9 : 0.75,
      kantFarg: SPAR_KANT_FARG,
      kantBredd: SKOTARSPAR_BAND_KANT as any[],
      kantOpacitet: ['interpolate', ['linear'], ['zoom'], SPAR_KANT_FRAN_ZOOM, 0, SPAR_KANT_FULL_ZOOM, art === 'egen' ? 0.7 : 0.55],
      streck: SKOTARSPAR_STRECK,
    };
  }
  const s = dampatSpar(roll, art);
  if (roll === 'skordare' && art === 'andras') {
    const svag = (op: number | any[]): number | any[] => typeof op === 'number' ? op * SKORDARSPAR_SVAGARE : ['*', SKORDARSPAR_SVAGARE, op];
    return { ...s, opacitet: svag(s.opacitet), kantOpacitet: ['*', SKORDARSPAR_SVAGARE, s.kantOpacitet], streck: null };
  }
  return { ...s, streck: null };
}

// ── KÖRSPÅREN SOM SVAR (Martin 2026-11-04, lib/korsparKlart) ─────────────────────────────────────────────────────────────────────────────────────────
// Blått betyder vatten (diken, blött, bäckar). Skotaren ritas därför INTE längre som en turkos linje på kartan: skördarens stråk blir GRÅTT där skotaren
// har kört (featurens `klar`), och skotarens eget spår är bara ett svagt ljust band. ROLLFARG_SKOTARE finns kvar i diagram och listor (Uppföljning), där
// det finns en teckenförklaring. dampatSpar/skotarlageSpar för skotaren används inte av kartan längre.
/** Ett kört stråk: appens grå (samma som "klart" i lib/kartKlart), tunnare, ingen mörk kant. */
export const STRAK_KLAR_FARG = FARG.text2;
export const STRAK_KLAR_OPACITET = 0.9;
/** Ett kört stråk är så här mycket smalare än ett som är kvar. */
export const STRAK_KLAR_BREDD_ANDEL = 0.85;
/** Skotarens band: ljust och svagt, bredare än en linje — "här har skotaren varit". */
export const SKOTAR_BAND_FARG = FARG.text;
export const SKOTAR_BAND_BREDD: readonly any[] = ['interpolate', ['linear'], ['zoom'], 13, 3, 15, 5, 17, 8, 19, 11];
export const SKOTAR_BAND_OPACITET: Readonly<Record<'plan' | 'egen' | 'hist' | 'andras', number>> = { plan: 0.5, andras: 0.5, egen: 0.6, hist: 0.55 };

const KLAR: any[] = ['==', ['get', 'klar'], true];
/** Byter varje stoppvärde i ett zoom-uttryck (['interpolate', …, ['zoom'], z, v, …]) mot ['case', klar, f(v), v]. Ett tal blir ett case direkt. */
function perKlart(v: any, f: (x: any) => any): any {
  // ['*', k, zoom-uttryck] (skotarlägets svagare skördare): flytta in faktorn i stoppen, annars ligger zoom inte överst.
  if (Array.isArray(v) && v[0] === '*' && v.length === 3 && Array.isArray(v[2]) && v[2][0] === 'interpolate' && Array.isArray(v[2][2]) && v[2][2][0] === 'zoom') {
    const z = v[2].slice(0, 3);
    for (let i = 3; i < v[2].length; i += 2) z.push(v[2][i], ['*', v[1], v[2][i + 1]]);
    return perKlart(z, f);
  }
  if (Array.isArray(v) && v[0] === 'interpolate' && Array.isArray(v[2]) && v[2][0] === 'zoom') {
    const ut = v.slice(0, 3);
    for (let i = 3; i < v.length; i += 2) ut.push(v[i], ['case', KLAR, f(v[i + 1]), v[i + 1]]);
    return ut;
  }
  return ['case', KLAR, f(v), v];
}

export interface SparPaint { farg: any; bredd: any; opacitet: any; kantFarg: string; kantBredd: any; kantOpacitet: any; streck: readonly number[] | null }

/** Skördarens stil med kört stråk inbyggt: grått, tunnare och utan kant där `klar` är sant, annars exakt som förut. */
export function medKlart(s: { farg: string; bredd: any; opacitet: any; kantFarg: string; kantBredd: any; kantOpacitet: any; streck?: readonly number[] | null }): SparPaint {
  return {
    farg: ['case', KLAR, STRAK_KLAR_FARG, s.farg],
    bredd: perKlart(s.bredd, (x) => (typeof x === 'number' ? Math.max(1, x * STRAK_KLAR_BREDD_ANDEL) : x)),
    opacitet: ['case', KLAR, STRAK_KLAR_OPACITET, s.opacitet],
    kantFarg: s.kantFarg,
    kantBredd: s.kantBredd,
    kantOpacitet: perKlart(s.kantOpacitet, () => 0),
    streck: s.streck ?? null,
  };
}

/** Skotarens spår på kartan, oavsett var: ett svagt ljust band utan kant. */
export function skotarBand(art: SparArt): SparPaint {
  return { farg: SKOTAR_BAND_FARG, bredd: SKOTAR_BAND_BREDD, opacitet: SKOTAR_BAND_OPACITET[art], kantFarg: SPAR_KANT_FARG, kantBredd: SKOTAR_BAND_BREDD, kantOpacitet: 0, streck: null };
}

/** Kartans stil för en rolls spår i ett lager. Skördare: rollfärgen med kört stråk grått. Skotare: bandet. `skotarlage` = skördarens spår i skotarens körvy (svagare). */
export function kartSpar(roll: SparRoll, art: SparArt, skotarlage = false): SparPaint {
  if (roll === 'skotare') return skotarBand(art);
  return medKlart(skotarlage ? skotarlageSpar(roll, art) : dampatSpar(roll, art));
}
