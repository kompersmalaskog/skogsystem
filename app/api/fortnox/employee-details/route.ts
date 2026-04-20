import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

/**
 * GET /api/fortnox/employee-details?medarbetare_id=<uuid>
 *
 * Hämtar semester- och ATK-saldo från Fortnox för given medarbetare.
 * Semester: VacationDaysPaid + VacationDaysSaved - VacationDaysRegisteredPaid.
 * ATK: ATKValue (kr). Timmar = saldo / timlön (Fortnox HourlyPay,
 * fallback till gs_avtal.timlon_kr). Om timlön saknas returneras timmar=null.
 * gs_avtal-raden som väljs är den där giltigt_fran <= idag och
 * (giltigt_till IS NULL OR giltigt_till >= idag).
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
    const idag = new Date().toISOString().slice(0, 10);

    const [mappRes, avtalRes] = await Promise.all([
      supabase
        .from("medarbetare_lonesystem")
        .select("anstallningsnummer")
        .eq("medarbetare_id", medarbetareId)
        .maybeSingle(),
      supabase
        .from("gs_avtal")
        .select("*")
        .lte("giltigt_fran", idag)
        .or(`giltigt_till.is.null,giltigt_till.gte.${idag}`)
        .order("giltigt_fran", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const avtal = avtalRes.data;
    console.log("[employee-details] gs_avtal vald:", avtal
      ? { id: avtal.id, namn: avtal.namn, giltigt_fran: avtal.giltigt_fran, giltigt_till: avtal.giltigt_till, timlon_kr: avtal.timlon_kr }
      : null);

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
    const sparade = numeriskt(emp.VacationDaysSaved);
    const uttagna = numeriskt(emp.VacationDaysRegisteredPaid);
    const kvar = Math.max(0, Math.round((betalda + sparade - uttagna) * 10) / 10);

    const saldoKr = numeriskt(emp.ATKValue);
    const timlonFortnox = numeriskt(emp.HourlyPay);
    const timlonAvtal = numeriskt(avtal?.timlon_kr);
    const timlon = timlonFortnox > 0 ? timlonFortnox : timlonAvtal;
    const timmar = timlon > 0 ? Math.round((saldoKr / timlon) * 10) / 10 : null;

    return NextResponse.json({
      ok: true,
      anstallningsnummer: anstNr,
      semester: { betalda, obetalda, sparade, uttagna, kvar },
      atk: { saldo_kr: saldoKr, timmar },
      lon: { timlon },
      gs_avtal_vald: avtal
        ? { id: avtal.id, namn: avtal.namn, giltigt_fran: avtal.giltigt_fran, giltigt_till: avtal.giltigt_till }
        : null,
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
