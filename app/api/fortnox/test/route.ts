import { NextResponse } from "next/server";
import { getFortnoxClient } from "@/lib/lonesystem/server";

/** Testar Fortnox-anslutning via GET /employees?limit=3. Auto-refreshar token. */
export async function POST() {
  try {
    const client = await getFortnoxClient();
    const result = await client.testConnection();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
