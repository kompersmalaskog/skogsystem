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

// Endast fält som får uppdateras via PATCH
const UPPDATERBARA = [
  "namn", "regnr", "typ", "grupp",
  "besiktning_datum", "forsakring_datum", "skatt_datum", "service_datum",
  "service_timmar", "nuvarande_timmar", "service_km", "nuvarande_km",
  "anteckning", "aktiv",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (roll !== "admin" && roll !== "chef") {
    return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });
  }

  const body = await req.json();
  const payload: any = { uppdaterad: new Date().toISOString() };
  for (const k of UPPDATERBARA) {
    if (k in body) payload[k] = body[k];
  }
  if (payload.regnr) payload.regnr = String(payload.regnr).toUpperCase().replace(/\s+/g, "");

  const supabase = supaService();
  const { data, error } = await supabase.from("fordon").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fordon: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (roll !== "admin" && roll !== "chef") {
    return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });
  }

  // Soft-delete — sätt aktiv=false istället för att radera
  const supabase = supaService();
  const { error } = await supabase.from("fordon").update({ aktiv: false, uppdaterad: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
