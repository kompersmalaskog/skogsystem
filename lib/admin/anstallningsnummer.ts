// Anställningsnumret hör till personen men lagras per lönesystem-koppling (medarbetare_lonesystem). EN skrivning,
// två ställen som använder den: personens löneuppgifter och Ny medarbetare-flödet (samt Lön → Lönesystem).
//
// Varje skrivning verifieras med .select(): 0 rader utan fel = RLS stoppade den tyst, och då får det aldrig se
// sparat ut. Kolumnen `uppdaterad` finns inte i produktion och skrivs därför aldrig.
import { supabase } from "@/lib/supabase";

export const IGEN_RAD = "Ändringen sparades inte — raden träffades inte (bara admin kan ändra det här).";

export type AnstallningKontext = { lonesystemId: string | null; nr: string; fel: string | null };

/** Fortnox-kopplingens id, och personens nummer på den. Utan koppling kan inget nummer sparas. */
export async function hamtaAnstallning(medarbetareId: string): Promise<AnstallningKontext> {
  const k = await supabase.from("lonesystem_koppling").select("id").eq("system_typ", "fortnox").maybeSingle();
  if (k.error) return { lonesystemId: null, nr: "", fel: k.error.message };
  const lonesystemId: string | null = (k.data as any)?.id ?? null;
  if (!lonesystemId) return { lonesystemId: null, nr: "", fel: null };
  const r = await supabase.from("medarbetare_lonesystem").select("anstallningsnummer").eq("medarbetare_id", medarbetareId).eq("lonesystem_id", lonesystemId);
  if (r.error) return { lonesystemId, nr: "", fel: r.error.message };
  return { lonesystemId, nr: String((r.data as any[])?.[0]?.anstallningsnummer || ""), fel: null };
}

/** Sparar (eller tar bort, om numret är tomt) personens nummer på kopplingen. Ger felet som text, eller null. */
export async function sparaAnstallningsnummer(medarbetareId: string, lonesystemId: string | null, anstallningsnummer: string): Promise<string | null> {
  if (!lonesystemId) return "Anslut Fortnox först under Lön → Lönesystem. Anställningsnumret hör till kopplingen.";
  const nr = anstallningsnummer.trim();
  const { data: finns, error: lasFel } = await supabase.from("medarbetare_lonesystem")
    .select("id").eq("medarbetare_id", medarbetareId).eq("lonesystem_id", lonesystemId);
  if (lasFel) return lasFel.message;
  const radId: string | undefined = (finns as any[])?.[0]?.id;
  if (!nr) {
    if (radId) {
      const { data, error } = await supabase.from("medarbetare_lonesystem").delete().eq("id", radId).select("id");
      if (error) return error.message;
      if (!data?.length) return IGEN_RAD;
    }
    return null;
  }
  const skriv = radId
    ? await supabase.from("medarbetare_lonesystem").update({ anstallningsnummer: nr }).eq("id", radId).select("id")
    : await supabase.from("medarbetare_lonesystem").insert({ medarbetare_id: medarbetareId, lonesystem_id: lonesystemId, anstallningsnummer: nr }).select("id");
  if (skriv.error) return skriv.error.message;
  if (!skriv.data?.length) return IGEN_RAD;
  return null;
}
