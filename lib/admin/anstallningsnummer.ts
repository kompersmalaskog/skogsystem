// Anställningsnumret hör till personen men lagras i medarbetare_lonesystem. EN skrivning, tre ställen som använder
// den: personens löneuppgifter, Ny medarbetare-flödet och Lön → Lönesystem.
//
// Numret går att spara UTAN en Fortnox-koppling (lonesystem_id är då null): ett nummer som Martin redan har ska inte
// vänta på att Fortnox ansluts. Exporten läser alla rader för personen, så ett sådant nummer fungerar direkt. När
// kopplingen finns knyts raden till den vid nästa sparning (samma rad, ingen dubblett), och numret kontrolleras mot
// Fortnox (kontrolleraAnstallningsnummer) så att ett felskrivet nummer upptäcks innan lönen skickas.
//
// Varje skrivning verifieras med .select(): 0 rader utan fel = RLS stoppade den tyst, och då får det aldrig se
// sparat ut. Kolumnen `uppdaterad` finns inte i produktion och skrivs därför aldrig.
import { supabase } from "@/lib/supabase";

export const IGEN_RAD = "Ändringen sparades inte — raden träffades inte (bara admin kan ändra det här).";

type Rad = { id: string; lonesystem_id: string | null; anstallningsnummer: string | null };

export type AnstallningKontext = { lonesystemId: string | null; nr: string; fel: string | null };

/** Fortnox-kopplingens id (null om ingen koppling finns än) och personens nummer, med eller utan koppling. */
export async function hamtaAnstallning(medarbetareId: string): Promise<AnstallningKontext> {
  const k = await supabase.from("lonesystem_koppling").select("id").eq("system_typ", "fortnox").maybeSingle();
  if (k.error) return { lonesystemId: null, nr: "", fel: k.error.message };
  const lonesystemId: string | null = (k.data as any)?.id ?? null;
  const r = await supabase.from("medarbetare_lonesystem").select("id, lonesystem_id, anstallningsnummer").eq("medarbetare_id", medarbetareId);
  if (r.error) return { lonesystemId, nr: "", fel: r.error.message };
  const rader = (r.data || []) as Rad[];
  const rad = (lonesystemId ? rader.find(x => x.lonesystem_id === lonesystemId) : undefined) ?? rader.find(x => x.lonesystem_id == null) ?? rader[0];
  return { lonesystemId, nr: String(rad?.anstallningsnummer || ""), fel: null };
}

/**
 * Sparar (eller tar bort, om numret är tomt) personens nummer. `lonesystemId` null = ingen koppling än. Ger felet
 * som text, eller null. En rad utan koppling knyts till kopplingen när den finns (samma rad uppdateras).
 */
export async function sparaAnstallningsnummer(medarbetareId: string, lonesystemId: string | null, anstallningsnummer: string): Promise<string | null> {
  const nr = anstallningsnummer.trim();
  const { data, error: lasFel } = await supabase.from("medarbetare_lonesystem").select("id, lonesystem_id, anstallningsnummer").eq("medarbetare_id", medarbetareId);
  if (lasFel) return lasFel.message;
  const rader = (data || []) as Rad[];
  const rad = (lonesystemId ? rader.find(x => x.lonesystem_id === lonesystemId) : undefined) ?? rader.find(x => x.lonesystem_id == null);
  if (!nr) {
    if (rad) {
      const r = await supabase.from("medarbetare_lonesystem").delete().eq("id", rad.id).select("id");
      if (r.error) return r.error.message;
      if (!r.data?.length) return IGEN_RAD;
    }
    return null;
  }
  const skriv = rad
    ? await supabase.from("medarbetare_lonesystem").update(lonesystemId ? { anstallningsnummer: nr, lonesystem_id: lonesystemId } : { anstallningsnummer: nr }).eq("id", rad.id).select("id")
    : await supabase.from("medarbetare_lonesystem").insert({ medarbetare_id: medarbetareId, lonesystem_id: lonesystemId, anstallningsnummer: nr }).select("id");
  if (skriv.error) return skriv.error.message;
  if (!skriv.data?.length) return IGEN_RAD;
  return null;
}

/** Svaret på "finns numret i Fortnox?". `ej_ansluten` är ett läge, inte ett fel: numret kontrolleras när anslutningen finns. */
export type AnstKontroll =
  | { status: "hittad"; namn: string }
  | { status: "saknas" }
  | { status: "ej_ansluten" }
  | { status: "fel"; fel: string };

export async function kontrolleraAnstallningsnummer(nr: string): Promise<AnstKontroll> {
  try {
    const r = await fetch("/api/fortnox/kontrollera-anstallningsnummer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anstallningsnummer: nr }) });
    const j = await r.json().catch(() => ({}));
    if (j?.status === "hittad") return { status: "hittad", namn: String(j.namn || "") };
    if (j?.status === "saknas") return { status: "saknas" };
    if (j?.status === "ej_ansluten") return { status: "ej_ansluten" };
    return { status: "fel", fel: j?.fel || j?.error || `HTTP ${r.status}` };
  } catch (e: any) {
    return { status: "fel", fel: e?.message || String(e) };
  }
}
