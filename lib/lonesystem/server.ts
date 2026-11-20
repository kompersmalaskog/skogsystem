/**
 * Server-side hjälpare för Fortnox-integration.
 * Använder service-role-klient för DB-åtkomst.
 * Krypterar/dekrypterar tokens med AES-256-GCM.
 */
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "./crypto";
import { refreshFortnoxToken, FortnoxClient } from "./fortnox";

export function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type KopplingRow = {
  id: string;
  system_typ: string;
  access_token: string | null;
  refresh_token: string | null;
  token_utgar: string | null;
  aktiv: boolean;
  senast_synkad: string | null;
  skapad: string | null;
};

export async function hämtaKoppling(): Promise<KopplingRow | null> {
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("lonesystem_koppling")
    .select("*")
    .eq("system_typ", "fortnox")
    .maybeSingle();
  if (error) throw error;
  return data as KopplingRow | null;
}

/** Hämta koppling och dekryptera tokens. */
export async function hämtaKopplingDekrypterad(): Promise<
  (KopplingRow & { plain_access_token: string | null; plain_refresh_token: string | null }) | null
> {
  const k = await hämtaKoppling();
  if (!k) return null;
  return {
    ...k,
    plain_access_token: k.access_token ? decrypt(k.access_token) : null,
    plain_refresh_token: k.refresh_token ? decrypt(k.refresh_token) : null,
  };
}

/** Skapa kopplingsraden om den inte finns (upsert). */
export async function säkraKopplingFinns(): Promise<string> {
  const supabase = serverSupabase();
  const k = await hämtaKoppling();
  if (k) return k.id;
  const { data, error } = await supabase
    .from("lonesystem_koppling")
    .insert({ system_typ: "fortnox", aktiv: false })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Spara krypterade tokens + expires + aktiv. */
export async function sparaTokens(
  kopplingId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
) {
  const supabase = serverSupabase();
  const utgar = new Date(Date.now() + expiresIn * 1000).toISOString();
  const { error } = await supabase
    .from("lonesystem_koppling")
    .update({
      access_token: encrypt(accessToken),
      refresh_token: encrypt(refreshToken),
      token_utgar: utgar,
      aktiv: true,
      uppdaterad: new Date().toISOString(),
    })
    .eq("id", kopplingId);
  if (error) throw error;
}

/** Rensa tokens (koppla ifrån). */
export async function rensaTokens(kopplingId: string) {
  const supabase = serverSupabase();
  const { error } = await supabase
    .from("lonesystem_koppling")
    .update({
      access_token: null,
      refresh_token: null,
      token_utgar: null,
      aktiv: false,
      uppdaterad: new Date().toISOString(),
    })
    .eq("id", kopplingId);
  if (error) throw error;
}

/**
 * Hämta en redo-att-använda FortnoxClient.
 * Auto-refreshar om token < 5 min kvar.
 */
export async function getFortnoxClient(): Promise<FortnoxClient> {
  const k = await hämtaKopplingDekrypterad();
  if (!k || !k.plain_access_token || !k.plain_refresh_token) {
    throw new Error("Fortnox är inte anslutet. Gå till Admin > Lön > Lönesystem och anslut.");
  }

  // Auto-refresh om token utgår inom 5 min
  const utgar = k.token_utgar ? new Date(k.token_utgar).getTime() : 0;
  const femMinFrånNu = Date.now() + 5 * 60 * 1000;
  if (utgar < femMinFrånNu) {
    const tokens = await refreshFortnoxToken(k.plain_refresh_token);
    await sparaTokens(k.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);
    return new FortnoxClient(tokens.access_token);
  }

  return new FortnoxClient(k.plain_access_token);
}

/** Bygg redirect-URI baserat på request origin. */
export function fortnoxRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/fortnox/callback`;
}
