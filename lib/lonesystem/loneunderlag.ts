// ─────────────────────────────────────────────────────────────
// Löneunderlaget — EN beräkning, tre läsare: Fortnox-exporten (skarp sändning +
// dry_run/granskningsvy), förarens egen tidsspecifikation (/api/lon/min-manad)
// och PDF:en. Lyft ur app/api/fortnox/salary-export/route.ts 2026-09-07 utan
// att ändra utfallet (byte-diff-test: loneunderlag.bytediff.test.ts).
//
// Regler som ärvs härifrån: MÄNGDER, aldrig kronor (Fortnox äger satserna);
// fakt-tabellerna läses aldrig här — allt kommer ur arbetsdag/extra_tid;
// per medarbetare filtreras ALDRIG i klienten utan här (medarbetareIds).
// ─────────────────────────────────────────────────────────────
import { beräknaExport, arbetsperiodFrånLöneperiod, type ExportSammanfattning } from "@/lib/lonesystem/loneberakning";
import { sistaDagenIManaden } from "@/lib/datumLokal";
import { synkAvvikelser as beraknaSynkAvvikelser } from "@/lib/synkAvvikelse";
import { ledighetKollisioner } from "@/lib/ledighetKollision";
import { obMinuter, arTidigVardag, oenighetsMorgnar } from "@/lib/ob";

export type LoneunderlagRad = ExportSammanfattning & { status: string };

export type LoneunderlagBerikad = LoneunderlagRad & {
  ob: { timmar: number; dagar: number; obesvarade: number };
  maskin_utan_typ: string[];
  synk: SynkRad[];
  ledighetskollision: ReturnType<typeof ledighetKollisioner>;
};

export type SynkRad = {
  medarbetare_id: string;
  medarbetare: string;
  datum: string;
  diff_min: number;
  bekraftat: string;
  maskinen: string;
};

export type Loneunderlag = {
  period: string;        // löneperiod YYYY-MM
  arbetsperiod: string;  // arbetsmånad YYYY-MM (period − 1)
  resultat: LoneunderlagRad[];       // det den skarpa sändningen itererar
  berikad: LoneunderlagBerikad[];    // resultat + granskningsdata (dry_run)
  totalt_rader: number;
  synkAvvikelser: SynkRad[];
  oenighet: { datum: string; svar: { medarbetare_id: string; start_tid: string | null; brandrisk_beordrad: boolean; namn: string }[] }[];
};

/**
 * Beräknar löneunderlaget för en LÖNEPERIOD (en månad efter arbetstiden).
 * `medarbetareIds` begränsar till givna medarbetare — förarens egen spec
 * skickar sitt eget id (härlett ur sessionen i routen, aldrig ur klienten).
 */
export async function beraknaLoneunderlag(
  supabase: any,
  p: { period: string; medarbetareIds?: string[] },
): Promise<Loneunderlag> {
  const period = p.period;
  const filterIds = p.medarbetareIds;

  // Löneperiod → arbetsperiod (en månad bakåt)
  const arbetsperiod = arbetsperiodFrånLöneperiod(period);
  const [aÅ, aM] = arbetsperiod.split("-").map(Number);
  const arbStart = arbetsperiod + "-01";
  const arbSlut = sistaDagenIManaden(aÅ, aM); // LOKALT — toISOString tappade sista dagen i UTC+2

  // Ladda data
  const [medRes, arbRes, extraRes, maskinRes, mappRes, loggRes, ledRes, avtalRes] = await Promise.all([
    supabase.from("medarbetare").select("id, namn").order("namn"),
    supabase.from("arbetsdag")
      .select("medarbetare_id, datum, arbetad_min, maskin_id, km_totalt, bekraftad, dagtyp, synk_avvikelse, start_tid, brandrisk_beordrad")
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

  // Ohanterade synk-avvikelser: bekraftade dagar vars maskintider byggts om
  // till andra varden an de bekraftade, och foraren har inte kvitterat annu.
  // VARNAR (blockerar ej) infor lonekorning — talet ar redan i den bekraftade
  // arbetad_min, sa en ohanterad avvikelse = betald tid ingen granskat.
  const _namnMap = new Map((medRes.data || []).map((m: any) => [m.id, m.namn]));
  // Delad lib (lib/synkAvvikelse) — SAMMA beräkning som Lön-flikens kort, så
  // varningen och kortet aldrig kan säga olika om samma dag. Filtrera till
  // ohanterade (oforklarad) och formatera exakt som förr (identiskt utfall).
  const synkAvvikelser: SynkRad[] = beraknaSynkAvvikelser((arbRes.data || []) as any[])
    .filter(r => r.status === 'oforklarad')
    .map(r => ({
      medarbetare_id: r.medarbetare_id,
      medarbetare: (_namnMap.get(r.medarbetare_id) as string | undefined) || r.medarbetare_id,
      datum: r.datum, diff_min: r.deltaMin,
      bekraftat: `${r.bekraftad_start}-${r.bekraftad_slut} rast ${r.bekraftad_rast_min}`,
      maskinen: `${r.mom_start}-${r.mom_slut} rast ${r.mom_rast_min}`,
    }))
    .sort((a, b) => b.diff_min - a.diff_min);
  if (extraRes.error) throw extraRes.error;

  // Ledighet + registrerat arbete samma dag (delad lib — samma sanning som
  // Lön-flikens kort). Grupperas per medarbetare för granskningsvyn.
  const ledKollAlla = ledighetKollisioner((ledRes.data || []) as any[], (arbRes.data || []) as any[]);
  const ledKollMap = new Map<string, typeof ledKollAlla>();
  for (const k of ledKollAlla) {
    if (!ledKollMap.has(k.medarbetare_id)) ledKollMap.set(k.medarbetare_id, []);
    ledKollMap.get(k.medarbetare_id)!.push(k);
  }
  // Brandrisk-oenighet: morgnar där tidiga förare svarat olika (namn på ytan).
  const oenighet = oenighetsMorgnar((arbRes.data || []) as any[]).map(o => ({
    datum: o.datum,
    svar: o.svar.map(s => ({ ...s, namn: (_namnMap.get(s.medarbetare_id) as string | undefined) || s.medarbetare_id })),
  }));

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
  const dagPerMed = new Map<string, any[]>();
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
  const resultat: LoneunderlagRad[] = [];
  // Granskningsdata som INTE går till Fortnox men syns i granskningsvyn:
  // OB-timmar (löneart ej fastställd) + maskiner som saknar typ (tyst borttagen
  // premie). Byggs per medarbetare, slås ihop i dry_run-svaret — den skarpa
  // sändningen rör dem aldrig.
  const obMap = new Map<string, { timmar: number; dagar: number; obesvarade: number }>();
  const maskinUtanTypMap = new Map<string, string[]>();

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

    // OB (lib/ob) — härledd, aldrig lagrad, aldrig en Fortnox-rad
    let obMin = 0, obDagar = 0, obObes = 0;
    for (const d of dagar as any[]) {
      const m = obMinuter(d);
      if (m > 0) { obMin += m; obDagar++; }
      if (d.brandrisk_beordrad == null && arTidigVardag(d)) obObes++;
    }
    obMap.set(med.id, { timmar: Math.round((obMin / 60) * 100) / 100, dagar: obDagar, obesvarade: obObes });

    // Maskiner utan typ i registret → ingen premie beräknas (Daniel-fallet).
    // Non-null maskin_id som inte finns i maskinTypMap = saknad eller otypad.
    const utanTyp = Array.from(new Set(
      (dagar as any[]).map(d => d.maskin_id).filter((mid: any) => mid && !maskinTypMap[mid])
    )) as string[];
    if (utanTyp.length) maskinUtanTypMap.set(med.id, utanTyp);
  }

  // Berikning (dry_run/granskningsvy/förarspec): OB, maskin-luckor,
  // tidsavvikelser, ledighetskollision — allt på ett ställe, ingen parallell
  // beräkning någonstans.
  const berikad: LoneunderlagBerikad[] = resultat.map(r => ({
    ...r,
    ob: obMap.get(r.medarbetare_id) || { timmar: 0, dagar: 0, obesvarade: 0 },
    maskin_utan_typ: maskinUtanTypMap.get(r.medarbetare_id) || [],
    synk: synkAvvikelser.filter(s => s.medarbetare_id === r.medarbetare_id),
    ledighetskollision: ledKollMap.get(r.medarbetare_id) || [],
  }));

  return {
    period,
    arbetsperiod,
    resultat,
    berikad,
    totalt_rader: resultat.reduce((s, r) => s + r.rader.length, 0),
    synkAvvikelser,
    oenighet,
  };
}
