// ─────────────────────────────────────────────────────────────
// VILOBROTT-LISTAN FÖRE/EFTER (2026-10-14): vilka brott försvinner, tillkommer eller ändras när analysen får de gemensamma reglerna —
// veckovilans ändar är vila (tiden före första passet, vilan efter sista passet fram till nu) och ett pass över midnatt slutar nästa dygn.
// Ren jämförelse mellan två analysfunktioner över SAMMA underlag (en export ur prod, scripts/vilobrott-fore-efter.sql); inget skrivs.
// Körs av scripts/vilobrott-fore-efter.ts, som tar den gamla analysen ur git (commit före ändringen) och den nya ur lib/vilobrott.
//
// Varje skillnad får en ORSAK, tagen genom att ta bort EN regel i taget (ablation): försvinner brottet redan när bara "före första passet"
// är med är det den som tog bort det; annars är det "efter sista passet fram till nu". Ett nytt dygnsvilobrott hör till ett pass över
// midnatt. Lagrade rader (tabellen vilobrott) klassas mot den nya analysen: stöds, stöds med ny vila, stöds inte längre (obesvarat
// raderas vid nästa omräkning, besvarat står kvar som revisionsspår).
// ─────────────────────────────────────────────────────────────
import { arTroligtVilobrott, medPerioddagSpann, type Arbetsdag, type Vilobrott, type VilaTrosklar } from "@/lib/vilobrott";
import { sthlmVaggklocka } from "@/lib/sthlmTid";

export type ForeEfterExport = {
  /** Ögonblicket exporten gjordes (ISO, UTC) — räknas om till Stockholms väggklocka som 'nu' i den nya analysen. */
  nu: string;
  /** Första datum i exporten (listan läser tre månader bakåt från den första i månaden). */
  fran?: string;
  trosklar: VilaTrosklar;
  medarbetare: { id: string; namn: string | null }[];
  arbetsdag: { medarbetare_id: string; datum: string; start_tid: string | null; slut_tid: string | null }[];
  extra_tid: { medarbetare_id: string; datum: string; start_tid: string | null; slut_tid: string | null }[];
  /** Tabellen vilobrott: lagrade brott och förarens svar. */
  vilobrott: { medarbetare_id: string; typ: "dygnsvila" | "veckovila"; datum: string; vila_h: number | string | null; besvarat_av_forare: boolean | null; orsak?: string | null }[];
};

export type Analys = (arbetsdagar: Arbetsdag[], trosklar: VilaTrosklar, nu?: Date | null) => Vilobrott[];

export type Skillnad = {
  medarbetare_id: string;
  namn: string;
  typ: "dygnsvila" | "veckovila";
  datum: string;
  slag: "forsvinner" | "tillkommer" | "andrad";
  vila_fore: number | null;
  vila_efter: number | null;
  orsak: string;
  /** Finns en lagrad rad för brottet (tabellen vilobrott) och är den besvarad av föraren? */
  lagrad: "ingen" | "obesvarad" | "besvarad";
};

export type LagradEffekt = {
  medarbetare_id: string;
  namn: string;
  typ: string;
  datum: string;
  vila_h: number | null;
  besvarad: boolean;
  /** Vad som händer med raden vid nästa omräkning av fönstret. */
  utfall: "stods_oforandrat" | "stods_ny_vila" | "stods_inte_obesvarad_raderas" | "stods_inte_besvarad_star_kvar" | "utanfor_underlaget";
  ny_vila_h?: number | null;
  /** Stod raden redan utan stöd i den GAMLA analysen (alltså: inget som den här ändringen orsakar)? */
  stod_utan_stod_redan: boolean;
};

export type ForeEfterResultat = {
  nu: string;
  antal_gamla: number;
  antal_nya: number;
  skillnader: Skillnad[];
  lagrade: LagradEffekt[];
};

/** Standardversion för "före": sista commit före de gemensamma vilareglerna. */
export const FORE_REF_STANDARD = "39ce42b";

/**
 * Kommandoradens argument för scripts/vilobrott-fore-efter.ts: valfri exportfil + `--fore-ref <commit>`, i valfri ordning.
 * (Felet 2026-10-14: utan --fore-ref blev indexet -1 och filen räknades som flaggans värde — exempeldatan kördes i tysthet i stället för
 * exporten. Därför är tolkningen en egen, testad funktion.) Okända flaggor och en saknad flaggvärde är fel, aldrig tyst ignorerade.
 */
export function tolkaArgument(args: string[]): { fil: string | undefined; foreRef: string } {
  let fil: string | undefined;
  let foreRef = FORE_REF_STANDARD;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--fore-ref") {
      const v = args[i + 1];
      if (!v || v.startsWith("--")) throw new Error("--fore-ref saknar värde (en commit eller gren)");
      foreRef = v;
      i++;
    } else if (a.startsWith("--")) {
      throw new Error(`Okänd flagga: ${a}`);
    } else if (fil !== undefined) {
      throw new Error(`Bara en exportfil kan anges (fick både ${fil} och ${a})`);
    } else {
      fil = a;
    }
  }
  return { fil, foreRef };
}

const nyckel = (m: string, typ: string, datum: string) => `${m}|${typ}|${datum}`;
const dagTid = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : "");
const minuter = (t: string) => { const m = t.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const korsarMidnatt = (r: { start_tid?: string | null; slut_tid?: string | null }) => {
  const s = r.start_tid ? minuter(r.start_tid) : null, e = r.slut_tid ? minuter(r.slut_tid) : null;
  return s != null && e != null && e <= s;
};

/**
 * @param gammal analysen FÖRE ändringen (anropas utan `nu`: den känner inte till det)
 * @param ny     analysen EFTER ändringen (anropas med `nu`; `null` = bara "före första passet", för orsaksbestämningen)
 */
export function jamforVilobrott(exp: ForeEfterExport, gammal: Analys, ny: Analys): ForeEfterResultat {
  const nu = sthlmVaggklocka(new Date(exp.nu));
  if (!nu) throw new Error(`Ogiltigt 'nu' i exporten: ${exp.nu}`);
  const namn = new Map(exp.medarbetare.map(m => [m.id, m.namn || m.id.slice(0, 8)]));
  const dagarPer = new Map<string, Arbetsdag[]>();
  const periodPer = new Map<string, Arbetsdag[]>();
  const lagg = (mapp: Map<string, Arbetsdag[]>, id: string, r: Arbetsdag) => { if (!mapp.has(id)) mapp.set(id, []); mapp.get(id)!.push(r); };
  for (const d of exp.arbetsdag) if (d.medarbetare_id) lagg(dagarPer, d.medarbetare_id, d);
  for (const p of exp.extra_tid) if (p.medarbetare_id && p.slut_tid) lagg(periodPer, p.medarbetare_id, p);
  const lagrat = new Map(exp.vilobrott.map(v => [nyckel(v.medarbetare_id, v.typ, v.datum), v]));

  type Rad = Vilobrott & { medarbetare_id: string; dag1?: Arbetsdag };
  const gamla = new Map<string, Rad>();
  const nya = new Map<string, Rad>();
  const nyaUtanSlut = new Set<string>();     // nya reglerna men BARA "före första passet" (nu = null)
  const ids = new Set<string>([...Array.from(dagarPer.keys()), ...Array.from(periodPer.keys())]);
  const passPer = new Map<string, Arbetsdag[]>();
  ids.forEach(id => {
    const spann = medPerioddagSpann(dagarPer.get(id) || [], (periodPer.get(id) || []) as any[]) as Arbetsdag[];
    passPer.set(id, spann);
    for (const b of gammal(spann, exp.trosklar).filter(arTroligtVilobrott)) gamla.set(nyckel(id, b.typ, b.datum), { ...b, medarbetare_id: id });
    for (const b of ny(spann, exp.trosklar, nu).filter(arTroligtVilobrott)) nya.set(nyckel(id, b.typ, b.datum), { ...b, medarbetare_id: id });
    for (const b of ny(spann, exp.trosklar, null).filter(arTroligtVilobrott)) nyaUtanSlut.add(nyckel(id, b.typ, b.datum));
  });

  const lagradStatus = (k: string): Skillnad["lagrad"] => { const l = lagrat.get(k); return !l ? "ingen" : l.besvarat_av_forare ? "besvarad" : "obesvarad"; };
  const skillnader: Skillnad[] = [];
  const bygg = (k: string, slag: Skillnad["slag"], g?: Rad, n?: Rad): Skillnad => {
    const b = (g || n)!;
    let orsak: string;
    if (slag === "forsvinner") {
      orsak = b.typ === "veckovila"
        ? (nyaUtanSlut.has(k) ? "Vilan efter sista passet fram till nu räknas (öppen lucka = slutar nu)" : "Tiden före första passet räknas som vila (ny förare eller datafönstrets första dagar)")
        : "Dygnsvilan räknas annorlunda (pass över midnatt)";
    } else if (slag === "tillkommer") {
      const dag1 = (passPer.get(b.medarbetare_id) || []).find(d => d.datum === b.datum);
      orsak = b.typ === "dygnsvila"
        ? (dag1 && korsarMidnatt(dag1) ? "Pass över midnatt: sluttiden räknas på nästa dygn (förut 24 tim för mycket vila)" : "Dygnsvilan räknas annorlunda")
        : "En sammanhängande period delades när vilan före/efter räknades — den senare delen får egen rad";
    } else {
      orsak = b.typ === "dygnsvila"
        ? "Pass över midnatt: vilan räknas från passets verkliga slut"
        : "Lägsta vilan i perioden ändrades (vilan före/efter räknas)";
    }
    return {
      medarbetare_id: b.medarbetare_id, namn: namn.get(b.medarbetare_id) || b.medarbetare_id, typ: b.typ, datum: b.datum, slag,
      vila_fore: g ? g.vila_h : null, vila_efter: n ? n.vila_h : null, orsak, lagrad: lagradStatus(k),
    };
  };
  gamla.forEach((g, k) => { const n = nya.get(k); if (!n) skillnader.push(bygg(k, "forsvinner", g)); else if (n.vila_h !== g.vila_h) skillnader.push(bygg(k, "andrad", g, n)); });
  nya.forEach((n, k) => { if (!gamla.has(k)) skillnader.push(bygg(k, "tillkommer", undefined, n)); });
  const ordning = { forsvinner: 0, tillkommer: 1, andrad: 2 } as const;
  skillnader.sort((a, b) => ordning[a.slag] - ordning[b.slag] || a.namn.localeCompare(b.namn, "sv") || a.datum.localeCompare(b.datum) || a.typ.localeCompare(b.typ));

  // Lagrade rader mot den nya analysen. Bara rader i underlagets tidsrymd (från första underlagsdatum) kan bedömas.
  const underlagFran = [...exp.arbetsdag.map(d => d.datum), ...exp.extra_tid.map(d => d.datum)].sort()[0] ?? "9999-12-31";
  const lagrade: LagradEffekt[] = exp.vilobrott.map(v => {
    const k = nyckel(v.medarbetare_id, v.typ, v.datum);
    const n = nya.get(k);
    const besvarad = !!v.besvarat_av_forare;
    const vila = v.vila_h == null ? null : Number(v.vila_h);
    let utfall: LagradEffekt["utfall"];
    if (v.datum < underlagFran) utfall = "utanfor_underlaget";
    else if (n) utfall = vila != null && Number(n.vila_h) === vila ? "stods_oforandrat" : "stods_ny_vila";
    else utfall = besvarad ? "stods_inte_besvarad_star_kvar" : "stods_inte_obesvarad_raderas";
    return {
      medarbetare_id: v.medarbetare_id, namn: namn.get(v.medarbetare_id) || v.medarbetare_id, typ: v.typ, datum: v.datum, vila_h: vila, besvarad, utfall,
      ny_vila_h: n ? n.vila_h : undefined, stod_utan_stod_redan: v.datum >= underlagFran && !gamla.has(k),
    };
  }).sort((a, b) => a.namn.localeCompare(b.namn, "sv") || a.datum.localeCompare(b.datum));

  return { nu: exp.nu, antal_gamla: gamla.size, antal_nya: nya.size, skillnader, lagrade };
}

const SLAG_TEXT = { forsvinner: "FÖRSVINNER", tillkommer: "TILLKOMMER", andrad: "ÄNDRAS" } as const;
const UTFALL_TEXT: Record<LagradEffekt["utfall"], string> = {
  stods_oforandrat: "stöds, oförändrad",
  stods_ny_vila: "stöds, vilan ändras",
  stods_inte_obesvarad_raderas: "stöds INTE längre — obesvarad: raderas vid nästa omräkning",
  stods_inte_besvarad_star_kvar: "stöds INTE längre — besvarad: står kvar (revisionsspår)",
  utanfor_underlaget: "före underlaget — kan inte bedömas",
};
const tim = (h: number | null | undefined) => (h == null ? "—" : String(Math.round(h * 10) / 10).replace(".", ","));

/** Rapporten som text (markdown), för terminalen och för planeringschatten. */
export function rapportText(r: ForeEfterResultat): string {
  const ut: string[] = [];
  ut.push(`# Vilobrott-listan före/efter — nu = ${r.nu}`);
  ut.push("");
  ut.push(`Listan i dag (gamla reglerna): ${r.antal_gamla} brott · efter ändringen: ${r.antal_nya} brott.`);
  const per = (s: Skillnad["slag"]) => r.skillnader.filter(x => x.slag === s).length;
  ut.push(`Skillnad: ${per("forsvinner")} försvinner · ${per("tillkommer")} tillkommer · ${per("andrad")} ändras.`);
  for (const slag of ["forsvinner", "tillkommer", "andrad"] as const) {
    const rader = r.skillnader.filter(x => x.slag === slag);
    ut.push("", `## ${SLAG_TEXT[slag]} (${rader.length})`);
    if (rader.length === 0) { ut.push("(inga)"); continue; }
    ut.push("| Förare | Typ | Datum | Vila före → efter (tim) | Lagrad rad | Orsak |", "|---|---|---|---|---|---|");
    for (const x of rader) ut.push(`| ${x.namn} | ${x.typ} | ${x.datum} | ${tim(x.vila_fore)} → ${tim(x.vila_efter)} | ${x.lagrad === "ingen" ? "—" : x.lagrad} | ${x.orsak} |`);
  }
  ut.push("", `## Lagrade rader i tabellen vilobrott (${r.lagrade.length})`);
  const andra = r.lagrade.filter(l => l.utfall !== "stods_oforandrat");
  if (andra.length === 0) ut.push("Alla lagrade rader stöds oförändrade.");
  else {
    ut.push("| Förare | Typ | Datum | Vila | Svar | Vad händer | Redan utan stöd förut? |", "|---|---|---|---|---|---|---|");
    for (const l of andra) ut.push(`| ${l.namn} | ${l.typ} | ${l.datum} | ${tim(l.vila_h)}${l.ny_vila_h != null && l.ny_vila_h !== l.vila_h ? ` → ${tim(l.ny_vila_h)}` : ""} | ${l.besvarad ? "besvarad" : "obesvarad"} | ${UTFALL_TEXT[l.utfall]} | ${l.stod_utan_stod_redan ? "ja" : "nej"} |`);
    ut.push("", `Oförändrade lagrade rader: ${r.lagrade.length - andra.length}.`);
  }
  return ut.join("\n");
}
