import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin/chef kan läsa alla; alla inloggade får läsa (read-only). Bara admin/chef
// kan skapa. Enkel variant — finare RLS kan läggas till senare.

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

export async function GET(req: NextRequest) {
  const { user } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });

  const supabase = supaService();
  const { data, error } = await supabase
    .from("fordon")
    .select("*")
    .eq("aktiv", true)
    .order("grupp")
    .order("namn");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, fordon: data || [] });
}

export async function POST(req: NextRequest) {
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (roll !== "admin" && roll !== "chef") {
    return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });
  }

  const body = await req.json();
  const supabase = supaService();

  const payload: any = {
    namn: String(body.namn || "").trim(),
    regnr: body.regnr ? String(body.regnr).toUpperCase().replace(/\s+/g, "") : null,
    typ: body.typ,
    grupp: body.grupp,
    besiktning_datum: body.besiktning_datum || null,
    forsakring_datum: body.forsakring_datum || null,
    skatt_datum: body.skatt_datum || null,
    service_datum: body.service_datum || null,
    service_timmar: body.service_timmar ?? null,
    nuvarande_timmar: body.nuvarande_timmar ?? null,
    service_km: body.service_km ?? null,
    nuvarande_km: body.nuvarande_km ?? null,
    anteckning: body.anteckning || null,
  };
  if (!payload.namn || !payload.typ || !payload.grupp) {
    return NextResponse.json({ ok: false, error: "namn, typ, grupp krävs" }, { status: 400 });
  }

  const { data, error } = await supabase.from("fordon").insert(payload).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fordon: data });
}
