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

const UPPDATERBARA = ["objekt_id", "objekt_namn", "maskin_id", "start_tid", "slut_tid", "arbetad_min", "ordning"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; oid: string }> }) {
  const { oid } = await params;
  if (!(await aut())) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  const body = await req.json();
  const payload: any = { uppdaterad: new Date().toISOString() };
  for (const k of UPPDATERBARA) if (k in body) payload[k] = body[k];
  const { data, error } = await supa().from("arbetsdag_objekt").update(payload).eq("id", oid).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, objekt: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; oid: string }> }) {
  const { oid } = await params;
  if (!(await aut())) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  const { error } = await supa().from("arbetsdag_objekt").delete().eq("id", oid);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
