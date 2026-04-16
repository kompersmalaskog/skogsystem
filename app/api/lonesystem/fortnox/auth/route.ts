import { NextResponse } from "next/server";
import { hämtaKoppling, fortnoxRedirectUri } from "@/lib/lonesystem/server";
import { FortnoxAdapter } from "@/lib/lonesystem/fortnox";
import crypto from "node:crypto";

/**
 * Startar OAuth-flödet mot Fortnox.
 * Förutsätter att lonesystem_koppling-raden för 'fortnox' har
 * api_client_id och api_client_secret ifyllda.
 */
export async function GET(req: Request) {
  const koppling = await hämtaKoppling("fortnox");
  if (!koppling) {
    return NextResponse.json({ error: "Ingen Fortnox-koppling — spara client_id/secret först." }, { status: 400 });
  }
  if (!koppling.api_client_id || !koppling.api_client_secret) {
    return NextResponse.json({ error: "client_id/secret saknas." }, { status: 400 });
  }

  // Använd kopplings-id som state (enkelt; för produktion: hashad nonce + verifiera)
  const state = `${koppling.id}:${crypto.randomBytes(8).toString("hex")}`;
  const redirectUri = fortnoxRedirectUri(req);
  const adapter = new FortnoxAdapter(koppling);
  const authUrl = adapter.buildAuthUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
}
