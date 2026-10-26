import { NextRequest, NextResponse } from 'next/server';
import { skapaAnmalan } from '@/lib/besok/server';
import webpush from 'web-push';
import { skickaBesokTillMaskiner } from '@/lib/hytt/maskinPush';
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT, vapidPrivatNyckel } from '@/lib/push/vapid';
import { BESOK_RUBRIKER, ejKonfigurerad, tillSvar, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/besok/<token>/anmal — markägarens "Jag kommer på besök". Öppen utan inloggning; bara token-länken ger åtkomst. Tar { namn, telefon, nar: 'nu'|'om1h'|'tid', tid? }.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const { token } = ctx.params;
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  try {
    const svar = await skapaAnmalan(sb, token, body);
    if (svar.status === 200 && svar.body.ok === true && typeof svar.body.id === 'string') await pushaTillMaskiner(sb, svar.body.id);
    return tillSvar(svar);
  } catch (e) {
    console.error('[besok] POST:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte spara just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}

/** Anmälan sparad → pusha till maskinerna på trakten (maskinens prenumerationer, aldrig personens). Best effort: en misslyckad push får aldrig fälla markägarens anmälan. */
async function pushaTillMaskiner(sb: NonNullable<ReturnType<typeof tjanstKlient>>, besokId: string): Promise<void> {
  try {
    const privat = vapidPrivatNyckel();
    if (!privat) { console.error('[besok] push till maskinen: VAPID_PRIVATE_KEY saknas'); return; }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privat);
    const r = await sb.from('objekt_besok').select('id, objekt_id, namn, besokstid').eq('id', besokId).maybeSingle();
    if (r.error || !r.data) return;
    const rapport = await skickaBesokTillMaskiner(sb, (sub, payload) => webpush.sendNotification(sub as any, payload, { TTL: 3600, urgency: 'high' }).then(() => undefined), r.data as { id: string; objekt_id: string; namn: string; besokstid: string });
    if (!rapport.ok) console.error('[besok] push till maskinen:', rapport.fel);
  } catch (e) {
    console.error('[besok] push till maskinen:', e instanceof Error ? e.message : e);
  }
}
