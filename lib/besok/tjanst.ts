// Service-klienten för besökssidans rutter. Läser SUPABASE_SERVICE_ROLE_KEY (finns redan för cron och Fortnox); saknas den svarar rutterna 503 — aldrig en tyst tom sida.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { Svar } from './server';

let klient: SupabaseClient | null = null;

export function tjanstKlient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const nyckel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !nyckel) return null;
  klient ??= createClient(url, nyckel, { auth: { persistSession: false, autoRefreshToken: false } });
  return klient;
}

/** Rubrikerna för alla svar från besökssidans rutter: aldrig cachat, aldrig indexerat. */
export const BESOK_RUBRIKER = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' } as const;

export const tillSvar = (s: Svar): NextResponse => NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });

export const ejKonfigurerad = (): NextResponse => NextResponse.json({ ok: false, fel: 'Tjänsten är inte konfigurerad' }, { status: 503, headers: BESOK_RUBRIKER });
