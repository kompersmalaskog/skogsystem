// scripts/audit-vilobrott.ts
//
// READ-ONLY revision av vilobrott-tabellen mot NUVARANDE arbetsdagar och perioder.
// Raderar, uppdaterar och skapar INGET (bara .select()). Rapporterar per förare vilka
// lagrade brott som nuvarande data inte längre stöder, och vilka som är orimliga (0 h).
//
// Bakgrund (Martin 2026-10-05): ett vilobrott för raderad testdata runt 29 september stod
// kvar och föraren fick frågan "Varför bröts vilan?" med texten "Mellan 29 september och
// 29 september hade du som mest 0 h sammanhängande vila". Frågan: finns fler sådana rader?
//
// Användning:
//   npx tsx scripts/audit-vilobrott.ts --env="C:\sökväg\till\.env.local"
// (eller sätt NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i miljön). Nycklarna
// skrivs aldrig ut.
//
// Klassning av varje lagrad rad:
//   stöds         nuvarande analys (hela historiken, samma kod som appen) ger samma brott
//   stöds ej      analysen ger det INTE längre (raderad dag/period, ändrade tider, ny analyskod)
//   orimligt      0 h vila (arTroligtVilobrott) — gammal data, aldrig ett riktigt brott
// och om förarens svar finns (besvarad). Besvarade rader är revisionsspår och ska aldrig
// raderas, ens när de inte stöds; de redovisas ändå.
// Kant: brott inom de första sju dagarna av en förares historik kan skilja sig för att
// underlaget där är kort — de markeras "kant".

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { analyseraVilobrott, arTroligtVilobrott, medPerioddagSpann } from "../lib/vilobrott";
import { franGolv } from "../lib/skarpStart";

function laddaEnv() {
  const arg = process.argv.find(a => a.startsWith("--env="));
  if (!arg) return;
  const fil = arg.slice("--env=".length).replace(/^"|"$/g, "");
  for (const rad of fs.readFileSync(fil, "utf8").split(/\r?\n/)) {
    const m = rad.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
laddaEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY (ange --env=<sökväg>)");
  process.exit(1);
}
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

/** Alla rader, sidor om 500, med unik tiebreaker (id) så paginering inte tappar eller dubblerar. */
async function allaRader(tabell: string, kolumner: string, filter: (q: any) => any = q => q): Promise<any[]> {
  const ut: any[] = [];
  for (let sida = 0; ; sida++) {
    const { data, error } = await filter(sb.from(tabell).select(kolumner))
      .order("id", { ascending: true })
      .range(sida * 500, sida * 500 + 499);
    if (error) throw new Error(`${tabell}: ${error.message}`);
    ut.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return ut;
}

async function main() {
  console.log("=== READ-ONLY revision av vilobrott — inget skrivs ===\n");
  const idag = new Date().toISOString().slice(0, 10);
  const { data: avtal, error: avtalFel } = await sb.from("gs_avtal")
    .select("dygnsvila_krav_h, dygnsvila_varning_h, veckovila_krav_h, veckovila_fonster_dagar, kompensation_deadline_dagar")
    .lte("giltigt_fran", idag).order("giltigt_fran", { ascending: false }).limit(1).maybeSingle();
  if (avtalFel || !avtal) throw new Error("Kunde inte läsa gs_avtal: " + (avtalFel?.message || "ingen rad"));
  const trosklar = {
    dygnsvila_krav_h: Number(avtal.dygnsvila_krav_h), dygnsvila_varning_h: Number(avtal.dygnsvila_varning_h),
    veckovila_krav_h: Number(avtal.veckovila_krav_h), veckovila_fonster_dagar: Number(avtal.veckovila_fonster_dagar),
    kompensation_deadline_dagar: Number(avtal.kompensation_deadline_dagar),
  };
  const golv = franGolv("2000-01-01");

  const medarbetare = await allaRader("medarbetare", "id, namn");
  const vilobrott = await allaRader("vilobrott", "id, medarbetare_id, typ, datum, vila_h, krav_h, beskrivning, besvarat_av_forare, orsak");
  const dagar = await allaRader("arbetsdag", "id, medarbetare_id, datum, start_tid, slut_tid", q => q.gte("datum", golv));
  const perioder = await allaRader("extra_tid", "id, medarbetare_id, datum, start_tid, slut_tid", q => q.gte("datum", golv).not("slut_tid", "is", null));

  console.log(`Underlag: ${medarbetare.length} medarbetare, ${dagar.length} arbetsdagar, ${perioder.length} perioder, ${vilobrott.length} lagrade vilobrott (från ${golv}).\n`);

  let totStoder = 0, totStodsEj = 0, totOrimligt = 0, totBesvaradeStodsEj = 0;
  const rapport: string[] = [];

  for (const med of medarbetare) {
    const rader = vilobrott.filter(v => v.medarbetare_id === med.id);
    if (rader.length === 0) continue;
    const egnaDagar = dagar.filter(d => d.medarbetare_id === med.id).map(d => ({ datum: d.datum, start_tid: d.start_tid, slut_tid: d.slut_tid }));
    const egnaPerioder = perioder.filter(p => p.medarbetare_id === med.id).map(p => ({ datum: p.datum, start_tid: p.start_tid, slut_tid: p.slut_tid }));
    const analys = analyseraVilobrott(medPerioddagSpann(egnaDagar, egnaPerioder), trosklar);
    const nycklar = new Set(analys.map(b => `${b.typ}|${b.datum}`));
    const forstaDatum = [...egnaDagar.map(d => d.datum), ...egnaPerioder.map(p => p.datum)].sort()[0] || "9999-12-31";
    const kantTill = new Date(forstaDatum + "T00:00:00"); kantTill.setDate(kantTill.getDate() + 7);
    const kantIso = kantTill.toISOString().slice(0, 10);

    const rubrik = `${med.namn || med.id}: ${rader.length} lagrade (${egnaDagar.length} dagar, ${egnaPerioder.length} perioder i underlaget)`;
    const rad: string[] = [];
    let stoder = 0;
    for (const v of rader.sort((a, b) => a.datum.localeCompare(b.datum))) {
      const orimligt = !arTroligtVilobrott(v);
      const stods = nycklar.has(`${v.typ}|${v.datum}`);
      const besvarad = !!v.besvarat_av_forare;
      if (orimligt) totOrimligt++;
      if (stods && !orimligt) { stoder++; totStoder++; continue; }
      if (!stods) { totStodsEj++; if (besvarad) totBesvaradeStodsEj++; }
      const kant = v.datum < kantIso ? " [kant]" : "";
      rad.push(`    ${v.datum}  ${v.typ.padEnd(9)} ${String(v.vila_h).padStart(5)} h  ${besvarad ? "BESVARAD" : "obesvarad"}  ${orimligt ? "orimligt " : ""}${stods ? "" : "stöds ej"}${kant}`);
    }
    rapport.push(`${rubrik}\n    ${stoder} stöds`);
    if (rad.length) rapport.push(rad.join("\n"));
    rapport.push("");
  }
  console.log(rapport.join("\n"));
  console.log("=== Sammanfattning ===");
  console.log(`Stöds av nuvarande data:        ${totStoder}`);
  console.log(`Stöds INTE längre:              ${totStodsEj}  (varav besvarade, revisionsspår: ${totBesvaradeStodsEj})`);
  console.log(`Orimliga (0 h vila):            ${totOrimligt}`);
  console.log("\nInget har ändrats. Raderingen av obesvarade rader som inte stöds sköts av appens städning vid öppning (lib/vilobrott-storage).");
}

main().catch(err => { console.error("FEL:", err.message); process.exit(1); });
