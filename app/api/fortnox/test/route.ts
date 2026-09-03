import { NextResponse } from "next/server";
import { getFortnoxClient } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";

/** Testar Fortnox-anslutning via GET /employees?limit=3. Auto-refreshar token. Admin/chef. */
export async function POST() {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const client = await getFortnoxClient();
    const result = await client.testConnection();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
