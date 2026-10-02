// FÖRVÄRMNING av route_cache för GROT-arket i /oversikt-v2.
//
// GROT-listan visar "N km från <närmaste andra GROT-objekt>" som ORS-vägavstånd. Varje par kostar ett
// ORS-anrop första gången (gratisplanen: 40/min, 2 000/dag); därefter ligger det i route_cache.
// Det här skriptet slår upp paren i förväg så vyn öppnas utan ORS-anrop.
//
//   npx tsx scripts/grot-forvarm-route-cache.ts            # TORRKÖRNING: listar paren och vad som saknas. Skriver inget, anropar inte ORS.
//   npx tsx scripts/grot-forvarm-route-cache.ts --skriv    # slår upp saknade par i ORS och skriver route_cache
//
// Skriver BARA route_cache — upsert på (from_lat, from_lng, to_lat, to_lng) avrundade till 3 decimaler,
// exakt den nyckel /api/routing läser. Samma lista, samma koordinater och samma kandidatval som vyn
// (hamtaGrotRaw + byggGrotLista + kandidatPar i lib/grotvy), och paren går i kanonisk riktning
// (lägst objekt_id → högst), så det som skrivs här är det vyn frågar efter.
//
// Gränser: högst 35 anrop/min (ett var 1,75:e sekund) — under ORS 40/min. Stannar vid 429 (kvoten slut).
// Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ORS_API_KEY ur .env.local (skrivs aldrig ut).
// Efter skrivning läses varje rad tillbaka och jämförs på INNEHÅLL (distance_km), inte på radantal.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { hamtaGrotRaw } from "../lib/grotvy/hamta";
import { byggGrotLista } from "../lib/grotvy/lista";
import { kandidatPar, K_KANDIDATER, type Punkt } from "../lib/grotvy/avstand";
import { idagLokal } from "../lib/grotvy/format";
import { round3 } from "../lib/routing";

const rot = path.resolve(__dirname, "..");
const envFil = [path.join(rot, ".env.local"), path.join(rot, "..", "..", "..", ".env.local")].find((f) => fs.existsSync(f));
if (!envFil) { console.error("hittar ingen .env.local"); process.exit(1); }
for (const rad of fs.readFileSync(envFil, "utf8").split("\n")) {
  const i = rad.indexOf("="); if (i < 0 || rad.startsWith("#")) continue;
  const k = rad.slice(0, i).trim(); if (!process.env[k]) process.env[k] = rad.slice(i + 1).trim().replace(/^"|"$/g, "");
}

const SKRIV = process.argv.includes("--skriv");
const MIN_MELLANRUM_MS = 1750; // 34 anrop/min
const ORS_KEY = process.env.ORS_API_KEY;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Cache = { distance_km: number; duration_min: number | null };
const nyckel = (a: Punkt, b: Punkt) => `${round3(a.lat)},${round3(a.lng)}>${round3(b.lat)},${round3(b.lng)}`;

async function cacheRad(a: Punkt, b: Punkt): Promise<Cache | null> {
  const { data, error } = await supabase.from("route_cache").select("distance_km, duration_min")
    .eq("from_lat", round3(a.lat)).eq("from_lng", round3(a.lng)).eq("to_lat", round3(b.lat)).eq("to_lng", round3(b.lng)).maybeSingle();
  if (error) throw new Error(`route_cache: ${error.message}`);
  return (data as Cache | null) ?? null;
}

const vila = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const raw = await hamtaGrotRaw(supabase);
  const lista = byggGrotLista(raw, { idag: idagLokal() });
  const punkter: Punkt[] = lista.alla.filter((r) => r.koordinat).map((r) => ({ id: r.id, lat: r.koordinat!.lat, lng: r.koordinat!.lng }));
  const namn = new Map(lista.alla.map((r): [string, string] => [r.id, r.namn]));
  const utanKoord = lista.alla.filter((r) => !r.koordinat);
  const par = kandidatPar(punkter, K_KANDIDATER);

  console.log(`GROT-listan: ${lista.alla.length} objekt (${lista.markagaren.length} markägar-önskemål, ${lista.passar.length} när det passar)`);
  console.log(`  med koordinat: ${punkter.length}   utan: ${utanKoord.length}${utanKoord.length ? "  → " + utanKoord.map((r) => r.namn).join(", ") : ""}`);
  console.log(`  kandidatpar (K=${K_KANDIDATER}, kanonisk riktning): ${par.length}\n`);

  const saknas: typeof par = [];
  let finns = 0;
  for (const p of par) {
    const rad = await cacheRad(p.fran, p.till);
    if (rad) finns++; else saknas.push(p);
  }
  console.log(`route_cache: ${finns} av ${par.length} par finns redan, ${saknas.length} saknas`);
  saknas.forEach((p, i) => console.log(`  saknas ${String(i + 1).padStart(2)}: ${namn.get(p.fran.id)} → ${namn.get(p.till.id)}   (${p.fran.lat.toFixed(4)},${p.fran.lng.toFixed(4)} → ${p.till.lat.toFixed(4)},${p.till.lng.toFixed(4)})`));

  if (!SKRIV) {
    console.log(`\nTORRKÖRNING — inget skrevs, ORS anropades inte. Kör med --skriv för att slå upp ${saknas.length} par (~${Math.ceil(saknas.length * MIN_MELLANRUM_MS / 60000)} min).`);
    return;
  }
  if (!saknas.length) { console.log("\nInget att göra — allt finns redan."); return; }
  if (!ORS_KEY) { console.error("\nORS_API_KEY saknas i .env.local — avbryter."); process.exit(1); }

  console.log(`\nSlår upp ${saknas.length} par i ORS (högst ${Math.floor(60000 / MIN_MELLANRUM_MS)}/min) …`);
  let skrivna = 0, ejRoutbara = 0, avbrutet: string | null = null;
  const forvantat = new Map<string, number>();
  for (let i = 0; i < saknas.length; i++) {
    const p = saknas[i];
    const t0 = Date.now();
    const rubrik = `${String(i + 1).padStart(2)}/${saknas.length} ${namn.get(p.fran.id)} → ${namn.get(p.till.id)}`;
    const r = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: ORS_KEY, "Content-Type": "application/json", Accept: "application/geo+json" },
      // Samma som /api/routing: radiuses 2000 m, annars faller punkter mitt i bestånd (kod 2010).
      body: JSON.stringify({ coordinates: [[round3(p.fran.lng), round3(p.fran.lat)], [round3(p.till.lng), round3(p.till.lat)]], radiuses: [2000, 2000] }),
    });
    if (r.status === 429) { avbrutet = "ORS svarade 429 — kvoten är slut för nu. Kör igen senare; det som redan skrivits ligger kvar."; break; }
    if (!r.ok) { ejRoutbara++; console.log(`  ✗ ${rubrik}: ORS ${r.status} ${(await r.text()).slice(0, 120)}`); }
    else {
      const body: any = await r.json();
      const meter = body?.features?.[0]?.properties?.summary?.distance;
      const sek = body?.features?.[0]?.properties?.summary?.duration;
      if (!Number.isFinite(meter)) { ejRoutbara++; console.log(`  ✗ ${rubrik}: svar utan distance`); }
      else {
        const km = Math.round(meter / 1000);
        const { error } = await supabase.from("route_cache").upsert(
          { from_lat: round3(p.fran.lat), from_lng: round3(p.fran.lng), to_lat: round3(p.till.lat), to_lng: round3(p.till.lng), distance_km: km, duration_min: Number.isFinite(sek) ? Math.round(sek / 60) : null },
          { onConflict: "from_lat,from_lng,to_lat,to_lng" },
        );
        if (error) { console.log(`  ✗ ${rubrik}: skrivning misslyckades: ${error.message}`); ejRoutbara++; }
        else { skrivna++; forvantat.set(nyckel(p.fran, p.till), km); console.log(`  ✓ ${rubrik}: ${km} km`); }
      }
    }
    const kvar = MIN_MELLANRUM_MS - (Date.now() - t0);
    if (kvar > 0 && i < saknas.length - 1) await vila(kvar);
  }

  // Verifiera på innehåll: läs tillbaka varje skriven rad och jämför distance_km.
  let avvikelser = 0;
  for (const p of par) {
    const v = forvantat.get(nyckel(p.fran, p.till));
    if (v == null) continue;
    const rad = await cacheRad(p.fran, p.till);
    if (!rad || rad.distance_km !== v) { avvikelser++; console.log(`  ✗✗ ${namn.get(p.fran.id)} → ${namn.get(p.till.id)}: väntade ${v} km, route_cache har ${rad?.distance_km ?? "ingen rad"}`); }
  }
  console.log(`\nKLART: ${skrivna} skrivna, ${ejRoutbara} misslyckade, ${avvikelser} avvikelser vid tillbakaläsning (${skrivna - avvikelser} av ${skrivna} verifierade på innehåll).`);
  if (avbrutet) console.log(avbrutet);
  const efter = (await Promise.all(par.map((p) => cacheRad(p.fran, p.till)))).filter(Boolean).length;
  console.log(`route_cache täcker nu ${efter} av ${par.length} par.`);
  if (avvikelser > 0 || avbrutet) process.exit(2);
})().catch((e) => { console.error("FEL:", e?.message ?? e); process.exit(1); });
