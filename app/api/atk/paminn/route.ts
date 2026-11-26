import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { koaAtkPaminnelse } from "@/lib/admin/atkNotis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/atk/paminn   Body: { period: "2026" }
 *
 * Knappen "Påminn alla" (Admin › Lön › ATK-val): köar EN notis per förare som inte valt (ej företagsledare, ej maskinkonto)
 * och kör flushen direkt. Bara admin, bara medan valet är öppet (1–15 maj). En andra tryckning inom tio minuter köar inget nytt.
 * Svar: { ok, koade, skickades }.
 */
export async function POST(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  let body: any;
  try { body = await req.json(); } catch { body = null; }
  const period = typeof body?.period === "string" ? body.period : "";
  if (!/^\d{4}$/.test(period)) return NextResponse.json({ ok: false, meddelande: "period krävs (år)." }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const r = await koaAtkPaminnelse(sb, { period, nu: new Date() });
  if (!r.ok) return NextResponse.json({ ok: false, meddelande: r.fel }, { status: /Kunde inte/.test(r.fel || "") ? 500 : 409 });

  let skickades = false;
  if (r.koade > 0) {
    try {
      const headers: Record<string, string> = {};
      const secret = process.env.CRON_SECRET;
      if (secret) headers.authorization = `Bearer ${secret}`;
      const cookie = req.headers.get("cookie");
      if (cookie) headers.cookie = cookie;
      const res = await fetch(new URL("/api/notis/flush", req.url), { method: "POST", headers });
      const j = res.ok ? await res.json().catch(() => null) : null;
      skickades = !!j && Number(j.skickade) > 0;
    } catch (e) {
      console.error("[atk/paminn] flush:", e);
    }
  }
  return NextResponse.json({ ok: true, koade: r.koade, skickades });
}
