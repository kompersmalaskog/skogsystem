/**
 * Koden för maskinen — personens EGEN kod. Förare och admin, i sin egen session (telefonen: Mer › Kod för maskinen).
 *   GET  → { satt, satt_at }   (aldrig koden eller hashen)
 *   POST → { kod }             fyra siffror; ersätter en tidigare kod och nollar felräknaren
 * Maskinkontot själv får inte (kravPerson). Annans kod nollställs av admin: /api/maskin/kod/nollstall.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/auth/admin";
import { arGiltigKod, skapaHash } from "@/lib/maskinkonto/kod";
import { kravPerson, nej } from "@/lib/maskinkonto/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const v = await kravPerson();
  if (!v.ok) return v.res;
  const { data, error } = await adminSupabase().from("forare_maskinkod").select("satt_at").eq("medarbetare_id", v.medarbetareId).maybeSingle();
  if (error) return nej(500, "Kunde inte läsa.");
  return NextResponse.json({ ok: true, satt: !!data, satt_at: data?.satt_at ?? null });
}

export async function POST(request: Request) {
  const v = await kravPerson();
  if (!v.ok) return v.res;
  const body = await request.json().catch(() => null) as { kod?: unknown } | null;
  if (!body || !arGiltigKod(body.kod)) return nej(400, "Koden är fyra siffror.");
  const db = adminSupabase();
  const { kod_hash, salt } = skapaHash(body.kod);
  const { error } = await db.from("forare_maskinkod").upsert({ medarbetare_id: v.medarbetareId, kod_hash, salt, satt_at: new Date().toISOString(), satt_av: v.medarbetareId });
  if (error) return nej(500, "Kunde inte spara koden.");
  await db.rpc("maskin_kod_ratt", { p_med: v.medarbetareId });
  return NextResponse.json({ ok: true });
}
