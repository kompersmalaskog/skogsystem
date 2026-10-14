// Historikvyn (admin): läsning ur vy_hist_maskin_ar och vy_hist_objekt_lista samt signerad länk till originalrapporten.
// All åtkomst går via inloggad klient (RLS: bara admin). Inget skrivs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { HistorikFel, tillHistorikFel } from "./fel";
import type { IndexAtgard, Kurvor } from "./indexForklaring";
import { tillMaskinAr, tillObjekt, type AtgardKod, type MaskinArRad, type ObjektRad } from "./typer";

const SIDA = 1000;

/** Hela vy_hist_maskin_ar (några hundra till ~1 500 rader). Sida för sida med fast ordning, så ingen rad hoppar över eller dubbleras. */
export async function hamtaMaskinAr(supabase: SupabaseClient): Promise<MaskinArRad[]> {
  const ut: MaskinArRad[] = [];
  for (let fran = 0; ; fran += SIDA) {
    const { data, error } = await supabase
      .from("vy_hist_maskin_ar")
      .select("*")
      .order("maskin")
      .order("atgard", { nullsFirst: true })
      .order("ar", { nullsFirst: true })
      .order("urval")
      .range(fran, fran + SIDA - 1);
    if (error) throw tillHistorikFel(error);
    const rader = (data ?? []) as Record<string, unknown>[];
    ut.push(...rader.map(tillMaskinAr));
    if (rader.length < SIDA) break;
  }
  // RLS ger tomt svar UTAN fel för den som inte är admin. En admin har alltid hundratals rader, så tomt = saknad behörighet.
  if (ut.length === 0) throw new HistorikFel("behorighet", "vy_hist_maskin_ar gav inga rader (RLS)");
  return ut;
}

/** Objekten bakom ett år. atgard null = alla åtgärder (skotare). medAntagna=false utesluter obekräftad maskinstandard. */
export async function hamtaObjekt(
  supabase: SupabaseClient,
  maskin: string,
  ar: number,
  atgard: AtgardKod | null,
  medAntagna: boolean,
): Promise<ObjektRad[]> {
  const ut: ObjektRad[] = [];
  for (let fran = 0; ; fran += SIDA) {
    let q = supabase.from("vy_hist_objekt_lista").select("*").eq("maskin", maskin).eq("ar", ar);
    if (atgard) q = q.eq("atgard", atgard);
    if (!medAntagna) q = q.eq("urval", "namn");
    const { data, error } = await q.order("rapportdatum", { nullsFirst: false }).order("sha256").range(fran, fran + SIDA - 1);
    if (error) throw tillHistorikFel(error);
    const rader = (data ?? []) as Record<string, unknown>[];
    ut.push(...rader.map(tillObjekt));
    if (rader.length < SIDA) return ut;
  }
}

/** Kurvan index räknas mot: vy_hist_normkurva, varianten som vy_hist_objekt_index använder (g15-viktad). En rad per åtgärd. */
export async function hamtaNormkurva(supabase: SupabaseClient): Promise<Kurvor> {
  const { data, error } = await supabase.from("vy_hist_normkurva").select("atgard,a,b,n").eq("variant", "g15-viktad");
  if (error) throw tillHistorikFel(error);
  const ut: Kurvor = {};
  for (const r of (data ?? []) as { atgard: string; a: unknown; b: unknown; n: unknown }[]) {
    const a = Number(r.a), b = Number(r.b), n = Number(r.n);
    if ((r.atgard === "gallring" || r.atgard === "slutavverkning") && Number.isFinite(a) && Number.isFinite(b)) ut[r.atgard as IndexAtgard] = { a, b, n };
  }
  return ut;
}

export const SIGNERAD_LANK_SEKUNDER = 60;

/** Signerad länk (60 s) till originalrapporten i den privata bucketen "historik". */
export async function signeradLank(supabase: SupabaseClient, sokvag: string): Promise<string> {
  const { data, error } = await supabase.storage.from("historik").createSignedUrl(sokvag, SIGNERAD_LANK_SEKUNDER);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Ingen länk returnerades");
  return data.signedUrl;
}
