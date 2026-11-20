/** POST /api/maskin/kod/nollstall — admin nollställer en förares kod ({ medarbetare_id }); personen väljer en ny i telefonen. */
import { NextResponse } from "next/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { adminSupabase } from "@/lib/auth/admin";
import { nej } from "@/lib/maskinkonto/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const body = await request.json().catch(() => null) as { medarbetare_id?: unknown } | null;
  if (!body || typeof body.medarbetare_id !== "string" || !UUID.test(body.medarbetare_id)) return nej(400, "Fel indata");
  const db = adminSupabase();
  const d = await db.from("forare_maskinkod").delete().eq("medarbetare_id", body.medarbetare_id);
  if (d.error) return nej(500, "Kunde inte nollställa.");
  await db.rpc("maskin_kod_ratt", { p_med: body.medarbetare_id });
  return NextResponse.json({ ok: true });
}
