/**
 * Maskinkonton — bara admin (kravRoll först i varje metod).
 *   GET   → { maskiner: [{ maskin_id, namn, typ, kontoFinns, skapat, aktiv }], personer: [{ id, namn, roll, harKod }] }
 *           vilka maskiner som har konto och när det skapades, och vilka förare som har valt sin kod (för Nollställ)
 *   PATCH { maskin_id, aktiv }  brytaren: maskinkonto på/av för en maskin. Av = maskinen fungerar som förut; inga data rörs.
 * Kontot skapas INTE här: det skapas av servern själv (POST /api/maskin/auto) första gången en maskindator med brytaren på startar. Admin slår bara på och av.
 */
import { NextResponse } from "next/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { adminSupabase } from "@/lib/auth/admin";
import { nej } from "@/lib/maskinkonto/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const db = adminSupabase();
  const idag = new Date().toISOString().slice(0, 10);
  const [m, k, p, koder] = await Promise.all([
    db.from("dim_maskin").select("maskin_id, visningsnamn, maskin_typ, aktiv_till").in("maskin_typ", ["Harvester", "Forwarder"]).order("maskin_typ").order("visningsnamn"),
    db.from("maskin_konto").select("maskin_id, aktiv, user_id"),
    db.from("medarbetare").select("id, namn, roll").eq("aktiv", true).in("roll", ["forare", "admin"]).order("namn"),
    db.from("forare_maskinkod").select("medarbetare_id"),
  ]);
  if (m.error || k.error || p.error || koder.error) return nej(500, "Kunde inte läsa maskinkontona.");
  const harKod = new Set((koder.data ?? []).map((r) => r.medarbetare_id as string));
  const konton = new Map((k.data ?? []).map((r) => [r.maskin_id as string, r]));
  const maskiner = (m.data ?? []).filter((x) => !x.aktiv_till || x.aktiv_till >= idag);
  // När kontot skapades står i auth, inte i appens tabeller. Bara de få maskiner som har ett konto slås upp.
  const skapat = new Map<string, string | null>();
  await Promise.all(maskiner.map(async (x) => {
    const r = konton.get(x.maskin_id);
    if (!r?.user_id) return;
    const u = await db.auth.admin.getUserById(r.user_id).catch(() => null);
    skapat.set(x.maskin_id, u?.data?.user?.created_at ?? null);
  }));
  return NextResponse.json({
    ok: true,
    maskiner: maskiner.map((x) => {
      const r = konton.get(x.maskin_id);
      return { maskin_id: x.maskin_id, namn: x.visningsnamn ?? x.maskin_id, typ: x.maskin_typ, kontoFinns: !!r?.user_id, skapat: skapat.get(x.maskin_id) ?? null, aktiv: !!r?.aktiv };
    }),
    personer: (p.data ?? []).map((x) => ({ id: x.id, namn: x.namn, roll: x.roll, harKod: harKod.has(x.id) })),
  });
}

export async function PATCH(request: Request) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const body = await request.json().catch(() => null) as { maskin_id?: unknown; aktiv?: unknown } | null;
  if (!body || typeof body.maskin_id !== "string" || typeof body.aktiv !== "boolean") return nej(400, "Fel indata");
  const db = adminSupabase();
  const { data: maskin } = await db.from("dim_maskin").select("maskin_id").eq("maskin_id", body.maskin_id).maybeSingle();
  if (!maskin) return nej(404, "Maskinen finns inte.");
  const r = await db.from("maskin_konto").upsert({ maskin_id: maskin.maskin_id, aktiv: body.aktiv, andrad: new Date().toISOString(), andrad_av: vakt.session.medarbetareId }, { onConflict: "maskin_id" }).select("maskin_id, aktiv");
  if (r.error || !r.data?.length) return nej(500, "Kunde inte ändra brytaren.");
  return NextResponse.json({ ok: true, aktiv: r.data[0].aktiv });
}
