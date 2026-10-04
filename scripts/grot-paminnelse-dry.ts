// TORRKÖRNING av GROT-påminnelserna mot riktiga data. Skriver INGENTING (inga notis_kö-rader, inga ändringar) och skickar ingen push.
//
//   npx tsx scripts/grot-paminnelse-dry.ts          # exakt som /api/grot/paminnelse?dry=1 körd idag
//   npx tsx scripts/grot-paminnelse-dry.ts --demo   # + fem FIKTIVA datum satta i MINNET (aldrig i databasen), så man ser alla fall och texterna
//
// Samma kod som cron-rutten (lib/grotvy/paminnelse-ko). Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ur .env.local (skrivs aldrig ut).

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { hamtaGrotRaw } from "../lib/grotvy/hamta";
import { byggGrotLista, medDimPatch } from "../lib/grotvy/lista";
import { idagStockholm } from "../lib/grotvy/format";
import { grotPaminnelser, paminnelseMeddelande, paminnelsePayload } from "../lib/grotvy/paminnelse";
import { koaGrotPaminnelser } from "../lib/grotvy/paminnelse-ko";

const rot = path.resolve(__dirname, "..");
const envFil = [path.join(rot, ".env.local"), path.join(rot, "..", "..", "..", ".env.local")].find((f) => fs.existsSync(f));
if (!envFil) { console.error("hittar ingen .env.local"); process.exit(1); }
for (const rad of fs.readFileSync(envFil, "utf8").split("\n")) {
  const i = rad.indexOf("="); if (i < 0 || rad.startsWith("#")) continue;
  const k = rad.slice(0, i).trim(); if (!process.env[k]) process.env[k] = rad.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const idag = idagStockholm();
const dagPlus = (d: string, n: number) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)); return t.toISOString().slice(0, 10); };

(async () => {
  console.log(`Idag (svensk tid): ${idag}\n`);

  // 1) Det riktiga läget — exakt vad cron-rutten skulle göra just nu, torrt.
  const rapport = await koaGrotPaminnelser(sb, { idag, dry: true });
  console.log("== TORRKÖRNING MOT RIKTIGA DATA ==");
  console.log(JSON.stringify(rapport, null, 2));

  if (!process.argv.includes("--demo")) return;

  // 2) Demo: fiktiva datum i minnet. Raden med dålig bärighet först (den visar markvillkoret i texten).
  const raw = await hamtaGrotRaw(sb);
  const lista = byggGrotLista(raw, { idag });
  const rader = lista.alla.slice().sort((a, b) => (b.barighet === "dalig" ? 1 : 0) - (a.barighet === "dalig" ? 1 : 0));
  const fall: { rad: (typeof rader)[number]; dagar: number; forvantat: string }[] = [
    { rad: rader[0], dagar: 7, forvantat: "7-notis" },
    { rad: rader[1], dagar: 6, forvantat: "7-notis (ett dygns marginal)" },
    { rad: rader[2], dagar: 2, forvantat: "2-notis" },
    { rad: rader[3], dagar: 5, forvantat: "ingen (datumet satt för sent för 7-notisen, för tidigt för 2-notisen)" },
    { rad: rader[4], dagar: -3, forvantat: "ingen (försenat)" },
  ].filter((f) => !!f.rad);
  let demoRaw = raw;
  fall.forEach((f) => { demoRaw = medDimPatch(demoRaw, [f.rad.id], { grot_senast: dagPlus(idag, f.dagar) }); });
  const demoLista = byggGrotLista(demoRaw, { idag });
  const pam = grotPaminnelser(demoLista);
  console.log("\n== DEMO (fiktiva datum i minnet) ==");
  fall.forEach((f) => {
    const p = pam.find((x) => x.radId === f.rad.id);
    console.log(`  ${f.rad.namn.slice(0, 30).padEnd(30)} datum idag${f.dagar >= 0 ? "+" : ""}${f.dagar}  → ${p ? `KÖAS (${p.tidpunkt}-notis)` : "köas inte"}   [väntat: ${f.forvantat}]`);
    if (p) {
      const m = paminnelseMeddelande(paminnelsePayload(p), idag);
      console.log(`      push: "${m.title}" / "${m.body}"   nyckel: ${p.nyckel}`);
    }
  });
})().catch((e) => { console.error("FEL", e?.message || e); process.exit(1); });
