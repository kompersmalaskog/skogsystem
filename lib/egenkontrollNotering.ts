// Noteringar i en egenkontrollrunda: ORD på en karta (och, i PR 9b, på ett foto) som förklarar vad man tittar på.
//
// TVÅ PRIMITIVER, båda bara ord: en PUNKT med text ("Stenmur.") och en LINJE med text ("Basvägen skulle gått här.").
// En pil är en linje med riktning (`pil`). Kommentaren är ingen tredje sak — den ÄR texten på punkten eller linjen.
// Varje notering har en AVSIKT: "blev" (så här blev det) eller "skulle" (så här skulle det gjorts). Ett fält, inte två verktyg.
//
// OBSERVATION ELLER NOTERING (Martin 2026-10-21, gäller ute på hygget):
//   Observation = en bedömning som ska räknas i rapportens tal.
//   Notering    = ord på en bild eller karta som förklarar vad man tittar på.
// En notering räknas aldrig i talen, har ingen ton och ingen typ, och står inte i listan över fynd.
//
// Tabellen heter egenkontroll_notering (migration 20261021074334/-41). Koordinater lagras som de ritades:
//   karta: [[lng, lat], …]    foto: [[u, v], …] i den lagrade bildens egna koordinater 0..1 (9b).
// Hela filen är ren — inget här når databasen (det gör lib/egenkontroll.ts) eller kartan.

import { giltigPosition } from './egenkontrollObservation';
import { slutaRitning, type LngLat } from './ritaPunkter';

export type NoteringUnderlag = 'karta' | 'foto';
export type NoteringTyp = 'punkt' | 'linje';
export type NoteringAvsikt = 'blev' | 'skulle';
/** Det man väljer att rita. Pil = linje med riktning. */
export type NoteringVerktyg = 'punkt' | 'linje' | 'pil';

export type Notering = {
  id: string;
  egenkontroll_id: string;
  underlag: NoteringUnderlag;
  foto_id: string | null;
  typ: NoteringTyp;
  pil: boolean;
  etikett: string;
  avsikt: NoteringAvsikt;
  koordinater: [number, number][];
  /** Foto: hur långt etiketten dragits från sin förvalda plats, i bildbredder (9b). Alltid null på en karta. */
  etikett_dx: number | null;
  etikett_dy: number | null;
  skapad: string;
  andrad: string;
};

// Gränserna speglar databasen (notering_etikett_langd, egenkontroll_notering_koordinater_ok) — noteringsmigrationen läses av ett test.
export const NOTERING_ETIKETT_MAX = 280;
export const NOTERING_MAX_PUNKTER = 500;
/** Tabellen tillåter ±2 bildbredder (notering_forskjutning_rimlig). */
export const NOTERING_FORSKJUTNING_MAX = 2;

export const NOTERING_VERKTYG: readonly NoteringVerktyg[] = ['punkt', 'linje', 'pil'] as const;
export const VERKTYG_ETIKETT: Record<NoteringVerktyg, string> = { punkt: 'Punkt', linje: 'Linje', pil: 'Pil' };
export const AVSIKT_ETIKETT: Record<NoteringAvsikt, string> = { blev: 'Så här blev det', skulle: 'Så här skulle det gjorts' };
/** Förvald avsikt: de allra flesta noteringar beskriver hur det är. */
export const AVSIKT_STANDARD: NoteringAvsikt = 'blev';

export function arAvsikt(x: unknown): x is NoteringAvsikt {
  return x === 'blev' || x === 'skulle';
}

export function verktygTillForm(v: NoteringVerktyg): { typ: NoteringTyp; pil: boolean } {
  return v === 'punkt' ? { typ: 'punkt', pil: false } : { typ: 'linje', pil: v === 'pil' };
}

/** Etiketten som den sparas: ett stycke, blanksteg hopdragna, trimmad. Radbrytningar i en etikett är aldrig avsikten. */
export function rensaEtikett(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

/** Tom etikett = noteringen finns inte (databasen avvisar en tom etikett med 23514; appen gör DELETE, aldrig UPDATE). */
export function arTomEtikett(text: unknown): boolean {
  return rensaEtikett(text) === '';
}

// ---------------------------------------------------------------------------
// Ritning på kartan
// ---------------------------------------------------------------------------

/** Så många tryck behövs för att verktyget ska kunna avslutas. */
export function minPunkter(v: NoteringVerktyg): number {
  return v === 'punkt' ? 1 : 2;
}

export function kanAvslutaRitning(v: NoteringVerktyg, antalTryck: number): boolean {
  return antalTryck >= minPunkter(v);
}

/** Punkt avslutas av sitt enda tryck; linje och pil av ✓. Efter `max` tryck tas inga fler emot. */
export function arRitningFull(v: NoteringVerktyg, antalTryck: number): boolean {
  return v === 'punkt' ? antalTryck >= 1 : antalTryck >= NOTERING_MAX_PUNKTER;
}

/** Texten i raden nertill medan man ritar. */
export function ritaRadText(v: NoteringVerktyg, antalTryck: number): string {
  if (v === 'punkt') return 'Tryck där punkten ska stå';
  const namn = v === 'pil' ? 'Pil' : 'Linje';
  if (antalTryck === 0) return `${namn}: tryck där den ska börja`;
  if (antalTryck === 1) return `${namn}: tryck där den ska sluta`;
  return `${namn} · ${antalTryck} punkter`;
}

/**
 * Det som sparas när ritningen är klar: EXAKT de tryckta punkterna (lib/ritaPunkter.ts — inga mellanpunkter, ingen utjämning,
 * inga dubbletter på samma plats). null = för få punkter för verktyget, eller en punkt utan riktig position.
 */
export function ritningTillKoordinater(v: NoteringVerktyg, tryck: LngLat[]): LngLat[] | null {
  const k = slutaRitning(tryck, false);
  if (k.length < minPunkter(v)) return null;
  const antal = v === 'punkt' ? 1 : Math.min(k.length, NOTERING_MAX_PUNKTER);
  const ut = k.slice(0, antal);
  return ut.every(([lng, lat]) => giltigPosition(lat, lng)) ? ut : null;
}

/** Samma regel som databasens egenkontroll_notering_koordinater_ok, för kartan: ett fel här ska aldrig bli ett databasfel i skogen. */
export function kartaKoordinaterGiltiga(typ: NoteringTyp, k: unknown): k is [number, number][] {
  if (!Array.isArray(k)) return false;
  if (typ === 'punkt' ? k.length !== 1 : k.length < 2 || k.length > NOTERING_MAX_PUNKTER) return false;
  return k.every((c) =>
    Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number'
    && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);
}

// ---------------------------------------------------------------------------
// Etikettens förskjutning på ett foto (9b) — EN klämfunktion för skärm, sparning och PDF
// ---------------------------------------------------------------------------
//
// Tabellen tillåter ±2 bildbredder, men en etikett får aldrig ligga utanför bilden. Renderaren klämmer därför in den — och om det sparade
// värdet inte också är klämt hamnar etiketten inte där man lade den. Därför klämmer SPARNINGEN med samma funktion som renderingen,
// och den renderar ur det sparade värdet: det som visas är det som ligger i databasen.
//
// Mått i BILDBREDDER (u och förskjutning), v i bildens höjd 0..1; `bildHojd` = höjd / bredd (stående bild > 1). Förskjutningen är
// hur långt etikettens MITT ligger från ankaret (den tryckta platsen).

export type EtikettRuta = { bredd: number; hojd: number };

const DECIMALER = 1e4;
const EPS = 1e-9;
const rundaInat = (x: number) => Math.round(x * DECIMALER) / DECIMALER;
/** Avrundning IN mot bilden: en avrundad etikett får aldrig hamna 0,0001 utanför kanten. */
const uppAvrundat = (x: number) => Math.ceil(x * DECIMALER - EPS) / DECIMALER;
const nerAvrundat = (x: number) => Math.floor(x * DECIMALER + EPS) / DECIMALER;

function klamAxel(ankare: number, forskjutning: number, ruta: number, langd: number): number {
  const lo = ruta / 2;
  const hi = langd - ruta / 2;
  // Etiketten är bredare än bilden: mitten av bilden är det enda rimliga.
  if (lo >= hi) return rundaInat(langd / 2 - ankare);
  const mitt = ankare + forskjutning;
  if (mitt < lo) return uppAvrundat(lo - ankare);
  if (mitt > hi) return nerAvrundat(hi - ankare);
  return rundaInat(forskjutning);
}

export function klamEtikett(i: { u: number; v: number; bildHojd: number; dx: number; dy: number; ruta: EtikettRuta }): { dx: number; dy: number } {
  const ut = {
    dx: klamAxel(i.u, i.dx, i.ruta.bredd, 1),
    dy: klamAxel(i.v * i.bildHojd, i.dy, i.ruta.hojd, i.bildHojd),
  };
  const gr = (x: number) => Math.max(-NOTERING_FORSKJUTNING_MAX, Math.min(NOTERING_FORSKJUTNING_MAX, x));
  return { dx: gr(ut.dx), dy: gr(ut.dy) };
}
