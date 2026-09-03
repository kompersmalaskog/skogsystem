import { NextResponse } from "next/server";
import { hämtaKoppling } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";

/** Returnerar anslutningsstatus baserat på om token finns och inte utgått. Admin/chef. */
export async function GET() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const k = await hämtaKoppling();
    if (!k || !k.access_token) {
      return NextResponse.json({ connected: false });
    }
    const tokenGiltig = k.token_utgar ? new Date(k.token_utgar).getTime() > Date.now() : false;
    return NextResponse.json({
      connected: tokenGiltig,
      since: k.skapad,
      token_utgar: k.token_utgar,
      senast_synkad: k.senast_synkad,
    });
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 500 });
  }
}
