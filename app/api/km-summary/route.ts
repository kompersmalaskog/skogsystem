import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeKm, hamtaObjektKoordinater, dagensPlatser, KoordKalla } from "@/lib/routing";
import { ersattningsMilDag } from "@/lib/kmErsattning";
import { sistaDagenIManaden } from "@/lib/datumLokal";

/**
 * GET /api/km-summary?medarbetare_id=&month=YYYY-MM
 *
 * Räknar total körsträcka och km-över-gräns för månaden. Per dag byggs
 * körkedjan [hem, obj1, obj2, ..., objN, hem] om DB saknar km-värden;
 * annars används DB-värdena rakt av. Max 5 ORS-anrop totalt per request.
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
    const toDate = sistaDagenIManaden(y, m); // LOKALT — toISOString tappade sista dagen i UTC+2
    const idag = new Date().toISOString().slice(0, 10);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const [medRes, arbRes, avtalRes] = await Promise.all([
      supabase.from("medarbetare").select("hem_lat, hem_lng").eq("id", medId).maybeSingle(),
      supabase.from("arbetsdag")
        .select("id, datum, start_tid, km_morgon, km_kvall, km_totalt, objekt_id")
        .eq("medarbetare_id", medId)
        .gte("datum", fromDate).lte("datum", toDate),
      supabase.from("gs_avtal").select("km_grans_per_dag")
        .lte("giltigt_fran", idag)
        .or(`giltigt_till.is.null,giltigt_till.gte.${idag}`)
        .order("giltigt_fran", { ascending: false })
        .limit(1).maybeSingle(),
    ]);

    const hemLat = medRes.data?.hem_lat;
    const hemLng = medRes.data?.hem_lng;
    const rader = (arbRes.data || []) as any[];
    const frikm = avtalRes.data?.km_grans_per_dag ?? 60;

    // Dagens objekt ur arbetsdag_objekt (ordning) — flyttdagar har flera. Faller
    // tillbaka på arbetsdag.objekt_id via dagensPlatser() när rader saknas.
    const arbIds = rader.map(r => r.id).filter(Boolean);
    const aoRes = arbIds.length
      ? await supabase.from("arbetsdag_objekt").select("arbetsdag_id, objekt_id, ordning").in("arbetsdag_id", arbIds)
      : { data: [] as any[] };
    const aoByArbetsdag = new Map<string, { objekt_id: string | null; ordning: number | null }[]>();
    for (const r of (aoRes.data || []) as any[]) {
      if (!aoByArbetsdag.has(r.arbetsdag_id)) aoByArbetsdag.set(r.arbetsdag_id, []);
      aoByArbetsdag.get(r.arbetsdag_id)!.push({ objekt_id: r.objekt_id, ordning: r.ordning });
    }

    // Slå upp alla objekt-koordinater (UNIONEN av arbetsdag + arbetsdag_objekt)
    // med FALLBACK: maskin-GPS (dim_objekt) → objekt.lat/lng → larmkoordinat, via
    // vo_nummer. Tidigare bara dim_objekt → skotarobjekt utan maskin-GPS gav tyst
    // 0 km (utebliven ersättning).
    const objektIds = Array.from(new Set([
      ...rader.filter(r => r.objekt_id).map(r => r.objekt_id as string),
      ...(aoRes.data || []).filter((r: any) => r.objekt_id).map((r: any) => r.objekt_id as string),
    ]));
    const koordMap = await hamtaObjektKoordinater(supabase, objektIds);
    const objMap: Record<string, { lat:number|null; lng:number|null; kalla: KoordKalla }> = {};
    for (const id of objektIds) objMap[id] = { lat: koordMap[id]?.lat ?? null, lng: koordMap[id]?.lng ?? null, kalla: koordMap[id]?.kalla ?? null };

    // Gruppera rader per datum
    const perDatum = new Map<string, any[]>();
    for (const r of rader) {
      if (!perDatum.has(r.datum)) perDatum.set(r.datum, []);
      perDatum.get(r.datum)!.push(r);
    }

    const MAX_ORS = 5;
    let totalKm = 0;
    let ersattningsKm = 0;
    let ersattningsMil = 0; // påbörjade mil (delad lib) — samma mängd som lönen
    let orsAnrop = 0;
    const berakningar: { datum:string; km:number; source:string; segments:number }[] = [];

    for (const [datum, dagRader] of perDatum) {
      dagRader.sort((a: any, b: any) => (a.start_tid || "").localeCompare(b.start_tid || ""));

      // DB-summa: om något värde finns, använd det
      let dbSumma = 0;
      for (const r of dagRader) {
        const mk = (Number(r.km_morgon) || 0) + (Number(r.km_kvall) || 0);
        if (mk > 0) dbSumma += mk;
        else if ((Number(r.km_totalt) || 0) > 0) dbSumma += Number(r.km_totalt);
      }

      let dagensKm = 0;
      let source = "db";
      let segCount = 0;

      if (dbSumma > 0) {
        dagensKm = dbSumma;
      } else if (hemLat != null && hemLng != null) {
        // Modell B (dagensPlatser = enda modelldefinitionen): dagens platser i
        // ordning ur arbetsdag_objekt ∪ arbetsdag.objekt_id, flytt/service
        // (kraver_koordinat=false) och koordinatlösa objekt bortfiltrerade.
        const aoRader = dagRader.flatMap((r: any) => aoByArbetsdag.get(r.id) || []);
        const fallbackSekvens = dagRader.map((r: any) => r.objekt_id as string | null);
        const platser = dagensPlatser(aoRader, fallbackSekvens, koordMap);

        if (platser.length > 0) {
          const first = objMap[platser[0]];
          const last = objMap[platser[platser.length - 1]];
          const hL = Number(hemLat), hN = Number(hemLng);
          // Endast pendlingsbenen lagras/ersätts: hem→första + sista→hem. Aldrig
          // mellan-objekt-körning — den har ingen kolumn och är inte pendling.
          // km_totalt får aldrig bli något annat än km_morgon + km_kvall.
          const mRes = await routeKm(supabase, { fromLat: hL, fromLng: hN, toLat: Number(first.lat), toLng: Number(first.lng) }, orsAnrop < MAX_ORS);
          if (mRes.source === "ors") orsAnrop++;
          const kRes = await routeKm(supabase, { fromLat: Number(last.lat), fromLng: Number(last.lng), toLat: hL, toLng: hN }, orsAnrop < MAX_ORS);
          if (kRes.source === "ors") orsAnrop++;

          const km_morgon = mRes.km;
          const km_kvall = kRes.km;
          dagensKm = km_morgon + km_kvall;
          segCount = 2;
          source = (mRes.source === "fallback" || kRes.source === "fallback") ? "fallback" : kRes.source;

          // Write-back — OFÖRÄNDRAT beteende: bara triviala single-plats/single-
          // rad 0-dagar, bägge ben äkta rutt (cache/ors, ej haversine-fallback),
          // dubbellåst med .or(). Ingen ny skrivväg — samma villkor som förr,
          // uttryckt över modell B:s morgon/kväll i stället för chain-segmenten.
          const bådaÄkta = mRes.source !== "fallback" && kRes.source !== "fallback";
          if (platser.length === 1 && dagRader.length === 1 && bådaÄkta) {
            const r0 = dagRader[0];
            if ((Number(r0.km_morgon) || 0) === 0 && (Number(r0.km_kvall) || 0) === 0 && (Number(r0.km_totalt) || 0) === 0 && r0.id) {
              await supabase.from("arbetsdag")
                .update({ km_morgon, km_kvall })
                .eq("id", r0.id)
                .or("km_morgon.is.null,km_morgon.eq.0");
            }
          }
        } else {
          source = "inga_objekt";
        }
      } else {
        source = "saknar_hem_koord";
      }

      totalKm += dagensKm;
      ersattningsKm += Math.max(0, dagensKm - frikm);
      ersattningsMil += ersattningsMilDag(dagensKm, frikm);
      berakningar.push({ datum, km: dagensKm, source, segments: segCount });
    }

    return NextResponse.json({
      ok: true,
      totalKm: Math.round(totalKm),
      ersattningsKm: Math.round(ersattningsKm),
      ersattningsMil,
      orsAnrop,
      dagar: perDatum.size,
      berakningar,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
