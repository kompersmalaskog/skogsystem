import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autentisera, svar401, svar404Medarbetare } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/personal — personalregistret med hemadress, anhörig och friskvårdsbudget (läses med service-nyckeln, som
 * går förbi RLS). Admin får alla aktiva; en förare får BARA sig själv (sin egen rad och sina egna certifikat) — aldrig
 * en kollegas adress, närstående eller budget. Rollen kommer ur sessionen, aldrig ur anropet.
 */
export async function GET() {
  const sess = await autentisera();
  if (!sess.user) return svar401();
  const arAdmin = sess.roll === "admin";
  if (!arAdmin && !sess.medarbetareId) return svar404Medarbetare();

  const supabase = supaService();
  let medFraga = supabase
    .from("medarbetare")
    .select("id, namn, roll, epost, telefon, hemadress, maskin_id, friskvard_budget_total, friskvard_budget_anvant, anhorig_namn, anhorig_telefon, anhorig_relation, aktiv")
    .eq("aktiv", true)
    .order("namn");
  let certFraga = supabase
    .from("medarbetare_certifikat")
    .select("*")
    .eq("aktiv", true)
    .order("utgar_datum", { ascending: true, nullsFirst: false });
  if (!arAdmin) {
    medFraga = medFraga.eq("id", sess.medarbetareId!);
    certFraga = certFraga.eq("medarbetare_id", sess.medarbetareId!);
  }
  const [medRes, certRes] = await Promise.all([medFraga, certFraga]);

  if (medRes.error) return NextResponse.json({ ok: false, error: medRes.error.message }, { status: 500 });
  if (certRes.error) return NextResponse.json({ ok: false, error: certRes.error.message }, { status: 500 });

  // Gruppera certifikat per medarbetare
  const certPerMed: Record<string, any[]> = {};
  for (const c of certRes.data || []) {
    if (!certPerMed[c.medarbetare_id]) certPerMed[c.medarbetare_id] = [];
    certPerMed[c.medarbetare_id].push(c);
  }

  const personal = (medRes.data || []).map(m => ({
    ...m,
    certifikat: certPerMed[m.id] || [],
  }));

  return NextResponse.json({ ok: true, personal });
}
