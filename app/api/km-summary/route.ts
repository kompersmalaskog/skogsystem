import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { berakaDagKm, persisteraDagKm, hamtaObjektKoordinater } from "@/lib/routing";
import { ersattningsMilDag } from "@/lib/kmErsattning";
import { sistaDagenIManaden } from "@/lib/datumLokal";
import { målMedarbetareId } from "@/lib/auth/server";

/**
 * GET /api/km-summary?medarbetare_id=&month=YYYY-MM
 * medarbetare_id härleds ur sessionen (admin/chef får peka på annan).
 *
 * Räknar total körsträcka och km-över-gräns för månaden. Per dag byggs
 * körkedjan [hem, obj1, obj2, ..., objN, hem] om DB saknar km-värden;
 * annars används DB-värdena rakt av. Max 5 ORS-anrop totalt per request.
 */
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const mål = await målMedarbetareId(u.searchParams.get("medarbetare_id"));
    if (!mål.ok) return mål.res;
    const medId = mål.id;
    const month = u.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: "month (YYYY-MM) krävs" }, { status: 400 });
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
        .select("id, datum, start_tid, km_morgon, km_kvall, km_totalt, objekt_id, redigerad, km_kalla")
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
        // Modell B via DELADE berakaDagKm — exakt samma beräkning som nattjobbet
        // och bekräftelse-öppningen (dagensPlatser + routeKm; pendlingsben
        // hem→första + sista→hem, mellan-objekt-körning räknas aldrig).
        const aoRader = dagRader.flatMap((r: any) => aoByArbetsdag.get(r.id) || []);
        const fallbackSekvens = dagRader.map((r: any) => r.objekt_id as string | null);
        const ber = await berakaDagKm(supabase, { aoRader, fallbackObjektId: fallbackSekvens, koordMap, hemLat, hemLng, allowOrs: orsAnrop < MAX_ORS });
        orsAnrop += ber?.orsAnrop ?? 0;
        if (ber) {
          dagensKm = ber.km_morgon + ber.km_kvall;
          segCount = 2;
          source = ber.källa;
          // Persistera via DELADE persisteraDagKm (km_kalla='auto', full vakt,
          // verifierad skrivning). Enkel-rad-dag: skriv till raden när vakten håller.
          if (dagRader.length === 1) {
            await persisteraDagKm(supabase, dagRader[0], ber);
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
