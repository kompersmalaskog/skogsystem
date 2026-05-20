// scripts/backfill-vilobrott.ts
//
// Körs EN GÅNG efter migrationerna 20260520_vilobrott.sql och
// 20260520_gs_avtal_vila_troskelvarden.sql är applicerade OCH efter att
// lib/vilobrott.ts har refaktorerats att ta tröskelvärden som parameter
// (Granskningspunkt B).
//
// Beräknar historiska vilobrott för alla medarbetare och skriver in dem
// i vilobrott-tabellen. Markeras som retroaktiva (besvarat_av_forare=true,
// orsak='annat', kompensation_uttagen=true) så förarna inte triggar
// orsaksfrågan för gamla händelser och historisk skuld inte ligger som
// öppna kompensationskrav.
//
// Användning:
//   NEXT_PUBLIC_SUPABASE_URL=https://... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   npx tsx scripts/backfill-vilobrott.ts

import { createClient } from "@supabase/supabase-js";
import { analyseraVilobrott } from "../lib/vilobrott";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // Hämta tröskelvärden från det avtal som gäller idag
  const idag = new Date().toISOString().slice(0, 10);
  const { data: avtal, error: avtalErr } = await sb
    .from("gs_avtal")
    .select("dygnsvila_krav_h, dygnsvila_varning_h, veckovila_krav_h, veckovila_fonster_dagar, kompensation_deadline_dagar")
    .lte("giltigt_fran", idag)
    .order("giltigt_fran", { ascending: false })
    .limit(1)
    .single();
  if (avtalErr || !avtal) {
    throw new Error("Kunde inte hämta gs_avtal: " + (avtalErr?.message || "ingen rad"));
  }

  const trosklar = {
    dygnsvila_krav_h: Number(avtal.dygnsvila_krav_h),
    dygnsvila_varning_h: Number(avtal.dygnsvila_varning_h),
    veckovila_krav_h: Number(avtal.veckovila_krav_h),
    veckovila_fonster_dagar: avtal.veckovila_fonster_dagar,
  };
  const deadlineDagar = avtal.kompensation_deadline_dagar;

  // Hämta alla medarbetare
  const { data: medarbetare, error: medErr } = await sb
    .from("medarbetare")
    .select("id, namn");
  if (medErr) throw medErr;

  let totBrott = 0;
  let totMedarbetare = 0;

  for (const med of medarbetare!) {
    const { data: dagar, error: dagErr } = await sb
      .from("arbetsdag")
      .select("datum, start_tid, slut_tid")
      .eq("medarbetare_id", med.id)
      .not("start_tid", "is", null)
      .not("slut_tid", "is", null)
      .order("datum");
    if (dagErr) {
      console.warn(`Hoppade ${med.namn}: ${dagErr.message}`);
      continue;
    }
    if (!dagar || dagar.length === 0) continue;

    // analyseraVilobrott() måste vara refaktorerad att ta trösklar som andra parameter.
    // Om signaturen är (dagar) i denna version får du TypeScript-fel — kör steg B först.
    const brott = analyseraVilobrott(dagar, trosklar);
    if (brott.length === 0) continue;

    const rader = brott.map((b) => {
      const kompH = b.krav_h - b.vila_h;
      const deadline = addDays(b.datum, deadlineDagar);
      return {
        medarbetare_id: med.id,
        typ: b.typ,
        datum: b.datum,
        vila_h: b.vila_h,
        krav_h: b.krav_h,
        beskrivning: b.beskrivning,
        // Retroaktiva: markera som besvarade så de inte triggar orsaksfrågan
        besvarat_av_forare: true,
        orsak: "annat" as const,
        orsak_fritext: "Retroaktiv import vid systembyte",
        besvarat_tid: new Date().toISOString(),
        kompensation_h: kompH,
        kompensation_deadline: deadline,
        // Och som uttagna så historisk skuld inte ligger som öppna ärenden
        kompensation_uttagen: true,
        kompensation_uttagen_tid: new Date().toISOString(),
      };
    });

    const { error: insErr } = await sb
      .from("vilobrott")
      .upsert(rader, { onConflict: "medarbetare_id,typ,datum" });
    if (insErr) {
      console.error(`Fel för ${med.namn}: ${insErr.message}`);
      continue;
    }

    totBrott += brott.length;
    totMedarbetare++;
    console.log(`${med.namn}: ${brott.length} retroaktiva brott`);
  }

  console.log("");
  console.log(`Klart. ${totBrott} retroaktiva brott hos ${totMedarbetare} medarbetare.`);
}

function addDays(datum: string, dagar: number): string {
  const d = new Date(datum);
  d.setDate(d.getDate() + dagar);
  return d.toISOString().slice(0, 10);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
