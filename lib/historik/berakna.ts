// Historikvyn (admin): ren logik utan React och utan databas. Allt som avgör vad som visas, och när det ska stå med ord i stället för en siffra.
//
// Regler (från Martin, steg 10–11):
// - Index finns bara för skördare i gallring och slutavverkning. m³/G15 jämförs aldrig mellan åtgärder: tvärs över åtgärder visas bara index.
// - Skotare visas med alla åtgärder tillsammans som standard. Åtgärdsuppdelning bara där åtgärden är känd.
// - Obekräftad maskinstandard ("antagna") ingår inte som standard; N visas och läggs till vid tryck.
// - Färre än 5 objekt, eller stopp i färre än 70 % av rapporterna, ska stå med text. Saknad data är ord, aldrig 0.

import type { AtgardKod, MaskinArRad, MaskinTyp, Urval } from "./typer";

export const MIN_OBJEKT = 5;
export const MIN_ANDEL_STOPP = 0.7;

export const ATGARD_ETIKETT: Record<AtgardKod, string> = {
  gallring: "Gallring",
  slutavverkning: "Slutavverkning",
  skada: "Skada",
  special: "Special",
  okand: "Åtgärd okänd",
};

export type Segment = "gallring" | "slutavverkning" | "skadaspecial";
export const SEGMENT_ETIKETT: Record<Segment, string> = {
  gallring: "Gallring",
  slutavverkning: "Slutavverkning",
  skadaspecial: "Skada och special",
};

/** Index finns bara för skördare i gallring/slutavverkning. */
export function harIndex(typ: MaskinTyp, atgard: AtgardKod | null): boolean {
  return typ === "skördare" && (atgard === "gallring" || atgard === "slutavverkning");
}

// ---------------------------------------------------------------------------------------------- formatering (svenska, decimalkomma)

const NBSP = " ";

export function fmt(v: number | null | undefined, decimaler = 0): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v.toLocaleString("sv-SE", { minimumFractionDigits: decimaler, maximumFractionDigits: decimaler }).replace(/ /g, NBSP);
}

export function procent(v: number | null | undefined, decimaler = 0): string | null {
  const s = fmt(v === null || v === undefined ? null : v * 100, decimaler);
  return s === null ? null : `${s}${NBSP}%`;
}

export function arSpann(fran: number, till: number): string {
  return fran === till ? String(fran) : `${fran}–${till}`;
}

// ---------------------------------------------------------------------------------------------- uppslag i vy_hist_maskin_ar

export function rad(rader: MaskinArRad[], maskin: string, atgard: AtgardKod | null, ar: number | null, urval: Urval): MaskinArRad | undefined {
  return rader.find((r) => r.maskin === maskin && r.atgard === atgard && r.ar === ar && r.urval === urval);
}

/** Alla maskiner av en typ, i namnordning. */
export function maskiner(rader: MaskinArRad[], typ: MaskinTyp): string[] {
  return Array.from(new Set(rader.filter((r) => r.typ === typ).map((r) => r.maskin))).sort((a, b) => a.localeCompare(b, "sv"));
}

/** Åren (stigande) en maskin har rader för i en åtgärd (null = alla åtgärder). */
export function aren(rader: MaskinArRad[], maskin: string, atgard: AtgardKod | null, urval: Urval): number[] {
  return rader
    .filter((r) => r.maskin === maskin && r.atgard === atgard && r.urval === urval && r.ar !== null)
    .map((r) => r.ar as number)
    .sort((a, b) => a - b);
}

export type ListRad = {
  maskin: string;
  typ: MaskinTyp;
  antalObjekt: number;
  antalMedIndex: number;
  g15: number | null;
  /** Huvudsiffran: viktat index (skördare, gallring/slutavverkning) eller m³/G15. */
  tal: number | null;
  talTyp: "index" | "m3_per_g15";
  arFran: number;
  arTill: number;
  /** Antal objekt med antagen åtgärd (obekräftad maskinstandard) i den här åtgärden, oavsett om de är medräknade. */
  antagna: number;
  /** Fanns objekt i åtgärden bara som antagna (och antagna är inte medtagna)? Då listas maskinen inte. */
  bara_antagna: boolean;
};

function listRad(rader: MaskinArRad[], maskin: string, typ: MaskinTyp, atgard: AtgardKod | null, medAntagna: boolean): ListRad | null {
  const urval: Urval = medAntagna ? "alla" : "namn";
  const hela = rad(rader, maskin, atgard, null, urval);
  const alla = rad(rader, maskin, atgard, null, "alla");
  const namn = rad(rader, maskin, atgard, null, "namn");
  const antagna = Math.max(0, (alla?.antal_objekt ?? 0) - (namn?.antal_objekt ?? 0));
  if (!hela || hela.antal_objekt === 0) {
    return antagna > 0 ? { maskin, typ, antalObjekt: 0, antalMedIndex: 0, g15: null, tal: null, talTyp: "index", arFran: 0, arTill: 0, antagna, bara_antagna: true } : null;
  }
  const ar = aren(rader, maskin, atgard, urval);
  const index = harIndex(typ, atgard);
  return {
    maskin,
    typ,
    antalObjekt: hela.antal_objekt,
    antalMedIndex: hela.antal_med_index,
    g15: hela.g15_h,
    tal: index ? hela.viktat_index : hela.m3_per_g15,
    talTyp: index ? "index" : "m3_per_g15",
    arFran: ar[0] ?? 0,
    arTill: ar[ar.length - 1] ?? 0,
    antagna,
    bara_antagna: false,
  };
}

/** Skördarlistan för en växelposition. Maskiner utan objekt i åtgärden listas inte. */
export function skordarlista(rader: MaskinArRad[], atgard: AtgardKod, medAntagna: boolean): ListRad[] {
  const ut: ListRad[] = [];
  for (const m of maskiner(rader, "skördare")) {
    const r = listRad(rader, m, "skördare", atgard, medAntagna);
    if (r && !r.bara_antagna) ut.push(r);
  }
  return ut.sort((a, b) => b.arTill - a.arTill || a.maskin.localeCompare(b.maskin, "sv"));
}

/** Antal antagna objekt som skulle läggas till i en åtgärd (summerat över alla skördare). */
export function antagnaIAtgard(rader: MaskinArRad[], atgard: AtgardKod): number {
  let n = 0;
  for (const m of maskiner(rader, "skördare")) {
    const alla = rad(rader, m, atgard, null, "alla")?.antal_objekt ?? 0;
    const namn = rad(rader, m, atgard, null, "namn")?.antal_objekt ?? 0;
    n += Math.max(0, alla - namn);
  }
  return n;
}

/** Skotarlistan: alla åtgärder tillsammans, en rad per maskin. */
export function skotarlista(rader: MaskinArRad[]): ListRad[] {
  const ut: ListRad[] = [];
  for (const m of maskiner(rader, "skotare")) {
    const r = listRad(rader, m, "skotare", null, false);
    if (r && !r.bara_antagna) ut.push(r);
  }
  return ut.sort((a, b) => b.arTill - a.arTill || a.maskin.localeCompare(b.maskin, "sv"));
}

export type AtgardsRad = {
  atgard: AtgardKod | null;
  etikett: string;
  antalObjekt: number;
  antalMedIndex: number;
  g15: number | null;
  /** Viktat index (bara skördare i gallring/slutavverkning). */
  index: number | null;
  harIndex: boolean;
  antagna: number;
};

/**
 * Åtgärdsraderna på maskinsidan. Skördare: en rad per åtgärd maskinen kört (gallring, slutavverkning, skada, special).
 * Skotare: först "Alla åtgärder", sedan en rad per åtgärd som är känd. Okända objekt räknas med i "Alla" men får ingen egen rad.
 */
export function atgardsrader(rader: MaskinArRad[], maskin: string, typ: MaskinTyp, medAntagna: boolean): AtgardsRad[] {
  const urval: Urval = medAntagna ? "alla" : "namn";
  const koder: (AtgardKod | null)[] = typ === "skotare" ? [null, "gallring", "slutavverkning", "skada", "special"] : ["gallring", "slutavverkning", "skada", "special"];
  const ut: AtgardsRad[] = [];
  for (const k of koder) {
    const r = rad(rader, maskin, k, null, urval);
    const alla = rad(rader, maskin, k, null, "alla")?.antal_objekt ?? 0;
    const namn = rad(rader, maskin, k, null, "namn")?.antal_objekt ?? 0;
    if (!r || r.antal_objekt === 0) continue;
    ut.push({
      atgard: k,
      etikett: k === null ? "Alla åtgärder" : ATGARD_ETIKETT[k],
      antalObjekt: r.antal_objekt,
      antalMedIndex: r.antal_med_index,
      g15: r.g15_h,
      index: harIndex(typ, k) ? r.viktat_index : null,
      harIndex: harIndex(typ, k),
      antagna: Math.max(0, alla - namn),
    });
  }
  return ut;
}

/** Antal objekt vars åtgärd är okänd (visas som text på maskinsidan). */
export function okandaObjekt(rader: MaskinArRad[], maskin: string): number {
  return rad(rader, maskin, "okand", null, "alla")?.antal_objekt ?? 0;
}

// ---------------------------------------------------------------------------------------------- tillförlitlighet och saknad data

/** Texter (aldrig bara färg) som ska stå vid ett värde. */
export function fewObjects(antal: number): string | null {
  return antal < MIN_OBJEKT ? `Bygger på ${antal} objekt` : null;
}

export type TuSvar = { text: string; ord: boolean; notis: string | null };

/**
 * TU som siffra eller ord. andel = andel rapporter med registrerade stopp (av dem som redovisar avbrott).
 * null i andel = formatet redovisar inga avbrott; 0 = redovisar men inga registrerade.
 */
export const TU_PONSSE = "TU enligt Ponsse (G15 / arbetstid)";

export function tuSvar(r: Pick<MaskinArRad, "tu" | "andel_rapporter_med_stopp" | "antal_rapporter_med_stopp" | "tu_rapporterad">): TuSvar {
  // Ponsse Skift har ingen avbrottsfördelning, bara arbetstid och G15: TU räknas som G15 / arbetstid och märks så (annan definition än övriga format)
  if (r.andel_rapporter_med_stopp === null && r.tu_rapporterad !== null) return { text: procent(r.tu_rapporterad, 1) as string, ord: false, notis: TU_PONSSE };
  if (r.andel_rapporter_med_stopp === null) return { text: "Avbrott saknas i rapportformatet", ord: true, notis: null };
  if (r.tu === null) return { text: "Inga stopp registrerade i rapporterna", ord: true, notis: null };
  const notis = r.andel_rapporter_med_stopp < MIN_ANDEL_STOPP ? `TU osäker: stopp registrerade i ${procent(r.andel_rapporter_med_stopp) ?? "?"} av rapporterna` : null;
  return { text: procent(r.tu, 1) as string, ord: false, notis };
}

export type Nyckeltal = {
  etikett: string;
  /** Färdig text: siffra med enhet, eller ord när data saknas. */
  varde: string;
  /** true när värdet är ord (saknad data) i stället för en siffra. */
  ord: boolean;
  notis: string | null;
  /** Huvudsiffran ska stå ensam överst, inte i listan. */
  stor?: boolean;
};

const SAKNAS_FORMAT = "saknas i rapportformatet";
export const VOLYM_SAKNAS_LASS = "Volym saknas: lass utan storlek";

function med(v: string | null, enhet: string, ordText: string): { varde: string; ord: boolean } {
  return v === null ? { varde: ordText, ord: true } : { varde: `${v}${NBSP}${enhet}`.trim(), ord: false };
}

/**
 * Nyckeltalen för ett år (eller hela perioden) i en åtgärd. Skördare: volym, G15, m³/G15, stammar/G15, medelstam, viktat index, TU,
 * reparationsgrad, bränsle l/m³. Skotare: volym, G15, m³/G15, lass/G15, TU, bränsle l/m³ (inget index: skotningsavstånd saknas).
 * Skördare i skada/special: volym, G15, m³/G15, medelstam (inget index).
 */
export function nyckeltal(r: MaskinArRad): Nyckeltal[] {
  const ut: Nyckeltal[] = [];
  const wisent = r.maskin === "Ponsse Wisent";
  const volym = med(fmt(r.volym_m3fub, 0), "m³", wisent ? VOLYM_SAKNAS_LASS : "Volym saknas");
  const osaker = r.antal_volym_osaker > 0 ? (wisent ? `Volym saknas i ${r.antal_volym_osaker} objekt: lass utan storlek (från 2024-09)` : `Volymen är osäker i ${r.antal_volym_osaker} objekt (rapporten anger lass × 1 m³ eller schablon)`) : null;
  ut.push({ etikett: "Total volym", ...volym, notis: osaker });
  const g15 = med(fmt(r.g15_h, 0), "h", "G15 saknas");
  ut.push({ etikett: "G15", ...g15, notis: null });
  const mg = med(fmt(r.m3_per_g15, 1), "", "m³/G15 saknas: G15 saknas i rapporten");
  ut.push({ etikett: "m³/G15", ...mg, notis: r.m3_per_g15 !== null ? fewObjects(r.antal_med_g15) : null });
  const skordare = r.typ === "skördare";
  const skadaEllerSpecial = r.atgard === "skada" || r.atgard === "special";
  if (skordare) {
    const st = med(fmt(r.stammar_per_g15, 0), "", `Stammar ${SAKNAS_FORMAT}`);
    if (!skadaEllerSpecial) ut.push({ etikett: "Stammar/G15", ...st, notis: null });
    const ms = med(fmt(r.medelstam, 3), "m³", `Medelstam kan inte räknas: stammar ${SAKNAS_FORMAT}`);
    ut.push({ etikett: "Medelstam", ...ms, notis: null });
    if (skadaEllerSpecial) return ut;
    if (harIndex(r.typ, r.atgard)) {
      const idx = med(fmt(r.viktat_index, 0), "", "Index saknas: G15 under 2 timmar eller stammar saknas");
      ut.push({ etikett: "Viktat index", ...idx, notis: r.viktat_index !== null ? fewObjects(r.antal_med_index) : null });
    }
  } else {
    const l = med(fmt(r.lass_per_g15, 2), "", `Lass ${SAKNAS_FORMAT}`);
    ut.push({ etikett: "Lass/G15", ...l, notis: null });
  }
  const tu = tuSvar(r);
  ut.push({ etikett: "TU", varde: tu.text, ord: tu.ord, notis: tu.notis });
  if (skordare) {
    const rg = r.andel_rapporter_med_stopp === null ? { varde: `Avbrott ${SAKNAS_FORMAT}`, ord: true } : r.reparationsgrad === null ? { varde: "Inga stopp registrerade i rapporterna", ord: true } : { varde: procent(r.reparationsgrad, 1) as string, ord: false };
    ut.push({ etikett: "Reparationsgrad", ...rg, notis: null });
  }
  const br = med(fmt(r.bransle_l_per_m3, 2), "l/m³", `Bränsle ${SAKNAS_FORMAT}`);
  ut.push({ etikett: "Bränsle", ...br, notis: null });
  const bg = med(fmt(r.bransle_l_per_g15, 1), "l/G15", `Bränsle ${SAKNAS_FORMAT}`);
  ut.push({ etikett: "Bränsle per G15", ...bg, notis: null });
  return ut;
}

/** Huvudtalet överst på maskinsidan. */
export function huvudtal(r: MaskinArRad | undefined): { varde: string; enhet: string; ord: string | null } {
  if (!r) return { varde: "–", enhet: "", ord: "Inga objekt i den här åtgärden" };
  if (harIndex(r.typ, r.atgard)) {
    const v = fmt(r.viktat_index, 0);
    return v === null ? { varde: "–", enhet: "viktat index", ord: "Index saknas: G15 under 2 timmar eller stammar saknas" } : { varde: v, enhet: "viktat index", ord: null };
  }
  const v = fmt(r.m3_per_g15, 1);
  return v === null ? { varde: "–", enhet: "m³/G15", ord: "m³/G15 saknas: G15 saknas i rapporten" } : { varde: v, enhet: "m³/G15", ord: null };
}

/** Värdet ett år i diagrammet: index eller m³/G15 beroende på åtgärd. */
export function diagramVarde(r: MaskinArRad): { varde: number | null; n: number } {
  if (harIndex(r.typ, r.atgard)) return { varde: r.viktat_index, n: r.antal_med_index };
  return { varde: r.m3_per_g15, n: r.antal_med_g15 };
}

// ---------------------------------------------------------------------------------------------- standardåtgärd (steg 12)

/**
 * Maskinsidans förvalda åtgärd = den åtgärd maskinen har flest objekt i (skördare). Räknas över ALLA objekt (även antagna), så att t.ex.
 * Komatsu 941 AptMan (193 antagna slutavverkningsobjekt) öppnas i slutavverkning och Rottne (gallring) i gallring, oavsett vilken växel
 * listan stod på. Skotare har ingen förvald åtgärd (alla åtgärder tillsammans). Lika många: gallring före slutavverkning före skada före special.
 */
export function standardAtgard(rader: MaskinArRad[], maskin: string, typ: MaskinTyp): AtgardKod | null {
  if (typ === "skotare") return null;
  let bast: AtgardKod | null = null;
  let n = 0;
  for (const k of ["gallring", "slutavverkning", "skada", "special"] as AtgardKod[]) {
    const antal = rad(rader, maskin, k, null, "alla")?.antal_objekt ?? 0;
    if (antal > n) {
      n = antal;
      bast = k;
    }
  }
  return bast;
}

// ---------------------------------------------------------------------------------------------- jämförelse (steg 12)

export const JAMFOR_MIN = 2;
export const JAMFOR_MAX = 4;

/**
 * Maskiner av en typ som har minst ett objekt i åtgärden (null = alla åtgärder, för skotare), flest objekt först. Valbar = minst 1 objekt bland ALLA objekt
 * (även antagna), oavsett om åtgärden kommer ur namn/ämne, bekräftad standard eller obekräftad maskinstandard. urval = vilka objekt jämförelsen använder
 * för maskinen: 'namn' om det finns sådana och antagna inte tagits med, annars 'alla' (en maskin med bara antagna objekt jämförs på dem, med text).
 */
export function maskinerMedObjekt(rader: MaskinArRad[], typ: MaskinTyp, atgard: AtgardKod | null, medAntagna: boolean): { maskin: string; antal: number; antagna: number; urval: Urval }[] {
  const ut: { maskin: string; antal: number; antagna: number; urval: Urval }[] = [];
  for (const m of maskiner(rader, typ)) {
    const alla = rad(rader, m, atgard, null, "alla")?.antal_objekt ?? 0;
    const namn = rad(rader, m, atgard, null, "namn")?.antal_objekt ?? 0;
    if (alla === 0) continue;
    const urval: Urval = medAntagna || namn === 0 ? "alla" : "namn";
    ut.push({ maskin: m, antal: urval === "alla" ? alla : namn, antagna: Math.max(0, alla - namn), urval });
  }
  return ut.sort((a, b) => b.antal - a.antal || a.maskin.localeCompare(b.maskin, "sv"));
}

/** Vilket urval jämförelsen använder för en maskin (se maskinerMedObjekt). */
export function jamforUrval(rader: MaskinArRad[], maskin: string, atgard: AtgardKod | null, medAntagna: boolean): Urval {
  const namn = rad(rader, maskin, atgard, null, "namn")?.antal_objekt ?? 0;
  return medAntagna || namn === 0 ? "alla" : "namn";
}

export type JamforCell = { text: string; ord: boolean; notis: string | null; tal: number | null; bast: boolean; extra?: string };
export type JamforRad = { etikett: string; celler: JamforCell[]; bastRiktning: "hog" | "lag" | null };

/** Index/linje-serie för diagrammet: viktat index (skördare) eller m³/G15 (skotare), ett värde per år. */
export function jamforSerie(rader: MaskinArRad[], maskin: string, atgard: AtgardKod | null, medAntagna: boolean): { ar: number; varde: number | null; n: number }[] {
  const urval: Urval = jamforUrval(rader, maskin, atgard, medAntagna);
  return rader
    .filter((r) => r.maskin === maskin && r.atgard === atgard && r.urval === urval && r.ar !== null)
    .sort((a, b) => (a.ar as number) - (b.ar as number))
    .map((r) => ({ ar: r.ar as number, ...diagramVarde(r) }));
}

/**
 * Tabellen under diagrammet: en kolumn per maskin, hela perioden. Skördare: år, objekt, volym, G15, m³/G15, stammar/G15, medelstam, viktat index, TU,
 * bränsle. Skotare: år, objekt, volym, G15, m³/G15, lass/G15, TU, bränsle (inget index). "Bäst" markeras bara i rader där riktningen är entydig
 * (viktat index och TU, högst) och bara bland värden som är tillförlitliga: minst 5 objekt, och TU bara om stopp finns i minst 70 % av rapporterna.
 */
export function jamforRader(rader: MaskinArRad[], maskinerValda: string[], typ: MaskinTyp, atgard: AtgardKod | null, medAntagna: boolean): JamforRad[] {
  const urvalAv = (m: string) => jamforUrval(rader, m, atgard, medAntagna);
  const rs = maskinerValda.map((m) => rad(rader, m, atgard, null, urvalAv(m)));
  const skordare = typ === "skördare";
  const cell = (r: MaskinArRad | undefined, f: (r: MaskinArRad) => { text: string; ord: boolean; notis: string | null; tal: number | null; osaker?: boolean }): JamforCell => {
    if (!r) return { text: "Inga objekt", ord: true, notis: null, tal: null, bast: false };
    const v = f(r);
    return { text: v.text, ord: v.ord, notis: v.notis, tal: v.osaker ? null : v.tal, bast: false };
  };
  const tal = (v: number | null, dec: number, enhet: string, saknas: string, notis: string | null, osaker = false) => {
    const t = fmt(v, dec);
    return t === null || v === null ? { text: saknas, ord: true, notis: null, tal: null } : { text: enhet ? `${t}${NBSP}${enhet}` : t, ord: false, notis, tal: Math.round(v * 10 ** dec) / 10 ** dec, osaker };
  };
  const ut: JamforRad[] = [];
  ut.push({
    etikett: "Kördes",
    celler: maskinerValda.map((m, i) => cell(rs[i], () => {
      const a = aren(rader, m, atgard, urvalAv(m));
      return { text: a.length ? arSpann(a[0], a[a.length - 1]) : "–", ord: !a.length, notis: null, tal: null };
    })),
    bastRiktning: null,
  });
  ut.push({
    etikett: "Antal objekt",
    celler: rs.map((r, i) => cell(r, (x) => {
      const bara = !medAntagna && urvalAv(maskinerValda[i]) === "alla";
      return { text: String(x.antal_objekt), ord: false, notis: bara ? "Bara antagna objekt (maskinstandard)" : fewObjects(x.antal_objekt), tal: x.antal_objekt };
    })),
    bastRiktning: null,
  });
  ut.push({ etikett: "Total volym (m³)", celler: rs.map((r) => cell(r, (x) => tal(x.volym_m3fub, 0, "", x.maskin === "Ponsse Wisent" ? VOLYM_SAKNAS_LASS : "Volym saknas", x.antal_volym_osaker > 0 ? (x.maskin === "Ponsse Wisent" ? `Saknas i ${x.antal_volym_osaker} objekt: lass utan storlek` : `Osäker i ${x.antal_volym_osaker} objekt`) : null))), bastRiktning: null });
  ut.push({ etikett: "G15 (h)", celler: rs.map((r) => cell(r, (x) => tal(x.g15_h, 0, "", "G15 saknas", null))), bastRiktning: null });
  ut.push({ etikett: "m³/G15", celler: rs.map((r) => cell(r, (x) => tal(x.m3_per_g15, 1, "", "G15 saknas i rapporten", fewObjects(x.antal_med_g15), x.antal_med_g15 < MIN_OBJEKT))), bastRiktning: null });
  if (skordare) {
    ut.push({ etikett: "Stammar/G15", celler: rs.map((r) => cell(r, (x) => tal(x.stammar_per_g15, 0, "", `Stammar ${SAKNAS_FORMAT}`, null))), bastRiktning: null });
    ut.push({ etikett: "Medelstam (m³)", celler: rs.map((r) => cell(r, (x) => tal(x.medelstam, 3, "", "Stammar saknas", null))), bastRiktning: null });
    ut.push({ etikett: "Viktat index", celler: rs.map((r) => cell(r, (x) => tal(x.viktat_index, 0, "", "Index saknas: G15 under 2 h", fewObjects(x.antal_med_index), x.antal_med_index < MIN_OBJEKT))), bastRiktning: "hog" });
  } else {
    ut.push({ etikett: "Lass/G15", celler: rs.map((r) => cell(r, (x) => tal(x.lass_per_g15, 2, "", `Lass ${SAKNAS_FORMAT}`, null))), bastRiktning: null });
  }
  ut.push({
    etikett: "TU",
    celler: rs.map((r) => cell(r, (x) => {
      const t = tuSvar(x);
      return { text: t.text, ord: t.ord, notis: t.notis, tal: t.ord ? null : x.tu, osaker: t.notis !== null };
    })),
    bastRiktning: "hog",
  });
  ut.push({ etikett: "Bränsle l/m³", celler: rs.map((r) => cell(r, (x) => tal(x.bransle_l_per_m3, 2, "", `Bränsle ${SAKNAS_FORMAT}`, null))), bastRiktning: null });
  ut.push({ etikett: "Bränsle l/G15", celler: rs.map((r) => cell(r, (x) => tal(x.bransle_l_per_g15, 1, "", `Bränsle ${SAKNAS_FORMAT}`, null))), bastRiktning: null });
  // medelstammen visas under m³/G15 och bränsle (de påverkas av stamstorleken) i stället för att markeras som bäst
  if (skordare) {
    for (const rad_ of ut) {
      if (rad_.etikett !== "m³/G15" && rad_.etikett !== "Bränsle l/m³") continue;
      rad_.celler.forEach((c, i) => {
        const ms = fmt(rs[i]?.medelstam ?? null, 3);
        if (!c.ord && ms) c.extra = `medelstam ${ms} m³`;
      });
    }
  }
  // tabellcellerna är smala: "…saknas i rapportformatet" blir "Saknas i formatet" (förklaras under tabellen)
  for (const rad_ of ut) for (const c of rad_.celler) if (c.ord && c.text.endsWith(SAKNAS_FORMAT)) c.text = "Saknas i formatet";
  // markera bästa (bara tillförlitliga tal; lika värden delar markeringen)
  for (const rad_ of ut) {
    if (!rad_.bastRiktning) continue;
    // en maskin med färre än MIN_OBJEKT objekt kan inte vara bäst i någon rad
    const giltiga = rad_.celler.map((c, i) => (c.tal !== null && (rs[i]?.antal_objekt ?? 0) >= MIN_OBJEKT ? c.tal : null));
    const tals = giltiga.filter((v): v is number => v !== null);
    if (tals.length < 2) continue;
    const bast = rad_.bastRiktning === "hog" ? Math.max(...tals) : Math.min(...tals);
    rad_.celler.forEach((c, i) => { if (giltiga[i] !== null && giltiga[i] === bast) c.bast = true; });
  }
  return ut;
}

/** Antal antagna objekt (obekräftad maskinstandard) i en åtgärd, summerat över alla skördare. */
export function antagnaTotalt(rader: MaskinArRad[], atgard: AtgardKod): number {
  return antagnaIAtgard(rader, atgard);
}
