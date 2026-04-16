import { NextResponse } from "next/server";
import { hämtaKoppling, uppdateraKoppling, fortnoxRedirectUri } from "@/lib/lonesystem/server";
import { FortnoxAdapter } from "@/lib/lonesystem/fortnox";

/**
 * OAuth-callback från Fortnox. Växlar code mot tokens, sparar i
 * lonesystem_koppling och redirectar tillbaka till admin-vyn.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${url.origin}/admin?lonesystem_fel=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${url.origin}/admin?lonesystem_fel=Saknar+code+eller+state`);
  }

  const koppling = await hämtaKoppling("fortnox");
  if (!koppling) {
    return NextResponse.redirect(`${url.origin}/admin?lonesystem_fel=Ingen+koppling`);
  }

  const stateKopplingId = state.split(":")[0];
  if (stateKopplingId !== koppling.id) {
    return NextResponse.redirect(`${url.origin}/admin?lonesystem_fel=Ogiltigt+state`);
  }

  try {
    const redirectUri = fortnoxRedirectUri(req);
    const adapter = new FortnoxAdapter(koppling);
    const tokens = await adapter.exchangeCode(code, redirectUri);
    const utgar = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await uppdateraKoppling(koppling.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_utgar: utgar,
      aktiv: true,
    });
    return NextResponse.redirect(`${url.origin}/admin?lonesystem_ok=1`);
  } catch (e: any) {
    return NextResponse.redirect(`${url.origin}/admin?lonesystem_fel=${encodeURIComponent(e.message || String(e))}`);
  }
}
