import { NextResponse } from "next/server";
import { hämtaKoppling, rensaTokens } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";

/** Koppla ifrån Fortnox — rensar krypterade tokens. Admin/chef (var öppen för vem som helst). */
export async function POST() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const k = await hämtaKoppling();
    if (!k) return NextResponse.json({ ok: false, meddelande: "Ingen koppling." });
    await rensaTokens(k.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
