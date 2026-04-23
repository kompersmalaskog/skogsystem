import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getFortnoxClient } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function kollaRedigera(): Promise<{ ok: boolean; error?: string; user?: any }> {
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
  if (med?.roll !== "admin" && med?.roll !== "chef") return { ok: false, error: "Kräver admin/chef", user };
  return { ok: true, user };
}

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/fortnox/mappning
 *
 * Returnerar:
 *   - befintliga mappningar (maskin_id ↔ kostnadsstalle_kod)
 *   - alla maskiner (för dropdown)
 *   - alla kostnadsställen från Fortnox
 *   - omappade kostnadsställen som faktiskt har rader i fortnox_voucher_rows
 *     (så användaren slipper se tomma ADBLUE/FO/KONTOR i listan)
 */
export async function GET() {
  const auth = await kollaRedigera();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const supabase = supaService();
  const [mapRes, maskinRes, aktivaCcRes] = await Promise.all([
    supabase.from("maskin_kostnadsstalle").select("id, maskin_id, kostnadsstalle_kod").order("maskin_id"),
    supabase.from("dim_maskin").select("maskin_id, modell, maskin_typ").order("modell"),
    supabase.from("fortnox_voucher_rows")
      .select("costcenter")
      .not("costcenter", "is", null)
      .limit(10000),
  ]);

  // Fortnox costcenters (liten, kalla live)
  let fortnoxCc: { Code: string; Description?: string; Active?: boolean }[] = [];
  try {
    const client = (await getFortnoxClient()) as any;
    const r = await fetch("https://api.fortnox.se/3/costcenters", {
      headers: { Authorization: `Bearer ${client.accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (r.ok) {
      const body = await r.json();
      fortnoxCc = body?.CostCenters || [];
    }
  } catch { /* fallback till bara DB-data */ }

  const mappningar = mapRes.data || [];
  const mappadeKoder = new Set(mappningar.map(m => m.kostnadsstalle_kod));
  const aktivaKoder = new Set<string>();
  for (const row of aktivaCcRes.data || []) {
    if (row.costcenter) aktivaKoder.add(row.costcenter);
  }

  // Omappade = finns i fortnox-listan ELLER har trafik men saknas i mappning
  const alla = new Map<string, { kod: string; namn?: string; aktiv?: boolean; har_trafik: boolean }>();
  for (const c of fortnoxCc) {
    alla.set(c.Code, { kod: c.Code, namn: c.Description, aktiv: c.Active, har_trafik: aktivaKoder.has(c.Code) });
  }
  for (const k of aktivaKoder) {
    if (!alla.has(k)) alla.set(k, { kod: k, har_trafik: true });
  }
  const omappade = Array.from(alla.values())
    .filter(c => !mappadeKoder.has(c.kod))
    .sort((a, b) => {
      // har trafik först, sen namn
      if (a.har_trafik !== b.har_trafik) return a.har_trafik ? -1 : 1;
      return (a.namn || a.kod).localeCompare(b.namn || b.kod, 'sv');
    });

  return NextResponse.json({
    ok: true,
    mappningar,
    maskiner: maskinRes.data || [],
    fortnox_kostnadsstallen: fortnoxCc.map(c => ({ kod: c.Code, namn: c.Description, aktiv: c.Active })),
    omappade,
  });
}

export async function POST(req: NextRequest) {
  const auth = await kollaRedigera();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await req.json();
  const maskin_id = String(body.maskin_id || "").trim();
  const kostnadsstalle_kod = String(body.kostnadsstalle_kod || "").trim();
  if (!maskin_id || !kostnadsstalle_kod) {
    return NextResponse.json({ ok: false, error: "maskin_id + kostnadsstalle_kod krävs" }, { status: 400 });
  }

  const supabase = supaService();
  const { data, error } = await supabase
    .from("maskin_kostnadsstalle")
    .insert({ maskin_id, kostnadsstalle_kod })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mappning: data });
}
