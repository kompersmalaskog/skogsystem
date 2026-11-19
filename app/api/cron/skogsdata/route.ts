import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_ROLLER, kravRoll } from '@/lib/auth/server';
import { korSkogsdata } from '@/lib/skogsdata/server';
import { korUttag, type UttagSvar } from '@/lib/skogsdata/uttagServer';

/**
 * GET /api/cron/skogsdata — hämtar laserdata, lutning och markfuktighet per trakt (Vidas traktgräns) och sparar i objekt_skogsdata
 * (vercel.json, varje timme). Underlaget för den automatiska prognosen. Aktiva trakter först, sedan avslutade (facit), några per körning.
 * Vem som får anropa: Vercel-cron (Bearer CRON_SECRET) eller en inloggad admin för hand. Ofarlig att köra ofta: en aktuell trakt rörs inte.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Börja inte på en ny trakt efter så här lång tid — ett utsnitt tar upp till 20 s (tjänsternas tidsgräns) och funktionen får 60. */
const BUDGET_MS = 35_000;
/** Uttaget börjar inte på en ny trakt efter så här lång tid från start. */
const UTTAG_TILL_MS = 50_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!cron) {
    const vakt = await kravRoll(ADMIN_ROLLER);
    if (!vakt.ok) return vakt.res;
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const start = Date.now();
  const svar = await korSkogsdata(sb, { budgetMs: BUDGET_MS });
  if (svar.fel.length) console.error('[cron/skogsdata]', svar.fel);
  // Uttaget (stammarna mot laserdatan) och frysningen av appens prognos — på den tid som är kvar. Ett fel här fäller inte hämtningen.
  let uttag: UttagSvar = { raknade: [], kvar: 0, frysta: [], fel: [] };
  try {
    uttag = await korUttag(sb, { budgetMs: Math.max(0, UTTAG_TILL_MS - (Date.now() - start)) });
  } catch (e) {
    uttag.fel.push((e as Error)?.message ?? 'okänt fel');
  }
  if (uttag.fel.length) console.error('[cron/skogsdata] uttag', uttag.fel);
  return NextResponse.json({ ...svar, uttag }, { status: svar.ok || svar.hamtade.length ? 200 : 500 });
}
