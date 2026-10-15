import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";
import { beraknaLoneunderlag } from "@/lib/lonesystem/loneunderlag";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { blockerandeLonearter } from "@/lib/lonesystem/loneartSaknas";

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
 * En löneart som HAR ett antal men saknar kod i mappningen stoppar den skarpa sändningen (409, `blockerande`) innan en enda rad
 * gått iväg. Admin kan UTTRYCKLIGEN välja att skicka utan de raderna: `skicka_utan_saknade: true` (bara det booleska true räknas).
 * Då skickas allt utom dem och svaret säger vilka som uteblev (`utelamnade`) — de läggs inte på senare av sig själva.
 * Premielönen är frivillig och blockerar aldrig (lib/lonesystem/loneart).
 *
 * Beräkningen bor i lib/lonesystem/loneunderlag.ts (delad med förarens
 * tidsspecifikation). Routen är ett skal: auth → beräkna → returnera/skicka.
 */
export async function POST(req: NextRequest) {
  // Allas löneunderlag + skarp Fortnox-sändning: admin, inget annat.
  // (Var helt öppen — oinloggad POST gav alla förares underlag.)
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const body = await req.json();
    const period: string = body.period;
    const filterIds: string[] | undefined = body.medarbetare_ids;
    const dryRun: boolean = body.dry_run ?? false;
    const skickaUtanSaknade: boolean = body.skicka_utan_saknade === true;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ ok: false, meddelande: "period krävs (YYYY-MM)." }, { status: 400 });
    }

    const supabase = serverSupabase();
    // medMaskintid bara i dry_run (kontrollvyn Dagar, admin) — aldrig i sändningen,
    // aldrig i förarens egen spec (min-manad begär den inte).
    const u = await beraknaLoneunderlag(supabase, { period, medarbetareIds: filterIds, medMaskintid: !!dryRun });
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
        // Samma lista som sändningen stoppas av: förhandsvisningen visar de röda raderna ur den.
        blockerande: blockerandeLonearter(resultat),
        kopplingar: u.kopplingar,
      });
    }

    // En löneart utan kod i mappningen får aldrig bli en tyst saknad rad i en skarp sändning: stoppa före första raden —
    // om inte admin uttryckligen valt att skicka utan dem.
    const blockerande = blockerandeLonearter(resultat);
    if (blockerande.length > 0 && !skickaUtanSaknade) {
      const namn = blockerande.map(b => b.label).join(", ");
      return NextResponse.json({
        ok: false,
        kod: "LONEART_SAKNAS",
        blockerande,
        meddelande: `Löneartskod saknas för ${namn}. Koppla koden under Lön → Lönearter, eller välj att skicka utan de raderna. Inget är skickat.`,
      }, { status: 409 });
    }
    const utelamnade = blockerande.flatMap(b => b.forare.map(f => ({ namn: f.namn, loneart: b.loneart, label: b.label, mangd: f.mangd, enhet: b.enhet })));

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
      utelamnade,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
