/**
 * GET  /api/fordelning/[objectKey] — full vymodell för ETT objekt (läge 3),
 *      allt live ur logs/matrix_cells.
 * POST /api/fordelning/[objectKey] { action: "markera_avslutad" } — sätter
 *      objektet till completed. Avslutspåminnelsens ett-tryck. Ingen automatik.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { hamtaObjektData } from "@/lib/hpr/objekt-data";
import { byggObjektVy, type Snapshot } from "@/lib/hpr/vy";

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
  _req: NextRequest,
  { params }: { params: Promise<{ objectKey: string }> }
) {
  if (!(await inloggad())) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const { objectKey } = await params;
  const supabase = supaService();

  const { data: obj } = await supabase
    .from("harvest_objects")
    .select("object_key,object_name,status,last_file_at")
    .eq("object_key", objectKey).maybeSingle();
  if (!obj) return NextResponse.json({ error: "Objektet finns inte" }, { status: 404 });

  const { data: snaps } = await supabase
    .from("distribution_snapshots")
    .select("object_key,product_key,computed_at,grade_total_pct")
    .eq("object_key", objectKey);

  const data = await hamtaObjektData(supabase, objectKey);
  const vy = byggObjektVy(
    data,
    { objektNamn: obj.object_name, status: obj.status, lastFileAt: obj.last_file_at },
    (snaps ?? []) as Snapshot[],
    new Date()
  );
  if (!vy) return NextResponse.json({ error: "Objektet saknar fördelningsdata" }, { status: 404 });
  return NextResponse.json({ objekt: vy });
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
