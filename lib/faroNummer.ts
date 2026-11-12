// FARORNA MED NUMMER (Martin 2026-11-12, skissen "kartan är svaret"): samma nummer i förarens lista (Hela trakten) och på kartan.
// EN ordning för båda: farogruppen ur byggOmGrupper (Om trakten), i den ordning listan visar dem. Numret är platsen i den ordningen, 1, 2, 3 …
// Kartan ritar en röd ring med numret och en kort text bredvid (pratbubblan), bara medan listan eller kortet ur listan är öppet.
// Texterna krockar aldrig: MapLibre visar inte en text som skulle ligga ovanpå en annan (numret visas alltid).
import { byggOmGrupper } from './omTrakten';
import type { KartMarkering } from './objektKort';
import { listaPunkt } from './kortFriYta';

/** Farorna i listans ordning (samma som Hela trakten visar under "Vad är farligt?"). */
export function faroMarkeringar(ms: readonly KartMarkering[]): KartMarkering[] {
  return (byggOmGrupper(ms, null, [], []).find((g) => g.grupp === 'faror')?.rader ?? []).flatMap((r) => r.markeringar);
}

/** Kort text för bubblan: första kommentaren, annars namnet — högst 40 tecken. */
export function faroKortText(m: KartMarkering): string {
  const k = (m.kommentarer?.[0]?.text ?? m.comment ?? '').trim().split(/\r?\n/)[0] ?? '';
  const t = k || m.namn || '';
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t;
}

export interface FaroPunkt { id: string; nr: number; lat: number; lng: number; text: string }

/** Punkterna på kartan: en per fara med plats (linjer och ytor: mitten, som listan flyger till). */
export function faroPunkter(ms: readonly KartMarkering[]): FaroPunkt[] {
  const ut: FaroPunkt[] = [];
  faroMarkeringar(ms).forEach((m, i) => {
    const p = listaPunkt(m, null);
    if (p) ut.push({ id: m.id, nr: i + 1, lat: p.lat, lng: p.lng, text: faroKortText(m) });
  });
  return ut;
}

export const FARONR_KALLA = 'larm-faronr-source';
/** Lagren (prefixet larm- = med i körvyns lista och över symbolerna i lib/lagerOrdning). */
export function faroNrLager(farg: { rod: string; vit: string; mork: string }): any[] {
  return [
    { id: 'larm-faronr-cirkel', type: 'circle', source: FARONR_KALLA,
      layout: { 'circle-sort-key': ['case', ['==', ['get', 'vald'], true], 1, 0] },   // den valda överst när två ligger tätt
      paint: { 'circle-radius': 15, 'circle-color': farg.rod, 'circle-stroke-color': farg.vit, 'circle-stroke-width': ['case', ['==', ['get', 'vald'], true], 5, 3], 'circle-pitch-alignment': 'viewport' } },
    { id: 'larm-faronr-text', type: 'symbol', source: FARONR_KALLA,
      layout: { 'text-field': ['to-string', ['get', 'nr']], 'text-size': 16, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true,
        'symbol-z-order': 'source', 'symbol-sort-key': ['case', ['==', ['get', 'vald'], true], 1, 0] },
      paint: { 'text-color': farg.vit } },
    { id: 'larm-faronr-bubbla', type: 'symbol', source: FARONR_KALLA,
      layout: { 'text-field': ['get', 'text'], 'text-size': 15, 'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'], 'text-anchor': 'left', 'text-offset': [1.5, 0],
        'text-max-width': 14, 'text-allow-overlap': false, 'text-optional': true, 'symbol-sort-key': ['case', ['==', ['get', 'vald'], true], 0, ['get', 'nr']] },
      paint: { 'text-color': farg.vit, 'text-halo-color': farg.mork, 'text-halo-width': 4 } },
  ];
}

export function faroNrData(punkter: readonly FaroPunkt[], vald: string | null) {
  return { type: 'FeatureCollection', features: punkter.map((p) => ({ type: 'Feature', properties: { nr: p.nr, text: p.text, vald: p.id === vald }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) };
}
