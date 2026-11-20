import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravArbetsdagAgare } from "@/lib/auth/arbetsdag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const UPPDATERBARA = ["objekt_id", "objekt_namn", "maskin_id", "start_tid", "slut_tid", "arbetad_min", "ordning"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; oid: string }> }) {
  const { id, oid } = await params;
  const vakt = await kravArbetsdagAgare(id);
  if (!vakt.ok) return vakt.res;
  const body = await req.json();
  const payload: any = { uppdaterad: new Date().toISOString() };
  for (const k of UPPDATERBARA) if (k in body) payload[k] = body[k];
  const { data, error } = await supa().from("arbetsdag_objekt").update(payload).eq("id", oid).eq("arbetsdag_id", id).select().maybeSingle();
  if (!error && !data) return NextResponse.json({ ok: false, error: "Raden finns inte på den här arbetsdagen" }, { status: 404 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, objekt: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; oid: string }> }) {
  const { id, oid } = await params;
  const vakt = await kravArbetsdagAgare(id);
  if (!vakt.ok) return vakt.res;
  // Raden måste höra till arbetsdagen i sökvägen: annars kunde en förare ange sin egen dag och en kollegas rad-id.
  const { data: borttagna, error } = await supa().from("arbetsdag_objekt").delete().eq("id", oid).eq("arbetsdag_id", id).select("id");
  if (!error && !(borttagna && borttagna.length)) return NextResponse.json({ ok: false, error: "Raden finns inte på den här arbetsdagen" }, { status: 404 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
