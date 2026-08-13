/**
 * Verifieringsharness för Modell B (steg 2).
 *
 * Kör om km-torrkörningen mot DEN INKOPPLADE koden: importerar samma
 * `dagensPlatser` + `hamtaObjektKoordinater` som km-chain/km-summary använder,
 * inte en kopia. Blir siffrorna identiska med den tidigare Python-torrkörningen
 * är modellen rätt extraherad till lib/routing.ts.
 *
 * READ-ONLY: läser route_cache men skriver ALDRIG tillbaka (till skillnad från
 * app-routens routeKm som upsertar) och gissar aldrig — ORS-miss = "kan ej
 * beräknas", aldrig haversine. Exakt samma stance som Python-torrkörningen.
 *
 * Kör:  npx tsx scripts/verify-km-modell.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { hamtaObjektKoordinater, dagensPlatser } from "@/lib/routing";

// ── env ur .env.local ──
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const ORS = env.ORS_API_KEY;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── ORS läs-only (ingen cache-write, ingen haversine) ──
const stat = { ors: 0, cache: 0, memo: 0, fail: 0 };
const memo = new Map<string, number | null>();
async function routeReadonly(fl: number, fn: number, tl: number, tn: number): Promise<number | null> {
  const fL = r3(fl), fN = r3(fn), tL = r3(tl), tN = r3(tn);
  const key = `${fL},${fN}->${tL},${tN}`;
  if (memo.has(key)) { stat.memo++; return memo.get(key)!; }
  const { data: hit } = await supabase.from("route_cache").select("distance_km")
    .eq("from_lat", fL).eq("from_lng", fN).eq("to_lat", tL).eq("to_lng", tN).maybeSingle();
  if (hit) { stat.cache++; memo.set(key, hit.distance_km); return hit.distance_km; }
  if (ORS) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${fN},${fL}&end=${tN},${tL}`;
      const r = await fetch(url, { headers: { Authorization: ORS, Accept: "application/geo+json" } });
      if (r.ok) {
        const b: any = await r.json();
        const m = b?.features?.[0]?.properties?.summary?.distance;
        if (Number.isFinite(m)) { stat.ors++; const km = Math.round(m / 1000); memo.set(key, km); await sleep(1600); return km; }
      }
    } catch { /* faller igenom till fail */ }
  }
  stat.fail++; memo.set(key, null); return null;
}

async function gall(tabell: string, sel: string, order: string): Promise<any[]> {
  const out: any[] = []; let fr = 0;
  while (true) {
    const { data, error } = await supabase.from(tabell).select(sel).order(order, { ascending: true }).range(fr, fr + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    fr += 1000;
  }
  return out;
}

(async () => {
  const idag = new Date().toISOString().slice(0, 10);
  const meds = new Map<string, any>((await supabase.from("medarbetare").select("id, namn, hem_lat, hem_lng")).data!.map((m: any) => [m.id, m]));
  const av = (await supabase.from("gs_avtal").select("km_grans_per_dag").lte("giltigt_fran", idag).order("giltigt_fran", { ascending: false }).limit(1).maybeSingle()).data;
  const GRANS = av?.km_grans_per_dag ?? 60;

  let arb = (await supabase.from("arbetsdag")
    .select("id, medarbetare_id, datum, objekt_id, km_morgon, km_kvall, redigerad")
    .gte("datum", "2026-06-01").eq("redigerad", false)).data as any[];
  const noll = (v: any) => v == null || Number(v) === 0;
  arb = arb.filter((a) => noll(a.km_morgon) && noll(a.km_kvall));

  // arbetsdag_objekt per arbetsdag_id
  const aoByAd = new Map<string, { objekt_id: string | null; ordning: number | null }[]>();
  for (const r of await gall("arbetsdag_objekt", "arbetsdag_id, objekt_id, ordning", "arbetsdag_id")) {
    if (!aoByAd.has(r.arbetsdag_id)) aoByAd.set(r.arbetsdag_id, []);
    aoByAd.get(r.arbetsdag_id)!.push({ objekt_id: r.objekt_id, ordning: r.ordning });
  }

  // koordMap via SAMMA helper som appen
  const oids = Array.from(new Set<string>([
    ...arb.filter((a) => a.objekt_id).map((a) => String(a.objekt_id)),
    ...Array.from(aoByAd.values()).flat().filter((r) => r.objekt_id).map((r) => String(r.objekt_id)),
  ]));
  const koordMap = await hamtaObjektKoordinater(supabase, oids);
  const namn = (oid: string) => (koordMap[oid]?.object_name || "").trim() || "(okänt)";

  const rows: any[] = []; const ejber: any[] = [];
  for (const a of arb) {
    const m = meds.get(a.medarbetare_id) || {};
    const aoRader = aoByAd.get(a.id) || [];
    // SAMMA anrop som km-chain/km-summary/backfillen:
    const platser = dagensPlatser(aoRader, [a.objekt_id], koordMap);
    const base = { forare: m.namn || "?", datum: a.datum, objekt_id: a.objekt_id };
    if (m.hem_lat == null || m.hem_lng == null) { ejber.push({ ...base, orsak: "saknar hemadress" }); continue; }
    if (platser.length === 0) { ejber.push({ ...base, orsak: "ingen plats med koordinat (kraver_koordinat)" }); continue; }
    const first = koordMap[platser[0]], last = koordMap[platser[platser.length - 1]];
    const kmM = await routeReadonly(Number(m.hem_lat), Number(m.hem_lng), first.lat!, first.lng!);
    const kmK = await routeReadonly(last.lat!, last.lng!, Number(m.hem_lat), Number(m.hem_lng));
    if (kmM == null || kmK == null) { ejber.push({ ...base, orsak: "ORS misslyckades" }); continue; }
    rows.push({ ...base, first: platser[0], last: platser[platser.length - 1], km_morgon: kmM, km_kvall: kmK, tot: kmM + kmK });
  }

  rows.sort((a, b) => a.forare.localeCompare(b.forare) || a.datum.localeCompare(b.datum));
  ejber.sort((a, b) => a.forare.localeCompare(b.forare) || a.datum.localeCompare(b.datum));

  console.log(`MODELL B via inkopplad dagensPlatser — gräns ${GRANS}`);
  console.log(`Kvalade rader: ${arb.length}  ->  beräknade: ${rows.length}  kan ej beräknas: ${ejber.length}\n`);
  console.log("## BERÄKNADE (förare | datum | första→sista | morgon+kväll=tot)");
  for (const r of rows)
    console.log(`  ${r.forare.padEnd(17)} ${r.datum}  ${String(r.first)}→${String(r.last)}  ${r.km_morgon}+${r.km_kvall}=${r.tot}`);
  console.log("\n## KAN EJ BERÄKNAS");
  for (const r of ejber)
    console.log(`  ${r.forare.padEnd(17)} ${r.datum}  obj=${r.objekt_id} ${namn(String(r.objekt_id))}  → ${r.orsak}`);
  console.log(`\n## ORS: ors=${stat.ors} cache=${stat.cache} memo=${stat.memo} fail=${stat.fail}  unika=${memo.size}`);

  // Maskinläsbar rad för mekanisk diff mot förra listan
  console.log("\n## JSON");
  console.log(JSON.stringify({
    berak: rows.map((r) => `${r.forare}|${r.datum}|${r.first}|${r.last}|${r.km_morgon}|${r.km_kvall}`).sort(),
    ejber: ejber.map((r) => `${r.forare}|${r.datum}|${r.objekt_id}`).sort(),
  }));
})().catch((e) => { console.error("FEL:", e?.message || e); process.exit(1); });
