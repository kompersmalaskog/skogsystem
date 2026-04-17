import { NextRequest, NextResponse } from "next/server";
import { exchangeFortnoxCode } from "@/lib/lonesystem/fortnox";
import { säkraKopplingFinns, sparaTokens, fortnoxRedirectUri } from "@/lib/lonesystem/server";

/**
 * OAuth callback från Fortnox.
 * Validerar state mot httpOnly cookie, byter code mot tokens,
 * krypterar och sparar i lonesystem_koppling.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  const adminUrl = (msg: string, ok = false) =>
    `${url.origin}/admin?${ok ? "lonesystem_ok=1" : `lonesystem_fel=${encodeURIComponent(msg)}`}`;

  if (errorParam) {
    return NextResponse.redirect(adminUrl(errorDesc || errorParam));
  }
  if (!code || !state) {
    return NextResponse.redirect(adminUrl("Saknar code eller state i callback."));
  }

  // Validera state mot cookie
  const cookieState = req.cookies.get("fortnox_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(adminUrl("Ogiltigt state — möjlig CSRF. Försök igen."));
  }

  try {
    const kopplingId = await säkraKopplingFinns();
    const redirectUri = fortnoxRedirectUri(req);
    const tokens = await exchangeFortnoxCode(code, redirectUri);
    await sparaTokens(kopplingId, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    const res = NextResponse.redirect(adminUrl("", true));
    // Rensa state-cookie
    res.cookies.set("fortnox_state", "", { path: "/api/fortnox", maxAge: 0 });
    return res;
  } catch (e: any) {
    return NextResponse.redirect(adminUrl(e.message || String(e)));
  }
}
