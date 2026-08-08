import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// Server-genererad signerad uppladdnings-URL till den privata trakt-inbox-bucketen.
// Klienten postar { filnamn, storlek }, får tillbaka { url, token, sokvag } och laddar upp
// råfilen DIREKT till storage (aldrig genom en route → ingen ~4,5 MB body-gräns). Själva
// URL:en skapas med service-role; token:en kringgår RLS så klienten aldrig behöver läs/skriv
// på bucketen.

const MAX_BYTES = 25 * 1024 * 1024; // samma tak som bucketens file_size_limit

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
    // Samma auth-gate som /api/import-trakt: bara inloggad admin får skapa en
    // uppladdnings-URL till trakthandlingar (markägardata).
    const auth = await skapaInloggadKlient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
    }
    const { data: medarbetare } = await auth
      .from('medarbetare')
      .select('roll')
      .eq('epost', user.email)
      .single();
    if (medarbetare?.roll !== 'admin') {
      return NextResponse.json({ error: 'Kräver admin' }, { status: 403 });
    }

    const { filnamn, storlek } = await request.json();
    if (!filnamn || typeof filnamn !== 'string') {
      return NextResponse.json({ error: 'filnamn saknas' }, { status: 400 });
    }
    const ext = /\.envz$/i.test(filnamn) ? 'envz' : /\.zip$/i.test(filnamn) ? 'zip' : null;
    if (!ext) {
      return NextResponse.json({ error: 'Endast .envz eller .zip' }, { status: 400 });
    }
    if (typeof storlek === 'number' && storlek > MAX_BYTES) {
      return NextResponse.json({ error: 'Filen är för stor (max 25 MB)' }, { status: 413 });
    }

    // Unik, klient-oberoende sökväg. Vi litar inte på klientens filnamn för lagringen.
    const rand = Math.random().toString(36).slice(2, 10);
    const sokvag = `incoming/${Date.now()}_${rand}.${ext}`;

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data, error } = await service.storage
      .from('trakt-inbox')
      .createSignedUploadUrl(sokvag);
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Kunde inte skapa uppladdnings-URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl, token: data.token, sokvag: data.path });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
