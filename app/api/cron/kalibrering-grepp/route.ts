import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_ROLLER, kravRoll } from "@/lib/auth/server";
import { raknaOmGrepp, type OmrakningSvar } from "@/lib/kalibrering/greppServer";

/**
 * GET /api/cron/kalibrering-grepp — håller Greppets cache (kalibrering_grepp_manad) aktuell. Vercel-cron var 30:e minut (vercel.json).
 *
 * Importen lägger in nya stammar (HPR → detalj_stam_diameter) och då ligger objektet efter: kalibrering_grepp_status() jämför antal stammar, senaste
 * `uppdaterad` och räknesättets version mot det som räknades senast. Här räknas de objekten om, ett åt gången, största först, inom en tidsbudget — det som
 * inte hinns tas av nästa körning. Vyn (/api/kalibrering/grepp) läser bara cachen och säger "Räknas om" tills det är klart.
 *
 * Vem som får anropa: Vercel-cron (Bearer CRON_SECRET) eller en inloggad admin som vill köra det för hand. Ingen nyckel i adressen.
 * Ofarlig att köra ofta: ett objekt som är aktuellt räknas inte om.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Börja inte på ett nytt objekt efter så här lång tid — det största objektet tar ~5 s och funktionen får 60. */
const BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ciron = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!ciron) {
    const vakt = await kravRoll(ADMIN_ROLLER);
    if (!vakt.ok) return vakt.res;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  // Skördarna: dim_maskin.maskin_typ = Harvester. Ett läsfel är ett fel, aldrig "inga maskiner".
  const { data: maskiner, error } = await supabase.from("dim_maskin").select("maskin_id").eq("maskin_typ", "Harvester").order("maskin_id");
  if (error) return NextResponse.json({ ok: false, error: `dim_maskin: ${error.message}` }, { status: 500 });

  const start = Date.now();
  const svar: OmrakningSvar[] = [];
  for (const m of (maskiner ?? []) as { maskin_id: string }[]) svar.push(await raknaOmGrepp(supabase, m.maskin_id, BUDGET_MS, start));

  const fel = svar.flatMap(s => s.fel.map(o => `${s.maskin_id}:${o}`));
  const statusFel = svar.filter(s => s.statusFel).map(s => `${s.maskin_id}: ${s.statusFel}`);
  if (fel.length || statusFel.length) console.error("[cron/kalibrering-grepp] ", { fel, statusFel });
  return NextResponse.json({
    ok: fel.length === 0 && statusFel.length === 0,
    raknade: svar.reduce((a, s) => a + s.klara.length, 0),
    kvar: svar.reduce((a, s) => a + s.kvar, 0),
    fel, statusFel, saknas: svar.some(s => s.saknas),
    maskiner: svar,
  });
}
