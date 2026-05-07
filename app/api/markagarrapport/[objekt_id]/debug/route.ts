// Debug-endpoint för verifiering mot riktig data.
// Bypasser atgard='slutavverkning'-checken så vi kan testa mot Hössjömåla
// (gallring) innan Husjönäs är reimporterat med pris_per_m3 ifyllt.
// Returnerar mellansiffror (massa-pris, timmer-pris per maskin) för granskning.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { aggregateMarkagarRapport } from '@/lib/markagarrapport/aggregate';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ objekt_id: string }> },
) {
  const { objekt_id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });
  const { data: medarb } = await supabase
    .from('medarbetare')
    .select('roll')
    .eq('epost', user.email)
    .maybeSingle();
  if (!medarb || (medarb.roll !== 'admin' && medarb.roll !== 'chef')) {
    return NextResponse.json({ error: 'Förbjudet' }, { status: 403 });
  }

  try {
    const result = await aggregateMarkagarRapport(supabase, objekt_id, {
      bypassAtgardCheck: true,
      includeDebug: true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
