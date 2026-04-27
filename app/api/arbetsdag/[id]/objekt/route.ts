import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function aut() {
  const cs = await cookies();
  const c = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cs.getAll(); }, setAll(x) { x.forEach(({ name, value, options }) => cs.set(name, value, options)); } } },
  );
  const { data: { user } } = await c.auth.getUser();
  return user;
}

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await aut())) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  const { data, error } = await supa()
    .from("arbetsdag_objekt")
    .select("*")
    .eq("arbetsdag_id", id)
    .order("ordning");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, objekt: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await aut())) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  const body = await req.json();

  const supabase = supa();
  // Auto-ordning: max(ordning) + 1
  const { data: maxRow } = await supabase
    .from("arbetsdag_objekt")
    .select("ordning")
    .eq("arbetsdag_id", id)
    .order("ordning", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nästaOrdning = (maxRow?.ordning || 0) + 1;

  const payload: any = {
    arbetsdag_id: id,
    objekt_id: body.objekt_id || null,
    objekt_namn: body.objekt_namn || null,
    maskin_id: body.maskin_id || null,
    start_tid: body.start_tid || null,
    slut_tid: body.slut_tid || null,
    arbetad_min: body.arbetad_min ?? null,
    ordning: body.ordning ?? nästaOrdning,
    skapad_av: body.skapad_av || "manuell",
  };

  const { data, error } = await supabase.from("arbetsdag_objekt").insert(payload).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, objekt: data });
}
