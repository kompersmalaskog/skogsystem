import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function kollaRedigera(): Promise<{ ok: boolean; error?: string }> {
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
  if (!user?.email) return { ok: false, error: "Ej inloggad" };
  const { data: med } = await authClient
    .from("medarbetare")
    .select("roll")
    .eq("epost", user.email)
    .maybeSingle();
  if (med?.roll !== "admin" && med?.roll !== "chef") return { ok: false, error: "Kräver admin/chef" };
  return { ok: true };
}

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const UPPDATERBARA = ["namn", "utfardad_datum", "utgar_datum", "anteckning", "aktiv"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; certId: string }> }) {
  const { certId } = await params;
  const auth = await kollaRedigera();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await req.json();
  const payload: any = { uppdaterad: new Date().toISOString() };
  for (const k of UPPDATERBARA) {
    if (k in body) payload[k] = body[k];
  }

  const supabase = supaService();
  const { data, error } = await supabase.from("medarbetare_certifikat").update(payload).eq("id", certId).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, certifikat: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; certId: string }> }) {
  const { certId } = await params;
  const auth = await kollaRedigera();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const supabase = supaService();
  const { error } = await supabase.from("medarbetare_certifikat").update({ aktiv: false, uppdaterad: new Date().toISOString() }).eq("id", certId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
