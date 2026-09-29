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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await kollaRedigera();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const supabase = supaService();

  // Tabellen är HISTORISERAD (giltig_fran/giltig_till) — resultatrapporten
  // slår upp ägaren per Fortnox-rads datum. Att radera en rad gör gamla
  // perioders kostnader ägarlösa. Därför:
  //  - öppen rad (giltig_till IS NULL) → STÄNGS med dagens datum, raderas ej
  //  - historisk rad → vägras; den bär redan bokförda perioder
  // Verifierad träff (select + 0-radskoll) — en tyst 0-radsdelete såg
  // tidigare ut som "borttagen" fast inget hände.
  const { data: rad, error: lasFel } = await supabase
    .from("maskin_kostnadsstalle")
    .select("id, maskin_id, kostnadsstalle_kod, giltig_fran, giltig_till")
    .eq("id", id)
    .maybeSingle();
  if (lasFel) return NextResponse.json({ ok: false, error: lasFel.message }, { status: 500 });
  if (!rad) return NextResponse.json({ ok: false, error: "Mappningen finns inte" }, { status: 404 });
  if (rad.giltig_till != null) {
    return NextResponse.json(
      { ok: false, error: `Historisk mappning (${rad.kostnadsstalle_kod} → ${rad.maskin_id}, avslutad ${rad.giltig_till}) raderas inte — den bär gamla perioders kostnader.` },
      { status: 400 },
    );
  }

  const idag = new Date().toISOString().slice(0, 10);
  const { data: stangda, error } = await supabase
    .from("maskin_kostnadsstalle")
    .update({ giltig_till: idag })
    .eq("id", id)
    .is("giltig_till", null)
    .select("id, maskin_id, kostnadsstalle_kod, giltig_fran, giltig_till");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!stangda || stangda.length === 0) {
    return NextResponse.json({ ok: false, error: "Ingen rad avslutades — försök igen" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, avslutad: stangda[0] });
}
