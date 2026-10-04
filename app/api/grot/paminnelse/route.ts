import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { idagStockholm } from "@/lib/grotvy/format";
import { koaGrotPaminnelser } from "@/lib/grotvy/paminnelse-ko";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET|POST /api/grot/paminnelse
 *
 * Köar push-påminnelser (7 och 2 dagar före markägarens datum, grot_senast) i notis_kö för GROT-trakter i GROT-listan.
 * /api/notis/flush (var 5:e minut) bygger texten och skickar. Logik: lib/grotvy/paminnelse + paminnelse-ko.
 *
 * Schema: Vercel-cron 05:00 UTC (vercel.json) → Bearer CRON_SECRET (middleware släpper igenom just den). Då körs det SKARPT.
 * En inloggad admin/chef kan också anropa rutten i webbläsaren — då är det en TORRKÖRNING (inget köas) om inte ?skarp=1 anges;
 * ?dry=1 ger alltid torrkörning. Svaret är rapporten som JSON: vilka påminnelser som gäller idag, mottagare, vad som köades
 * respektive redan fanns. ok:false → status 500 (syns i cron-loggen).
 *
 * Mottagare: bara Martin (lib/grotvy/paminnelse-ko GROT_MOTTAGARE_EPOST). Kräver kolumnen notis_kö.dedup_nyckel
 * (supabase/migrations/20261004_notis_ko_dedup_nyckel.sql) för skarp körning.
 */

async function behorighet(req: NextRequest): Promise<{ svar: NextResponse | null; arCron: boolean }> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return { svar: null, arCron: true };
  const vakt = await kravRoll(ADMIN_ROLLER);
  return vakt.ok ? { svar: null, arCron: false } : { svar: vakt.res, arCron: false };
}

async function kor(req: NextRequest) {
  const { svar, arCron } = await behorighet(req);
  if (svar) return svar;
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1" || (!arCron && url.searchParams.get("skarp") !== "1");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rapport = await koaGrotPaminnelser(sb, { idag: idagStockholm(), dry });
  if (!rapport.ok) console.error("[grot/paminnelse]", rapport.fel);
  else console.info(`[grot/paminnelse] ${dry ? "torr" : "skarp"} ${rapport.idag}: ${rapport.kandidater.length} påminnelser, ${rapport.koade.length} köade, ${rapport.redanKoade.length} fanns redan`);
  return NextResponse.json({ lage: dry ? "torrkörning — inget köades" : "skarp", ...rapport }, { status: rapport.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) { return kor(req); }
export async function POST(req: NextRequest) { return kor(req); }
