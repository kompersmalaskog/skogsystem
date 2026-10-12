import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { haversine } from "@/utils/geo";

/**
 * GET /api/routing?fromLat=&fromLng=&toLat=&toLng=[&withDuration=1]
 *
 * Returnerar körsträcka i km mellan två WGS84-punkter. Försöker först
 * slå i route_cache (koord avrundade till 3 decimaler). Vid miss anropas
 * OpenRouteService. Om ORS-nyckel saknas eller ORS fallerar används
 * haversine × 1.4 som fallback (ingen cache för fallback).
 *
 * withDuration=1: returnera även ORS-restid i minuter. En cache-träff utan
 * lagrad restid behandlas då som miss (ORS fyller på duration_min i cachen).
 * Restid finns aldrig för fallback — då är minutes null, ingen gissning.
 *
 * Svar: { km:number, minutes:number|null, source:'cache'|'ors'|'fallback' }
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

    const withDuration = u.searchParams.get("withDuration") === "1";
    // withGeometry=1: returnera även ORS väggeometri (GeoJSON [lng,lat]-koordinater). Geometrin
    // lagras INTE i route_cache (ingen kolumn) → en geometri-begäran går alltid till ORS, aldrig
    // cache-genväg. km/restid cachas som vanligt. Fallback/fel → geometry:null (aldrig påhittad).
    const withGeometry = u.searchParams.get("withGeometry") === "1";

    const { data: hit } = await supabase
      .from("route_cache")
      .select("distance_km, duration_min")
      .eq("from_lat", rFrom_lat).eq("from_lng", rFrom_lng)
      .eq("to_lat", rTo_lat).eq("to_lng", rTo_lng)
      .maybeSingle();

    // Träff räcker bara om restid inte efterfrågas (eller redan lagrad) OCH geometri inte efterfrågas
    if (hit && (!withDuration || hit.duration_min != null) && !withGeometry) {
      return NextResponse.json({ km: hit.distance_km, minutes: hit.duration_min ?? null, source: "cache" });
    }

    const key = process.env.ORS_API_KEY;
    let orsError: string | null = null; // skäl loggas + skickas med (withGeometry) så klienten kan visa varför
    if (key) {
      try {
        // POST-geojson med radiuses=2000 m: punkter mitt i bestånd (t.ex. Vällust) ligger > 350 m
        // (ORS default) från väg → kod 2010. 2000 m som reserv snappar dem till närmaste väg.
        const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson`;
        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/geo+json" },
          body: JSON.stringify({ coordinates: [[rFrom_lng, rFrom_lat], [rTo_lng, rTo_lat]], radiuses: [2000, 2000] }),
        });
        if (r.ok) {
          const body: any = await r.json();
          const meters = body?.features?.[0]?.properties?.summary?.distance;
          const seconds = body?.features?.[0]?.properties?.summary?.duration;
          if (Number.isFinite(meters)) {
            const km = Math.round(meters / 1000);
            const minutes = Number.isFinite(seconds) ? Math.round(seconds / 60) : null;
            await supabase.from("route_cache").upsert(
              { from_lat: rFrom_lat, from_lng: rFrom_lng, to_lat: rTo_lat, to_lng: rTo_lng, distance_km: km, duration_min: minutes },
              { onConflict: "from_lat,from_lng,to_lat,to_lng" },
            );
            const geometry = Array.isArray(body?.features?.[0]?.geometry?.coordinates) ? body.features[0].geometry.coordinates : null;
            return NextResponse.json({ km, minutes, source: "ors", ...(withGeometry ? { geometry } : {}) });
          }
          orsError = `ors utan distance: ${JSON.stringify(body?.error ?? body).slice(0, 200)}`;
          console.warn("[routing]", orsError);
        } else {
          const txt = await r.text().catch(() => "");
          orsError = `ors ${r.status}: ${txt.slice(0, 200)}`;
          console.warn("[routing] ORS-fel", orsError);
        }
      } catch (e: any) {
        orsError = `ors-undantag: ${e?.message || String(e)}`;
        console.warn("[routing]", orsError);
      }
    } else {
      orsError = "ingen ORS_API_KEY";
    }

    // Cache-träffen utan restid är fortfarande bättre än haversine för km (men saknar geometri)
    if (hit) {
      return NextResponse.json({ km: hit.distance_km, minutes: null, source: "cache", ...(withGeometry ? { geometry: null, orsError } : {}) });
    }

    const km = Math.round(haversine(fromLat, fromLng, toLat, toLng) * 1.4);
    return NextResponse.json({ km, minutes: null, source: "fallback", ...(withGeometry ? { geometry: null, orsError } : {}) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
