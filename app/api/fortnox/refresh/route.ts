import { NextResponse } from "next/server";
import { hämtaKopplingDekrypterad, sparaTokens } from "@/lib/lonesystem/server";
import { refreshFortnoxToken } from "@/lib/lonesystem/fortnox";

/**
 * Manuell token-refresh. Kan anropas av cron eller admin.
 * Auto-refresh sker även automatiskt i getFortnoxClient() vid < 5 min kvar.
 */
export async function POST() {
  try {
    const k = await hämtaKopplingDekrypterad();
    if (!k || !k.plain_refresh_token) {
      return NextResponse.json({ ok: false, meddelande: "Ingen refresh_token. Anslut först." }, { status: 400 });
    }

    const tokens = await refreshFortnoxToken(k.plain_refresh_token);
    await sparaTokens(k.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    return NextResponse.json({
      ok: true,
      meddelande: "Token förnyad.",
      utgar: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
