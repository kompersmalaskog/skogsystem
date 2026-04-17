import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildFortnoxAuthUrl } from "@/lib/lonesystem/fortnox";
import { säkraKopplingFinns, fortnoxRedirectUri } from "@/lib/lonesystem/server";

/**
 * Startar Fortnox OAuth-flödet.
 * Genererar state, sparar i httpOnly cookie (10 min), redirectar till Fortnox.
 */
export async function GET(req: Request) {
  try {
    await säkraKopplingFinns();
    const state = crypto.randomBytes(32).toString("hex");
    const redirectUri = fortnoxRedirectUri(req);
    const authUrl = buildFortnoxAuthUrl(state, redirectUri);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set("fortnox_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/fortnox",
      maxAge: 600, // 10 min
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
