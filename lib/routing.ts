import { haversine } from "@/utils/geo";

/**
 * Serverside routing-helpers: cache-lookup → ORS → haversine-fallback.
 * Delas mellan /api/routing, /api/km-summary och /api/km-chain.
 */

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** En route-lookup-begäran mellan två WGS84-punkter. */
export interface RouteRequest {
  fromLat: number; fromLng: number;
  toLat: number;   toLng: number;
}

/** Svar: km + vilken källa datan kom från. */
export interface RouteResult {
  km: number;
  source: "cache" | "ors" | "fallback";
}

/**
 * Slår i route_cache först (koord avrundas till 3 decimaler), sen ORS om
 * nyckel finns och allowOrs=true. Vid miss/ORS-fel: haversine × 1.4.
 * ORS-träff upsertas i cachen. Fallback cachas inte.
 */
export async function routeKm(
  supabase: any,
  req: RouteRequest,
  allowOrs: boolean,
): Promise<RouteResult> {
  const fL = round3(req.fromLat);
  const fLn = round3(req.fromLng);
  const tL = round3(req.toLat);
  const tLn = round3(req.toLng);

  const { data: hit } = await supabase
    .from("route_cache")
    .select("distance_km")
    .eq("from_lat", fL).eq("from_lng", fLn)
    .eq("to_lat", tL).eq("to_lng", tLn)
    .maybeSingle();
  if (hit) return { km: hit.distance_km, source: "cache" };

  const key = process.env.ORS_API_KEY;
  if (allowOrs && key) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${fLn},${fL}&end=${tLn},${tL}`;
      const r = await fetch(url, { headers: { Authorization: key, Accept: "application/geo+json" } });
      if (r.ok) {
        const body: any = await r.json();
        const meters = body?.features?.[0]?.properties?.summary?.distance;
        if (Number.isFinite(meters)) {
          const km = Math.round(meters / 1000);
          await supabase.from("route_cache").upsert(
            { from_lat: fL, from_lng: fLn, to_lat: tL, to_lng: tLn, distance_km: km },
            { onConflict: "from_lat,from_lng,to_lat,to_lng" },
          );
          return { km, source: "ors" };
        }
      } else {
        console.warn("[routing] ORS", r.status, await r.text().catch(() => ""));
      }
    } catch (e: any) {
      console.warn("[routing] ORS-fel", e?.message || String(e));
    }
  }

  return { km: Math.round(haversine(req.fromLat, req.fromLng, req.toLat, req.toLng) * 1.4), source: "fallback" };
}

/** Ett segment i en körkedja: från-etikett → till-etikett = X km. */
export interface Segment {
  fromLabel: string;
  toLabel: string;
  km: number;
  source: string;
}

export interface Point {
  lat: number;
  lng: number;
  label: string; // "Hem", "Hössjömåla" etc
}

/**
 * Bygger hela km-kedjan genom en lista av punkter: [hem, obj1, ..., objN, hem].
 * Hoppar över segment där endera punkten saknar koord — loggas men bryter inte
 * kedjan. Max orsBudget ORS-anrop (övriga använder cache eller haversine).
 */
export async function bygKedjaKm(
  supabase: any,
  punkter: (Point | null)[],
  orsBudget: number,
): Promise<{ segments: Segment[]; totalKm: number; orsAnrop: number }> {
  const segments: Segment[] = [];
  let totalKm = 0;
  let orsAnrop = 0;

  for (let i = 0; i < punkter.length - 1; i++) {
    const a = punkter[i];
    const b = punkter[i + 1];
    if (!a || !b) {
      console.warn("[km-chain] hoppar över segment", i, "— punkt saknas", { a, b });
      continue;
    }
    const res = await routeKm(
      supabase,
      { fromLat: a.lat, fromLng: a.lng, toLat: b.lat, toLng: b.lng },
      orsAnrop < orsBudget,
    );
    if (res.source === "ors") orsAnrop++;
    segments.push({ fromLabel: a.label, toLabel: b.label, km: res.km, source: res.source });
    totalKm += res.km;
  }

  return { segments, totalKm, orsAnrop };
}
