import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

/**
 * POST /api/notify
 * Body: { medarbetare_id, title, body, url }
 *
 * Skickar push till ALLA registrerade enheter för medarbetaren.
 * Raderar prenumerationer som returnerar 410/404 (enhet avregistrerad).
 * Uppdaterar last_used vid lyckat utskick.
 */

const VAPID_PUBLIC_KEY =
  'BGe21_FkdZWkOiaLTWE2GXADsaA08uC2eRGglHIyJ85rL35YkrkUY1L3jTJ7fGvAQlDRjJsH3AMMeX62B63hr34';
const VAPID_SUBJECT = 'mailto:info@kompersmalskog.se';

export async function POST(req: NextRequest) {
  try {
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPrivate) {
      return NextResponse.json(
        {
          ok: false,
          error: 'VAPID_PRIVATE_KEY saknas i env-vars — kan inte skicka push.',
        },
        { status: 500 },
      );
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivate);

    const { medarbetare_id, title, body, url } = await req.json();
    if (!medarbetare_id) {
      return NextResponse.json({ ok: false, error: 'medarbetare_id krävs' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('medarbetare_id', medarbetare_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!subs || subs.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Inga push-prenumerationer registrerade för medarbetaren' },
        { status: 404 },
      );
    }

    const payload = JSON.stringify({
      title: title || 'Kompersmåla Skog',
      body: body || '',
      url: url || '/arbetsrapport',
    });

    const skickat: string[] = [];
    const döda: string[] = [];
    const fel: { id: string; status?: number; message: string }[] = [];

    await Promise.all(
      subs.map(async (row: any) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          skickat.push(row.id);
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            döda.push(row.id);
          } else {
            fel.push({ id: row.id, status: e.statusCode, message: e.message || String(e) });
          }
        }
      }),
    );

    if (döda.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', döda);
    }
    if (skickat.length > 0) {
      await supabase
        .from('push_subscriptions')
        .update({ last_used: new Date().toISOString() })
        .in('id', skickat);
    }

    return NextResponse.json({
      ok: skickat.length > 0 || subs.length === döda.length,
      skickat: skickat.length,
      borttagna: döda.length,
      fel,
    });
  } catch (e: any) {
    console.error('Push notification error:', e);
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 },
    );
  }
}
