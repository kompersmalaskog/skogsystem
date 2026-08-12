import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";
import { beräknaExport, arbetsperiodFrånLöneperiod } from "@/lib/lonesystem/loneberakning";
import { sistaDagenIManaden } from "@/lib/datumLokal";

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
    const arbSlut = sistaDagenIManaden(aÅ, aM); // LOKALT — toISOString tappade sista dagen i UTC+2

    // Ladda data
    const [medRes, arbRes, extraRes, maskinRes, mappRes, loggRes, ledRes, avtalRes] = await Promise.all([
      supabase.from("medarbetare").select("id, namn").order("namn"),
      supabase.from("arbetsdag")
        .select("medarbetare_id, datum, arbetad_min, maskin_id, km_totalt, bekraftad, dagtyp")
        .gte("datum", arbStart).lte("datum", arbSlut),
      // Extra tid = arbete när maskinen var av — arbetstid rakt av,
      // ska in i timlön/övertid (arbetad_min ser den inte)
      supabase.from("extra_tid")
        .select("medarbetare_id, datum, minuter")
        .gte("datum", arbStart).lte("datum", arbSlut),
      supabase.from("maskiner").select("maskin_id, typ"),
      supabase.from("medarbetare_lonesystem")
        .select("medarbetare_id, anstallningsnummer"),
      supabase.from("fortnox_export_logg")
        .select("medarbetare_id, status")
        .eq("period", period),
      // Godkänd ledighet som ÖVERLAPPAR arbetsperioden (start <= arbSlut och
      // slut >= arbStart). Primär frånvarokälla; loneberakning tillämpar
      // "arbete vinner" + begränsar till arbetsperiodens månad.
      supabase.from("ledighet_ansokningar")
        .select("medarbetare_id, typ, startdatum, slutdatum, status")
        .eq("status", "godkänd")
        .lte("startdatum", arbSlut).gte("slutdatum", arbStart),
      // Fri pendling km/dag — samma fält som appen (km_grans_per_dag), aldrig
      // hårdkodad 60. Fortnox äger kr/mil-satsen, vi skickar bara mil-antalet.
      supabase.from("gs_avtal").select("km_grans_per_dag")
        .order("giltigt_fran", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (medRes.error) throw medRes.error;
    if (arbRes.error) throw arbRes.error;
    if (extraRes.error) throw extraRes.error;

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

    // Gruppera extra tid per medarbetare (OBS: filtret på medarbetare_id är
    // bärande — en förares extra tid får aldrig hamna på någon annan)
    const extraPerMed = new Map<string, { datum: string | null; minuter: number | null }[]>();
    for (const e of (extraRes.data || [])) {
      if (!e.medarbetare_id) continue;
      if (!extraPerMed.has(e.medarbetare_id)) extraPerMed.set(e.medarbetare_id, []);
      extraPerMed.get(e.medarbetare_id)!.push({ datum: e.datum, minuter: e.minuter });
    }

    // Gruppera godkänd ledighet per medarbetare (medarbetare_id bär identiteten —
    // anvandare_id är fritext och används aldrig för koppling)
    const ledPerMed = new Map<string, { typ: string; startdatum: string; slutdatum: string }[]>();
    for (const l of (ledRes.data || [])) {
      if (!l.medarbetare_id) continue;
      if (!ledPerMed.has(l.medarbetare_id)) ledPerMed.set(l.medarbetare_id, []);
      ledPerMed.get(l.medarbetare_id)!.push({ typ: l.typ, startdatum: l.startdatum, slutdatum: l.slutdatum });
    }

    // Fri pendling km/dag ur avtalet (fallback 60) — matas in i beräkningen
    const kmGrans = avtalRes.data?.km_grans_per_dag ?? 60;

    // Beräkna per medarbetare
    const medarbetare = (medRes.data || []) as { id: string; namn: string }[];
    const resultat: (ExportSammanfattning & { status: string })[] = [];

    for (const med of medarbetare) {
      if (filterIds && !filterIds.includes(med.id)) continue;
      const dagar = dagPerMed.get(med.id) || [];
      const extra = extraPerMed.get(med.id) || [];
      const ledigheter = ledPerMed.get(med.id) || [];
      // Extra-only-månad (arbete utan ett enda maskinpass) ska också med —
      // det är arbetstid; beräkningen varnar då om ordinarie-effekten. Även en
      // ren frånvaromånad (bara ledighet) ska med så frånvaron syns.
      if (dagar.length === 0 && extra.length === 0 && ledigheter.length === 0) continue;

      const anstNr = anstMap[med.id] || "";
      const export_ = beräknaExport(med.id, med.namn, anstNr, dagar, maskinTypMap, period, extra, ledigheter, kmGrans); // period = löneperiod

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
