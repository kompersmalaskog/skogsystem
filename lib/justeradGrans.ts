// EN sanning för traktgränsen (Martin 2026-11-25: "justerad gräns ska gälla överallt").
//
// "Justera gräns" sparar en KOPIA av Vidas traktdel som en boundary-markör (planering_markeringar, fromVidaTd = delens nyckel, path = SVG-x/y mot objektets origo).
// Det gör att allt som läser Vidas gräns på servern (vyn objekt_traktgrans → objektlistans "Här", traktanalysen, skogsdatan) såg Vidas ORIGINAL. Här byggs
// ögonblicksbilden i lng/lat — med samma omräkning som sidan själv ritar med — som skrivs till objekt_traktgrans_justerad (RPC satt_justerad_traktgrans, bara admin);
// vyn byter sedan ut precis de Vida-delar som har en kopia. Markörerna är fortfarande sanningen; tabellen är bara deras lng/lat-avtryck, härlett ur markörerna VARJE gång
// (aldrig tillagt för hand), så den kan inte glida: ändras kopiorna ändras signaturen, raderas de töms tabellen.
//
// Ren logik (ingen React, ingen databas) — kopplingen sitter i app/planering/page.tsx och lib/justeradGransSynk.ts. Testas i lib/justeradGrans.test.ts.

export type LngLat = [number, number];
export interface JusteradDel { partKey: string; ring: LngLat[] }

/** Hur långt utanför Vidas traktdelar en justerad kopia får ligga (m) innan vi tror att origot är fel och vägrar skriva något. En planerare flyttar hörn tiotals meter, inte hundratals. */
export const JUSTERAD_MARGINAL_M = 300;

/** Koordinaterna avrundas till 7 decimaler (~1 cm): signaturen blir stabil mot flyttalsbrus och tabellen slipper onödiga ändringar. */
const avrunda = (v: number): number => Math.round(v * 1e7) / 1e7;

interface MarkorIn { id?: unknown; isLine?: boolean; lineType?: string; fromVidaTd?: unknown; path?: { x: number; y: number }[]; andradTs?: number }

export type ByggSvar =
  | { ok: true; delar: JusteradDel[] }
  | { ok: false; skal: string };

/**
 * Objektets justerade traktdelar ur markörerna: varje boundary-markör med fromVidaTd (≥ 3 hörn) → en del { partKey, ring i lng/lat }.
 * Finns två markörer för samma del gäller den senast ändrade (andradTs, annars högst id). `tillLatLon` är sidans egen svgToLatLon.
 *
 * Skyddsnät: ligger något hörn mer än JUSTERAD_MARGINAL_M utanför Vidas delar (eller är ett tal ogiltigt) är origot troligen fel — då skrivs INGET (`ok: false`):
 * hellre ingen justerad gräns på servern än en som ligger på fel ställe och styr "Här", traktanalys och skogsdata.
 */
export function byggJusteradeDelar(
  markers: readonly MarkorIn[],
  vidaDelar: readonly { ringLngLat: readonly LngLat[] }[],
  tillLatLon: (x: number, y: number) => { lat: number; lon: number },
): ByggSvar {
  const perDel = new Map<string, { m: MarkorIn; ts: number; id: number }>();
  for (const m of markers) {
    if (!(m && m.isLine && m.lineType === 'boundary' && m.fromVidaTd != null && String(m.fromVidaTd) !== '')) continue;
    if (!Array.isArray(m.path) || m.path.length < 3) continue;
    const nyckel = String(m.fromVidaTd);
    const ts = Number(m.andradTs) || 0, id = Number(m.id) || 0;
    const had = perDel.get(nyckel);
    if (!had || ts > had.ts || (ts === had.ts && id > had.id)) perDel.set(nyckel, { m, ts, id });
  }
  if (perDel.size === 0) return { ok: true, delar: [] };

  // Vidas utsträckning (alla delar) + marginal.
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const d of vidaDelar) for (const [lng, lat] of d.ringLngLat) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return { ok: false, skal: 'Vidas traktdelar är inte lästa' };
  const mLat = JUSTERAD_MARGINAL_M / 111320;
  const mLng = JUSTERAD_MARGINAL_M / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));

  const delar: JusteradDel[] = [];
  for (const [partKey, { m }] of [...perDel.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ring: LngLat[] = [];
    for (const p of m.path!) {
      const ll = tillLatLon(p.x, p.y);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) return { ok: false, skal: `ogiltigt hörn i ${partKey}` };
      if (ll.lon < minLng - mLng || ll.lon > maxLng + mLng || ll.lat < minLat - mLat || ll.lat > maxLat + mLat) {
        return { ok: false, skal: `hörnen i ${partKey} ligger långt utanför Vidas traktdelar (origot stämmer inte)` };
      }
      ring.push([avrunda(ll.lon), avrunda(ll.lat)]);
    }
    // Öppen ring: ta bort en dubblett-slutpunkt.
    if (ring.length >= 2) { const a = ring[0], z = ring[ring.length - 1]; if (a[0] === z[0] && a[1] === z[1]) ring.pop(); }
    if (ring.length < 3) continue;
    delar.push({ partKey, ring });
  }
  return { ok: true, delar };
}

/** Stabil signatur: samma justerade gräns → samma text. Tom text = inga justerade delar. */
export function justeradSignatur(delar: readonly JusteradDel[]): string {
  return delar.length ? JSON.stringify(delar) : '';
}
