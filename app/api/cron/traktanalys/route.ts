import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_ROLLER, kravRoll } from '@/lib/auth/server';
import { korTraktanalys } from '@/lib/traktAnalys/server';

/**
 * GET /api/cron/traktanalys — kör traktanalysen av sig själv mot Vidas traktgräns för alla trakter som inte är avslutade (vercel.json, varje timme).
 * En ny trakt från Vida är analyserad inom en timme; resultatet ligger i objekt.trakt_analys och läses via lib/traktAnalys/markning.ts.
 * Vem som får anropa: Vercel-cron (Bearer CRON_SECRET) eller en inloggad admin för hand. Ofarlig att köra ofta: en aktuell trakt rörs inte.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Börja inte på en ny trakt efter så här lång tid — en analys tar upp till ~15 s (tjänsternas tidsgräns) och funktionen får 60. */
const BUDGET_MS = 40_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!cron) {
    const vakt = await kravRoll(ADMIN_ROLLER);
    if (!vakt.ok) return vakt.res;
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const svar = await korTraktanalys(sb, { budgetMs: BUDGET_MS });
  if (svar.fel.length) console.error('[cron/traktanalys]', svar.fel);
  return NextResponse.json(svar, { status: svar.ok || svar.analyserade.length ? 200 : 500 });
}
