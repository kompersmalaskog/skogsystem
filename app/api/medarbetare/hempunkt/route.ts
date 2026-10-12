import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { bekraftaHempunkt, type BekraftaAtgard } from "@/lib/hempunkt";

export const dynamic = "force-dynamic";

/**
 * POST /api/medarbetare/hempunkt { id, atgard: "stammer" } | { id, atgard: "flytta", lat, lng }
 * Admin svarar på hempunktskartan: "Stämmer" stämplar den geokodade punkten (källan förblir geokod), "Flytta punkten" sätter
 * en ny punkt (källa manuell). Byns mittpunkt kan inte bekräftas som den är. Skrivningen läses tillbaka (lib/hempunkt).
 */
export async function POST(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "Medarbetare saknas" }, { status: 400 });
  let atgard: BekraftaAtgard;
  if (body?.atgard === "stammer") atgard = { atgard: "stammer" };
  else if (body?.atgard === "flytta") atgard = { atgard: "flytta", lat: body.lat, lng: body.lng };
  else return NextResponse.json({ ok: false, error: "Okänd åtgärd" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const res = await bekraftaHempunkt(sb, id, atgard, new Date().toISOString());
  if (!res.ok) return NextResponse.json({ ok: false, error: res.fel }, { status: 422 });
  return NextResponse.json({ ok: true });
}
