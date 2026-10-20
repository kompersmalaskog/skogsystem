// Admin → Lön → Förarens månad: vymodellen. Allt här är UPPSTÄLLNING av det lönemotorn redan räknat (dry_run-svaret = samma
// beräkning som exporten och förarens spec) — inget tal räknas om. Det enda som läggs ihop är dagarnas km för förklaringen
// "körda / över gränsen" (kmUppdelning, samma funktion som förarens spec) och längden på en lista.
//
// Tid skrivs som tim och min med decimalen i parentes ("42 tim 10 min (42,17)"): Fortnox och lönen räknar i decimal, så de
// som stämmer av mot lönebeskedet ser båda. Dagraderna skrivs bara i tim och min.
import { loneartInfo } from "@/lib/lonesystem/loneart";
import { minText, dagAvvikelser, kmUppdelning } from "@/lib/lonesystem/forarText";
import { ordinarieText } from "@/lib/lonesystem/manadsordinarie";
import { dagText } from "@/lib/admin/loneunderlagVy";
import type { ExtraPost } from "@/lib/lonesystem/loneunderlag";

const DAG = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

/** 42.1666 → "42,17" */
export const dec2 = (h: number) => (Math.round((Number(h) || 0) * 100) / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Minuter → "42 tim 10 min (42,17)". `h` är motorns egen decimal när den finns (annars min/60). */
export function tidMedDecimal(min: number, h?: number): string {
  return `${minText(min)} (${dec2(h ?? min / 60)})`;
}

export type VyRadDel = { nyckel: string; text: string; varde: string };
export type VyLonerad = { nyckel: string; rubrik: string; varde: string; detalj: string | null };
export type VyExtra = { nyckel: string; datum: string; text: string; tid: string; kommentar: string | null };
export type VyKm = { totalt: string; over: string | null; mil: string; sa: string; dagarOver: { datum: string; text: string }[] };
export type VyDag = {
  nyckel: string;
  datum: string;
  rubrik: string;
  /** Raden under: start–slut · rast · extra tid · km med källa — bara tim och min. `radDelar` är samma rad i bitar som inte bryts mitt i. */
  rad: string;
  radDelar: string[];
  /** Samma rad i två rader: tider (start–slut · rast · extra tid) och plats/km (Hem → trakt · km med källa · → mil). */
  radTid: string[];
  radKm: string[];
  tid: string;
  avvikelser: string[];
  detalj: string[];
  extra: VyExtra[];
};

export type ForarManadVy = {
  namn: string;
  foretagsledare: boolean;
  /** Svaret överst. */
  overtid: string;
  utrakning: {
    delar: VyRadDel[];
    arbetat: string;
    ordinarie: string;
    ordinarieForklaring: string;
    overtid: string;
    notis: string | null;
    extra: VyExtra[];
  };
  lonerader: VyLonerad[];
  km: VyKm;
  dagar: VyDag[];
};

const hm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : "");
const kmText = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} km`;

/** Källan i klartext: 'auto' = beräknad, 'forare' = förarens egen (märkt "egen"), annars ingen uppgift (dagar från före källan sparades). */
export function kmKallaText(k: string | null | undefined): string {
  return k === "auto" ? "beräknad" : k === "forare" ? "egen" : "ingen uppgift";
}

/** Dagens km med källa: "113 km beräknad", "160 km egen (appen: 118 km)", "68 km ingen uppgift". Appens värde bara när föraren har skrivit egen km
 *  och routing gick att räkna — det är en jämförelse, dagens km och lönen är de egna. */
function kmDagText(d: any): string {
  const appen = d.km_kalla === "forare" ? d.km_rutt?.appen : null;
  return `${kmText(d.km_totalt)} ${kmKallaText(d.km_kalla)}${appen ? ` (appen: ${kmText(appen.totalt)})` : ""}`;
}

/** "Hem → trakt": den första trakten dagen började på. Tom när dagens trakt inte är känd. */
const hemTill = (d: any): string | null => (d.km_rutt ? `Hem → ${d.km_rutt.forsta}` : null);

function extraRad(e: ExtraPost, i: number): VyExtra {
  const klockslag = e.start_tid || e.slut_tid ? `${hm(e.start_tid) || "–"}–${hm(e.slut_tid) || "–"}` : null;
  const traktText = e.objekt ? ` · ${e.objekt}` : "";
  return {
    nyckel: `${e.datum}-${i}`,
    datum: e.datum,
    text: `${dagText(e.datum)} · ${e.aktivitet}${traktText}`,
    tid: minText(e.minuter),
    kommentar: [klockslag, e.kommentar].filter(Boolean).join(" · ") || null,
  };
}

function dagDetaljer(d: any, maskinNamn: Record<string, string>): string[] {
  const ut: string[] = [];
  ut.push(d.maskin_id ? `Maskin ${maskinNamn[d.maskin_id] || d.maskin_id}` : d.perioddag ? "Perioddag, ingen maskin" : "Ingen maskin");
  ut.push(d.start_tid || d.slut_tid ? `${hm(d.start_tid) || "–"}–${hm(d.slut_tid) || "–"}${d.rast_min ? ` · rast ${minText(d.rast_min)}` : " · ingen rast"}` : "Inga klockslag, tiden ligger i perioder");
  ut.push(d.extra_min > 0 ? `Maskintid ${minText(d.arbetad_min)} + extra tid ${minText(d.extra_min)}` : `Tid ${minText((d.arbetad_min || 0) + (d.extra_min || 0))}`);
  ut.push((d.objekt || []).length ? `Trakt: ${d.objekt.join(", ")}` : "Ingen trakt");
  // Km: källan alltid med, och trakterna benen gick mellan på ALLA dagar (härledda ur dagens trakter, samma funktion som räknade km). Är km förarens
  // egen står också vad appen hade fått bredvid — bara visning.
  const appen = d.km_kalla === "forare" ? d.km_rutt?.appen : null;
  const ben = (km: number, appenKm: number | undefined) => (km > 0 ? ` · ${kmText(km)}${appenKm != null ? ` (appen: ${kmText(appenKm)})` : ""}` : "");
  if (d.km_rutt) {
    ut.push(`Hem → ${d.km_rutt.forsta}${ben(d.km_morgon, appen?.morgon)}`);
    ut.push(`${d.km_rutt.sista} → Hem${ben(d.km_kvall, appen?.kvall)}`);
  }
  const mil = d.ersattningsmil ? ` · ${d.ersattningsmil} mil ersätts` : "";
  if (d.km_kalla === "auto") ut.push(`Beräknad · ${kmText(d.km_totalt)} totalt${mil}`);
  else if (d.km_kalla === "forare") ut.push(`Egen · ${kmText(d.km_totalt)} totalt${appen ? ` (appen: ${kmText(appen.totalt)})` : ""}${mil}`);
  else ut.push(d.km_totalt ? `${kmText(d.km_totalt)} · ingen uppgift om källa${mil}` : "Ingen uppgift om km");
  if (d.ob_min > 0) ut.push(`OB ${minText(d.ob_min)}`);
  if (d.traktamente) ut.push("Traktamente");
  ut.push(d.bekraftad ? "Bekräftad av föraren" : "Inte bekräftad");
  return ut;
}

export function byggForarManad(m: any, ctx: { rodaDagar: Record<string, string>; maskinNamn: Record<string, string> }): ForarManadVy {
  const a = m.arbetat || { maskin_min: 0, extra_min: 0, kortpass_min: 0, hemskickad_min: 0 };
  const delarMin = Number(a.maskin_min) + Number(a.extra_min) + Number(a.kortpass_min) + Number(a.hemskickad_min);
  // Arbetat = timlön + övertid (motorns decimaler); minuterna är delarnas summa, så raderna summerar exakt.
  const arbetatH = Number(m.timlon_h) + Number(m.overtid_h);

  const delar: VyRadDel[] = [
    { nyckel: "maskin", text: "Maskintid", varde: minText(a.maskin_min) },
    ...(a.extra_min > 0 ? [{ nyckel: "extra", text: "Extra tid", varde: minText(a.extra_min) }] : []),
    ...(a.kortpass_min > 0 ? [{ nyckel: "kortpass", text: "Kortpass (under en arbetsdag)", varde: minText(a.kortpass_min) }] : []),
    ...(a.hemskickad_min > 0 ? [{ nyckel: "hem", text: "Hemskickad, fylls upp till 8 tim", varde: minText(a.hemskickad_min) }] : []),
  ];

  const o = m.ordinarie;
  const ordinarieForklaring = !o ? "" : o.modell === "utjamning"
    ? `${m.arbetsdagar} arbetade dagar × 8 tim (utjämningsperiod)`
    : ordinarieText(o).replace(/(\d)h\b/g, "$1 tim").replace(/ − /g, " − ");
  const notis = ((m.varningar || []) as string[]).find(v => /extra tid ligger på dagar utan maskinpass/.test(v)) ?? null;

  // En extra-post på 0 min (ett tryck som aldrig blev tid) är ingen tid och står inte i uträkningen.
  const extra: VyExtra[] = ((m.extra_poster || []) as ExtraPost[]).filter(e => e.minuter > 0).map(extraRad);
  const extraPerDatum = new Map<string, VyExtra[]>();
  for (const e of extra) { if (!extraPerDatum.has(e.datum)) extraPerDatum.set(e.datum, []); extraPerDatum.get(e.datum)!.push(e); }

  // Lönerader i den ordning motorn lägger dem; övertid står i uträkningen och reseersättningen under Mil.
  const brandrisk = (m.brandrisk?.dagar || []) as { datum: string; start_tid: string; ob_min: number }[];
  const helglonGer = ((m.helglon?.dagar || []) as { datum: string; namn: string; ger: boolean }[]).filter(h => h.ger);
  const lonerader: VyLonerad[] = ((m.lonerader || []) as { loneart: string; mangd: string; beskrivning: string }[])
    .filter(r => !r.loneart.startsWith("overtid") && r.loneart !== "korersattning" && r.loneart !== "valtlappar")
    .map(r => {
      const info = loneartInfo(r.loneart);
      const h = parseFloat(r.mangd);
      const varde = tidMedDecimal(Math.round(h * 60), h);
      let detalj: string | null = null;
      if (r.loneart === "timlon") detalj = `Det som ryms i månadens ordinarie: lägst av arbetat ${minText(delarMin)} och ordinarie ${minText(Math.round(Number(m.ordinarie_h) * 60))}`;
      else if (r.loneart.startsWith("premielon")) detalj = r.beskrivning.replace(/(\d)h\b/g, "$1 tim").replace(/(\d)\.(\d)/g, "$1,$2");
      else if (r.loneart.startsWith("helglon")) detalj = `8 tim per röd vardag: ${helglonGer.map(x => `${dagText(x.datum)} ${x.namn}`).join(", ")}`;
      else if (r.loneart === "brandrisk_ob") detalj = `Beordrade morgnar, start till 06:30: ${brandrisk.map(b => `${dagText(b.datum)} ${b.start_tid} (${minText(b.ob_min)})`).join(", ")}`;
      return { nyckel: r.loneart, rubrik: info?.label ?? r.loneart, varde, detalj };
    });

  // Mil: totalen och det ersättningsgrundande är motorns (kor_mil, ersattningsmil per dag); uppdelningen är förarspecens egen funktion.
  const dagarRå = (m.dagar || []) as any[];
  const kd = kmUppdelning(dagarRå, Number(m.km_grans ?? 60));
  const km: VyKm = {
    totalt: kmText(kd.totalKm),
    over: kd.overKm > 0 ? `${kmText(kd.overKm)} över ${m.km_grans} km/dag` : null,
    mil: `${Number(m.kor_mil)} mil`,
    sa: `Ersättning räknas per dag: km över ${m.km_grans} km (fri pendling), avrundat uppåt till påbörjad mil.`,
    dagarOver: dagarRå.filter(d => d.ersattningsmil > 0).map(d => ({
      datum: d.datum,
      // datum · Hem → trakt · km med källa · → mil
      text: [dagText(d.datum), hemTill(d), kmDagText(d), `→ ${d.ersattningsmil} mil`].filter(Boolean).join(" · "),
    })),
  };

  // Dagarna: samma varningar som Dagar (kontrollvyn) och förarens spec, på dagen de gäller.
  const deldag = new Map<string, any>([
    ...((m.deldagar || []) as any[]).map(x => [x.datum, x] as [string, any]),
    ...((m.hemskickad || []) as any[]).map(h => [h.datum, { typ: "hemskickad", fran_tid: h.fran_tid, till_tid: null }] as [string, any]),
  ]);
  const ledig = new Map<string, string>(((m.ledighetskollision || []) as any[]).map(x => [x.datum, x.typ]));
  const synk = new Map<string, number>(((m.synk || []) as any[]).map(s => [s.datum, s.diff_min]));
  const dagar: VyDag[] = dagarRå.map(d => {
    const min = Math.round((d.arbetad_min || 0) + (d.extra_min || 0));
    const avv = dagAvvikelser(d, {
      rodaDagar: ctx.rodaDagar, deldag: deldag.get(d.datum) || null, ledig: ledig.get(d.datum) || null,
      synkMin: synk.get(d.datum) || null, vilobrott: ((m.vilobrott || []) as any[]).filter(v => v.datum === d.datum), kontroll: true,
    }).map(x => (x === "utan objekt" ? "ingen trakt" : x === "utan maskin" ? "ingen maskin" : x));
    if (min === 0) avv.unshift("ingen tid");
    if (d.extra_min > 0 && !d.arbetad_min && !d.perioddag) avv.push("extra tid utan pass");
    const dt = new Date(`${d.datum}T12:00:00`);
    // Rasten står redan som varning på dagen när den är lång: den visas inte två gånger.
    const radTid = [
      d.start_tid || d.slut_tid ? `${hm(d.start_tid) || "–"}–${hm(d.slut_tid) || "–"}` : null,
      d.rast_min && !avv.some(x => x.startsWith("rast ")) ? `rast ${minText(d.rast_min)}` : null,
      d.extra_min > 0 ? `extra tid ${minText(d.extra_min)}` : null,
    ].filter(Boolean) as string[];
    const radKm = [
      hemTill(d),
      d.km_totalt ? kmDagText(d) : null,
      d.ersattningsmil ? `→ ${d.ersattningsmil} mil` : null,
    ].filter(Boolean) as string[];
    const radDelar = [...radTid, ...radKm];
    const rad = radDelar.join(" · ");
    return {
      nyckel: d.id || d.datum,
      datum: d.datum,
      rubrik: `${DAG[dt.getDay()]} ${dagText(d.datum)}`,
      rad,
      radDelar,
      radTid,
      radKm,
      tid: minText(min),
      avvikelser: avv,
      detalj: dagDetaljer(d, ctx.maskinNamn),
      extra: extraPerDatum.get(d.datum) || [],
    };
  });

  return {
    namn: m.namn,
    foretagsledare: m.foretagsledare === true,
    overtid: tidMedDecimal(Math.round(Number(m.overtid_h) * 60), Number(m.overtid_h)),
    utrakning: {
      delar,
      arbetat: `${minText(delarMin)} (${dec2(arbetatH)})`,
      ordinarie: tidMedDecimal(Math.round(Number(m.ordinarie_h) * 60), Number(m.ordinarie_h)),
      ordinarieForklaring,
      overtid: tidMedDecimal(Math.round(Number(m.overtid_h) * 60), Number(m.overtid_h)),
      notis,
      extra,
    },
    lonerader,
    km,
    dagar,
  };
}
