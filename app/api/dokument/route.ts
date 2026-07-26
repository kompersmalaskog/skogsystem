import { NextRequest, NextResponse } from 'next/server';

// Öppnar ett dokument (TD/stämplingslängd) i läsvy i STÄLLET för nedladdning.
// Bakgrund: kartbilder-bucketens signerade URL:er serveras med Content-Type
// application/pdf men UTAN Content-Disposition. En cross-origin PDF utan
// disposition är tvetydig → många webbläsare/PWA-webviews LADDAR NER den i
// stället för att visa den (särskilt på mobil). Supabase kan inte signera med
// inline (bara download=attachment). Därför proxar vi den signerade URL:en
// SAME-ORIGIN och sätter en explicit `Content-Disposition: inline` → läsvy.
//
// Säkerhet: proxar ENDAST vår egen kartbilder-bucket-signerade URL (SSRF-spärr).
// Den signerade token:en (kort TTL) är själva behörigheten — precis som när
// klienten öppnar URL:en direkt idag. Ingen ny exponering, inget cachas.

function supabaseBas(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) return new NextResponse('Saknar url', { status: 400 });

  const bas = supabaseBas();
  const tillaten = bas && target.startsWith(`${bas}/storage/v1/object/sign/kartbilder/`);
  if (!tillaten) return new NextResponse('Otillåten url', { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(target, { signal: AbortSignal.timeout(20000) });
  } catch {
    return new NextResponse('Kunde inte hämta dokument', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('Kunde inte hämta dokument', { status: upstream.status || 502 });
  }

  // Filnamn ur pathen (bara för visning) — saniterat, aldrig från klientens fria text.
  const rawPath = decodeURIComponent((target.split('/sign/kartbilder/')[1] || 'dokument.pdf').split('?')[0]);
  const filnamn = (rawPath.split('/').pop() || 'dokument.pdf').replace(/[^\w.\-]/g, '_');

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': `inline; filename="${filnamn}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
