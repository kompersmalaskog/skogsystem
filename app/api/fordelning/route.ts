/**
 * GET /api/fordelning — översikt över objekt med fördelningsmål.
 *
 * ALLA siffror räknas LIVE ur logs/matrix_cells (via lib/hpr/vy). Snapshots
 * används bara för trendpilen. Objekt utan fördelningsprodukter utelämnas.
 *
 * ?scope=aktiva (default) räknar bara aktiva objekt — startsidebannern och
 * avslutspåminnelsen behöver bara dem, och det håller svaret snabbt. ?scope=alla
 * tar med avslutade också (tyngre, används i fördelningsvyns fullständiga lista).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { hamtaObjektData } from "@/lib/hpr/objekt-data";
import { byggObjektVy, type Snapshot } from "@/lib/hpr/vy";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function inloggad(): Promise<boolean> {
  const cookieStore = await cookies();
  const c = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await c.auth.getUser();
  return !!user;
}

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  if (!(await inloggad())) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  const scope = req.nextUrl.searchParams.get("scope") ?? "aktiva";
  const supabase = supaService();

  // Objekt som HAR fördelningsprodukter (annars finns ingen grad att visa)
  const { data: distProd } = await supabase
    .from("products").select("object_key").eq("distribution_allowed", true);
  const medMal = new Set((distProd ?? []).map((p) => p.object_key));

  let q = supabase.from("harvest_objects")
    .select("object_key,object_name,status,last_file_at");
  if (scope === "aktiva") q = q.eq("status", "active");
  const { data: objekt, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const kandidater = (objekt ?? []).filter((o) => medMal.has(o.object_key));

  const { data: snaps } = await supabase
    .from("distribution_snapshots")
    .select("object_key,product_key,computed_at,grade_total_pct");
  const snapMap = new Map<string, Snapshot[]>();
  for (const s of snaps ?? []) {
    const arr = snapMap.get(s.object_key) ?? [];
    arr.push(s as Snapshot);
    snapMap.set(s.object_key, arr);
  }

  const nu = new Date();
  const vyer = await Promise.all(
    kandidater.map(async (o) => {
      const data = await hamtaObjektData(supabase, o.object_key);
      return byggObjektVy(
        data,
        { objektNamn: o.object_name, status: o.status, lastFileAt: o.last_file_at },
        snapMap.get(o.object_key) ?? [],
        nu
      );
    })
  );

  const objektVyer = vyer.filter((v) => v != null);
  // Sortera: läge 2 först (behöver uppmärksamhet), sedan störst volym
  objektVyer.sort((a, b) => (b!.lage - a!.lage) || (b!.volymM3 - a!.volymM3));

  return NextResponse.json({ objekt: objektVyer });
}
