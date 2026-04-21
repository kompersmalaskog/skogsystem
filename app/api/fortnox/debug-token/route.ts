import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/lonesystem/crypto";
import { serverSupabase } from "@/lib/lonesystem/server";

// Engångs-debug. Skyddad med ?key=skogsystem-debug. Ta bort när Fortnox-scope
// är utrett.
const DEBUG_KEY = "skogsystem-debug";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) {
    return NextResponse.json({ ok: false, error: "Ogiltig nyckel" }, { status: 401 });
  }

  const supabase = serverSupabase();
  const { data: koppling, error } = await supabase
    .from("lonesystem_koppling")
    .select("*")
    .eq("system_typ", "fortnox")
    .eq("aktiv", true)
    .maybeSingle();

  if (error) return NextResponse.json({ steg: "hämta koppling", error: error.message }, { status: 500 });
  if (!koppling) return NextResponse.json({ error: "Ingen aktiv fortnox-koppling" }, { status: 404 });

  let accessToken: string;
  try {
    accessToken = decrypt(koppling.access_token);
  } catch (e: any) {
    return NextResponse.json({ steg: "decrypt", error: e.message }, { status: 500 });
  }

  // Försök tolka som JWT (3 base64-delar separerade av punkter)
  let jwtPayload: any = null;
  let jwtFörsök: string | null = null;
  const delar = accessToken.split(".");
  if (delar.length === 3) {
    try {
      const b64 = delar[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
      jwtPayload = JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
    } catch (e: any) {
      jwtFörsök = `Kunde inte tolka JWT-payload: ${e.message}`;
    }
  } else {
    jwtFörsök = `Inte JWT-format (${delar.length} delar separerade av punkter). Sannolikt opak token.`;
  }

  // Testanrop mot companyinformation
  const compUrl = "https://api.fortnox.se/3/companyinformation";
  const compRes = await fetch(compUrl, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    },
  });
  const compHeaders: Record<string, string> = {};
  compRes.headers.forEach((v, k) => { compHeaders[k] = v; });
  const compBody = await compRes.text();

  // Testanrop mot employees också (det som appen använder)
  const empRes = await fetch("https://api.fortnox.se/3/employees?limit=1", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    },
  });
  const empHeaders: Record<string, string> = {};
  empRes.headers.forEach((v, k) => { empHeaders[k] = v; });
  const empBody = await empRes.text();

  return NextResponse.json({
    ok: true,
    koppling: {
      id: koppling.id,
      system_typ: koppling.system_typ,
      token_utgar: koppling.token_utgar,
      senast_synkad: koppling.senast_synkad,
      access_token_head: accessToken.slice(0, 40) + "...",
      access_token_length: accessToken.length,
      ser_ut_som_jwt: delar.length === 3,
    },
    jwt_payload: jwtPayload,
    jwt_not: jwtFörsök,
    companyinformation_test: {
      url: compUrl,
      status: compRes.status,
      headers: compHeaders,
      body: compBody.slice(0, 2000),
    },
    employees_test: {
      url: "https://api.fortnox.se/3/employees?limit=1",
      status: empRes.status,
      headers: empHeaders,
      body: empBody.slice(0, 2000),
    },
  });
}
