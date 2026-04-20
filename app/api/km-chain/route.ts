import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bygKedjaKm, Point } from "@/lib/routing";
import { formatObjektNamn } from "@/utils/formatObjektNamn";

/**
 * GET /api/km-chain?medarbetare_id=&datum=YYYY-MM-DD
 *
 * Bygger körkedjan för en specifik dag: [hem, obj1, obj2, ..., objN, hem].
 * Samlar alla arbetsdag-rader för dagen (sorterat på start_tid ASC) och
 * hämtar dim_objekt-koordinater. Returnerar segment-list och total km.
 */
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const medId = u.searchParams.get("medarbetare_id");
    const datum = u.searchParams.get("datum");
    if (!medId || !datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      return NextResponse.json({ ok: false, error: "medarbetare_id och datum (YYYY-MM-DD) krävs" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const [medRes, arbRes] = await Promise.all([
      supabase.from("medarbetare").select("hem_lat, hem_lng").eq("id", medId).maybeSingle(),
      supabase.from("arbetsdag")
        .select("id, start_tid, objekt_id")
        .eq("medarbetare_id", medId).eq("datum", datum)
        .order("start_tid", { ascending: true, nullsFirst: false }),
    ]);

    const hemLat = medRes.data?.hem_lat;
    const hemLng = medRes.data?.hem_lng;
    const rader = (arbRes.data || []) as any[];

    if (hemLat == null || hemLng == null) {
      return NextResponse.json({ ok: false, error: "Hemkoordinater saknas för medarbetaren." }, { status: 400 });
    }

    const objektIds = Array.from(new Set(rader.filter(r => r.objekt_id).map(r => r.objekt_id as string)));
    const objMap: Record<string, { lat: number|null; lng: number|null; namn: string }> = {};
    if (objektIds.length > 0) {
      const { data: objekt } = await supabase
        .from("dim_objekt")
        .select("objekt_id, object_name, skogsagare, huvudtyp, latitude, longitude")
        .in("objekt_id", objektIds);
      for (const o of objekt || []) {
        const n = (o.object_name || "").trim();
        const raw = n && !/^\d{10,}$/.test(n) ? n : ([o.skogsagare, o.huvudtyp].filter(Boolean).join(" · ") || o.objekt_id);
        objMap[o.objekt_id] = { lat: o.latitude, lng: o.longitude, namn: formatObjektNamn(raw) };
      }
    }

    // Unik sekvens av objekt i tidsordning (samma objekt i rad räknas en gång)
    const sekvens: string[] = [];
    for (const r of rader) {
      if (!r.objekt_id) continue;
      if (sekvens[sekvens.length - 1] !== r.objekt_id) sekvens.push(r.objekt_id);
    }

    const hem: Point = { lat: Number(hemLat), lng: Number(hemLng), label: "Hem" };
    const punkter: (Point | null)[] = [hem];
    for (const oid of sekvens) {
      const o = objMap[oid];
      if (o?.lat != null && o?.lng != null) {
        punkter.push({ lat: Number(o.lat), lng: Number(o.lng), label: o.namn });
      } else {
        console.warn("[km-chain] objekt saknar koord, hoppar över", oid);
        // Lägg null så bygKedjaKm hoppar över båda angränsande segment
        punkter.push(null);
      }
    }
    punkter.push(hem);

    const { segments, totalKm, orsAnrop } = await bygKedjaKm(supabase, punkter, 5);

    return NextResponse.json({
      ok: true,
      datum,
      sekvens,
      objektKoord: Object.fromEntries(Object.entries(objMap).map(([k,v]) => [k, { lat: v.lat, lng: v.lng, namn: v.namn }])),
      segments,
      totalKm,
      orsAnrop,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
