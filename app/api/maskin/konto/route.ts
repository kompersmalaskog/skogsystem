/**
 * Maskinkonton — bara admin (kravRoll först i varje metod).
 *   GET   → { maskiner: [{ maskin_id, namn, typ, kontoFinns, aktiv, epost }], personer: [{ id, namn, roll, harKod }] }
 *   POST  { maskin_id, epost }          lägger upp maskinens konto (auth-användare + medarbetarrad roll 'maskin', aktiv = false) och
 *                                       returnerar { epost, losenord } — lösenordet visas EN gång
 *   POST  { maskin_id, nytt_losenord }  ny lösenord till befintligt konto (visas en gång)
 *   PATCH { maskin_id, aktiv }          brytaren: maskinkonto på/av för en maskin. Av = maskinen fungerar som förut; inga data rörs.
 * Kontots lösenord lagras aldrig av appen. Brytaren är ensam om att avgöra om kontot får användas (kravMaskinkonto).
 */
import { NextResponse } from "next/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { adminSupabase } from "@/lib/auth/admin";
import { slumpLosenord } from "@/lib/maskinkonto/kod";
import { nej } from "@/lib/maskinkonto/server";

export const dynamic = "force-dynamic";
const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const db = adminSupabase();
  const idag = new Date().toISOString().slice(0, 10);
  const [m, k, p, koder] = await Promise.all([
    db.from("dim_maskin").select("maskin_id, visningsnamn, maskin_typ, aktiv_till").in("maskin_typ", ["Harvester", "Forwarder"]).order("maskin_typ").order("visningsnamn"),
    db.from("maskin_konto").select("maskin_id, aktiv, user_id, epost"),
    db.from("medarbetare").select("id, namn, roll").eq("aktiv", true).in("roll", ["forare", "admin"]).order("namn"),
    db.from("forare_maskinkod").select("medarbetare_id"),
  ]);
  if (m.error || k.error || p.error || koder.error) return nej(500, "Kunde inte läsa maskinkontona.");
  const konton = new Map((k.data ?? []).map((r) => [r.maskin_id as string, r]));
  const harKod = new Set((koder.data ?? []).map((r) => r.medarbetare_id as string));
  return NextResponse.json({
    ok: true,
    maskiner: (m.data ?? [])
      .filter((x) => !x.aktiv_till || x.aktiv_till >= idag)
      .map((x) => {
        const r = konton.get(x.maskin_id);
        return { maskin_id: x.maskin_id, namn: x.visningsnamn ?? x.maskin_id, typ: x.maskin_typ, kontoFinns: !!r?.user_id, aktiv: !!r?.aktiv, epost: r?.epost ?? null };
      }),
    personer: (p.data ?? []).map((x) => ({ id: x.id, namn: x.namn, roll: x.roll, harKod: harKod.has(x.id) })),
  });
}

export async function POST(request: Request) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const body = await request.json().catch(() => null) as { maskin_id?: unknown; epost?: unknown; nytt_losenord?: unknown } | null;
  if (!body || typeof body.maskin_id !== "string") return nej(400, "Fel indata");
  const db = adminSupabase();
  const { data: maskin } = await db.from("dim_maskin").select("maskin_id, visningsnamn").eq("maskin_id", body.maskin_id).maybeSingle();
  if (!maskin) return nej(404, "Maskinen finns inte.");
  const { data: konto } = await db.from("maskin_konto").select("maskin_id, user_id, medarbetare_id").eq("maskin_id", maskin.maskin_id).maybeSingle();
  const losenord = slumpLosenord();

  if (body.nytt_losenord === true) {
    if (!konto?.user_id) return nej(404, "Maskinen har inget konto än.");
    const u = await db.auth.admin.updateUserById(konto.user_id, { password: losenord });
    if (u.error) return nej(500, "Kunde inte byta lösenord.");
    return NextResponse.json({ ok: true, losenord });
  }

  if (konto?.user_id) return nej(409, "Maskinen har redan ett konto.");
  const epost = typeof body.epost === "string" ? body.epost.trim().toLowerCase() : "";
  if (!EPOST.test(epost)) return nej(400, "Skriv en e-postadress som kontot ska heta.");
  const finns = await db.from("medarbetare").select("id").ilike("epost", epost.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (finns.error) return nej(500, "Kunde inte kontrollera e-posten.");
  if ((finns.data ?? []).length > 0) return nej(409, "E-postadressen används redan av någon annan.");

  const namn = maskin.visningsnamn ?? maskin.maskin_id;
  const u = await db.auth.admin.createUser({ email: epost, password: losenord, email_confirm: true, user_metadata: { namn, maskinkonto: true } });
  const userId = u.data?.user?.id;
  if (u.error || !userId) return nej(u.error?.message?.toLowerCase().includes("already") ? 409 : 500, u.error?.message?.toLowerCase().includes("already") ? "Det finns redan ett konto med den adressen." : "Kunde inte skapa kontot.");

  // Raden FÖRST med aktiv = false (så den aldrig syns som förare), sedan kopplingen i maskin_konto. Går något fel tas kontot bort igen.
  const ins = await db.from("medarbetare").insert({ namn, epost, roll: "maskin", aktiv: false, maskin_id: maskin.maskin_id, user_id: userId }).select("id");
  const medId: string | undefined = ins.data?.[0]?.id;
  if (ins.error || !medId) { await db.auth.admin.deleteUser(userId); return nej(500, "Kunde inte lägga till maskinkontot."); }
  const k2 = await db.from("maskin_konto").upsert({ maskin_id: maskin.maskin_id, user_id: userId, medarbetare_id: medId, epost, andrad: new Date().toISOString(), andrad_av: vakt.session.medarbetareId }, { onConflict: "maskin_id" });
  if (k2.error) {
    await db.from("medarbetare").delete().eq("id", medId);
    await db.auth.admin.deleteUser(userId);
    return nej(500, "Kunde inte koppla kontot till maskinen.");
  }
  return NextResponse.json({ ok: true, epost, losenord });
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
