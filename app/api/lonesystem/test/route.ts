import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient } from "@/lib/lonesystem/server";

/**
 * Testar Fortnox-anslutningen. Anropar GET /3/companyinformation.
 * Auto-refreshar token om den är på väg att gå ut.
 */
export async function POST(req: NextRequest) {
  try {
    const client = await getFortnoxClient();
    const result = await client.testConnection();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
