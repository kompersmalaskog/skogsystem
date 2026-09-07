import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";
import { beraknaLoneunderlag } from "@/lib/lonesystem/loneunderlag";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";

/**
 * POST /api/fortnox/salary-export
 * Body: { period: "2026-04", medarbetare_ids?: string[], dry_run?: boolean }
 *
 * period = LÖNEPERIOD (en månad efter arbetstiden).
 * Löneperiod mars 2026 → arbetstid februari 2026.
 *
 * dry_run=true: returnerar beräkningar utan att skicka till Fortnox.
 * dry_run=false (default): skickar salary transactions till Fortnox.
 *
 * Beräkningen bor i lib/lonesystem/loneunderlag.ts (delad med förarens
 * tidsspecifikation). Routen är ett skal: auth → beräkna → returnera/skicka.
 */
export async function POST(req: NextRequest) {
  // Allas löneunderlag + skarp Fortnox-sändning: admin/chef, inget annat.
  // (Var helt öppen — oinloggad POST gav alla förares underlag.)
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const body = await req.json();
    const period: string = body.period;
    const filterIds: string[] | undefined = body.medarbetare_ids;
    const dryRun: boolean = body.dry_run ?? false;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ ok: false, meddelande: "period krävs (YYYY-MM)." }, { status: 400 });
    }

    const supabase = serverSupabase();
    const u = await beraknaLoneunderlag(supabase, { period, medarbetareIds: filterIds });
    const { arbetsperiod, resultat, synkAvvikelser } = u;

    // Dry run — returnera beräkningar utan att skicka (berikat per medarbetare
    // för granskningsvyn — samma objekt som förarspecen läser).
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        period,
        arbetsperiod,
        medarbetare: u.berikad,
        totalt_rader: u.totalt_rader,
        synkAvvikelser,
        oenighet: u.oenighet,
      });
    }

    // Skicka till Fortnox
    const client = await getFortnoxClient();
    let skickade = 0;
    let fel = 0;
    const felMeddelanden: string[] = [];
    const redanSkickad = new Set(resultat.filter(r => r.status === "skickat").map(r => r.medarbetare_id));

    for (const r of resultat) {
      if (r.status === "skickat") continue;
      if (!r.anstallningsnummer) {
        felMeddelanden.push(`${r.namn}: anställningsnummer saknas.`);
        fel++;
        continue;
      }
      if (r.rader.length === 0) continue;

      try {
        for (const rad of r.rader) {
          await client.sendSalaryTransaction({
            EmployeeId: rad.EmployeeId,
            SalaryCode: rad.SalaryCode,
            Number: parseFloat(rad.Number),
            Amount: 0,
            Date: rad.Date,
            TextRow: rad.beskrivning,
          });
          skickade++;
        }
        // Logga framgång
        await supabase.from("fortnox_export_logg").upsert({
          medarbetare_id: r.medarbetare_id,
          period,
          status: "skickat",
          rader: r.rader,
          skickad_at: new Date().toISOString(),
        }, { onConflict: "medarbetare_id,period" });
      } catch (e: any) {
        fel++;
        const msg = `${r.namn}: ${e.message || String(e)}`;
        felMeddelanden.push(msg);
        await supabase.from("fortnox_export_logg").upsert({
          medarbetare_id: r.medarbetare_id,
          period,
          status: "fel",
          rader: r.rader,
          fel_meddelande: msg,
        }, { onConflict: "medarbetare_id,period" });
      }
    }

    return NextResponse.json({
      ok: fel === 0,
      period,
      skickade,
      fel,
      felMeddelanden,
      medarbetare: resultat.map(r => ({
        namn: r.namn,
        rader: r.rader.length,
        status: redanSkickad.has(r.medarbetare_id) ? "skickat" : (r.anstallningsnummer ? "skickat" : "fel"),
      })),
      synkAvvikelser,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
