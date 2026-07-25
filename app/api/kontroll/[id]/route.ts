import { NextRequest, NextResponse } from "next/server";
import { autentisera, supaService, kanRedigera } from "@/lib/resurs-auth";
import { harledForfallDatum, harledMatarvarde, type Kontrollrad } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPPDATERBARA = [
  "typ", "intervall_manader", "intervall_timmar", "intervall_km",
  "senast_utford", "senast_matarstallning", "nasta_forfall", "nasta_matarvarde",
  "anteckning", "aktiv",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (!kanRedigera(roll)) return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });

  const body = await req.json();
  const supabase = supaService();

  // Läs nuvarande rad för att kunna räkna om cache-fälten mot en fullständig rad.
  const { data: nuv, error: lasFel } = await supabase.from("kontroll").select("*").eq("id", id).single();
  if (lasFel) return NextResponse.json({ ok: false, error: lasFel.message }, { status: lasFel.code === "PGRST116" ? 404 : 500 });

  const payload: any = {};
  for (const k of UPPDATERBARA) if (k in body) payload[k] = body[k];

  // Räkna om cache (#3): härlett vinner när intervall + senast finns, annars
  // behålls explicit satt värde.
  const sammanslagen = { ...nuv, ...payload } as Kontrollrad;
  payload.nasta_forfall = harledForfallDatum(sammanslagen);
  payload.nasta_matarvarde = harledMatarvarde(sammanslagen);

  const { data, error } = await supabase.from("kontroll").update(payload).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, kontroll: data });
}
