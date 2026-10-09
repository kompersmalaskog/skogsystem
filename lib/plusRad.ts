// PLUS-DOCKAN: plusknappen expanderar åt vänster till en mörk docka nere till höger (körvyn OCH planeringen — samma komponent).
//
//   • SEX symbolknappar, sedan ett avdelarstreck, "Alla" och ×. Dockan fylls BARA med symboler: Högstubbe och Evighetsträd finns i
//     pillen (körvyn) och mätverktygen, Rita och lagren finns i Alla — de hör inte hemma i dockan. MAX_FASTA = 6.
//   • FASTA först (föraren höll fingret på en symbol → "Fast i dockan"), resten fylls AUTOMATISKT efter mest använt.
//   • Håll fingret på en symbol i dockan → "Lossa" (fast) / "Fast i dockan" (automatisk). Max sex fasta.
//   • Sparas per maskin (localStorage), så valet följer maskinen och överlever omstart.
//
// Rena funktioner → testbara (plusRad.test.ts). Inget här vet något om React eller kartan.

export const PLATSER = 6;
export const MAX_FASTA = PLATSER;

export type RitaId = 'linje' | 'yta';
export type MatId = 'strackan' | 'yta';

export type PlusPost =
  | { typ: 'symbol'; id: string }      // sätt en symbol
  | { typ: 'lager'; id: string }       // växla ett kartlager På/Av
  | { typ: 'rita'; id: RitaId }        // Rita linje / Rita yta
  | { typ: 'matning'; id: MatId };     // Mät sträcka / Mät yta

export const RITA_IDS: readonly RitaId[] = ['linje', 'yta'];
export const MAT_IDS: readonly MatId[] = ['strackan', 'yta'];

export const RITA_NAMN: Readonly<Record<RitaId, string>> = { linje: 'Rita linje', yta: 'Rita yta' };
export const MAT_NAMN: Readonly<Record<MatId, string>> = { strackan: 'Mät sträcka', yta: 'Mät yta' };

/** Symboler som redan har en egen knapp i pillen (körvyn) — de fyller aldrig en plats i dockan. De finns kvar i Alla. */
export const PILL_SYMBOLER: readonly string[] = ['highstump', 'eternitytree'];

/** Dockan innan något är använt: dessa sex symboler, i den här ordningen (och som tiebreak mellan lika många användningar). */
export const STANDARD_ORDNING: readonly PlusPost[] = [
  { typ: 'symbol', id: 'wet' },
  { typ: 'symbol', id: 'steep' },
  { typ: 'symbol', id: 'culturemonument' },
  { typ: 'symbol', id: 'landing' },
  { typ: 'symbol', id: 'windfall' },
  { typ: 'symbol', id: 'manualfelling' },
];

export interface PlusRadState {
  /** Fasta platser, i den ordning föraren fäste dem. Max MAX_FASTA. */
  fasta: PlusPost[];
  /** Antal användningar per post (nyckel = postNyckel). Räknas även för fasta, så en lossad post hamnar rätt direkt. */
  anv: Record<string, number>;
}

export interface Lagring { getItem(k: string): string | null; setItem(k: string, v: string): void }

export const postNyckel = (p: PlusPost): string => `${p.typ}:${p.id}`;

/** Får posten ligga i dockan? Bara symboler, och inte de som pillen redan har. */
export const arDockPost = (p: PlusPost): boolean => p.typ === 'symbol' && !PILL_SYMBOLER.includes(p.id);
export const arSammaPost = (a: PlusPost, b: PlusPost): boolean => postNyckel(a) === postNyckel(b);

export const tomtPlusRad = (): PlusRadState => ({ fasta: [], anv: {} });

const MAX_ANV_NYCKLAR = 300;

function giltigPost(x: any): x is PlusPost {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id || x.id.length > 60) return false;
  if (x.typ === 'symbol' || x.typ === 'lager') return true;
  if (x.typ === 'rita') return (RITA_IDS as readonly string[]).includes(x.id);
  if (x.typ === 'matning') return (MAT_IDS as readonly string[]).includes(x.id);
  return false;
}

export function nyckelTillPost(nyckel: string): PlusPost | null {
  const i = nyckel.indexOf(':');
  if (i <= 0) return null;
  const p = { typ: nyckel.slice(0, i), id: nyckel.slice(i + 1) };
  return giltigPost(p) ? (p as PlusPost) : null;
}

/** Tolka sparad JSON. Trasigt, fel form eller okända poster ger aldrig ett fel — de kastas tyst bort. */
export function tolkaPlusRad(raw: string | null | undefined): PlusRadState {
  if (!raw) return tomtPlusRad();
  let p: any;
  try { p = JSON.parse(raw); } catch { return tomtPlusRad(); }
  if (!p || typeof p !== 'object') return tomtPlusRad();
  const fasta: PlusPost[] = [];
  for (const x of Array.isArray(p.fasta) ? p.fasta : []) {
    if (!giltigPost(x)) continue;
    const post = { typ: x.typ, id: x.id } as PlusPost;
    if (!arDockPost(post)) continue;
    if (fasta.some((y) => arSammaPost(y, post))) continue;
    fasta.push(post);
    if (fasta.length >= MAX_FASTA) break;
  }
  const anv: Record<string, number> = {};
  if (p.anv && typeof p.anv === 'object' && !Array.isArray(p.anv)) {
    const poster = Object.entries(p.anv)
      .filter(([k, v]) => nyckelTillPost(k) && typeof v === 'number' && Number.isFinite(v) && v > 0)
      .map(([k, v]) => [k, Math.floor(v as number)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ANV_NYCKLAR);
    for (const [k, v] of poster) anv[k] = v;
  }
  return { fasta, anv };
}

const lagringNu = (): Lagring | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
const maskinDel = (maskinId: string | null | undefined): string => (maskinId && maskinId.trim()) || 'ingen';
export const plusRadNyckel = (maskinId: string | null | undefined): string => `korvy_plusrad_v1:${maskinDel(maskinId)}`;

export function hamtaPlusRad(maskinId: string | null | undefined, lagring: Lagring | null = lagringNu()): PlusRadState {
  try { return tolkaPlusRad(lagring?.getItem(plusRadNyckel(maskinId))); } catch { return tomtPlusRad(); }
}

/** Spara. false = lagringen gick inte att skriva (visas aldrig som ett lyckat spar). */
export function sparaPlusRad(maskinId: string | null | undefined, s: PlusRadState, lagring: Lagring | null = lagringNu()): boolean {
  try {
    if (!lagring) return false;
    lagring.setItem(plusRadNyckel(maskinId), JSON.stringify({ fasta: s.fasta.slice(0, MAX_FASTA), anv: s.anv }));
    return true;
  } catch { return false; }
}

/** En användning till (symbol satt, lager växlat, verktyg startat). */
export function noteraAnvandning(s: PlusRadState, post: PlusPost): PlusRadState {
  const k = postNyckel(post);
  return { fasta: s.fasta, anv: { ...s.anv, [k]: (s.anv[k] ?? 0) + 1 } };
}

export interface RadPlats { post: PlusPost; fast: boolean }

/**
 * Dockan som ska visas: de fasta först, sedan automatiskt det mest använda tills sex platser är fyllda.
 * Automatiska kandidater = standardsymbolerna + alla symboler som någon gång använts; mest använt först, lika → standardordningen,
 * därefter alfabetiskt (så dockan aldrig hoppar mellan två renderingar). Bara symboler (arDockPost). `finns` filtrerar bort poster som inte
 * längre existerar (en symbol som bytt namn) — både fasta och automatiska.
 */
export function beraknaRad(s: PlusRadState, finns: (p: PlusPost) => boolean = () => true): RadPlats[] {
  const fasta = s.fasta.filter((p) => arDockPost(p) && finns(p)).slice(0, MAX_FASTA);
  const ut: RadPlats[] = fasta.map((post) => ({ post, fast: true }));
  const upptagna = new Set(fasta.map(postNyckel));
  const kandidater = new Map<string, PlusPost>();
  for (const p of STANDARD_ORDNING) kandidater.set(postNyckel(p), p);
  for (const k of Object.keys(s.anv)) { const p = nyckelTillPost(k); if (p && arDockPost(p) && !kandidater.has(k)) kandidater.set(k, p); }
  const stdIndex = (k: string) => { const i = STANDARD_ORDNING.findIndex((p) => postNyckel(p) === k); return i < 0 ? Infinity : i; };
  const sorterade = Array.from(kandidater.entries())
    .filter(([k, p]) => !upptagna.has(k) && finns(p))
    .sort((a, b) => (s.anv[b[0]] ?? 0) - (s.anv[a[0]] ?? 0) || stdIndex(a[0]) - stdIndex(b[0]) || (a[0] < b[0] ? -1 : 1));
  for (const [, post] of sorterade) {
    if (ut.length >= MAX_FASTA) break;
    ut.push({ post, fast: false });
  }
  return ut;
}

export const arFast = (s: PlusRadState, post: PlusPost): boolean => s.fasta.some((p) => arSammaPost(p, post));

export type FastaResultat = { ok: true; state: PlusRadState } | { ok: false; skal: 'full' | 'finns' | 'ej-symbol' };

/** "Fast i dockan". Bara en symbol går att fästa. Är dockan full (sex fasta) får föraren lossa en först — inget byts ut i smyg. */
export function fastaPost(s: PlusRadState, post: PlusPost): FastaResultat {
  if (!arDockPost(post)) return { ok: false, skal: 'ej-symbol' };
  if (arFast(s, post)) return { ok: false, skal: 'finns' };
  if (s.fasta.length >= MAX_FASTA) return { ok: false, skal: 'full' };
  return { ok: true, state: { fasta: [...s.fasta, post], anv: s.anv } };
}

/** "Lossa": posten blir automatisk igen och hamnar där dess användning placerar den. */
export function lossaPost(s: PlusRadState, post: PlusPost): PlusRadState {
  return { fasta: s.fasta.filter((p) => !arSammaPost(p, post)), anv: s.anv };
}
