import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

/**
 * GET /api/fortnox/employee-details?medarbetare_id=<uuid>
 *
 * Hämtar semester- och ATK-saldo från Fortnox för given medarbetare.
 * Slår upp anställningsnummer i medarbetare_lonesystem, frågar
 * /3/employees/{anst_nr} i Fortnox och läser atk_ledig_tim från gs_avtal.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const medarbetareId = searchParams.get("medarbetare_id");
    if (!medarbetareId) {
      return NextResponse.json(
        { ok: false, meddelande: "medarbetare_id krävs" },
        { status: 400 },
      );
    }

    const supabase = serverSupabase();

    const [mappRes, avtalRes] = await Promise.all([
      supabase
        .from("medarbetare_lonesystem")
        .select("anstallningsnummer")
        .eq("medarbetare_id", medarbetareId)
        .maybeSingle(),
      supabase
        .from("gs_avtal")
        .select("atk_ledig_tim")
        .order("giltigt_fran", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const anstNr = mappRes.data?.anstallningsnummer;
    if (!anstNr) {
      return NextResponse.json(
        { ok: false, meddelande: "Anställningsnummer saknas för medarbetaren." },
        { status: 404 },
      );
    }

    const client = (await getFortnoxClient()) as any;
    const accessToken: string = client.accessToken;

    const res = await fetch(
      `https://api.fortnox.se/3/employees/${encodeURIComponent(anstNr)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, meddelande: `Fortnox ${res.status}: ${await res.text()}` },
        { status: 502 },
      );
    }
    const body = await res.json();
    const emp: any = body.Employee || {};

    const betalda = numeriskt(emp.VacationDaysPaid);
    const obetalda = numeriskt(emp.VacationDaysUnpaid);
    const sparade = sumSparade(emp);

    const saldoKr = numeriskt(emp.ATKValue);
    const timmar = numeriskt(avtalRes.data?.atk_ledig_tim);
    const timlon = numeriskt(emp.HourlyPay);

    return NextResponse.json({
      ok: true,
      anstallningsnummer: anstNr,
      semester: { betalda, obetalda, sparade },
      atk: { saldo_kr: saldoKr, timmar },
      lon: { timlon },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, meddelande: e.message || String(e) },
      { status: 500 },
    );
  }
}

function numeriskt(v: any): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

// Summerar alla Fortnox-fält som heter VacationDaysSaved*, Saved1..Saved6+.
// Vi vet inte exakt shape – stöd både platta fält och ev. nested array.
function sumSparade(emp: any): number {
  let total = 0;
  for (const [k, v] of Object.entries(emp)) {
    if (!k.startsWith("VacationDaysSaved")) continue;
    if (Array.isArray(v)) {
      for (const item of v) total += numeriskt((item as any)?.Days ?? item);
    } else if (v && typeof v === "object") {
      for (const inner of Object.values(v as any)) total += numeriskt(inner);
    } else {
      total += numeriskt(v);
    }
  }
  return Math.round(total * 10) / 10;
}
