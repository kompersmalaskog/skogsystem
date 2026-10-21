/**
 * POST /api/fordelning/berakna — räknar om apteringskort som är äldre än
 * objektets senaste fil (eller aldrig räknats), ett objekt i taget, inom en
 * tidsbudget. Svarar { raknade, kvar }; sidan anropar igen tills kvar = 0.
 *
 * Normalt räknar importen korten direkt och här finns inget att göra. Den här
 * vägen fyller på första gången (befintliga objekt) och efter att VY_VERSION
 * höjts. Ett objekt i taget: parallellt var det som slog i statement timeout.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { lasLista, raknaOchSparaVy } from "@/lib/hpr/vy-lager";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Starta inget nytt objekt efter så här lång tid (största objektet ~5 s). */
const BUDGET_MS = 35_000;

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

export async function POST() {
  if (!(await inloggad())) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const start = Date.now();
  try {
    const { inaktuella } = await lasLista(supabase, new Date());
    let raknade = 0;
    const fel: string[] = [];
    for (const key of inaktuella) {
      if (Date.now() - start > BUDGET_MS) break;
      try {
        await raknaOchSparaVy(supabase, key);
        raknade++;
      } catch (e) {
        // Ett objekt som inte går att räkna får inte stoppa de andra.
        fel.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
        console.error("[fordelning/berakna]", key, e);
      }
    }
    const kvar = inaktuella.length - raknade - fel.length;
    return NextResponse.json({ raknade, kvar: Math.max(0, kvar), fel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
