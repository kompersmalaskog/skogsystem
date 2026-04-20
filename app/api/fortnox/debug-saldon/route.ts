import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

/**
 * GET /api/fortnox/debug-saldon?id=07
 *
 * Dumpar rå data för att felsöka saldo-uträkningen.
 * Hämtar fält som matchar /vacation|atk|atf|saved/i från Fortnox-employee
 * och alla rader + kolumnnycklar från gs_avtal.
 * Tas bort när saldon-fliken visar rätt värden.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "07";

    const client = (await getFortnoxClient()) as any;
    const accessToken: string = client.accessToken;

    const r = await fetch(`https://api.fortnox.se/3/employees/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const text = await r.text();
    let empBody: any;
    try { empBody = JSON.parse(text); } catch { empBody = text; }
    const emp = empBody?.Employee || {};

    const vacAtkFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(emp)) {
      if (/vacation|atk|atf|saved/i.test(k)) vacAtkFields[k] = v;
    }

    const supabase = serverSupabase();
    const avt = await supabase
      .from("gs_avtal")
      .select("*")
      .order("giltigt_fran", { ascending: false })
      .limit(3);

    const avtalRader = avt.data || [];
    const kolumnnycklar = avtalRader[0] ? Object.keys(avtalRader[0]).sort() : [];
    const atkRelateradeFält: Record<string, any> = {};
    if (avtalRader[0]) {
      for (const [k, v] of Object.entries(avtalRader[0])) {
        if (/atk|ledig|tim/i.test(k)) atkRelateradeFält[k] = v;
      }
    }

    return NextResponse.json({
      queried_id: id,
      fortnox: {
        status: r.status,
        vacation_atk_fields: vacAtkFields,
      },
      gs_avtal: {
        kolumnnycklar,
        atk_relaterade_falt: atkRelateradeFält,
        rader: avtalRader,
        error: avt.error?.message ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
