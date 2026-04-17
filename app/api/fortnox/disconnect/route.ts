import { NextResponse } from "next/server";
import { hämtaKoppling, rensaTokens } from "@/lib/lonesystem/server";

/** Koppla ifrån Fortnox — rensar krypterade tokens. */
export async function POST() {
  try {
    const k = await hämtaKoppling();
    if (!k) return NextResponse.json({ ok: false, meddelande: "Ingen koppling." });
    await rensaTokens(k.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
