import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { beraknaOchPersisteraDagKm, hamtaObjektKoordinater, ObjektKoord } from "@/lib/routing";
import { ymdLokal } from "@/lib/datumLokal";
import { franGolv } from "@/lib/skarpStart";
import { geokodaMedarbetare } from "@/lib/geokod";
import { hamtaMedarbetarKontroller } from "@/lib/medarbetarKontroll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/km/nattjobb — Vercel-cron (~01:00). SKYDDSNÄT: fyller km på oskyddade
 * 0-km-dagar i de senaste FONSTER_DAGAR dagarna som ingen öppnat. Huvudvägen är
 * att km beräknas vid öppning (km-summary + /api/km/berakna-dag); nattjobbet
 * fångar bara det som föll mellan stolarna.
 *
 * Delar EXAKT kodväg med app + bekräftelse via lib/routing beraknaOchPersisteraDagKm
 * (dagensPlatser + routeKm + samma vakt: km 0/null · km_kalla ≠
 * 'forare' · koordinat finns · ben ≤ 250 km). Rör bara km-fälten + km_kalla='auto'.
 *
 * Bearer CRON_SECRET. Rapporterar exakt vilka dagar som fylldes (med värden) och
 * vilka som hoppades (med orsak) — aldrig tyst: i HTTP-svaret OCH i tabellen
 * km_nattjobb_logg (en rad per körning), så utfallet går att läsa i efterhand
 * utan Vercels flyktiga funktionsloggar. (2026-09-04: Max/Daniel hoppades två
 * nätter i rad och ingen kunde se varför.)
 */
const FONSTER_DAGAR = 14;
const ORS_TAK = 100; // per körning — cachen gör att de flesta ben inte når ORS

/** Skriver körningens logg-rad. Verifierar att raden landade (id tillbaka) —
 *  en misslyckad loggskrivning får aldrig krascha jobbet, men den ska synas. */
async function skrivLogg(supabase: any, rad: Record<string, any>): Promise<string | null> {
  const { data, error } = await supabase.from("km_nattjobb_logg").insert(rad).select("id").maybeSingle();
  if (error || !data?.id) {
    console.error("[km/nattjobb] kunde inte skriva km_nattjobb_logg:", error?.message || "ingen rad tillbaka");
    return null;
  }
  return data.id as string;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET saknas i miljön" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startad = new Date();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // Hålls utanför try så en krasch mitt i loopen ändå loggar det som hann hända.
  const fyllda: any[] = [];
  const hoppade: any[] = [];
  let orsAnrop = 0;
  let kandidaterAntal = 0;
  let fran = "", idag = "";
  const geokod: any[] = [];
  let kontroller: any = null;

  try {
    // 0a. GEOKODNING av hemadresser som väntar (ändrade via formulär ELLER SQL —
    //     triggern hemadress_andrad märker dem). Görs FÖRE km-loopen så en ny
    //     punkt räknas redan i natt. Gps/manuella punkter skyddas i lib/geokod.
    //     Tak: några anrop per natt räcker, adresser ändras sällan.
    const { data: vantar, error: vantarFel } = await supabase
      .from("medarbetare").select("id, namn").eq("hem_geokod_status", "vantar").limit(10);
    if (vantarFel) geokod.push({ fel: `kunde inte läsa väntande adresser: ${vantarFel.message}` });
    for (const m of (vantar as any[]) || []) {
      const r = await geokodaMedarbetare(supabase, m.id);
      geokod.push({ medarbetare_id: m.id, namn: m.namn, ...r });
    }

    // 0b. KONTROLLERNA (lib/medarbetarKontroll): okopplade operatörer med
    //     namnmatch, förare utan maskin, saknad hempunkt. Rapporteras i svaret
    //     och loggen — admin kopplar med ett klick i Medarbetare-fliken. Ett fel
    //     här får aldrig stoppa km-jobbet, men det ska synas.
    try {
      kontroller = await hamtaMedarbetarKontroller(supabase);
    } catch (e: any) {
      kontroller = { fel: e?.message || String(e) };
    }

    idag = ymdLokal(new Date());
    const franDate = new Date();
    franDate.setDate(franDate.getDate() - FONSTER_DAGAR);
    // Fönstret klipps mot skarp start: dagar före 2026-08-01 är byggmaterial
    // och får aldrig fyllas automatiskt (lib/skarpStart).
    fran = franGolv(ymdLokal(franDate));

    // Alla dagar i fönstret — även redigerade (vakten på redigerad togs bort
    // 2026-09-09: redigerad = tiderna/maskinen rättade, inte km; se lib/routing).
    // km-nollhet + km_kalla-vakt avgörs i helpern. Bekräftade dagar tas MED — de
    // är just de som ingen öppnar igen och som annars förblir tomma (Stefan
    // 08-18-fallet). Det ENDA skyddet för en medveten km-uppgift är km_kalla='forare'.
    const { data: arb, error: arbErr } = await supabase
      .from("arbetsdag")
      .select("id, medarbetare_id, datum, objekt_id, km_morgon, km_kvall, km_totalt, redigerad, km_kalla, bekraftad")
      .gte("datum", fran).lte("datum", idag)
      .order("datum", { ascending: true });
    if (arbErr) return NextResponse.json({ error: "kunde inte hämta arbetsdag", details: arbErr.message }, { status: 500 });

    const noll = (v: any) => v == null || Number(v) === 0;
    const kandidater = (arb || []).filter(a => noll(a.km_morgon) && noll(a.km_kvall) && noll(a.km_totalt) && a.km_kalla !== "forare");
    kandidaterAntal = kandidater.length;

    // Medarbetare (hemadress) + arbetsdag_objekt + objekt-koordinater
    const medIds = Array.from(new Set(kandidater.map(a => a.medarbetare_id)));
    const arbIds = kandidater.map(a => a.id);
    const [medRes, aoRes] = await Promise.all([
      medIds.length ? supabase.from("medarbetare").select("id, hem_lat, hem_lng").in("id", medIds) : Promise.resolve({ data: [] as any[] }),
      arbIds.length ? supabase.from("arbetsdag_objekt").select("arbetsdag_id, objekt_id, ordning").in("arbetsdag_id", arbIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const medMap = new Map<string, any>(((medRes.data as any[]) || []).map(m => [m.id, m]));
    const aoByArb = new Map<string, { objekt_id: string | null; ordning: number | null }[]>();
    for (const r of (aoRes.data as any[]) || []) {
      if (!aoByArb.has(r.arbetsdag_id)) aoByArb.set(r.arbetsdag_id, []);
      aoByArb.get(r.arbetsdag_id)!.push({ objekt_id: r.objekt_id, ordning: r.ordning });
    }
    const objektIds = Array.from(new Set<string>([
      ...kandidater.filter(a => a.objekt_id).map(a => String(a.objekt_id)),
      ...((aoRes.data as any[]) || []).filter(r => r.objekt_id).map(r => String(r.objekt_id)),
    ]));
    const koordMap: Record<string, ObjektKoord> = await hamtaObjektKoordinater(supabase, objektIds);

    for (const a of kandidater) {
      const m = medMap.get(a.medarbetare_id) || {};
      const res = await beraknaOchPersisteraDagKm(supabase, {
        rad: a,
        aoRader: aoByArb.get(a.id) || [],
        koordMap,
        hemLat: m.hem_lat ?? null, hemLng: m.hem_lng ?? null,
        allowOrs: orsAnrop < ORS_TAK,
      });
      orsAnrop += res.orsAnrop;
      if (res.status === "skrev") {
        fyllda.push({ id: a.id, medarbetare_id: a.medarbetare_id, datum: a.datum, km_morgon: res.km_morgon, km_kvall: res.km_kvall, källa: res.källa, anm: res.anm ?? null, bekraftad: a.bekraftad });
      } else {
        hoppade.push({ id: a.id, medarbetare_id: a.medarbetare_id, datum: a.datum, orsak: res.orsak });
      }
    }

    // Tabellform = prod (Martin körde SQL:en 2026-09-04): kord_tid, fonster_fran/till,
    // kandidater, fyllda (int), hoppade (int), ors_anrop, detaljer (jsonb), fel.
    const loggId = await skrivLogg(supabase, {
      kord_tid: startad.toISOString(),
      fonster_fran: fran, fonster_till: idag,
      kandidater: kandidaterAntal, fyllda: fyllda.length, hoppade: hoppade.length,
      ors_anrop: orsAnrop, detaljer: { fyllda, hoppade, geokod, kontroller },
    });
    console.log(`[km/nattjobb] ${fran}..${idag}: kandidater=${kandidaterAntal} fyllda=${fyllda.length} hoppade=${hoppade.length} ors=${orsAnrop} logg=${loggId ?? "EJ SKRIVEN"}`);
    for (const g of geokod) console.log(`[km/nattjobb] geokod ${g.namn ?? ""}: ${g.status ?? g.fel} ${g.etikett ?? ""}`);
    for (const o of kontroller?.okandaOperatorer || []) console.log(`[km/nattjobb] OKOPPLAD operatör ${o.operator_id} "${o.operator_namn}" → ${o.medarbetare.namn}: ${o.datum.length} dagar`);
    for (const f of kontroller?.forareUtanMaskin || []) console.log(`[km/nattjobb] förare utan maskin: ${f.namn}`);
    for (const h of hoppade) console.log(`[km/nattjobb] hoppad ${h.datum} ${h.medarbetare_id}: ${h.orsak}`);

    return NextResponse.json({
      ok: true,
      fönster: { fran, till: idag, dagar: FONSTER_DAGAR },
      kandidater: kandidaterAntal,
      fyllda,
      hoppade,
      orsAnrop,
      geokod,
      kontroller,
      logg_id: loggId,
    });
  } catch (e: any) {
    const fel = e?.message || String(e);
    console.error("[km/nattjobb] KRASCH:", fel);
    const loggId = await skrivLogg(supabase, {
      kord_tid: startad.toISOString(),
      fonster_fran: fran || null, fonster_till: idag || null,
      kandidater: kandidaterAntal, fyllda: fyllda.length, hoppade: hoppade.length,
      ors_anrop: orsAnrop, detaljer: { fyllda, hoppade, geokod, kontroller }, fel,
    });
    return NextResponse.json({ ok: false, error: fel, logg_id: loggId }, { status: 500 });
  }
}
