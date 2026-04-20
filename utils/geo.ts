/**
 * Fågelvägsavstånd mellan två WGS84-koordinater (haversine), i kilometer.
 */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // jordradie km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Uppskattad vägsträcka från fågelvägsavstånd. 1.3× är en grov faktor
 * som fungerar bra för svensk landsbygd utan OSRM/OSM-lookup.
 */
export function vägKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return Math.round(haversine(lat1, lng1, lat2, lng2) * 1.3);
}
