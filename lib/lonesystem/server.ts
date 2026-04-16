/**
 * Server-side hjälpare för lönesystem — använder service role
 * eftersom OAuth-callbacken inte har user-session.
 */
import { createClient } from "@supabase/supabase-js";
import type { Koppling, SystemTyp } from "./types";

export function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function hämtaKoppling(systemTyp: SystemTyp): Promise<Koppling | null> {
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("lonesystem_koppling")
    .select("*")
    .eq("system_typ", systemTyp)
    .maybeSingle();
  if (error) throw error;
  return (data as Koppling) || null;
}

export async function uppdateraKoppling(id: string, patch: Partial<Koppling>) {
  const supabase = serverSupabase();
  const { error } = await supabase.from("lonesystem_koppling").update(patch).eq("id", id);
  if (error) throw error;
}

/** Bygg redirect-URI baserat på request origin. */
export function fortnoxRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/lonesystem/fortnox/callback`;
}
