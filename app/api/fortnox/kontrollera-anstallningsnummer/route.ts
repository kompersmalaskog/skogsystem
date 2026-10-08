import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";

/**
 * POST /api/fortnox/kontrollera-anstallningsnummer { anstallningsnummer }
 * Finns numret som EmployeeId i Fortnox? Admin. Svar: { ok, status: 'hittad' (+namn) | 'saknas' | 'ej_ansluten' | 'fel' (+fel) }.
 *
 * Läser bara. 'ej_ansluten' är ett läge (numret kan sparas utan Fortnox och kontrolleras när anslutningen finns), inte ett
 * fel. Ett Fortnox-fel ger aldrig 'saknas': ett nummer som inte gick att slå upp är inte ett nummer som inte finns.
 */
export async function POST(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  const body = await req.json().catch(() => ({}));
  const nr = typeof body?.anstallningsnummer === "string" ? body.anstallningsnummer.trim() : "";
  if (!nr) return NextResponse.json({ ok: false, status: "fel", fel: "Anställningsnummer saknas." }, { status: 400 });

  let client;
  try {
    client = await getFortnoxClient();
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (/inte anslutet/i.test(msg)) return NextResponse.json({ ok: true, status: "ej_ansluten" });
    return NextResponse.json({ ok: false, status: "fel", fel: msg });
  }
  try {
    const anstallda = await client.getEmployees();
    const traff = anstallda.find(a => String(a.externt_id).trim() === nr);
    return NextResponse.json(traff ? { ok: true, status: "hittad", namn: traff.namn } : { ok: true, status: "saknas" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, status: "fel", fel: e?.message || String(e) });
  }
}
