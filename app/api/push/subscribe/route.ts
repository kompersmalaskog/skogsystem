import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/push/subscribe
 * Body: { medarbetare_id: string, subscription: PushSubscriptionJSON, device_name?: string }
 *
 * Upsert på endpoint — samma enhet kan re-registreras utan dubbletter, och
 * byter ägare om en annan medarbetare loggar in på samma enhet.
 */
export async function POST(req: NextRequest) {
  try {
    const { medarbetare_id, subscription, device_name } = await req.json();

    if (!medarbetare_id || !subscription?.endpoint) {
      return NextResponse.json(
        { ok: false, error: "medarbetare_id och subscription.endpoint krävs" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          medarbetare_id,
          endpoint: subscription.endpoint,
          subscription,
          device_name: device_name || null,
          last_used: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 },
    );
  }
}
