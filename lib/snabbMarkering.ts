// Snabbmarkering i körvyn: tryck på en räknare i objektpillen (Högstubbar / Evighetsträd) eller på en symbol i snabbarket →
// markeringen läggs på MASKINENS position, ett kvitto "Högstubbe satt — Ångra" står kvar i 5 s, och Ångra tar bort den.
//
// Rena funktioner. Själva sparandet går genom körvyns vanliga markörflöde (setMarkers → planering_markeringar-synken), och Ångra
// genom den vanliga deleteMarker (som även raderar raden i databasen). Här bor bara reglerna så de kan testas.

/** Hur länge kvittot med Ångra står kvar (ms). */
export const KVITTO_MS = 5000;

export interface Position { lat: number; lon: number }

export type PlaceringsSkal = 'ingen-position' | 'gammal-position';

/**
 * Får vi sätta en markering på maskinens position nu? En markering på en GAMMAL position är värre än ingen: efter
 * åldersvakten (lib/gpsKalla) betyder `fixFarsk=false` att positionen inte längre är maskinens. Då sätts inget, och
 * föraren får veta varför i stället för att få en högstubbe på fel plats.
 */
export function kanPlaceraPaPosition(
  pos: Position | null | undefined,
  fixFarsk: boolean,
): { ok: true; pos: Position } | { ok: false; skal: PlaceringsSkal } {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return { ok: false, skal: 'ingen-position' };
  if (!fixFarsk) return { ok: false, skal: 'gammal-position' };
  return { ok: true, pos };
}

export const placeringsFelText = (skal: PlaceringsSkal): string =>
  skal === 'ingen-position' ? 'Ingen position än — kan inte sätta markeringen' : 'GPS-positionen är gammal — kan inte sätta markeringen';

/** Typer som räknas mot miljökravet; de får `antal: 1` precis som när planeraren sätter dem (prompten "Hur många?"). */
const RAKNADE_TYPER = new Set(['highstump', 'eternitytree', 'naturecorner']);

export interface SnabbMarkering {
  id: number;
  type: string;
  x: number;
  y: number;
  isMarker: true;
  comment: string;
  antal?: number;
}

/** Markören i samma form som planeringens egen utsättning (id, type, x, y, isMarker, comment). */
export function nyMarkering(typ: string, id: number, x: number, y: number): SnabbMarkering {
  const m: SnabbMarkering = { id, type: typ, x, y, isMarker: true, comment: '' };
  if (RAKNADE_TYPER.has(typ)) m.antal = 1;
  return m;
}

/** Listan utan markeringen (Ångra). Andra markeringar rörs aldrig. */
export function angraMarkering<T extends { id: unknown }>(markers: readonly T[], id: unknown): T[] {
  return markers.filter((m) => String(m.id) !== String(id));
}

export const kvittoRubrik = (namn: string): string => `${namn} satt`;

/** Återstående ms för ett kvitto (0 = borta). */
export function kvittoKvar(skapadMs: number, nuMs: number, varaktighetMs: number = KVITTO_MS): number {
  return Math.max(0, skapadMs + varaktighetMs - nuMs);
}
