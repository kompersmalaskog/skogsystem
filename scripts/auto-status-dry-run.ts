// TORRKÖRNING (read-only) av auto-status-regeln — listar vilka objekt som SKULLE
// påverkas i dag, skriver ALDRIG. Spegel av importens auto_status_pagaende och
// redigeringens avslut-på-spar. Ingen backfill: nästa prod-fil / nästa spar gör jobbet.
//
//   npx tsx scripts/auto-status-dry-run.ts
//
// Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ur .env.local (skrivs aldrig ut).

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rot = path.resolve(__dirname, "..");
const envFil = [path.join(rot, ".env.local"), path.join(rot, "..", "..", "..", ".env.local")].find((f) => fs.existsSync(f));
if (!envFil) { console.error("hittar ingen .env.local"); process.exit(1); }
for (const rad of fs.readFileSync(envFil, "utf8").split("\n")) {
  const i = rad.indexOf("="); if (i < 0 || rad.startsWith("#")) continue;
  const k = rad.slice(0, i).trim(); if (!process.env[k]) process.env[k] = rad.slice(i + 1).trim().replace(/^"|"$/g, "");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Obj = { id: string; namn: string | null; status: string | null; vo_nummer: string | null; dim_objekt_id: string | null };
type Dim = { objekt_id: string; vo_nummer: string | null; object_name: string | null; skordning_avslutad: string | null; skotning_avslutad: string | null };
type Ko = { id: string; maskin_id: string; objekt_id: string; ordning: number };

async function distinctObjektId(table: string): Promise<Set<string>> {
  const s = new Set<string>(); let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase.from(table).select("objekt_id").not("objekt_id", "is", null).range(from, from + PAGE - 1);
    if (error) { console.log(`(${table}: ${error.message})`); break; }
    if (!data?.length) break;
    for (const r of data as { objekt_id: string }[]) s.add(r.objekt_id);
    if (data.length < PAGE) break; from += PAGE;
  }
  return s;
}

(async () => {
  const objekt = ((await supabase.from("objekt").select("id, namn, status, vo_nummer, dim_objekt_id").limit(5000)).data || []) as Obj[];
  const dim = ((await supabase.from("dim_objekt").select("objekt_id, vo_nummer, object_name, skordning_avslutad, skotning_avslutad").limit(5000)).data || []) as Dim[];
  const ko = ((await supabase.from("maskin_ko").select("id, maskin_id, objekt_id, ordning").limit(5000)).data || []) as Ko[];

  const dimByObjId = new Map(dim.map((d) => [d.objekt_id, d]));
  const dimByVo = new Map(dim.filter((d) => d.vo_nummer).map((d) => [String(d.vo_nummer), d]));
  const dimFor = (o: Obj): Dim | null => (o.dim_objekt_id && dimByObjId.get(o.dim_objekt_id)) || (o.vo_nummer && dimByVo.get(String(o.vo_nummer))) || null;

  const prod = await distinctObjektId("fakt_produktion");
  const sort = await distinctObjektId("fakt_sortiment");
  const lass = await distinctObjektId("fakt_lass");
  const harProd = (dimId: string | undefined | null) => !!dimId && (prod.has(dimId) || sort.has(dimId) || lass.has(dimId));

  const koByUuid = new Map<string, Ko[]>();
  for (const k of ko) { const a = koByUuid.get(k.objekt_id) || []; a.push(k); koByUuid.set(k.objekt_id, a); }
  const köText = (o: Obj) => { const r = koByUuid.get(o.id) || []; return r.length ? r.map((k) => `${k.maskin_id}#${k.ordning}`).join(", ") : "(ingen kö)"; };

  console.log(`objekt=${objekt.length}  dim_objekt=${dim.length}  maskin_ko=${ko.length}`);
  console.log(`produktion-objekt_id: fakt_produktion=${prod.size} fakt_sortiment=${sort.size} fakt_lass=${lass.size}\n`);

  console.log("=== IMPORT: planerade objekt med produktion → skulle flippas planerad→pagaende vid nästa prod-fil ===");
  let n = 0;
  for (const o of objekt.filter((o) => o.status === "planerad")) {
    const d = dimFor(o); if (!harProd(d?.objekt_id)) continue;
    n++;
    console.log(`  • ${o.namn} (vo=${o.vo_nummer ?? "—"} dim=${d?.objekt_id}) — i kö: ${köText(o)}`);
  }
  console.log(`  → ${n} objekt. (Filens maskins kö-rad tas bort; andra maskiners köer lämnas.)\n`);

  console.log("=== REDIGERING: ej avslutade objekt med BÅDA avslut-flaggorna satta i dim_objekt → skulle avslutas vid nästa spar ===");
  let m = 0;
  for (const o of objekt) {
    if (o.status === "avslutat") continue;
    const d = dimFor(o); if (!d?.skordning_avslutad || !d?.skotning_avslutad) continue;
    m++;
    console.log(`  • ${o.namn} (status=${o.status}) — kö-rader som skulle tas bort (alla maskiner): ${köText(o)}`);
  }
  console.log(`  → ${m} objekt.\n`);

  console.log("Ingen backfill: inget ändras av denna rapport — nästa fil / nästa spar gör jobbet.");
})();
