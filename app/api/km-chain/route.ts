import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bygKedjaKm, Point, hamtaObjektKoordinater, dagensPlatser, dagensObjektOrdnat, KoordKalla } from "@/lib/routing";
import { formatObjektNamn } from "@/utils/formatObjektNamn";
import { målMedarbetareId } from "@/lib/auth/server";

/**
 * GET /api/km-chain?medarbetare_id=&datum=YYYY-MM-DD
 * medarbetare_id härleds ur sessionen (admin/chef får peka på annan).
 *
 * Bygger körkedjan för en specifik dag: [hem, obj1, obj2, ..., objN, hem].
 * Samlar alla arbetsdag-rader för dagen (sorterat på start_tid ASC) och
 * hämtar dim_objekt-koordinater. Returnerar segment-list och total km.
 */
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const mål = await målMedarbetareId(u.searchParams.get("medarbetare_id"));
    if (!mål.ok) return mål.res;
    const medId = mål.id;
    const datum = u.searchParams.get("datum");
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      return NextResponse.json({ ok: false, error: "datum (YYYY-MM-DD) krävs" }, { status: 400 });
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

    // Dagens objekt ur arbetsdag_objekt (ordning) — flyttdagar har flera. Faller
    // tillbaka på arbetsdag.objekt_id via dagensPlatser() om rader saknas.
    const arbIds = rader.map(r => r.id).filter(Boolean);
    const aoRes = arbIds.length
      ? await supabase.from("arbetsdag_objekt")
          .select("objekt_id, ordning").in("arbetsdag_id", arbIds)
      : { data: [] as any[] };
    const aoRader = (aoRes.data || []) as { objekt_id: string | null; ordning: number | null }[];

    // Koordinat-uppslag över UNIONEN av objekt i arbetsdag + arbetsdag_objekt.
    const objektIds = Array.from(new Set([
      ...rader.filter(r => r.objekt_id).map(r => r.objekt_id as string),
      ...aoRader.filter(r => r.objekt_id).map(r => r.objekt_id as string),
    ]));
    // Koordinat med FALLBACK: maskin-GPS (dim_objekt) → objekt.lat/lng →
    // larmkoordinat, via vo_nummer. Tidigare bara dim_objekt → skotarobjekt
    // utan maskin-GPS gav tyst 0 km trots att objektet hade koordinat.
    const koordMap = await hamtaObjektKoordinater(supabase, objektIds);
    const objMap: Record<string, { lat: number|null; lng: number|null; namn: string; kalla: KoordKalla }> = {};
    for (const id of objektIds) {
      const k = koordMap[id];
      const n = (k?.object_name || "").trim();
      const raw = n && !/^\d{10,}$/.test(n) ? n : ([k?.skogsagare, k?.huvudtyp].filter(Boolean).join(" · ") || id);
      objMap[id] = { lat: k?.lat ?? null, lng: k?.lng ?? null, namn: formatObjektNamn(raw), kalla: k?.kalla ?? null };
    }

    // Modell B (dagensPlatser = enda modelldefinitionen): dagens platser i
    // ordning, med flytt/service (kraver_koordinat=false) och koordinatlösa
    // objekt bortfiltrerade. Alla kvarvarande har koordinat → inga null i kedjan.
    const fallbackSekvens = rader.map(r => r.objekt_id as string | null);
    const platser = dagensPlatser(aoRader, fallbackSekvens, koordMap);

    // Ärligt "saknar koordinat"-besked: fanns det ett objekt som KRÄVER
    // koordinat (kraver_koordinat !== false) men saknar den? Flytt/service
    // (kraver=false) räknas aldrig som saknad — samma regel som koordinatlarmet.
    const dagensObjekt = dagensObjektOrdnat(aoRader, fallbackSekvens);
    const saknarKoord = dagensObjekt.some(oid => {
      const k = koordMap[oid];
      return (!k || k.lat == null || k.lng == null) && (k?.kraver_koordinat !== false);
    });

    const hem: Point = { lat: Number(hemLat), lng: Number(hemLng), label: "Hem" };
    const punkter: (Point | null)[] = [hem];
    for (const oid of platser) {
      const o = objMap[oid];
      punkter.push({ lat: Number(o.lat), lng: Number(o.lng), label: o?.namn || oid });
    }
    punkter.push(hem);

    const { segments, totalKm, orsAnrop } = await bygKedjaKm(supabase, punkter, 5);

    // Modell B: det LAGRADE och ersättningsgrundande talet är morgon + kväll
    // (hem→första + sista→hem) — aldrig mellan-objekt-benen. `totalKm` nedan är
    // kedjans VISUELLA dagsrutt; på en flyttdag med flera platser är den ≥
    // km_morgon+km_kvall eftersom den även räknar körningen mellan objekten.
    const km_morgon = segments.length ? segments[0].km : 0;
    const km_kvall = segments.length ? segments[segments.length - 1].km : 0;
    const kmErsattningsgrund = km_morgon + km_kvall;

    return NextResponse.json({
      ok: true,
      datum,
      platser,
      saknarKoord,         // dagen har objekt som kräver koordinat men saknar den
      objektKoord: Object.fromEntries(Object.entries(objMap).map(([k,v]) => [k, { lat: v.lat, lng: v.lng, namn: v.namn, kalla: v.kalla }])),
      segments,
      totalKm,             // visuell dagsrutt (kan innehålla mellan-objekt-ben)
      km_morgon,           // hem → första platsen
      km_kvall,            // sista platsen → hem
      kmErsattningsgrund,  // km_morgon + km_kvall = det som lagras/ersätts
      orsAnrop,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
