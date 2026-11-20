// Servervakter för maskinkonton. ENDAST serverkod. Rutterna under app/api/maskin börjar alltid med en av dem.
import { NextResponse } from "next/server";
import { autentisera, svar401, svar403, ADMIN_ROLLER } from "@/lib/auth/server";
import { adminSupabase } from "@/lib/auth/admin";

export const nej = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

type MaskinVakt =
  | { ok: true; maskinId: string; medarbetareId: string; epost: string }
  | { ok: false; res: NextResponse };

/** Anropet kommer från ett maskinkonto vars maskin har brytaren PÅ. Allt annat: 401/403. */
export async function kravMaskinkonto(): Promise<MaskinVakt> {
  const s = await autentisera();
  if (!s.user) return { ok: false, res: svar401() };
  if (s.roll !== "maskin" || !s.medarbetareId) return { ok: false, res: svar403("Bara maskinens konto") };
  const db = adminSupabase();
  const { data: med } = await db.from("medarbetare").select("maskin_id").eq("id", s.medarbetareId).maybeSingle();
  const maskinId: string | null = med?.maskin_id ?? null;
  if (!maskinId) return { ok: false, res: svar403("Kontot saknar maskin") };
  const { data: konto } = await db.from("maskin_konto").select("aktiv").eq("maskin_id", maskinId).maybeSingle();
  if (!konto?.aktiv) return { ok: false, res: svar403("Maskinkontot är avstängt för den här maskinen") };
  return { ok: true, maskinId, medarbetareId: s.medarbetareId, epost: s.user.email };
}

type PersonVakt = { ok: true; medarbetareId: string; roll: string } | { ok: false; res: NextResponse };

/** En förare eller admin i sin egen session (telefon eller upplåst maskin) — aldrig själva maskinkontot. */
export async function kravPerson(): Promise<PersonVakt> {
  const s = await autentisera();
  if (!s.user) return { ok: false, res: svar401() };
  if (!s.medarbetareId || (s.roll !== "forare" && s.roll !== "admin")) return { ok: false, res: svar403("Bara förare och admin") };
  return { ok: true, medarbetareId: s.medarbetareId, roll: s.roll };
}

export { ADMIN_ROLLER };
