// "Om något händer" — rutinkorten, nödkoordinaten och vem man ringer. Spec: "Arbetsmiljö i Skogsystem – spec", Om något händer.
//
// Allt här fungerar UTAN TÄCKNING:
//  - Korten står i koden (inte i databasen), så de finns så fort sidan finns. Ändras de: ändra här.
//  - Telefonnumren och traktenas larmplatser sparas på enheten (localStorage, NOD_NYCKEL) varje gång appen har nät, och läses
//    därifrån när den inte har det. Positionen kommer från telefonens/datorns GPS, som inte behöver nät.
//  - Sidan och dess filer sparas av service workern (public/sw.js, "nod-cacha").
// Ren modul utom läs/skriv av localStorage.

export type Rutinkort = {
  id: string;
  titel: string;
  /** Högst tre steg. */
  steg: [string, string, string];
};

/** Ordningen är den på skärmen. Tre steg per kort, korta meningar (spec: "max 3 steg"). */
export const RUTINKORT: Rutinkort[] = [
  { id: 'skadad', titel: 'Någon är skadad', steg: ['Ring 112 och läs upp koordinaten.', 'Stoppa blödning med tryckförband.', 'Ring arbetsledningen.'] },
  { id: 'brand', titel: 'Det brinner', steg: ['Stäng av motorn, ta släckaren och gå ut.', 'Släck om det går – annars ring 112.', 'Ring arbetsledningen.'] },
  { id: 'oga', titel: 'Olja i ögat', steg: ['Spola med ögonflaskan i minst 15 minuter.', 'Ring 1177, eller 112 om det inte blir bättre.', 'Rapportera vad som hände.'] },
  { id: 'lacka', titel: 'Oljeläckage', steg: ['Stäng av och stoppa läckan.', 'Lägg ut absorbent eller saneringsduk.', 'Rapportera med en bild.'] },
  { id: 'valt', titel: 'Maskinen har vält', steg: ['Sitt kvar med bältet på tills den står still.', 'Stäng av motorn och gå ut försiktigt.', 'Ring arbetsledningen.'] },
  { id: 'kraftledning', titel: 'Kraftledning träffad', steg: ['Sitt kvar i hytten.', 'Ring 112 och säg "kraftledning".', 'Hoppa bara ut om det brinner – jämfota, rör aldrig maskinen och marken samtidigt.'] },
  { id: 'fast', titel: 'Maskinen sitter fast', steg: ['Stäng av. Gå aldrig under kran eller last.', 'Ring arbetsledningen innan någon börjar dra.', 'Ingen står i vajerns eller kedjans linje.'] },
];

export function hittaKort(id: string | null | undefined): Rutinkort | null {
  return RUTINKORT.find(k => k.id === id) ?? null;
}

export type Kontakt = { namn: string; telefon: string };
export type Larmplats = { objektId: string; namn: string; lat: number; lng: number; beskrivning: string | null };
export type Position = { lat: number; lng: number; noggrannhet: number | null };

/** Koordinaten som den läses upp för 112: WGS84 med fem decimaler (som larmkoordinaten i resten av appen). */
export function koordinatText(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** "N 56.84321 · E 15.22190" — två rader på skärmen, lätt att läsa upp. */
export function koordinatRader(lat: number, lng: number): [string, string] {
  return [`N ${lat.toFixed(5)}`, `E ${lng.toFixed(5)}`];
}

export function avstandM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** En larmplats räknas som "här" inom så här många meter från där man står. */
export const LARMPLATS_NARA_M = 3000;

/**
 * Vilken trakts larmplats som gäller. Med position: den närmaste inom 3 km (står man inte vid någon trakt finns ingen).
 * Utan position: traktens som enheten senast hade öppen, om den finns bland larmplatserna. Annars ingen — aldrig en gissning.
 */
export function valjLarmplats(platser: Larmplats[], pos: Position | null, senasteObjektId: string | null): Larmplats | null {
  if (pos) {
    let bast: Larmplats | null = null;
    let bastM = Infinity;
    for (const p of platser) {
      const m = avstandM(pos, p);
      if (m < bastM) { bast = p; bastM = m; }
    }
    return bast && bastM <= LARMPLATS_NARA_M ? bast : null;
  }
  if (senasteObjektId) return platser.find(p => p.objektId === senasteObjektId) ?? null;
  return null;
}

/** "Ring Martin" / "Ring Martin eller Joacim" som rubrik; knapparna är en per person. */
export function ringText(k: Kontakt): string {
  return `Ring ${k.namn}`;
}

/** tel:-länk utan mellanslag och bindestreck. */
export function telLank(nummer: string): string {
  return `tel:${nummer.replace(/[^\d+]/g, '')}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Det som sparas på enheten.
// ---------------------------------------------------------------------------------------------------------------------

export const NOD_NYCKEL = 'nod_v1';

export type NodData = { kontakter: Kontakt[]; larmplatser: Larmplats[]; hamtad: number };

export function tolkaNod(raw: string | null | undefined): NodData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || !Array.isArray(p.kontakter) || !Array.isArray(p.larmplatser) || typeof p.hamtad !== 'number') return null;
    const kontakter = (p.kontakter as unknown[]).filter((k): k is Kontakt =>
      !!k && typeof (k as Kontakt).namn === 'string' && typeof (k as Kontakt).telefon === 'string' && (k as Kontakt).telefon.trim() !== '');
    const larmplatser = (p.larmplatser as unknown[]).filter((l): l is Larmplats =>
      !!l && typeof (l as Larmplats).objektId === 'string' && Number.isFinite((l as Larmplats).lat) && Number.isFinite((l as Larmplats).lng));
    return { kontakter, larmplatser, hamtad: p.hamtad };
  } catch {
    return null;
  }
}

export function lasNod(): NodData | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return tolkaNod(localStorage.getItem(NOD_NYCKEL));
  } catch { return null; }
}

export function sparaNod(d: NodData): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(NOD_NYCKEL, JSON.stringify(d));
  } catch { /* fullt eller blockerat — sidan läser från nätet nästa gång */ }
}

/** Objektet enheten senast hade öppen — maskindatorns minne först, sedan planeringens. Ägaren kontrolleras inte: det är bara en hint. */
export function senasteObjektPaEnheten(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    for (const nyckel of ['enhet_senaste_objekt_v1', 'planering_senaste_objekt_v1']) {
      const raw = localStorage.getItem(nyckel);
      if (!raw) continue;
      const p = JSON.parse(raw);
      if (p && typeof p.objektId === 'string' && p.objektId) return p.objektId;
    }
  } catch { /* inget minne */ }
  return null;
}
