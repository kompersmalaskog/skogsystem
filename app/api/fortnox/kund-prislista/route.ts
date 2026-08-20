import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getFortnoxClient } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fortnox/kund-prislista?kundnr=1
 *
 * Engångsfråga inför fakturaunderlaget: HAR KUNDEN EN EGEN PRISLISTA?
 *
 * Fortnox artikelpriser kan ligga i prislistor (GET /3/prices/{lista}/{nr}).
 * Har Vida (kundnr 1) en annan lista än standard måste à-prishämtningen bära
 * KUNDEN, inte bara artikelnumret — annars visar underlaget listpriset i
 * stället för Vidas pris. Dokumentationen svarar inte på det; kundobjektet
 * gör det.
 *
 * Kräver ingen ny scope: "customer" är redan beviljad. Kan alltså köras innan
 * article/price-scopen (#430) är på plats.
 *
 * Svarar med prisrelaterade fält + NAMNEN på kundobjektets övriga fält.
 * Inte hela kundobjektet: adress, org.nr och kontaktuppgifter hör inte hemma
 * i ett debugsvar. Fältnamnen räcker för att se vad som finns att hämta.
 *
 * Admin- eller chefsroll krävs.
 */

// Fält vi faktiskt vill se värdet på — allt annat redovisas bara med namn.
const PRISFALT = ["CustomerNumber", "Name", "PriceList", "Currency", "VATType", "TermsOfPayment"];

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ ok: false, meddelande: "Ej inloggad" }, { status: 401 });
    }
    const { data: med } = await authClient
      .from("medarbetare").select("roll").eq("epost", user.email).single();
    if (!med || (med.roll !== "admin" && med.roll !== "chef")) {
      return NextResponse.json({ ok: false, meddelande: "Kräver admin-roll" }, { status: 403 });
    }

    const kundnr = new URL(req.url).searchParams.get("kundnr") || "1";

    let client;
    try {
      client = await getFortnoxClient();
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        lage: "ej_ansluten",
        meddelande: e?.message || "Fortnox är inte anslutet.",
      }, { status: 400 });
    }

    const svar = await client.getCustomer(kundnr);

    // De tre lägena hålls isär — de leder till olika åtgärder.
    if (!svar.ok) {
      if (svar.status === 403) {
        return NextResponse.json({
          ok: false,
          lage: "scope_saknas",
          meddelande: 'Fortnox nekade läsning av kunder. Scopen "customer" saknas i den utdelade token — kör /api/fortnox/auth på nytt.',
          status: svar.status,
        }, { status: 502 });
      }
      if (svar.status === 404) {
        return NextResponse.json({
          ok: false,
          lage: "kund_saknas",
          meddelande: `Kundnummer ${kundnr} finns inte i Fortnox.`,
          status: svar.status,
        }, { status: 404 });
      }
      return NextResponse.json({
        ok: false,
        lage: "fortnox_svarade_inte",
        meddelande: `Fortnox svarade ${svar.status || "inte alls"}.`,
        status: svar.status,
        detalj: svar.text?.slice(0, 500) || null,
      }, { status: 502 });
    }

    const k = svar.customer;
    const varden: Record<string, any> = {};
    for (const f of PRISFALT) if (f in k) varden[f] = k[f];

    const harPrislistefalt = "PriceList" in k;
    const prislista = harPrislistefalt ? (k.PriceList ?? null) : null;

    return NextResponse.json({
      ok: true,
      kundnr,
      varden,
      har_prislistefalt: harPrislistefalt,
      prislista,
      // Bara namnen — inga adress- eller kontaktvärden i ett debugsvar.
      falt_pa_kundobjektet: Object.keys(k).sort(),
      slutsats: !harPrislistefalt
        ? "Kundobjektet saknar PriceList-fält. Artikelpris hämtas då per artikelnummer utan prislista."
        : prislista
          ? `Kunden har prislistan "${prislista}". À-prishämtningen MÅSTE bära kunden — GET /3/prices/${prislista}/{artikelnr}, inte artikelns listpris.`
          : "Kunden har PriceList-fältet men det är tomt — standardprislistan gäller. Nyckla ändå på (kund, artikelnummer) så modellen håller när en kund får egen lista.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
