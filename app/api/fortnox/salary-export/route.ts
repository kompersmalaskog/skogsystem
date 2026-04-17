import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";
import { beräknaExport, arbetsperiodFrånLöneperiod } from "@/lib/lonesystem/loneberakning";

/**
 * POST /api/fortnox/salary-export
 * Body: { period: "2026-04", medarbetare_ids?: string[], dry_run?: boolean }
 *
 * period = LÖNEPERIOD (en månad efter arbetstiden).
 * Löneperiod mars 2026 → arbetstid februari 2026.
 *
 * dry_run=true: returnerar beräkningar utan att skicka till Fortnox.
 * dry_run=false (default): skickar salary transactions till Fortnox.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const period: string = body.period;
    const filterIds: string[] | undefined = body.medarbetare_ids;
    const dryRun: boolean = body.dry_run ?? false;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ ok: false, meddelande: "period krävs (YYYY-MM)." }, { status: 400 });
    }

    const supabase = serverSupabase();
    // Löneperiod → arbetsperiod (en månad bakåt)
    const arbetsperiod = arbetsperiodFrånLöneperiod(period);
    const [aÅ, aM] = arbetsperiod.split("-").map(Number);
    const arbStart = arbetsperiod + "-01";
    const arbSlut = new Date(aÅ, aM, 0).toISOString().slice(0, 10);

    // Ladda data
    const [medRes, arbRes, maskinRes, mappRes, loggRes] = await Promise.all([
      supabase.from("medarbetare").select("id, namn").order("namn"),
      supabase.from("arbetsdag")
        .select("medarbetare_id, datum, arbetad_min, maskin_id, km_totalt, bekraftad, dagtyp")
        .gte("datum", arbStart).lte("datum", arbSlut),
      supabase.from("maskiner").select("maskin_id, typ"),
      supabase.from("medarbetare_lonesystem")
        .select("medarbetare_id, anstallningsnummer"),
      supabase.from("fortnox_export_logg")
        .select("medarbetare_id, status")
        .eq("period", period),
    ]);

    if (medRes.error) throw medRes.error;
    if (arbRes.error) throw arbRes.error;

    // Maskintyp-map
    const maskinTypMap: Record<string, "skordare" | "skotare"> = {};
    for (const m of (maskinRes.data || [])) {
      if (m.maskin_id && (m.typ === "skordare" || m.typ === "skotare")) {
        maskinTypMap[m.maskin_id] = m.typ;
      }
    }

    // Anställningsnummer-map
    const anstMap: Record<string, string> = {};
    for (const ml of (mappRes.data || [])) {
      if (ml.medarbetare_id && ml.anstallningsnummer) {
        anstMap[ml.medarbetare_id] = ml.anstallningsnummer;
      }
    }

    // Redan skickade
    const redanSkickad = new Set<string>();
    for (const l of (loggRes.data || [])) {
      if (l.status === "skickat") redanSkickad.add(l.medarbetare_id);
    }

    // Gruppera arbetsdagar per medarbetare
    const dagPerMed = new Map<string, typeof arbRes.data>();
    for (const d of (arbRes.data || [])) {
      if (!d.medarbetare_id) continue;
      if (!dagPerMed.has(d.medarbetare_id)) dagPerMed.set(d.medarbetare_id, []);
      dagPerMed.get(d.medarbetare_id)!.push(d);
    }

    // Beräkna per medarbetare
    const medarbetare = (medRes.data || []) as { id: string; namn: string }[];
    const resultat: (ExportSammanfattning & { status: string })[] = [];

    for (const med of medarbetare) {
      if (filterIds && !filterIds.includes(med.id)) continue;
      const dagar = dagPerMed.get(med.id) || [];
      if (dagar.length === 0) continue;

      const anstNr = anstMap[med.id] || "";
      const export_ = beräknaExport(med.id, med.namn, anstNr, dagar, maskinTypMap, period); // period = löneperiod

      let status = "utkast";
      if (redanSkickad.has(med.id)) status = "skickat";

      resultat.push({ ...export_, status });
    }

    // Dry run — returnera beräkningar utan att skicka
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        period,
        arbetsperiod,
        medarbetare: resultat,
        totalt_rader: resultat.reduce((s, r) => s + r.rader.length, 0),
      });
    }

    // Skicka till Fortnox
    const client = await getFortnoxClient();
    let skickade = 0;
    let fel = 0;
    const felMeddelanden: string[] = [];

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
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
