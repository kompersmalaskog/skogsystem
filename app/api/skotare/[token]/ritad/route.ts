import { NextRequest, NextResponse } from 'next/server';
import { skotarRitadSvar } from '@/lib/skotarlank/ritad';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// GET /api/skotare/<token>/ritad?del=… — ÖPPEN utan inloggning (som resten av skotarlänken). Bakgrunden Ritad för länkens trakt.
// Området räknas av servern ur trakten; klienten skickar inga koordinater (lib/skotarlank/ritad).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarRitadSvar(sb, ctx.params.token, req.nextUrl.searchParams.get('del'));
    return NextResponse.json(s.body, { status: s.status, headers: { ...BESOK_RUBRIKER, ...(s.status === 200 ? { 'Cache-Control': 'private, max-age=3600' } : {}) } });
  } catch (e) {
    console.error('[skotare] ritad:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
