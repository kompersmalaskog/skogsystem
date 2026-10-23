import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { beraknaLoneunderlag } from "@/lib/lonesystem/loneunderlag";
import { koaLonNotiser } from "@/lib/lonesystem/granskaNotis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET|POST /api/lon/notis
 *
 * Köar lönenotiserna i notis_kö: den 1:a kl 18 (svensk tid) "Granska din <månad>" till alla förare med lönerader, den 3:e kl 18 påminnelsen
 * till dem som inte godkänt. /api/notis/flush (var 5:e minut) bygger texten färskt och skickar. Reglerna: lib/lonesystem/granskaNotis.
 *
 * Schema: Vercel-cron varje timme (vercel.json) → Bearer CRON_SECRET (middleware släpper igenom just den). Rutten själv avgör om det är dags
 * (svensk tid, sommar/vinter) och databasens dedup ser till att det köas en gång per förare och månad, hur många gånger den än körs.
 * En inloggad admin kan anropa rutten i webbläsaren — då är det en TORRKÖRNING (inget köas) om inte ?skarp=1 anges; ?dry=1 ger alltid torrkörning.
 * I torrkörning går det att se vad som hade hänt en annan tidpunkt: ?nu=2026-10-01T16:30:00Z (ignoreras vid skarp körning).
 * ok:false → status 500 (syns i cron-loggen).
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
  const onskatNu = url.searchParams.get("nu");
  const nu = dry && onskatNu && Number.isFinite(Date.parse(onskatNu)) ? new Date(onskatNu) : new Date();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rapport = await koaLonNotiser(sb, {
    nu, dry,
    hamtaUnderlag: async (loneperiod) => (await beraknaLoneunderlag(sb, { period: loneperiod })).resultat as any,
  });
  if (!rapport.ok) console.error("[lon/notis]", rapport.fel);
  return NextResponse.json({ lage: dry ? "torrkörning — inget köades" : "skarp", nu: nu.toISOString(), ...rapport }, { status: rapport.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) { return kor(req); }
export async function POST(req: NextRequest) { return kor(req); }
