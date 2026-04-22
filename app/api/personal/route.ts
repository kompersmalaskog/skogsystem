import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function autentisera(): Promise<{ user: any; roll: string | null }> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return { user: null, roll: null };
  const { data: med } = await authClient
    .from("medarbetare")
    .select("roll")
    .eq("epost", user.email)
    .maybeSingle();
  return { user, roll: med?.roll || null };
}

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const { user } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });

  const supabase = supaService();
  const [medRes, certRes] = await Promise.all([
    supabase
      .from("medarbetare")
      .select("id, namn, roll, epost, telefon, hemadress, maskin_id, friskvard_budget_total, friskvard_budget_anvant, anhorig_namn, anhorig_telefon, anhorig_relation, aktiv")
      .eq("aktiv", true)
      .order("namn"),
    supabase
      .from("medarbetare_certifikat")
      .select("*")
      .eq("aktiv", true)
      .order("utgar_datum", { ascending: true, nullsFirst: false }),
  ]);

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
