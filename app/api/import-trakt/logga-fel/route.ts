import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// Loggar ett misslyckat trakt-importförsök som KLIENTEN upptäckte — när /api/import-trakt inte
// svarade alls (OOM/timeout dödar funktionen innan den hinner logga sig själv) eller svarade 5xx
// utan JSON. import_fel kräver service-role för skrivning (RLS), så klienten går via den här lilla
// endpointen. Läses av /datahalsa "Tappades något vid import?". Poängen: en tyst död import ska
// synas i appen, inte bara som en föräldralös fil i trakt-inbox som ingen tittar i.
//
// Lättviktig med FLIT: bara en INSERT, laddar aldrig traktfilen — kan inte själv OOM:a.

async function skapaInloggadKlient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* API-route sätter inga cookies */ },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Samma admin-gate som import-routen — bara inloggad admin får skriva en felrad.
    const auth = await skapaInloggadKlient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
    const { data: medarbetare } = await auth
      .from('medarbetare').select('roll').eq('epost', user.email).single();
    if (medarbetare?.roll !== 'admin') return NextResponse.json({ error: 'Kräver admin' }, { status: 403 });

    const { sokvag, feltext } = await request.json();

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { error } = await service.from('import_fel').insert({
      tabell: 'objekt',
      filnamn: typeof sokvag === 'string' ? sokvag : null,
      felkod: 'IMPORT_INGET_SVAR',
      feltext: (typeof feltext === 'string' ? feltext : 'Importen svarade inte — trolig timeout eller minnesbrist. Filen ligger kvar i trakt-inbox för omkörning.').slice(0, 2000),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
