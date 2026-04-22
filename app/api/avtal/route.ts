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
  const { data, error } = await supabase
    .from("avtal")
    .select("*")
    .eq("aktiv", true)
    .order("kategori")
    .order("namn");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avtal: data || [] });
}

export async function POST(req: NextRequest) {
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (roll !== "admin" && roll !== "chef") {
    return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });
  }

  const body = await req.json();
  const payload: any = {
    namn: String(body.namn || "").trim(),
    kategori: body.kategori,
    leverantor: body.leverantor || null,
    kopplad_till: body.kopplad_till || null,
    start_datum: body.start_datum || null,
    slut_datum: body.slut_datum || null,
    belopp_per_manad: body.belopp_per_manad ?? null,
    belopp_per_ar: body.belopp_per_ar ?? null,
    budget_total: body.budget_total ?? null,
    budget_anvant: body.budget_anvant ?? 0,
    anteckning: body.anteckning || null,
  };
  if (!payload.namn || !payload.kategori) {
    return NextResponse.json({ ok: false, error: "namn + kategori krävs" }, { status: 400 });
  }

  const supabase = supaService();
  const { data, error } = await supabase.from("avtal").insert(payload).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avtal: data });
}
