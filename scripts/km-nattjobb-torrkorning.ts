// TORRKÖRNING av nattjobbets km-fyllning — räknar vad som SKULLE skrivas,
// skriver ALDRIG till arbetsdag. Samma kandidatfilter och samma helper-vakter
// som app/api/km/nattjobb (km 0/null · km_kalla ≠ 'forare' · ej fallback · ben-tak),
// samma koordinatkedja (hamtaObjektKoordinater) och samma beräkning (berakaDagKm).
//
//   npx tsx scripts/km-nattjobb-torrkorning.ts            # 14-dagarsfönstret
//   npx tsx scripts/km-nattjobb-torrkorning.ts 30         # annat fönster
//
// Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ORS_API_KEY ur
// .env.local i repo-roten (skrivs aldrig ut). ORS anropas (route_cache fylls —
// det är en cache, inte lönedata).

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { berakaDagKm, hamtaObjektKoordinater, MAX_BEN_KM, type ObjektKoord } from "../lib/routing";
import { ymdLokal } from "../lib/datumLokal";

const rot = path.resolve(__dirname, "..");
const envFil = [path.join(rot, ".env.local"), path.join(rot, "..", "..", "..", ".env.local")].find((f) => fs.existsSync(f));
if (!envFil) { console.error("hittar ingen .env.local"); process.exit(1); }
for (const rad of fs.readFileSync(envFil, "utf8").split("\n")) {
  const i = rad.indexOf("="); if (i < 0 || rad.startsWith("#")) continue;
  const k = rad.slice(0, i).trim(); if (!process.env[k]) process.env[k] = rad.slice(i + 1).trim().replace(/^"|"$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const FONSTER = Number(process.argv[2] || 14);

(async () => {
  const idag = ymdLokal(new Date());
  const franD = new Date(); franD.setDate(franD.getDate() - FONSTER);
  const fran = ymdLokal(franD);
  const { data: arb, error } = await supabase.from("arbetsdag")
    .select("id, medarbetare_id, datum, objekt_id, km_morgon, km_kvall, km_totalt, redigerad, km_kalla, bekraftad")
    .gte("datum", fran).lte("datum", idag).order("datum", { ascending: true });
  if (error) { console.error(error.message); process.exit(1); }
  const noll = (v: any) => v == null || Number(v) === 0;
  const kand = (arb || []).filter((a) => noll(a.km_morgon) && noll(a.km_kvall) && noll(a.km_totalt) && a.km_kalla !== "forare");
  const forareSkyddade = (arb || []).filter((a) => a.km_kalla === "forare").length;
  const { data: med } = await supabase.from("medarbetare").select("id, namn, hem_lat, hem_lng");
  const medMap = new Map((med || []).map((m: any) => [m.id, m]));
  const arbIds = kand.map((a) => a.id);
  const { data: ao } = arbIds.length
    ? await supabase.from("arbetsdag_objekt").select("arbetsdag_id, objekt_id, ordning").in("arbetsdag_id", arbIds)
    : { data: [] as any[] };
  const aoPer = new Map<string, any[]>();
  for (const r of ao || []) { if (!aoPer.has(r.arbetsdag_id)) aoPer.set(r.arbetsdag_id, []); aoPer.get(r.arbetsdag_id)!.push(r); }
  const objIds = Array.from(new Set([
    ...kand.map((a) => a.objekt_id).filter(Boolean).map(String),
    ...(ao || []).map((r: any) => r.objekt_id).filter(Boolean).map(String),
  ]));
  const koordMap: Record<string, ObjektKoord> = await hamtaObjektKoordinater(supabase, objIds);

  const rader: any[] = [];
  let ors = 0;
  for (const a of kand) {
    const m: any = medMap.get(a.medarbetare_id);
    const ber = await berakaDagKm(supabase, {
      aoRader: (aoPer.get(a.id) || []).map((r) => ({ objekt_id: r.objekt_id, ordning: r.ordning })),
      fallbackObjektId: [a.objekt_id], koordMap,
      hemLat: m?.hem_lat ?? null, hemLng: m?.hem_lng ?? null, allowOrs: true,
    });
    ors += ber?.orsAnrop || 0;
    let utfall: string;
    if (!ber) utfall = m?.hem_lat == null ? "HOPPAS: saknar hemadress" : "HOPPAS: inget objekt med koordinat";
    else if (ber.källa === "fallback") utfall = "HOPPAS: bara fågelvägen (ORS-fel)";
    else if (ber.km_morgon > MAX_BEN_KM || ber.km_kvall > MAX_BEN_KM) utfall = `HOPPAS: ben > ${MAX_BEN_KM} km`;
    else utfall = `SKRIVS: ${ber.km_morgon} + ${ber.km_kvall} = ${ber.km_morgon + ber.km_kvall} km (${ber.källa}${ber.anm ? ", " + ber.anm : ""})`;
    rader.push({ datum: a.datum, vem: m?.namn, objekt: a.objekt_id, redigerad: !!a.redigerad, bekraftad: !!a.bekraftad, utfall });
  }
  console.log(`Fönster ${fran}..${idag}: ${arb?.length ?? 0} dagar, ${kand.length} kandidater (km 0 & km_kalla≠forare), ${forareSkyddade} skyddade av km_kalla='forare' (rörs aldrig). ORS-anrop: ${ors}.`);
  for (const r of rader) console.log(`${r.datum}  ${String(r.vem).padEnd(18)} obj ${String(r.objekt ?? "-").padEnd(10)} ${r.redigerad ? "redigerad " : "          "}${r.bekraftad ? "bekräftad " : "          "} ${r.utfall}`);
})();
