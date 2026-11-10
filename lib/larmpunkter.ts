// Larmplatserna på en trakt — där räddningstjänsten ska mötas om något händer.
//
// Varför (Martin 2026-11-10): Vida skickar EN larmkoordinat per avlägg, inte en per trakt. På en utspridd gallring
// (Gallring Santhe 2026: elva bitar över 4 km) ligger fem larmpunkter, var och en vid sitt avlägg. Appen sparade bara
// en (objekt.larmkoordinat_*, den sista i filen) och visade den för alla, också för en maskin 3–4 km bort.
//
// Regeln:
//   - Alla Vidas larmpunkter (L_TILLAGGSPUNKTER, FLBESKR "Larmkoordinat", TYP 39) plus objektets egen larmkoordinat
//     (satt av planeraren eller ur traktdirektivet). En punkt inom 50 m från en annan är samma punkt.
//   - Varje punkt får namnet på avlägget den ligger vid (inom 500 m): "Avlägg 01-3 · skbv gräskulla".
//   - Med en FÄRSK position väljs den närmaste (fågelväg). Utan färsk position väljs INGEN — då visas alla och föraren
//     väljer själv. Appen gissar aldrig en larmplats.
// Ren, inga beroenden till kartan eller databasen.
import { avstandPunktM } from './larm/geo';

export interface Larmpunkt {
  lat: number;
  lng: number;
  /** "Avlägg 01-3 · skbv gräskulla", eller null när inget avlägg ligger nära. */
  namn: string | null;
  /** 'vida' = ur Vidas karta; 'objekt' = objektets egen larmkoordinat (planerarens eller traktdirektivets). */
  kalla: 'vida' | 'objekt';
  /** Det här är objektets egen larmkoordinat (den planeraren ändrar), också när den sammanföll med en av Vidas. */
  objektets: boolean;
}

/** Två punkter närmare än så här är samma larmplats (traktdirektivets punkt är en av Vidas). */
export const SAMMA_PUNKT_M = 50;
/** Ett avlägg inom så här långt bort ger larmplatsen sitt namn. Uppmätt Santhe: 20–230 m. */
export const AVLAGG_NAMN_M = 500;
/** En position räknas som färsk så här länge efter sista giltiga fix. */
export const POS_FARSK_MS = 120_000;
/** Står man längre bort än så här från alla larmplatser är man inte på trakten — då väljs ingen på positionen. */
export const PA_TRAKTEN_M = 5000;

type Feature = { properties?: Record<string, unknown> | null; geometry?: { type?: string; coordinates?: unknown } | null };

function punkt(f: Feature): { lat: number; lng: number } | null {
  if (f?.geometry?.type !== 'Point') return null;
  const c = f.geometry.coordinates;
  if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
  if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return { lat: c[1], lng: c[0] };
}

const tillaggspunkt = (f: Feature) => /^L_TILLAGGSPUNKTER$/i.test(String(f?.properties?._lager ?? ''));
const beskr = (f: Feature) => String(f?.properties?.FLBESKR ?? '');
const arLarm = (f: Feature) => tillaggspunkt(f) && /larmkoordinat/i.test(beskr(f));
const arAvlagg = (f: Feature) => tillaggspunkt(f) && /avl[aä]gg/i.test(beskr(f));

function avlaggNamn(f: Feature): string {
  const nr = String(f.properties?.EXTRA_LABE ?? f.properties?.LOPNR ?? '').trim();
  const plats = String(f.properties?.ATGARD ?? '').trim();
  const forsta = nr && nr !== '0' ? `Avlägg ${nr}` : 'Avlägg';
  return plats ? `${forsta} · ${plats}` : forsta;
}

const ll = (p: { lat: number; lng: number }) => ({ lat: p.lat, lon: p.lng });

/** Alla larmplatser på trakten, i Vidas ordning; objektets egen sist om den inte redan finns. */
export function larmpunkterUr(
  features: readonly Feature[] | null | undefined,
  objektLarm: { lat: number; lng: number } | null,
): Larmpunkt[] {
  const fs = features ?? [];
  const avlagg = fs.filter(arAvlagg).map((f) => ({ p: punkt(f), namn: avlaggNamn(f) })).filter((a): a is { p: { lat: number; lng: number }; namn: string } => !!a.p);
  const namnFor = (p: { lat: number; lng: number }): string | null => {
    let bast: string | null = null; let bastM = Infinity;
    for (const a of avlagg) { const m = avstandPunktM(ll(p), ll(a.p)); if (m < bastM) { bastM = m; bast = a.namn; } }
    return bastM <= AVLAGG_NAMN_M ? bast : null;
  };
  const ut: Larmpunkt[] = [];
  const finns = (p: { lat: number; lng: number }) => ut.some((q) => avstandPunktM(ll(p), ll(q)) < SAMMA_PUNKT_M);
  for (const f of fs) {
    if (!arLarm(f)) continue;
    const p = punkt(f);
    if (!p || finns(p)) continue;
    ut.push({ ...p, namn: namnFor(p), kalla: 'vida', objektets: false });
  }
  if (objektLarm && Number.isFinite(objektLarm.lat) && Number.isFinite(objektLarm.lng)) {
    const samma = ut.find((q) => avstandPunktM(ll(objektLarm), ll(q)) < SAMMA_PUNKT_M);
    if (samma) samma.objektets = true;
    else ut.push({ lat: objektLarm.lat, lng: objektLarm.lng, namn: namnFor(objektLarm), kalla: 'objekt', objektets: true });
  }
  return ut;
}

export interface LarmVal {
  /** Den larmplats som gäller: den enda, eller den närmaste med färsk position. null = välj själv bland `alla`. */
  vald: Larmpunkt | null;
  /** Avstånd från positionen till den valda, i meter (bara när den valdes på position). */
  avstandM: number | null;
  /** Alla, närmast först när positionen är färsk, annars i Vidas ordning. */
  alla: Larmpunkt[];
  /** Fler än en, och ingen färsk position: föraren måste välja själv. */
  valjSjalv: boolean;
}

/** Vilken larmplats som gäller just nu. `pos` räknas bara när den är färsk och på trakten (inom 5 km); annars väljs ingen bland flera. */
export function valjLarmpunkt(punkter: readonly Larmpunkt[], pos: { lat: number; lng: number } | null, posFarsk: boolean): LarmVal {
  const alla = [...punkter];
  if (alla.length === 0) return { vald: null, avstandM: null, alla, valjSjalv: false };
  const p = pos && posFarsk && Number.isFinite(pos.lat) && Number.isFinite(pos.lng) ? pos : null;
  if (p) {
    const medM = alla.map((q) => ({ q, m: avstandPunktM(ll(p), ll(q)) })).sort((a, b) => a.m - b.m);
    if (medM[0].m <= PA_TRAKTEN_M) return { vald: medM[0].q, avstandM: medM[0].m, alla: medM.map((x) => x.q), valjSjalv: false };
  }
  if (alla.length === 1) return { vald: alla[0], avstandM: null, alla, valjSjalv: false };
  return { vald: null, avstandM: null, alla, valjSjalv: true };
}

/** Koordinaten som den läses upp för 112: WGS84 med fem decimaler (som i resten av appen). */
export const larmKoordinatText = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

function avstandOrd(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** En rad i listan över alla larmplatser. */
export interface LarmPlatsRad { namn: string; koordinat: string; narmast: boolean }

/** Det korten visar. Samma modell för ⓘ-kortet, förarens kort och "Om något händer". */
export interface LarmVisning {
  /** Någon larmplats finns. */
  satt: boolean;
  /** Den som gäller (vald eller den enda). '' när föraren måste välja själv. */
  koordinat: string;
  /** Avlägget den ligger vid. */
  namn: string | null;
  /** "Närmast dig · 850 m" — bara när den valts bland flera på positionen. */
  narmast: string | null;
  /** Flera larmplatser och ingen färsk position: kortet visar alla och ber föraren välja. */
  valjSjalv: boolean;
  /** Alla larmplatser när de är fler än en (tom annars), i samma ordning som `LarmVal.alla`. */
  platser: LarmPlatsRad[];
}

export function larmVisning(val: LarmVal): LarmVisning {
  const v = val.vald;
  const flera = val.alla.length > 1;
  return {
    satt: val.alla.length > 0,
    koordinat: v ? larmKoordinatText(v) : '',
    namn: v?.namn ?? null,
    narmast: v && flera && val.avstandM != null ? `Närmast dig · ${avstandOrd(val.avstandM)}` : null,
    valjSjalv: val.valjSjalv,
    platser: flera ? val.alla.map((p) => ({
      namn: p.namn ?? 'Larmplats',
      koordinat: larmKoordinatText(p),
      narmast: p === v && val.avstandM != null,
    })) : [],
  };
}

/** Flera larmplatser och ingen färsk position på trakten — texten ovanför listan. */
export const LARM_VALJ_SJALV = 'Appen vet inte var du är – läs upp den larmplats som ligger närmast dig';
