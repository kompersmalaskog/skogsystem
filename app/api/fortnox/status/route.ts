import { NextResponse } from "next/server";
import { hämtaKoppling } from "@/lib/lonesystem/server";

/** Returnerar anslutningsstatus — klient-safe (inga tokens exponeras). */
export async function GET() {
  try {
    const k = await hämtaKoppling();
    if (!k || !k.aktiv) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({
      connected: true,
      since: k.skapad,
      token_utgar: k.token_utgar,
      senast_synkad: k.senast_synkad,
    });
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 500 });
  }
}
