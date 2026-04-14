import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  'mailto:info@kompersmalskog.se',
  'BGe21_FkdZWkOiaLTWE2GXADsaA08uC2eRGglHIyJ85rL35YkrkUY1L3jTJ7fGvAQlDRjJsH3AMMeX62B63hr34',
  process.env.VAPID_PRIVATE_KEY || 'DUop3YJnWfPGbNF2KGz8elhEpkVRoivHzM3Xt-Y5_fA'
);

export async function POST(req: NextRequest) {
  try {
    const { medarbetare_id, title, body, url } = await req.json();

    if (!medarbetare_id) {
      return NextResponse.json({ error: 'medarbetare_id krävs' }, { status: 400 });
    }

    // Fetch push subscription from medarbetare
    const { data: med, error } = await supabase
      .from('medarbetare')
      .select('push_subscription')
      .eq('id', medarbetare_id)
      .single();

    if (error || !med?.push_subscription) {
      return NextResponse.json({ error: 'Ingen push-prenumeration hittad' }, { status: 404 });
    }

    const subscription = JSON.parse(med.push_subscription);

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || 'Kompersmåla Skog',
        body: body || '',
        url: url || '/arbetsrapport',
      })
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // If subscription is expired/invalid, clear it
    if (e.statusCode === 410 || e.statusCode === 404) {
      const { medarbetare_id } = await req.json().catch(() => ({}));
      if (medarbetare_id) {
        await supabase
          .from('medarbetare')
          .update({ push_subscription: null })
          .eq('id', medarbetare_id);
      }
    }
    console.error('Push notification error:', e);
    return NextResponse.json({ error: 'Kunde inte skicka notis' }, { status: 500 });
  }
}
