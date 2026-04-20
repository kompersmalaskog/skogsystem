import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bygKedjaKm, Point } from "@/lib/routing";

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
    const toDate = new Date(y, m, 0).toISOString().slice(0, 10);
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

    // Slå upp alla objekt-koordinater
    const objektIds = Array.from(new Set(rader.filter(r => r.objekt_id).map(r => r.objekt_id as string)));
    const objMap: Record<string, { lat:number|null; lng:number|null }> = {};
    if (objektIds.length > 0) {
      const { data: objekt } = await supabase
        .from("dim_objekt").select("objekt_id, latitude, longitude")
        .in("objekt_id", objektIds);
      for (const o of objekt || []) objMap[o.objekt_id] = { lat: o.latitude, lng: o.longitude };
    }

    // Gruppera rader per datum
    const perDatum = new Map<string, any[]>();
    for (const r of rader) {
      if (!perDatum.has(r.datum)) perDatum.set(r.datum, []);
      perDatum.get(r.datum)!.push(r);
    }

    const MAX_ORS = 5;
    let totalKm = 0;
    let ersattningsKm = 0;
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
        // Bygg unik objektsekvens (samma objekt i följd räknas en gång)
        const sekvens: string[] = [];
        for (const r of dagRader) {
          if (!r.objekt_id) continue;
          if (sekvens[sekvens.length - 1] !== r.objekt_id) sekvens.push(r.objekt_id);
        }
        if (sekvens.length > 0) {
          const hem: Point = { lat: Number(hemLat), lng: Number(hemLng), label: "Hem" };
          const punkter: (Point | null)[] = [hem];
          for (const oid of sekvens) {
            const o = objMap[oid];
            punkter.push(o?.lat != null && o?.lng != null ? { lat: Number(o.lat), lng: Number(o.lng), label: oid } : null);
          }
          punkter.push(hem);
          const budget = Math.max(0, MAX_ORS - orsAnrop);
          const chain = await bygKedjaKm(supabase, punkter, budget);
          orsAnrop += chain.orsAnrop;
          dagensKm = chain.totalKm;
          segCount = chain.segments.length;
          source = chain.segments.length > 0 ? chain.segments[chain.segments.length - 1].source : "chain";

          // Spara tillbaka för 1-objekt-1-rad-dagar så nästa request läser DB
          if (sekvens.length === 1 && dagRader.length === 1 && chain.segments.length === 2) {
            const r0 = dagRader[0];
            if ((Number(r0.km_morgon) || 0) === 0 && (Number(r0.km_kvall) || 0) === 0 && (Number(r0.km_totalt) || 0) === 0 && r0.id) {
              await supabase.from("arbetsdag")
                .update({ km_morgon: chain.segments[0].km, km_kvall: chain.segments[1].km })
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
      berakningar.push({ datum, km: dagensKm, source, segments: segCount });
    }

    return NextResponse.json({
      ok: true,
      totalKm: Math.round(totalKm),
      ersattningsKm: Math.round(ersattningsKm),
      orsAnrop,
      dagar: perDatum.size,
      berakningar,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
