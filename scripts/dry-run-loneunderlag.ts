/**
 * Kör löneunderlagets dry_run lokalt mot prod-data (samma lib som
 * /api/fortnox/salary-export) och skriver hela svaret som JSON.
 * Skickar INGENTING till Fortnox.
 *   npx tsx scripts/dry-run-loneunderlag.ts 2026-09 <utfil.json> [sökväg till .env.local]
 */
import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { beraknaLoneunderlag } from "@/lib/lonesystem/loneunderlag";

const [period, utfil, envFil = ".env.local"] = process.argv.slice(2);
if (!period || !utfil) { console.error("period (YYYY-MM) och utfil krävs"); process.exit(1); }
const env: Record<string, string> = {};
for (const line of readFileSync(envFil, "utf-8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("="); env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const u = await beraknaLoneunderlag(supabase, { period });
  writeFileSync(utfil, JSON.stringify(u, null, 1));
  console.log(`period ${u.period} · arbetsperiod ${u.arbetsperiod} · medarbetare ${u.berikad.length} · rader ${u.totalt_rader} → ${utfil}`);
})().catch((e) => { console.error("FEL:", e?.message || e); process.exit(1); });
