import { NextResponse } from 'next/server';
import { arGiltigtSkotarToken } from '@/lib/skotarlank/offentlig';
import { skotarManifest } from '@/lib/skotarlank/manifest';

// GET /api/skotare/<token>/manifest — appmanifestet för skotarsidan, så att den går att installera som app på maskindatorn (Chrome på Windows) och öppnas
// i helskärm direkt på RÄTT trakt. Ingen data här: bara adressen (som redan står i länken). Ogiltig token → 404.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  if (!arGiltigtSkotarToken(ctx.params.token)) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json(skotarManifest(ctx.params.token), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
