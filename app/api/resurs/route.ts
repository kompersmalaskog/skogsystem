import { NextRequest, NextResponse } from "next/server";
import { autentisera, supaService, kanRedigera, selectResurs, ekonomiUtanRatt } from "@/lib/resurs-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fält en klient får sätta vid skapande (ekonomi ingår men gate:as separat).
const SKRIVBARA = [
  "namn", "typ", "regnr", "serienr", "marke", "modell", "arsmodell",
  "avstalld", "matarstallning", "matare_avlast", "anteckning",
  "inkopsdatum", "inkopspris",
] as const;

export async function GET() {
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });

  const supabase = supaService();
  // Fältfiltrering i select() (#3, läsriktning) + kontroller inbäddade.
  const { data, error } = await supabase
    .from("resurs")
    .select(`${selectResurs(roll)}, kontroll(*)`)
    .eq("aktiv", true)
    .order("typ")
    .order("namn");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, resurs: data || [] });
}

export async function POST(req: NextRequest) {
  const { user, roll } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });
  if (!kanRedigera(roll)) return NextResponse.json({ ok: false, error: "Kräver admin/chef" }, { status: 403 });

  const body = await req.json();
  if (ekonomiUtanRatt(roll, body)) {
    return NextResponse.json({ ok: false, error: "Ekonomifält kräver admin/chef" }, { status: 403 });
  }

  const payload: any = {};
  for (const k of SKRIVBARA) if (k in body) payload[k] = body[k];
  payload.namn = String(payload.namn || "").trim();
  if (payload.regnr) payload.regnr = String(payload.regnr).toUpperCase().replace(/\s+/g, "");
  if (!payload.namn || !payload.typ) {
    return NextResponse.json({ ok: false, error: "namn och typ krävs" }, { status: 400 });
  }

  const supabase = supaService();
  const { data, error } = await supabase.from("resurs").insert(payload).select(selectResurs(roll)).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resurs: data });
}
