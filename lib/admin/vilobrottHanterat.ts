// Vilobrott: admins egen "hanterat"-markering (Martin 2026-10-25).
//
// Föraren svarar på varför vilan bröts (besvarat_av_forare, orsak) — det gör ALDRIG admin åt föraren. Admin markerar att brottet är
// hanterat och skriver vad som gjordes ("kompensationsledighet 3 h 14 okt"). Vem och när sätts av databasen (trigger
// a_vilobrott_kvittering, migration 20261025180000); spärren där gör också att bara admin kan sätta det.
//
// Listan (lib/admin/vilobrottLista) räknar om brotten ur arbetsdagarna, så ett brott kan sakna rad i tabellen när föraren inte öppnat
// appen sedan. Då skapas raden här — med brottets siffror och obesvarad — och föraren får frågan som vanligt.
import { supabase } from "@/lib/supabase";
import type { VilobrottRad } from "@/lib/admin/vilobrottLista";

/** Längsta anteckning (en mening räcker; Arbetsmiljöverket läser den i PDF:en). */
export const ANTECKNING_MAX = 300;

/** Kan anteckningen sparas? Tom text räcker inte: ett "hanterat" utan vad som gjordes säger ingenting. */
export function anteckningGiltig(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= ANTECKNING_MAX;
}

type Brott = Pick<VilobrottRad, "medarbetare_id" | "typ" | "datum" | "vila_h" | "krav_h" | "beskrivning">;

const SAKNAS = /42703|PGRST204|kvitterad_anteckning/;
function felText(e: { code?: string; message?: string }, vad: string): string {
  if (SAKNAS.test(`${e.code ?? ""} ${e.message ?? ""}`)) return `Kunde inte ${vad}: databasen saknar fältet för anteckningen (migrationen är inte körd).`;
  if (e.code === "42501") return `Kunde inte ${vad}: bara admin kan markera ett vilobrott som hanterat.`;
  return `Kunde inte ${vad}: ${e.message ?? e.code ?? "okänt fel"}`;
}

/** Markerar brottet hanterat med anteckningen. Kastar vid fel; returnerar först när raden lästs tillbaka med kvitteringen. */
export async function markeraHanterat(b: Brott, anteckning: string): Promise<void> {
  const text = anteckning.trim();
  if (!anteckningGiltig(text)) throw new Error("Skriv vad som gjordes, till exempel kompensationsledighet.");
  // kvitterad_tid skickas bara som signal: databasen skriver över den med now() och sätter vem.
  const kvittering = { kvitterad_tid: new Date().toISOString(), kvitterad_anteckning: text };
  const upd = await supabase.from("vilobrott").update(kvittering)
    .eq("medarbetare_id", b.medarbetare_id).eq("typ", b.typ).eq("datum", b.datum).select("id");
  if (upd.error) throw new Error(felText(upd.error, "spara"));
  if (!upd.data || upd.data.length === 0) {
    const ins = await supabase.from("vilobrott").insert({
      medarbetare_id: b.medarbetare_id, typ: b.typ, datum: b.datum,
      vila_h: b.vila_h, krav_h: b.krav_h, beskrivning: b.beskrivning, ...kvittering,
    }).select("id");
    if (ins.error) {
      // 23505: föraren hann skapa raden under tiden — gör om uppdateringen en gång.
      if (ins.error.code !== "23505") throw new Error(felText(ins.error, "spara"));
      const igen = await supabase.from("vilobrott").update(kvittering)
        .eq("medarbetare_id", b.medarbetare_id).eq("typ", b.typ).eq("datum", b.datum).select("id");
      if (igen.error) throw new Error(felText(igen.error, "spara"));
    }
  }
  await kontrollera(b, true);
}

/** Tar bort markeringen (databasen tömmer vem och anteckningen). Förarens svar rörs inte. */
export async function angraHanterat(b: Brott): Promise<void> {
  const upd = await supabase.from("vilobrott").update({ kvitterad_tid: null, kvitterad_anteckning: null })
    .eq("medarbetare_id", b.medarbetare_id).eq("typ", b.typ).eq("datum", b.datum).select("id");
  if (upd.error) throw new Error(felText(upd.error, "ångra"));
  await kontrollera(b, false);
}

/** Läser tillbaka: en radräkning bevisar inte att kvitteringen landade. */
async function kontrollera(b: Brott, ska: boolean): Promise<void> {
  const las = await supabase.from("vilobrott").select("kvitterad_tid")
    .eq("medarbetare_id", b.medarbetare_id).eq("typ", b.typ).eq("datum", b.datum).maybeSingle();
  if (las.error) throw new Error(felText(las.error, "kontrollera sparningen"));
  const finns = !!(las.data as { kvitterad_tid?: string | null } | null)?.kvitterad_tid;
  if (finns !== ska) throw new Error(ska ? "Sparningen syns inte i databasen. Försök igen." : "Markeringen ligger kvar. Försök igen.");
}

/** "Hanterat av Martin 25 okt" — förnamn och dag (svensk tid). */
export function hanteratText(h: { tid: string; av: string }): string {
  const d = new Date(h.tid);
  const dag = Number.isNaN(d.getTime()) ? "" : ` ${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).replace(".", "")}`;
  return `Hanterat av ${h.av.split(" ")[0]}${dag}`;
}
