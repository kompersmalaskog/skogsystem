import { NextResponse } from "next/server";
import { getFortnoxClient } from "@/lib/lonesystem/server";

/** Testar Fortnox-anslutning + hämtar anställda. Auto-refreshar token. */
export async function POST() {
  try {
    const client = await getFortnoxClient();
    const testResult = await client.testConnection();
    if (!testResult.ok) return NextResponse.json(testResult);

    const anställda = await client.getEmployees();
    return NextResponse.json({
      ok: true,
      meddelande: testResult.meddelande,
      anstallda_antal: anställda.length,
      anstallda_forsta: anställda.slice(0, 3).map(e => e.namn),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
