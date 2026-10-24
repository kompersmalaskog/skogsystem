import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { koaManuellPaminnelse, lasLonRadMotDb } from "@/lib/lonesystem/granskaNotis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lon/paminn   Body: { medarbetare_id, arbetsmanad: "2026-09" }
 *
 * Knappen "Påminn" på förarkortet (Admin → Lön → Löneunderlag, status "Väntar på föraren"): samma notis som den 1:a ("Granska din september"),
 * direkt. Bara admin. Köar EN rad (en andra tryckning inom tio minuter köar ingen ny) och kör sedan flushen så pushen går iväg nu i stället för
 * om upp till fem minuter. Företagsledare, redan godkända och redan skickade månader nekas med en förklaring.
 * Svar: { ok, koad, skickades } — `skickades: false` betyder köad, går ut vid nästa körning (cron var 5:e minut).
 */
export async function POST(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  let body: any;
  try { body = await req.json(); } catch { body = null; }
  const medarbetareId = typeof body?.medarbetare_id === "string" ? body.medarbetare_id : "";
  const arbetsmanad = typeof body?.arbetsmanad === "string" ? body.arbetsmanad : "";
  if (!medarbetareId || !arbetsmanad) return NextResponse.json({ ok: false, meddelande: "medarbetare_id och arbetsmanad krävs." }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const r = await koaManuellPaminnelse(sb, { medarbetareId, arbetsmanad, nu: new Date(), lasRad: lasLonRadMotDb(sb) });
  if (!r.ok) return NextResponse.json({ ok: false, meddelande: r.fel }, { status: /Kunde inte/.test(r.fel || "") ? 500 : 409 });

  // Kör flushen direkt så pushen går nu. Misslyckas det är raden ändå köad och tas av nästa cron — aldrig ett fel för admin.
  let skickades = false;
  if (r.koad) {
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
      console.error("[lon/paminn] flush:", e);
    }
  }
  return NextResponse.json({ ok: true, koad: r.koad, skickades });
}
