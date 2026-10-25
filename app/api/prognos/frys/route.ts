import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';
import { frysAppPrognos, hamtaUtfall, type FrysUtfall } from '@/lib/prognos/appPrognos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/prognos/frys — ENGÅNGSFYLLNING av appens prognos (objekt.app_prognos) på trakter som ännu inte fått någon.
 *
 * Importen fryser prognosen på varje ny leverans; den här rutten tar det som redan ligger i appen (oplanerade, planerade och pågående
 * objekt utan app_prognos). Samma regler som importen (lib/prognos/appPrognos): bara virkestrakter, bara när ingen maskin börjat — en trakt
 * som redan körts hoppas över med skälet, aldrig en prognos i efterhand. Bara admin. Svar: { frysta, hoppade: { skal: antal }, fel: [...] }.
 * Går att köra om: en fryst trakt hoppas över ('redan_fryst').
 */
export async function POST() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const u = await hamtaUtfall(sb);
  if (u.error || !u.data) return NextResponse.json({ ok: false, meddelande: `Utfallet kunde inte läsas: ${u.error}` }, { status: 500 });

  const o = await sb.from('objekt').select('id').is('app_prognos', null).in('status', ['oplanerad', 'planerad', 'pagaende']).in('typ', ['slutavverkning', 'gallring']);
  if (o.error) return NextResponse.json({ ok: false, meddelande: `Objekten kunde inte läsas: ${o.error.message}` }, { status: 500 });

  let frysta = 0;
  const hoppade: Record<string, number> = {};
  const fel: { objekt_id: string; fel: string }[] = [];
  for (const rad of o.data ?? []) {
    const r: FrysUtfall = await frysAppPrognos(sb, String(rad.id), { kalla: 'frys', utfall: u.data });
    if (r.status === 'fryst') frysta++;
    else if (r.status === 'hoppad') hoppade[r.skal] = (hoppade[r.skal] ?? 0) + 1;
    else fel.push({ objekt_id: String(rad.id), fel: r.fel });
  }
  return NextResponse.json({ ok: true, frysta, hoppade, fel, kandidater: (o.data ?? []).length });
}
