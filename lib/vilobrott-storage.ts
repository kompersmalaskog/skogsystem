import { supabase } from "@/lib/supabase";
import { analyseraVilobrott, type Arbetsdag, type VilaTrosklar } from "@/lib/vilobrott";

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
 * Hämtar vilobrott för en medarbetare över en explicit period.
 * Används av Min tid-fliken, Vila-fliken med periodfilter, och som
 * underliggande för hamtaAktuellaVilobrott().
 */
export async function hamtaVilobrottForPeriod(
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
 * Hämtar vilobrott för en medarbetare de senaste 14 dagarna.
 * Används av Dag-vyns morgon-varningar och Bekräfta-flödets för-check.
 */
export async function hamtaAktuellaVilobrott(
  medarbetareId: string,
): Promise<VilobrottRad[]> {
  const från = new Date();
  från.setDate(från.getDate() - 14);
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
): Promise<void> {
  const nyaBrott = analyseraVilobrott(dagar, trosklar);
  // Begränsa till analysfönstret — brott utanför är inte vår jurisdiktion.
  const nyaIFonster = nyaBrott.filter(
    (b) => b.datum >= fonsterFromDatum && b.datum <= fonsterToDatum,
  );

  const befintliga = await hamtaVilobrottForPeriod(
    medarbetareId,
    fonsterFromDatum,
    fonsterToDatum,
  );

  const nyckel = (typ: string, datum: string) => `${typ}|${datum}`;
  const befintligaMap = new Map(befintliga.map((b) => [nyckel(b.typ, b.datum), b]));
  const nyaMap = new Map(nyaIFonster.map((b) => [nyckel(b.typ, b.datum), b]));

  // 1) Insertera nya, uppdatera siffror på befintliga (utan att röra orsak)
  for (const ny of nyaIFonster) {
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
