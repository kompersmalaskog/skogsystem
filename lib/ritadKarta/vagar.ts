// Vägarna i Ritad ur Trafikverkets vägdatabas NVDB (Martin 2026-11-03: OpenStreetMap saknar många skogsbilvägar ute i skogen).
// NVDB har hela vägnätet — också enskilda vägar och skogsbilvägar — och varje länk har en funktionell vägklass 0–9 (0 = störst).
// Rent och testbart; hämtningen bor i app/api/ritad-karta/vagar/route.ts (nyckeln är serverns, aldrig webbläsarens).
//
//   • Området = trakten + VAG_MARGINAL_M åt alla håll. NVDB:s filter tar bara länkar som ligger HELT inne i rutan, så rutan är större
//     än det som ritas: en väg som går ut ur trakten följer med.
//   • Klass 0–5 = allmän väg (bred, ljus), 6–9 och okänd = skogsväg (smalare). Samma grusfärg som OpenStreetMaps vägar (lib/ritadKarta/stil).
//   • Ett svar som inte går att läsa ger inga vägar — aldrig en gissad väg. OpenStreetMaps vägar ligger kvar under.

export type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number };
export type VagSlag = 'stor' | 'skog';
export type VagFeature = { type: 'Feature'; properties: { k: VagSlag }; geometry: { type: 'LineString'; coordinates: [number, number][] } };
export type VagFC = { type: 'FeatureCollection'; features: VagFeature[] };

/** Rutan som frågas är trakten + så här många meter (NVDB tar bara länkar som ligger helt inne i rutan). */
export const VAG_MARGINAL_M = 1500;
/** Högst så här många länkar läses (sidor om 1 000). Fler än så i ett traktområde betyder fel område, inte fler vägar. */
export const VAG_MAX_LANKAR = 5000;
/** Klass 0–5 i NVDB:s funktionella vägklass är allmän väg; 6–9 är de minsta vägarna (skogsbilvägar, enskilda vägar). */
export const VAG_STOR_TOM_KLASS = 5;

/** Rutan runt traktens ringar ([lng, lat]) + marginal, i WGS84. */
export function vagBox(ringar: [number, number][][], marginalM = VAG_MARGINAL_M): Bbox | null {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const r of ringar ?? []) for (const p of r ?? []) {
    const [lon, lat] = p;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
  }
  if (!Number.isFinite(minLat)) return null;
  const dLat = marginalM / 111_320;
  const dLon = marginalM / (111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return { minLat: minLat - dLat, maxLat: maxLat + dLat, minLon: minLon - dLon, maxLon: maxLon + dLon };
}

/** "LINESTRING Z (lon lat höjd, ...)" eller "MULTILINESTRING Z ((...),(...))" → linjer i [lon, lat]. */
export function tolkaWkt(wkt: unknown): [number, number][][] {
  if (typeof wkt !== 'string') return [];
  const delar = wkt.match(/\(([^()]*)\)/g) ?? [];
  const ut: [number, number][][] = [];
  for (const d of delar) {
    const pts = d.slice(1, -1).split(',').map((p) => p.trim().split(/\s+/).map(Number))
      .filter((t) => Number.isFinite(t[0]) && Number.isFinite(t[1]))
      .map((t) => [t[0], t[1]] as [number, number]);
    if (pts.length >= 2) ut.push(pts);
  }
  return ut;
}

/**
 * Vägklassen ur en NVDB-rad. Fältets exakta namn är inte bekräftat mot API:t härifrån, så det första fältet vars namn innehåller "klass"
 * och som är ett heltal 0–9 tas. Inget sådant = null (räknas som skogsväg: en okänd väg ritas hellre smal än som en allmän väg).
 */
export function vagKlass(rad: Record<string, unknown>): number | null {
  for (const [k, v] of Object.entries(rad ?? {})) {
    if (!/klass/i.test(k)) continue;
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d$/.test(v.trim()) ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 0 && n <= 9) return n;
  }
  return null;
}

export const vagSlag = (klass: number | null): VagSlag => (klass != null && klass <= VAG_STOR_TOM_KLASS ? 'stor' : 'skog');

/** NVDB:s rader (objekttypen FunktionellVägklass) → vägar att rita. Rader utan geometri hoppas över. */
export function nvdbTillVagar(rader: unknown[]): VagFC {
  const features: VagFeature[] = [];
  for (const r of rader ?? []) {
    const rad = (r ?? {}) as Record<string, any>;
    const k = vagSlag(vagKlass(rad));
    for (const coords of tolkaWkt(rad?.Geometry?.['WKT-WGS84-3D'])) {
      features.push({ type: 'Feature', properties: { k }, geometry: { type: 'LineString', coordinates: coords } });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Är svaret från servern en användbar vägsamling? (Det sparade i enheten kan vara gammalt eller trasigt.) */
export function arVagFC(v: unknown): v is VagFC {
  return !!v && (v as any).type === 'FeatureCollection' && Array.isArray((v as any).features);
}
