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
export function tuSvar(r: Pick<MaskinArRad, "tu" | "andel_rapporter_med_stopp" | "antal_rapporter_med_stopp">): TuSvar {
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
  const volym = med(fmt(r.volym_m3fub, 0), "m³", "Volym saknas");
  const osaker = r.antal_volym_osaker > 0 ? `Volymen är osäker i ${r.antal_volym_osaker} objekt (rapporten anger lass × 1 m³ eller schablon)` : null;
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
