import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { haversine } from "@/utils/geo";

/**
 * GET /api/routing?fromLat=&fromLng=&toLat=&toLng=
 *
 * Returnerar körsträcka i km mellan två WGS84-punkter. Försöker först
 * slå i route_cache (koord avrundade till 3 decimaler). Vid miss anropas
 * OpenRouteService. Om ORS-nyckel saknas eller ORS fallerar används
 * haversine × 1.4 som fallback (ingen cache för fallback).
 *
 * Svar: { km:number, source:'cache'|'ors'|'fallback' }
 */
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const fromLat = Number(u.searchParams.get("fromLat"));
    const fromLng = Number(u.searchParams.get("fromLng"));
    const toLat   = Number(u.searchParams.get("toLat"));
    const toLng   = Number(u.searchParams.get("toLng"));

    for (const v of [fromLat, fromLng, toLat, toLng]) {
      if (!Number.isFinite(v)) {
        return NextResponse.json({ ok: false, error: "fromLat/fromLng/toLat/toLng krävs" }, { status: 400 });
      }
    }

    const rFrom_lat = round3(fromLat);
    const rFrom_lng = round3(fromLng);
    const rTo_lat   = round3(toLat);
    const rTo_lng   = round3(toLng);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: hit } = await supabase
      .from("route_cache")
      .select("distance_km")
      .eq("from_lat", rFrom_lat).eq("from_lng", rFrom_lng)
      .eq("to_lat", rTo_lat).eq("to_lng", rTo_lng)
      .maybeSingle();

    if (hit) {
      return NextResponse.json({ km: hit.distance_km, source: "cache" });
    }

    const key = process.env.ORS_API_KEY;
    if (key) {
      try {
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${rFrom_lng},${rFrom_lat}&end=${rTo_lng},${rTo_lat}`;
        const r = await fetch(url, { headers: { Authorization: key, Accept: "application/geo+json" } });
        if (r.ok) {
          const body: any = await r.json();
          const meters = body?.features?.[0]?.properties?.summary?.distance;
          if (Number.isFinite(meters)) {
            const km = Math.round(meters / 1000);
            await supabase.from("route_cache").upsert(
              { from_lat: rFrom_lat, from_lng: rFrom_lng, to_lat: rTo_lat, to_lng: rTo_lng, distance_km: km },
              { onConflict: "from_lat,from_lng,to_lat,to_lng" },
            );
            return NextResponse.json({ km, source: "ors" });
          }
          console.warn("[routing] ORS svar utan distance", body?.error || body);
        } else {
          console.warn("[routing] ORS-fel", r.status, await r.text().catch(() => ""));
        }
      } catch (e: any) {
        console.warn("[routing] ORS-undantag", e?.message || String(e));
      }
    }

    const km = Math.round(haversine(fromLat, fromLng, toLat, toLng) * 1.4);
    return NextResponse.json({ km, source: "fallback" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
