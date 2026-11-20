// Syntetiska traktgränser och spår för tester (samma form som objekt_geometri.geometri: en FeatureCollection med L_TRAKTDEL).
import type { TraktGeometriFC } from '../objektPlats';

/** En kvadratisk traktgräns runt (lat,lng) med halva sidan `d` grader (≈ 111 km per grad lat). */
export function kvadrat(lat: number, lng: number, d: number): TraktGeometriFC {
  const ring: [number, number][] = [
    [lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d],
  ];
  return {
    type: 'FeatureCollection',
    features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
}

/** En rad punkter [{lat,lng,tid}] längs en linje, `stegLat`/`stegLng` grader mellan punkterna, tid en minut isär från `start`. */
export function spar(lat0: number, lng0: number, antal: number, stegLat = 0.0002, stegLng = 0.0001, start = '2026-10-09T08:00:00.000Z') {
  const t0 = Date.parse(start);
  return Array.from({ length: antal }, (_, i) => ({ lat: lat0 + i * stegLat, lng: lng0 + i * stegLng, tid: new Date(t0 + i * 60000).toISOString() }));
}
