/**
 * GET  /api/fordelning/[objectKey] — full vymodell för ETT objekt (läge 3),
 *      färdigräknad ur fordelning_vy (lib/hpr/vy-lager). Saknas den räknas
 *      den här; är den äldre än senaste filen skickas den med uppdateras: true
 *      och sidan hämtar en färsk med ?rakna=1.
 * POST /api/fordelning/[objectKey] { action: "markera_avslutad" } — sätter
 *      objektet till completed. Avslutspåminnelsens ett-tryck. Ingen automatik.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { ObjektVy } from "@/lib/hpr/vy";
import { arAktuell, medLevandeMeta, raknaOchSparaVy, type ObjektMeta } from "@/lib/hpr/vy-lager";

export const runtime = "nodejs";
export const maxDuration = 60;
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ objectKey: string }> }
) {
  if (!(await inloggad())) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const { objectKey } = await params;
  const rakna = req.nextUrl.searchParams.get("rakna") === "1";
  const supabase = supaService();

  const { data: obj, error: objErr } = await supabase
    .from("harvest_objects")
    .select("object_key,object_name,status,last_file_at")
    .eq("object_key", objectKey).maybeSingle();
  if (objErr) return NextResponse.json({ error: objErr.message }, { status: 500 });
  if (!obj) return NextResponse.json({ error: "Objektet finns inte" }, { status: 404 });
  const meta = obj as ObjektMeta;
  const nu = new Date();

  // Färdigräknad vy först (räknad vid import). Bara om den saknas, eller sidan
  // ber om en färsk (?rakna=1) efter att ha visat en inaktuell, räknas den här.
  if (!rakna) {
    const { data: rad, error: radErr } = await supabase
      .from("fordelning_vy")
      .select("last_file_at,version,vy")
      .eq("object_key", objectKey).maybeSingle();
    if (radErr) return NextResponse.json({ error: radErr.message }, { status: 500 });
    if (rad?.vy) {
      const aktuell = arAktuell(rad, meta.last_file_at);
      return NextResponse.json({ objekt: medLevandeMeta(rad.vy as ObjektVy, meta, nu), uppdateras: !aktuell });
    }
  }

  try {
    const vy = await raknaOchSparaVy(supabase, objectKey);
    if (!vy) return NextResponse.json({ error: "Objektet saknar fördelningsdata" }, { status: 404 });
    return NextResponse.json({ objekt: medLevandeMeta(vy, meta, nu), uppdateras: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ objectKey: string }> }
) {
  if (!(await inloggad())) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const { objectKey } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "markera_avslutad") {
    return NextResponse.json({ error: "Okänd action" }, { status: 400 });
  }
  const supabase = supaService();
  const { error } = await supabase
    .from("harvest_objects")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("object_key", objectKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Verifiera på innehåll, inte på radräkning
  const { data: kontroll } = await supabase
    .from("harvest_objects").select("status").eq("object_key", objectKey).maybeSingle();
  if (kontroll?.status !== "completed") {
    return NextResponse.json({ error: "Statusen landade inte" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: "completed" });
}
