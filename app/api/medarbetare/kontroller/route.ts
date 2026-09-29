import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { hamtaMedarbetarKontroller } from "@/lib/medarbetarKontroll";

export const dynamic = "force-dynamic";

/**
 * GET  /api/medarbetare/kontroller — det som bara admin-formuläret sätter och som
 *      gett tyst dataförlust: okopplade operatörer med namnmatch, förare utan
 *      maskin, medarbetare utan hempunkt (lib/medarbetarKontroll).
 * POST /api/medarbetare/kontroller { operator_id, medarbetare_id } — kopplar EN
 *      operatör (admin har tryckt; aldrig automatiskt) och svarar med de datum
 *      operatören har skift, så admin kan bygga dagarna med /api/mom-import.
 * Admin/chef. Service-roll: fakt_skift och operator_medarbetare är RLS-låsta.
 */
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Samma golv som /api/mom-import (SYNK_FRAN) — äldre dagar byggs inte om.
const SYNK_FRAN = process.env.MOM_SYNK_FRAN || "2026-07-14";

export async function GET() {
  const v = await kravRoll(ADMIN_ROLLER);
  if (!v.ok) return v.res;
  try {
    return NextResponse.json({ ok: true, ...(await hamtaMedarbetarKontroller(service())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const v = await kravRoll(ADMIN_ROLLER);
  if (!v.ok) return v.res;
  const body = await req.json().catch(() => ({}));
  const operatorId = typeof body?.operator_id === "string" ? body.operator_id : "";
  const medarbetareId = typeof body?.medarbetare_id === "string" ? body.medarbetare_id : "";
  if (!operatorId || !medarbetareId) return NextResponse.json({ ok: false, error: "operator_id och medarbetare_id krävs" }, { status: 400 });
  const sb = service();
  // Redan kopplad (till vem som helst) → rör inget, säg det.
  const { data: finns, error: finnsFel } = await sb.from("operator_medarbetare").select("medarbetare_id").eq("operator_id", operatorId).maybeSingle();
  if (finnsFel) return NextResponse.json({ ok: false, error: finnsFel.message }, { status: 500 });
  if (finns) return NextResponse.json({ ok: false, error: "Operatören är redan kopplad" }, { status: 409 });
  const { data: ny, error } = await sb.from("operator_medarbetare").insert({ operator_id: operatorId, medarbetare_id: medarbetareId }).select("operator_id").maybeSingle();
  if (error || !ny) return NextResponse.json({ ok: false, error: error?.message || "Kopplingen sparades inte" }, { status: 500 });
  const { data: skift, error: skiftFel } = await sb.from("fakt_skift").select("datum").eq("operator_id", operatorId).gte("datum", SYNK_FRAN).order("datum", { ascending: true });
  if (skiftFel) return NextResponse.json({ ok: true, datum: [], varning: `Kopplad, men kunde inte läsa skiften: ${skiftFel.message}` });
  const datum = Array.from(new Set((skift || []).map((s: any) => String(s.datum))));
  return NextResponse.json({ ok: true, datum });
}
