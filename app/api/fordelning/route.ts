/**
 * GET /api/fordelning — översikt över objekt med fördelningsmål.
 *
 * Läser FÄRDIGRÄKNADE kort ur `fordelning_vy` (lib/hpr/vy-lager) — räknar
 * aldrig själv. Förut räknades alla 47 objekt (~512 000 stockar) om vid varje
 * öppning och vyn slog i statement timeout (2026-10-20). Korten räknas när
 * HPR-filen importeras; ett objekt vars kort är äldre än senaste filen visas
 * med förra siffrorna och `uppdateras: true`, och räknas om av
 * POST /api/fordelning/berakna (sidan anropar den när `attRakna` > 0).
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { lasLista } from "@/lib/hpr/vy-lager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function inloggad(): Promise<boolean> {
  const cookieStore = await cookies();
  const c = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await c.auth.getUser();
  return !!user;
}

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  if (!(await inloggad())) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  try {
    const lista = await lasLista(supaService(), new Date());
    return NextResponse.json({
      objekt: lista.objekt,
      vantar: lista.vantar,
      attRakna: lista.inaktuella.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
