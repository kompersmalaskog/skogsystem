import { supabase } from "@/lib/supabase";
import { analyseraVilobrott, arTroligtVilobrott, medPerioddagSpann, type Arbetsdag, type VilaTrosklar } from "@/lib/vilobrott";
import { vilaTrosklarFromAvtal } from "@/lib/gs-avtal";
import { franGolv } from "@/lib/skarpStart";
import { ymdLokal } from "@/lib/datumLokal";

/**
 * Storage-lagret för vilobrott-tabellen. Håller lib/vilobrott.ts fri från
 * Supabase-imports — denna fil är där DB-anrop sker.
 *
 * Re-analys-mönster: när en arbetsdag muteras kör analyseraOchSpara() på
 * ett fönster runt mutationen (typiskt datum-3 till datum+3). Den
 * INSERT:ar nya brott, UPDATE:ar siffror på befintliga (utan att röra
 * förarens orsak/svar), och DELETE:ar obesvarade brott som inte längre är
 * aktuella. Besvarade brott behålls även om vilan nu är OK — de är
 * revisionsspår mot Arbetsmiljöverket.
 */

// DB-radens shape — alla kolumner i vilobrott-tabellen.
export type VilobrottRad = {
  id: string;
  medarbetare_id: string;
  typ: "dygnsvila" | "veckovila";
  datum: string;
  vila_h: number;
  krav_h: number;
  brist_h: number;
  beskrivning: string | null;
  upptackt_tid: string;
  besvarat_av_forare: boolean;
  orsak: "oforutsedd" | "akut_jour" | "planerad_avtal" | "annat" | null;
  orsak_fritext: string | null;
  besvarat_tid: string | null;
  kompensation_h: number | null;
  kompensation_deadline: string | null;
  kompensation_uttagen: boolean;
  kompensation_uttagen_tid: string | null;
  kvitterad_av_chef: string | null;
  kvitterad_tid: string | null;
  skapad: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ALLA rader i perioden, även sådana som inte är troliga (0 h vila). Används av re-analysen,
 * som måste SE gamla artefakter för att kunna radera dem. Visning och frågor går via
 * hamtaVilobrottForPeriod nedan.
 */
export async function hamtaVilobrottRaa(
  medarbetareId: string,
  fromDatum: string,
  toDatum: string,
): Promise<VilobrottRad[]> {
  const { data, error } = await supabase
    .from("vilobrott")
    .select("*")
    .eq("medarbetare_id", medarbetareId)
    .gte("datum", fromDatum)
    .lte("datum", toDatum)
    .order("datum", { ascending: false });
  if (error) throw new Error(`Kunde inte hämta vilobrott: ${error.message}`);
  return (data || []) as VilobrottRad[];
}

/**
 * Hämtar vilobrott för en medarbetare över en explicit period, utan rader som inte är
 * troliga (arTroligtVilobrott: ett brott med 0 h vila är gammal data, inte ett brott).
 * Används av Min tid-fliken, Vila-fliken med periodfilter, Dag-vyns "vad som väntar",
 * Bekräfta-flödets för-check och som underliggande för hamtaAktuellaVilobrott().
 */
export async function hamtaVilobrottForPeriod(
  medarbetareId: string,
  fromDatum: string,
  toDatum: string,
): Promise<VilobrottRad[]> {
  const rader = await hamtaVilobrottRaa(medarbetareId, fromDatum, toDatum);
  return rader.filter(arTroligtVilobrott);
}

/**
 * Hämtar vilobrott för en medarbetare de senaste `dagar` dagarna (default 14).
 * Används av Dag-vyns "vad som väntar" (30 dagar) och Bekräfta-flödets för-check.
 */
export async function hamtaAktuellaVilobrott(
  medarbetareId: string,
  dagar = 14,
): Promise<VilobrottRad[]> {
  const från = new Date();
  från.setDate(från.getDate() - dagar);
  return hamtaVilobrottForPeriod(medarbetareId, isoDate(från), isoDate(new Date()));
}

/**
 * Generell UPSERT av vilobrott-rader. Skriver över alla fält i payload —
 * passar för backfill och andra fall där hela raden är känd. För
 * partiella uppdateringar som ska bevara förarens orsak/svar, använd
 * analyseraOchSpara() istället.
 */
export async function sparaVilobrott(
  rader: Partial<VilobrottRad>[],
): Promise<void> {
  if (rader.length === 0) return;
  const { error } = await supabase
    .from("vilobrott")
    .upsert(rader, { onConflict: "medarbetare_id,typ,datum" });
  if (error) throw new Error(`Kunde inte spara vilobrott: ${error.message}`);
}

/**
 * Re-analyserar vilan i ett fönster och synkar vilobrott-tabellen:
 *
 * - Nya brott (saknas i DB) INSERT:as med besvarat_av_forare = false.
 * - Befintliga brott som fortfarande är aktuella UPDATE:ras bara på
 *   vila_h/krav_h/beskrivning. Förarens orsak/svar lämnas orört.
 * - Obesvarade brott som inte längre är aktuella DELETE:as.
 * - Besvarade brott som inte längre är aktuella lämnas orörda
 *   (revisionsspår — förarens svar ska inte raderas av en re-analys).
 *
 * `dagar` måste innehålla minst fonsterFromDatum-7 till fonsterToDatum så
 * att veckovila-fönstret går att räkna ut. Caller ansvarar för det.
 *
 * `fonsterFromDatum`/`fonsterToDatum` avgränsar VAR vi muterar — brott på
 * andra datum lämnas orörda även om de råkar dyka upp i analysens output.
 *
 * TODO: MOM-import (Python-skript som lägger arbetsdag-rader) kör inte
 * denna funktion automatiskt. Detektering sker nästa gång föraren öppnar
 * appen. Löses senare via en webhook eller Edge Function vid HPR/MOM-
 * import.
 */
export async function analyseraOchSpara(
  medarbetareId: string,
  dagar: Arbetsdag[],
  trosklar: VilaTrosklar,
  fonsterFromDatum: string,
  fonsterToDatum: string,
  /** baraStada: ENDAST radera obesvarade brott som underlaget inte längre stöder.
   *  Inga inserts, inga uppdateringar — används vid öppning av appen, där nya brott
   *  inte ska dyka upp av sig självt. */
  opts: { baraStada?: boolean } = {},
): Promise<void> {
  // SKRIVGOLV (lib/skarpStart): analysera aldrig före skarp start. Ett läsgolv
  // hade räckt för visningen, men den här funktionen INSERT/UPDATE/DELETE:ar —
  // ett fönster som når in i juli hade skapat/raderat brott på byggmaterial.
  // Besvarade brott före golvet finns kvar i DB (revisionsspår) och rörs ej.
  fonsterFromDatum = franGolv(fonsterFromDatum);
  if (fonsterToDatum < fonsterFromDatum) return;
  // PERIODDAGAR (lib/vilobrott medPerioddagSpann): arbetstidslagen gäller all
  // arbetstid. Dagar utan klockslag får sitt spann ur perioderna. Hämtas här,
  // en gång, så BÅDA anroparna i Arbetsrapport (synk efter mutation, för-check
  // vid Bekräfta) får dem — 7 dagar bakom fönstret, som `dagar` ska täcka.
  const perFrom = new Date(fonsterFromDatum + "T00:00:00");
  perFrom.setDate(perFrom.getDate() - 7);
  const { data: perioder, error: perFel } = await supabase
    .from("extra_tid")
    .select("datum, start_tid, slut_tid")
    .eq("medarbetare_id", medarbetareId)
    .gte("datum", ymdLokal(perFrom))
    .lte("datum", fonsterToDatum)
    .not("slut_tid", "is", null);
  // Ett läsfel får inte tyst ge "ingen perioddag" — då analyseras (och
  // raderas!) brott på fel underlag. Kasta, anroparen loggar.
  if (perFel) throw new Error(`Kunde inte läsa perioderna (extra_tid): ${perFel.message}`);
  const nyaBrott = analyseraVilobrott(medPerioddagSpann(dagar, (perioder || []) as any[]), trosklar);
  // Begränsa till analysfönstret — brott utanför är inte vår jurisdiktion.
  const nyaIFonster = nyaBrott.filter(
    (b) => b.datum >= fonsterFromDatum && b.datum <= fonsterToDatum,
  );

  // RÅA rader: re-analysen måste se gamla artefakter (0 h) för att kunna radera dem.
  const befintliga = await hamtaVilobrottRaa(
    medarbetareId,
    fonsterFromDatum,
    fonsterToDatum,
  );

  const nyckel = (typ: string, datum: string) => `${typ}|${datum}`;
  const befintligaMap = new Map(befintliga.map((b) => [nyckel(b.typ, b.datum), b]));
  const nyaMap = new Map(nyaIFonster.map((b) => [nyckel(b.typ, b.datum), b]));

  // 1) Insertera nya, uppdatera siffror på befintliga (utan att röra orsak)
  for (const ny of opts.baraStada ? [] : nyaIFonster) {
    const k = nyckel(ny.typ, ny.datum);
    const fanns = befintligaMap.get(k);
    if (!fanns) {
      const { error } = await supabase.from("vilobrott").insert({
        medarbetare_id: medarbetareId,
        typ: ny.typ,
        datum: ny.datum,
        vila_h: ny.vila_h,
        krav_h: ny.krav_h,
        beskrivning: ny.beskrivning,
      });
      if (error) {
        // 23505 = unique_violation. Annan klient hann först (single-device
        // är norm men det kan hända vid t.ex. öppna flikar). Raden finns
        // där vi vill att den ska vara — fortsätt utan retry.
        if ((error as { code?: string }).code === "23505") {
          console.warn(`Vilobrott redan inserterat (${ny.typ} ${ny.datum})`);
          continue;
        }
        throw new Error(`Insert vilobrott (${ny.typ} ${ny.datum}): ${error.message}`);
      }
    } else {
      // Skippa om värdena är oförändrade — sparar onödiga writes.
      // Beskrivning jämförs också eftersom strängen refererar trösklar
      // dynamiskt: om gs_avtal ändras får vi uppdaterad beskrivning här.
      if (
        Number(fanns.vila_h) === ny.vila_h &&
        Number(fanns.krav_h) === ny.krav_h &&
        fanns.beskrivning === ny.beskrivning
      ) continue;
      const { error } = await supabase
        .from("vilobrott")
        .update({
          vila_h: ny.vila_h,
          krav_h: ny.krav_h,
          beskrivning: ny.beskrivning,
        })
        .eq("id", fanns.id);
      if (error) throw new Error(`Update vilobrott (${ny.typ} ${ny.datum}): ${error.message}`);
    }
  }

  // 2) Radera obesvarade brott som inte längre är aktuella.
  //
  // Besvarade brott raderas ALDRIG — de är del av revisionsspåret mot
  // Arbetsmiljöverket. Även om föraren ändrar en arbetsdag så brottet inte
  // längre är aktuellt behåller vi raden med dess orsak och fritext.
  // Endast obesvarade artefakter (besvarat_av_forare = false) tas bort.
  const attRadera = befintliga
    .filter((b) => !nyaMap.has(nyckel(b.typ, b.datum)))
    .filter((b) => !b.besvarat_av_forare);
  for (const b of attRadera) {
    const { error } = await supabase.from("vilobrott").delete().eq("id", b.id);
    if (error) throw new Error(`Delete vilobrott (${b.typ} ${b.datum}): ${error.message}`);
  }
}

/**
 * Trösklarna ur gs_avtal (samma urval som Arbetsrapport: giltigt just nu, senaste först).
 * null när avtalet saknas eller är ogiltigt — då går det inte att analysera, och anroparen
 * ska INTE tolka det som "inga brott" (inget raderas).
 */
export async function hamtaVilaTrosklar(): Promise<VilaTrosklar | null> {
  const idag = isoDate(new Date());
  const { data, error } = await supabase
    .from("gs_avtal")
    .select("*")
    .lte("giltigt_fran", idag)
    .or(`giltigt_till.is.null,giltigt_till.gte.${idag}`)
    .order("giltigt_fran", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  try { return vilaTrosklarFromAvtal(data as any); } catch { return null; }
}

/**
 * Re-analys mot NUVARANDE data för [fran, till]: hämtar arbetsdag-raderna FÄRSKT ur databasen
 * (inte ur ett tillstånd i klienten som kan vara gammalt) och synkar vilobrott-tabellen.
 *
 * Varför: vilobrott räknades bara om i Arbetsrapport efter Avsluta/Starta/Ändra tider och vid
 * Bekräfta. Raderades en arbetsdag eller en period (eller ändrades den i Planera eller
 * direkt i databasen) stod brottet kvar och föraren fick frågan "Varför bröts vilan?" på
 * ett brott som inte fanns (Martin 2026-10-05, testdata runt 29 september). Nu körs den här
 * efter varje ändring av pass och perioder, och i städläge vid öppning av appen.
 *
 * Läsfel kastas (ett tomt underlag p.g.a. ett fel får aldrig radera brott). Saknas trösklarna
 * görs ingenting. Besvarade brott rörs aldrig (revisionsspår).
 */
export async function omanalyseraVilobrott(
  medarbetareId: string,
  fran: string,
  till: string,
  opts: { baraStada?: boolean; trosklar?: VilaTrosklar | null } = {},
): Promise<void> {
  const trosklar = opts.trosklar !== undefined ? opts.trosklar : await hamtaVilaTrosklar();
  if (!trosklar) return;
  // veckovila-fönstret behöver dagarna 7 före första analysdatum (+ marginal)
  const underlagFran = new Date(franGolv(fran) + "T00:00:00");
  underlagFran.setDate(underlagFran.getDate() - 14);
  const { data, error } = await supabase
    .from("arbetsdag")
    .select("datum, start_tid, slut_tid")
    .eq("medarbetare_id", medarbetareId)
    .gte("datum", ymdLokal(underlagFran))
    .lte("datum", till)
    .order("datum", { ascending: true });
  if (error) throw new Error(`Kunde inte läsa arbetsdagarna för vilo-analysen: ${error.message}`);
  await analyseraOchSpara(medarbetareId, (data || []) as Arbetsdag[], trosklar, fran, till, { baraStada: opts.baraStada });
}

/** Efter en ändring av pass eller perioder på `datum`: full omräkning av fönstret datum±3. */
export async function raknaOmVilobrottEfterAndring(medarbetareId: string, datum: string): Promise<void> {
  const d = new Date(datum + "T00:00:00");
  const fran = new Date(d); fran.setDate(d.getDate() - 3);
  const till = new Date(d); till.setDate(d.getDate() + 3);
  await omanalyseraVilobrott(medarbetareId, ymdLokal(fran), ymdLokal(till));
}

/** Vid öppning av appen: radera obesvarade brott som nuvarande data inte stöder. Inga nya brott. */
export async function stadaVilobrott(medarbetareId: string, dagar = 30): Promise<void> {
  const till = new Date();
  const fran = new Date(); fran.setDate(fran.getDate() - dagar);
  await omanalyseraVilobrott(medarbetareId, ymdLokal(fran), ymdLokal(till), { baraStada: true });
}
