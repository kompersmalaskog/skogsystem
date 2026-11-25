// Admin → Lön → Förarens månad: vymodellen. Allt här är UPPSTÄLLNING av det lönemotorn redan räknat (dry_run-svaret = samma
// beräkning som exporten och förarens spec) — inget tal räknas om. Det enda som läggs ihop är dagarnas km för förklaringen
// "körda / över gränsen" (kmUppdelning, samma funktion som förarens spec) och längden på en lista.
//
// Tid skrivs som tim och min med decimalen i parentes ("42 tim 10 min (42,17)"): Fortnox och lönen räknar i decimal, så de
// som stämmer av mot lönebeskedet ser båda. Dagraderna skrivs bara i tim och min.
import { loneartInfo } from "@/lib/lonesystem/loneart";
import { minText, dagAvvikelser, kmUppdelning } from "@/lib/lonesystem/forarText";
import { ordinarieText } from "@/lib/lonesystem/manadsordinarie";
import { dagText, synkVisas } from "@/lib/admin/loneunderlagVy";
import { kvotDetalj, kvotMaskinText, kvotVarde, summeraKvot } from "@/lib/admin/lonekvot";
import type { ExtraPost } from "@/lib/lonesystem/loneunderlag";

const DAG = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

/** 42.1666 → "42,17" */
export const dec2 = (h: number) => (Math.round((Number(h) || 0) * 100) / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Minuter → "42 tim 10 min (42,17)". `h` är motorns egen decimal när den finns (annars min/60). */
export function tidMedDecimal(min: number, h?: number): string {
  return `${minText(min)} (${dec2(h ?? min / 60)})`;
}

export type VyRadDel = { nyckel: string; text: string; varde: string };
/** `utanKod`: raden har ett antal men ingen löneart i Fortnox — "saknar" stoppar sändningen, "valfri" (premien) hoppas över. */
export type VyLonerad = { nyckel: string; rubrik: string; varde: string; detalj: string | null; utanKod: "saknar" | "valfri" | null };
export type VyExtra = { nyckel: string; datum: string; text: string; tid: string; kommentar: string | null };
export type VyKm = { totalt: string; over: string | null; mil: string; sa: string; dagarOver: { datum: string; text: string }[]; perTrakt: VyMilTrakt[] };
/** En rad under en trakt: dagar i följd med samma km. `rakning` = "218 km – 60 = 16 mil per dag". `avviker` finns bara när
 *  förarens egna km är minst 10 % fler än appens: "Föraren skrev 218 km · appen räknade 198 km". */
export type VyMilRad = { nyckel: string; datum: string; dagar: number; rakning: string; avviker: string | null; mil: string };
export type VyMilTrakt = { trakt: string; mil: string; rader: VyMilRad[] };
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
  /** Vad maskinen loggade när föraren skrev en annan tid (orange i den utfällda dagen). */
  maskinLogg: string | null;
  extra: VyExtra[];
};

/** Lönekvot: samma uppställning och samma tal som Dagar (lib/admin/lonekvot) — maskinens G15 under förarens inloggning mot betald tid. */
export type VyLonekvot = { varde: string; maskin: string; detalj: string };

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
  lonekvot: VyLonekvot;
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

/**
 * Den utfällda dagen säger BARA det som inte redan står på dagens rad (klockslag, tid, hem → trakt, km och mil står där).
 * Det nya: maskinen och rasten, vad maskinen loggade när den skiljer sig (orange, `maskinLogg`), km per väg, OB, traktamente
 * och om föraren bekräftat dagen.
 */
function dagDetaljer(d: any, maskinNamn: Record<string, string>): string[] {
  const ut: string[] = [];
  const maskin = d.maskin_id ? `Maskin ${maskinNamn[d.maskin_id] || d.maskin_id}` : d.perioddag ? "Perioddag, ingen maskin" : "Ingen maskin";
  const harTider = !!(d.start_tid || d.slut_tid);
  ut.push(harTider ? `${maskin}${d.rast_min ? "" : " · ingen rast"}` : `${maskin} · inga klockslag, tiden ligger i perioder`);
  if (d.extra_min > 0) ut.push(`Maskintid ${minText(d.arbetad_min)} + extra tid ${minText(d.extra_min)}`);
  if ((d.objekt || []).length > 1) ut.push(`Trakter: ${d.objekt.join(", ")}`);
  // Km per väg. Är km förarens egen står vad appen hade fått inom parentes — bara visning.
  if (d.km_rutt && (d.km_morgon > 0 || d.km_kvall > 0)) {
    const appen = d.km_kalla === "forare" ? d.km_rutt.appen : null;
    const hem = d.km_rutt.sista === d.km_rutt.forsta ? "hem" : `hem från ${d.km_rutt.sista}`;
    ut.push(`Dit ${kmText(d.km_morgon)} · ${hem} ${kmText(d.km_kvall)}${appen ? ` (appen ${kmText(appen.morgon)} + ${kmText(appen.kvall)})` : ""}`);
  }
  if (d.ob_min > 0) ut.push(`OB ${minText(d.ob_min)}`);
  if (d.traktamente) ut.push("Traktamente");
  ut.push(d.bekraftad ? "Bekräftad av föraren" : "Inte bekräftad");
  return ut;
}

/** "Maskinen loggade 07:34–15:53 – 27 min kortare". Ur synkraden ("07:34-15:53 rast 0"); null när skillnaden inte visas. */
function maskinLoggText(s: { diff_min: number; maskinen: string } | undefined): string | null {
  if (!s || !synkVisas(s.diff_min)) return null;
  const m = /^(\S+)-(\S+) rast (\d+)/.exec(s.maskinen || "");
  const tider = m ? `${hm(m[1]) || m[1]}–${hm(m[2]) || m[2]}${Number(m[3]) > 0 ? ` · rast ${minText(Number(m[3]))}` : ""}` : s.maskinen;
  return `Maskinen loggade ${tider} – ${Math.abs(s.diff_min)} min ${s.diff_min > 0 ? "kortare" : "längre"}`;
}

/** Förarens egna km räknas som avvikande från appens när de är minst så här mycket fler (bara en markering, ingen varning). */
export const APPEN_AVVIKER_ANDEL = 0.1;

const intervall = (forsta: string, sista: string) =>
  forsta === sista ? dagText(forsta)
    : forsta.slice(0, 7) === sista.slice(0, 7) ? `${Number(forsta.slice(8, 10))}–${dagText(sista)}` : `${dagText(forsta)}–${dagText(sista)}`;

/**
* Dagarna över km-gränsen, per trakt: trakten är rubriken med sina mil, och dagar i följd med samma km är EN rad med
 * uträkningen rakt ut ("13–16 okt · 4 dagar · 218 km – 60 = 16 mil per dag"). Summan av trakternas mil är summan av
 * dagarnas ersättningsmil (motorns tal; uträkningen visar bara hur det blev så).
 */
export function milPerTrakt(dagar: any[], grans = 60): VyMilTrakt[] {
  type Arb = { rad: VyMilRad & { _sig: string; _sista: string; _mil: number; _milDag: number; _km: number }; trakt: string };
  const grupper = new Map<string, { mil: number; rader: Arb["rad"][] }>();
  let forra: Arb | null = null;
  for (const d of dagar) {
    const r = d.km_rutt;
    const trakt = !r ? "Trakt okänd" : r.forsta === r.sista ? r.forsta : `${r.forsta} → ${r.sista}`;
    const appenKm = d.km_kalla === "forare" && r?.appen ? Number(r.appen.totalt) : null;
    const avviker = appenKm != null && appenKm > 0 && Number(d.km_totalt) >= appenKm * (1 + APPEN_AVVIKER_ANDEL)
      ? `Föraren skrev ${kmText(d.km_totalt)} · appen räknade ${kmText(appenKm)}` : null;
    const sig = [d.km_totalt, avviker ?? "", d.ersattningsmil].join("|");
    if (!grupper.has(trakt)) grupper.set(trakt, { mil: 0, rader: [] });
    const g = grupper.get(trakt)!;
    g.mil += Number(d.ersattningsmil);
    if (forra && forra.trakt === trakt && forra.rad._sig === sig) {
      forra.rad.dagar += 1; forra.rad._sista = d.datum; forra.rad._mil += Number(d.ersattningsmil);
      continue;
    }
    const rad: Arb["rad"] = {
      nyckel: d.datum, datum: "", dagar: 1, rakning: "", avviker,
      mil: "", _sig: sig, _sista: d.datum, _mil: Number(d.ersattningsmil), _milDag: Number(d.ersattningsmil), _km: Number(d.km_totalt),
    };
    g.rader.push(rad);
    forra = { rad, trakt };
  }
  return [...grupper.entries()].map(([trakt, g]) => ({
    trakt,
    mil: `${g.mil} mil`,
    rader: g.rader.map(({ _sig, _sista, _mil, _milDag, _km, ...r }) => ({
      ...r,
      datum: `${intervall(r.nyckel, _sista)}${r.dagar > 1 ? ` · ${r.dagar} dagar` : ""}`,
      rakning: `${kmText(_km)} – ${grans} = ${_milDag} mil${r.dagar > 1 ? " per dag" : ""}`,
      mil: `${_mil} mil`,
    })),
  }));
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
  const lonerader: VyLonerad[] = ((m.lonerader || []) as { loneart: string; mangd: string; beskrivning: string; status?: string }[])
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
      const utanKod = r.status === "saknar_kod" ? "saknar" as const : r.status === "valfri_utan_kod" ? "valfri" as const : null;
      return { nyckel: r.loneart, rubrik: info?.label ?? r.loneart, varde, detalj, utanKod };
    });

  // Mil: totalen och det ersättningsgrundande är motorns (kor_mil, ersattningsmil per dag); uppdelningen är förarspecens egen funktion.
  const dagarRå = (m.dagar || []) as any[];
  const kd = kmUppdelning(dagarRå, Number(m.km_grans ?? 60));
  const km: VyKm = {
    totalt: kmText(kd.totalKm),
    over: kd.overKm > 0 ? `${kmText(kd.overKm)} över ${m.km_grans} km/dag` : null,
    mil: `${Number(m.kor_mil)} mil`,
    sa: `Körning över ${m.km_grans ?? 60} km per dag ersätts (hem → skogen → hem), avrundat uppåt till hel mil.`,
    perTrakt: milPerTrakt(dagarRå.filter(d => d.ersattningsmil > 0), Number(m.km_grans ?? 60)),
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
  const synk = new Map<string, number>(((m.synk || []) as any[]).filter(s => synkVisas(s.diff_min)).map(s => [s.datum, s.diff_min]));
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
      maskinLogg: maskinLoggText(((m.synk || []) as any[]).find(x => x.datum === d.datum)),
      extra: extraPerDatum.get(d.datum) || [],
    };
  });

  // Lönekvoten ur SAMMA dagar och samma regler som Dagar: betald tid = maskintid vid maskinen + extra tid, utan avrundning per dag.
  const kvot = summeraKvot(dagarRå.map(d => ({ min: (d.arbetad_min || 0) + (d.extra_min || 0), maskintid: d.maskintid })));

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
    lonekvot: { varde: kvotVarde(kvot), maskin: kvotMaskinText(kvot), detalj: kvotDetalj(kvot) },
    km,
    dagar,
  };
}
