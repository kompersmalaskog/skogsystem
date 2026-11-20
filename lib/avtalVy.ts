// Mitt avtal (Arbetsrapport → Inställningar): vad föraren ser, byggt ur EN rad i gs_avtal och inget annat.
//
// Regeln (2026-10-14): ett värde kommer ur en riktig kolumn (lib/gs-avtal GS_AVTAL_KOLUMNER) eller så står det "–".
// Aldrig en reserv. Förut stod `gsAvtal?.atk_ledig_tim ?? 65.2` i vyn: kolumnen heter atk_ledig_tid_h, så reserven
// visades alltid, och "Gäller 1 apr 2025 – 31 mar 2027" var en text. En förare som inte kunde läsa raden (gs_avtal var
// bara läsbar för admin) och en förare med ett avtal som ändrats såg samma påhittade siffror som om de vore avtalet.
// Ren funktion, ingen I/O.
import type { GsAvtal } from "./gs-avtal";

export const SAKNAS = "–";

/** Hur övertid räknas (lagkontrollen och lönen, 2026-10-19). Appens egen regel — ingen avtalskolumn bär den, så den står kvar även när raden inte gick att läsa. */
export const OVERTID_REGEL = "per kalendermånad – först när månadens timmar är fyllda";

export type AvtalRad = [etikett: string, varde: string];
export type AvtalGrupp = { rubrik: string; rader: AvtalRad[] };

const MANADER = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "2025-04-01" → "1 apr 2025". Allt som inte är ett datum → null (aldrig "NaN apr"). */
export function avtalDatum(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const man = Number(m[2]);
  const dag = Number(m[3]);
  if (man < 1 || man > 12 || dag < 1 || dag > 31) return null;
  return `${dag} ${MANADER[man - 1]} ${m[1]}`;
}

/** Gäller-raden: från giltigt_fran till giltigt_till; utan slutdatum "löpande". Saknas startdatum: "–". */
export function avtalsperiod(fran: string | null | undefined, till: string | null | undefined): string {
  const f = avtalDatum(fran);
  if (!f) return SAKNAS;
  const t = avtalDatum(till);
  return t ? `${f} – ${t}` : `Från ${f}, löpande`;
}

/** Ett tal ur kolumnen → "3,62" (decimalkomma, högst två decimaler, inga döda nollor). null/tomt/NaN → null. */
function talText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

/** Värde + enhet, eller "–" när kolumnen saknar värde. Enheten står aldrig ensam. */
function medEnhet(v: unknown, enhet: string, prefix = ""): string {
  const t = talText(v);
  return t === null ? SAKNAS : `${prefix}${t}${enhet}`;
}

function text(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  return t || SAKNAS;
}

/** "Nyårsdagen,Trettondagen,…" → "Nyårsdagen, Trettondagen, …". Tom lista → "–". */
export function helglonLista(v: string | null | undefined): string {
  const dagar = String(v ?? "").split(",").map(d => d.trim()).filter(Boolean);
  return dagar.length ? dagar.join(", ") : SAKNAS;
}

/**
 * Grupperna i vyn, i samma ordning som förut. Kr-satser (övertid, OB, färdmedel, färdtid, traktamente) visas inte:
 * satserna ägs av lönesystemet, appen skickar bara mängder. `avtal === null` = raden gick inte att läsa → alla värden "–".
 */
export function byggAvtalGrupper(avtal: GsAvtal | null | undefined): AvtalGrupp[] {
  const a: Partial<GsAvtal> = avtal ?? {};
  return [
    { rubrik: "Avtalsperiod", rader: [
      ["Avtal", text(a.namn)],
      ["Gäller", avtalsperiod(a.giltigt_fran, a.giltigt_till)],
    ] },
    { rubrik: "Övertid", rader: [
      ["Max övertid", medEnhet(a.max_overtid_ar_h, " tim/år")],
      ["Övertid räknas", OVERTID_REGEL],
    ] },
    { rubrik: "Färdmedel & färdtid", rader: [
      ["Km-gräns", medEnhet(a.km_grans_per_dag, " km/dag")],
    ] },
    { rubrik: "ATK", rader: [
      ["Avsättning", medEnhet(a.atk_procent, "%")],
      ["Nästa period", medEnhet(a.atk_procent_nasta, "%")],
      ["Ledig tid", medEnhet(a.atk_ledig_tid_h, " tim/år")],
      ["Pension-tillägg", medEnhet(a.pension_tillagg_pct, "%", "+")],
    ] },
    { rubrik: "Sjuklön", rader: [
      ["Ersättning efter karens", medEnhet(a.sjuklon_pct, "% av lön")],
    ] },
    { rubrik: "Semester", rader: [
      ["Semesterdagar", medEnhet(a.semester_dagar_ar, " dagar/år")],
      ["Ersättning tidsbegränsad", medEnhet(a.semester_ersattning_pct, "%")],
    ] },
    { rubrik: "Helglön (timavlönade)", rader: [
      ["Dagar", helglonLista(a.helglon_dagar)],
    ] },
    { rubrik: "Övriga tillägg", rader: [
      ["Skifttillägg", medEnhet(a.skift_tillagg_kr, " kr/tim")],
      ["Bortovaro >12h", medEnhet(a.bortovaro_12h_kr, " kr/tim")],
    ] },
  ];
}
