/**
 * Bevisar att salary-exportens synkAvvikelser-varning ger IDENTISKT utfall
 * före/efter refaktoreringen: kör RIKTIGA lib/synkAvvikelse (nya vägen) mot en
 * ordagrann kopia av den gamla inline-logiken, på verklig prod-data, och jämför.
 * npx tsx scripts/verify-salary-synk-identisk.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { synkAvvikelser as libSynk } from "@/lib/synkAvvikelse";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("="); env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const med = (await supabase.from("medarbetare").select("id, namn")).data || [];
  const arb = (await supabase.from("arbetsdag")
    .select("medarbetare_id, datum, synk_avvikelse").not("synk_avvikelse", "is", null)).data || [];
  const _namnMap = new Map(med.map((m: any) => [m.id, m.namn]));

  // ── NYA vägen: riktiga libben + salary-mappningen ──
  const nya = libSynk(arb as any)
    .filter((r) => r.status === "oforklarad")
    .map((r) => ({
      medarbetare: _namnMap.get(r.medarbetare_id) || r.medarbetare_id,
      datum: r.datum, diff_min: r.deltaMin,
      bekraftat: `${r.bekraftad_start}-${r.bekraftad_slut} rast ${r.bekraftad_rast_min}`,
      maskinen: `${r.mom_start}-${r.mom_slut} rast ${r.mom_rast_min}`,
    }))
    .sort((a, b) => b.diff_min - a.diff_min);

  // ── GAMLA vägen: ordagrann kopia av den tidigare inline-logiken ──
  const _tMin = (t: any) => { const m = String(t || "").match(/(\d{2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
  const gamla = (arb as any[])
    .filter((d) => d.synk_avvikelse && !d.synk_avvikelse.kvitterad)
    .map((d) => {
      const av = d.synk_avvikelse;
      const conf = (_tMin(av.bekraftad_slut) - _tMin(av.bekraftad_start)) - (av.bekraftad_rast_min || 0);
      const mom = (_tMin(av.mom_slut) - _tMin(av.mom_start)) - (av.mom_rast_min || 0);
      return {
        medarbetare: _namnMap.get(d.medarbetare_id) || d.medarbetare_id,
        datum: d.datum, diff_min: conf - mom,
        bekraftat: `${av.bekraftad_start}-${av.bekraftad_slut} rast ${av.bekraftad_rast_min}`,
        maskinen: `${av.mom_start}-${av.mom_slut} rast ${av.mom_rast_min}`,
      };
    })
    .sort((a, b) => b.diff_min - a.diff_min);

  const jn = JSON.stringify(nya), jg = JSON.stringify(gamla);
  console.log(`Testrader (arbetsdag med synk_avvikelse): ${arb.length}`);
  console.log(`GAMLA gav ${gamla.length} rader, NYA gav ${nya.length} rader`);
  console.log(`IDENTISKT: ${jn === jg ? "JA — byte för byte" : "NEJ — SKILJER SIG"}`);
  if (jn !== jg) {
    console.log("GAMLA:", jg);
    console.log("NYA:  ", jn);
    process.exit(1);
  }
  console.log("Exempel (första raden):", JSON.stringify(nya[0]));
})().catch((e) => { console.error("FEL:", e?.message || e); process.exit(1); });
