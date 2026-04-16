import { NextRequest, NextResponse } from "next/server";
import { hämtaKoppling } from "@/lib/lonesystem/server";
import { getAdapter } from "@/lib/lonesystem";
import type { SystemTyp } from "@/lib/lonesystem/types";

/**
 * Testar anslutningen mot ett lönesystem.
 * Body: { system_typ: SystemTyp }
 */
export async function POST(req: NextRequest) {
  try {
    const { system_typ } = await req.json();
    if (!system_typ) return NextResponse.json({ ok: false, meddelande: "system_typ krävs" }, { status: 400 });

    const koppling = await hämtaKoppling(system_typ as SystemTyp);
    if (!koppling) return NextResponse.json({ ok: false, meddelande: "Ingen koppling sparad." });

    const adapter = getAdapter(koppling);
    const result = await adapter.testConnection();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
