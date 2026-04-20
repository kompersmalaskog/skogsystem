import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { haversine } from "@/utils/geo";

/**
 * GET /api/km-summary?medarbetare_id=&month=YYYY-MM
 *
 * Räknar ut total körsträcka och km-över-gräns för en medarbetare i en
 * given månad. För varje arbetsdag:
 *   - Om km_morgon/km_kvall/km_totalt finns i DB → använd.
 *   - Annars: räkna fram hem→objekt via route_cache eller ORS
 *     (max 5 ORS-anrop per request, övriga faller till haversine × 1.4).
 *
 * Svar: { totalKm: number, ersattningsKm: number, orsAnrop: number,
 *         berakningar: { datum, objekt_id, km, source }[] }
 */
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const medId = u.searchParams.get("medarbetare_id");
    const month = u.searchParams.get("month");
    if (!medId || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: "medarbetare_id och month (YYYY-MM) krävs" }, { status: 400 });
    }

    const [y, m] = month.split("-").map(Number);
    const fromDate = `${month}-01`;
    const toDate = new Date(y, m, 0).toISOString().slice(0, 10);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const idag = new Date().toISOString().slice(0, 10);

    const [medRes, arbRes, avtalRes] = await Promise.all([
      supabase.from("medarbetare").select("hem_lat, hem_lng").eq("id", medId).maybeSingle(),
      supabase.from("arbetsdag")
        .select("datum, km_morgon, km_kvall, km_totalt, objekt_id")
        .eq("medarbetare_id", medId)
        .gte("datum", fromDate).lte("datum", toDate),
      supabase.from("gs_avtal").select("km_grans_per_dag")
        .lte("giltigt_fran", idag)
        .or(`giltigt_till.is.null,giltigt_till.gte.${idag}`)
        .order("giltigt_fran", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const hemLat = medRes.data?.hem_lat;
    const hemLng = medRes.data?.hem_lng;
    const arbetsdagar = arbRes.data || [];
    const frikm = avtalRes.data?.km_grans_per_dag ?? 60;

    const objektIds = Array.from(new Set(
      arbetsdagar.filter((d: any) => d.objekt_id).map((d: any) => d.objekt_id as string)
    ));
    const objMap: Record<string, { lat:number|null; lng:number|null }> = {};
    if (objektIds.length > 0) {
      const { data: objekt } = await supabase
        .from("dim_objekt")
        .select("objekt_id, latitude, longitude")
        .in("objekt_id", objektIds);
      for (const o of objekt || []) {
        objMap[o.objekt_id] = { lat: o.latitude, lng: o.longitude };
      }
    }

    let totalKm = 0;
    let ersattningsKm = 0;
    let orsAnrop = 0;
    const MAX_ORS = 5;
    const berakningar: { datum:string; objekt_id:string|null; km:number; source:string }[] = [];

    for (const d of arbetsdagar as any[]) {
      const m1 = Number(d.km_morgon) || 0;
      const m2 = Number(d.km_kvall) || 0;
      const mt = Number(d.km_totalt) || 0;
      let dagensKm = 0;
      let source = "db";

      if (m1 + m2 > 0) {
        dagensKm = m1 + m2;
      } else if (mt > 0) {
        dagensKm = mt;
      } else if (d.objekt_id && hemLat != null && hemLng != null) {
        const o = objMap[d.objekt_id];
        if (o?.lat != null && o?.lng != null) {
          const allowOrs = orsAnrop < MAX_ORS;
          const res = await getEnkelKm(supabase, Number(hemLat), Number(hemLng), Number(o.lat), Number(o.lng), allowOrs);
          if (res) {
            if (res.source === "ors") orsAnrop++;
            dagensKm = res.km * 2; // tur och retur
            source = res.source;
          }
        } else {
          source = "saknar_objekt_koord";
        }
      } else {
        source = d.objekt_id ? "saknar_hem_koord" : "saknar_objekt";
      }

      totalKm += dagensKm;
      ersattningsKm += Math.max(0, dagensKm - frikm);
      berakningar.push({ datum: d.datum, objekt_id: d.objekt_id || null, km: dagensKm, source });
    }

    return NextResponse.json({
      ok: true,
      totalKm: Math.round(totalKm),
      ersattningsKm: Math.round(ersattningsKm),
      orsAnrop,
      dagar: arbetsdagar.length,
      berakningar,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

function round3(v: number): number { return Math.round(v * 1000) / 1000; }

async function getEnkelKm(
  supabase: any,
  fLat: number, fLng: number, tLat: number, tLng: number,
  allowOrs: boolean,
): Promise<{ km:number; source:string } | null> {
  const fL = round3(fLat), fLn = round3(fLng), tL = round3(tLat), tLn = round3(tLng);

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
      }
    } catch (e: any) {
      console.warn("[km-summary] ORS-fel", e?.message || String(e));
    }
  }

  return { km: Math.round(haversine(fLat, fLng, tLat, tLng) * 1.4), source: "fallback" };
}
