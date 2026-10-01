// Förarens objektlista — gruppering + sortering (sektion C i förarflödet).
//
// Rena funktioner: tar objekt + position + maskinkontext, returnerar de fyra grupperna
// HÄR / PÅGÅENDE / PLANERADE / AVSLUTADE och sorterar inom grupp. Ingen DB, inga React-beroenden.
// UI:t (ObjektValjare) konsumerar detta; tills statusrapporten finns räknas ett objekt med
// hyttspår/lass senaste 7 dagarna som pågående — anroparen beräknar det och sätter aktivSenaste7.

import {
  objektInnehallerPunkt,
  maskinKlararObjekt,
  arTilldelad,
  type KlararTyp,
  type ObjektForVal,
} from './objektPlats';

export interface ForareObjekt extends ObjektForVal {
  namn?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** hyttspår/lass ≤ 7 dagar → räknas som pågående tills statusrapporten finns (beräknas av anroparen). */
  aktivSenaste7?: boolean | null;
  /** objekt.avslutad_timestamp (ISO) — styr ordningen i AVSLUTADE. */
  avslutad_timestamp?: string | null;
}

export interface ForareGrupper {
  har: ForareObjekt[];
  pagaende: ForareObjekt[];
  planerade: ForareObjekt[];
  avslutade: ForareObjekt[];
}

const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
/** Fågelvägs-avstånd i meter. */
export function avstandM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const harPos = (o: ForareObjekt): o is ForareObjekt & { lat: number; lng: number } =>
  typeof o.lat === 'number' && typeof o.lng === 'number';

/** Komparator inom en grupp: maskinens typ matchar FÖRST (spec C), sedan närmaste, sedan namn.
 *  Tilldelat-denna-maskin bryter lika FÖRE typ (egna objekt högst), men är främst en chip-markering. */
function inomGruppSort(
  pos: { lat: number; lng: number } | null | undefined,
  maskinId: string | null | undefined,
  klararTyp: KlararTyp,
) {
  return (a: ForareObjekt, b: ForareObjekt): number => {
    const ta = arTilldelad(a, maskinId) ? 0 : 1;
    const tb = arTilldelad(b, maskinId) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    const ka = maskinKlararObjekt(klararTyp, a) ? 0 : 1;
    const kb = maskinKlararObjekt(klararTyp, b) ? 0 : 1;
    if (ka !== kb) return ka - kb;
    if (pos && harPos(a) && harPos(b)) {
      const da = avstandM(pos.lat, pos.lng, a.lat, a.lng);
      const db = avstandM(pos.lat, pos.lng, b.lat, b.lng);
      if (da !== db) return da - db;
    } else if (pos && harPos(a) !== harPos(b)) {
      return harPos(a) ? -1 : 1; // objekt med koordinat före utan, när vi har en position
    }
    return String(a.namn || a.id).localeCompare(String(b.namn || b.id), 'sv');
  };
}

/** Är statusen en "pågående"-status (inkl. de äldre skordning/skotning)? */
function arPagaende(status: string | null | undefined): boolean {
  const t = (status || '').toLowerCase();
  return t === 'pagaende' || t === 'skotning' || t === 'skordning';
}

/** Dela upp förarens objekt i HÄR / PÅGÅENDE / PLANERADE / AVSLUTADE och sortera inom grupp.
 *  Varje objekt hamnar i EXAKT en grupp, prioritet HÄR > PÅGÅENDE > PLANERADE > AVSLUTADE.
 *  Avslutade går alltid till AVSLUTADE (även om man står inne i dem). Objekt med en status
 *  utanför planerad/pågående/avslutad visas inte (spec B: förare ser just de tre). */
export function grupperaForareObjekt(args: {
  objekt: ForareObjekt[];
  pos?: { lat: number; lng: number } | null;
  maskinId?: string | null;
  klararTyp?: KlararTyp;
}): ForareGrupper {
  const { objekt, pos, maskinId, klararTyp } = args;
  const har: ForareObjekt[] = [], pagaende: ForareObjekt[] = [], planerade: ForareObjekt[] = [], avslutade: ForareObjekt[] = [];
  for (const o of objekt || []) {
    const st = (o.status || '').toLowerCase();
    if (st === 'avslutat' || st === 'klar') { avslutade.push(o); continue; }
    if (pos && objektInnehallerPunkt(o.geometri, pos.lat, pos.lng)) { har.push(o); continue; }
    if (arPagaende(st) || o.aktivSenaste7 === true) { pagaende.push(o); continue; }
    if (st === 'planerad') { planerade.push(o); continue; }
    // annan/okänd status → visas inte i förarlistan
  }
  const cmp = inomGruppSort(pos, maskinId, klararTyp);
  har.sort(cmp); pagaende.sort(cmp); planerade.sort(cmp);
  avslutade.sort(sorteraAvslutade);
  return { har, pagaende, planerade, avslutade };
}

/** AVSLUTADE: senast avslutat överst (avslutad_timestamp fallande); saknar timestamp → sist. */
export function sorteraAvslutade(a: ForareObjekt, b: ForareObjekt): number {
  const ta = a.avslutad_timestamp ? Date.parse(a.avslutad_timestamp) : NaN;
  const tb = b.avslutad_timestamp ? Date.parse(b.avslutad_timestamp) : NaN;
  const va = Number.isNaN(ta) ? -Infinity : ta;
  const vb = Number.isNaN(tb) ? -Infinity : tb;
  if (va !== vb) return vb - va; // nyast först
  return String(a.namn || a.id).localeCompare(String(b.namn || b.id), 'sv');
}
