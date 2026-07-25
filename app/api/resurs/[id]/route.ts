import { NextRequest, NextResponse } from "next/server";
import { autentisera, supaService, kanRedigera, selectResurs, ekonomiUtanRatt } from "@/lib/resurs-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPPDATERBARA = [
  "namn", "typ", "regnr", "serienr", "marke", "modell", "arsmodell",
  "avstalld", "matarstallning", "matare_avlast", "anteckning", "aktiv",
  "inkopsdatum", "inkopspris",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (!kanRedigera(roll)) return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });

  const body = await req.json();
  // Skrivriktning: samma ekonomi-gate som select() (#3).
  if (ekonomiUtanRatt(roll, body)) {
    return NextResponse.json({ ok: false, error: "Ekonomifält kräver admin/chef" }, { status: 403 });
  }

  const payload: any = { uppdaterad: new Date().toISOString() };
  for (const k of UPPDATERBARA) if (k in body) payload[k] = body[k];
  if (payload.regnr) payload.regnr = String(payload.regnr).toUpperCase().replace(/\s+/g, "");

  const supabase = supaService();
  const { data, error } = await supabase.from("resurs").update(payload).eq("id", id).select(selectResurs(roll)).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resurs: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (!kanRedigera(roll)) return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });

  // Soft-delete — aktiv=false, aldrig radera.
  const supabase = supaService();
  const { error } = await supabase.from("resurs").update({ aktiv: false, uppdaterad: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
