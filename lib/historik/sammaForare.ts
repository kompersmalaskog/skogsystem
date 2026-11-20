// Historikvyn (admin): samma förare på olika maskiner. Rena regler ovanpå vy_hist_forare_maskin_jamfor (en rad per förare × åtgärd × maskin):
// vilka förare som går att jämföra, vilka maskiner som har nog data, kolumnordning, "bäst" och om åren skiljer. Inga namn är hårdkodade:
// tekniska förare är redan borta i vyn, och urvalet nedan (minst två maskiner med minst 200 G15-timmar) avgör resten.

import { arSpann, fmt, FOR_LITE_DATA, MIN_ANDEL_STOPP, procent, type JamforCell, type JamforRad } from "./berakna";
import { INDEX_ATGARDER, type IndexAtgard } from "./indexForklaring";
import { tal } from "./typer";

/** Under så här många G15-timmar för föraren i åtgärden visas "För lite data" i stället för siffror. */
export const GRANS_G15_H = 200;

export type ForareMaskinRad = {
  forare: string;
  atgard: IndexAtgard;
  maskin: string;
  antal_objekt: number;
  ar_fran: number;
  ar_till: number;
  g15_h: number;
  viktat_index: number | null;
  /** TU ur avbrott (Komatsu, Rottne) */
  tu: number | null;
  antal_med_tu: number;
  /** TU enligt Ponsse: G15 / arbetstid (Giant, King ny). Annan definition än `tu`. */
  tu_rapporterad: number | null;
  m3_per_g15: number | null;
};

export function tillForareMaskin(r: Record<string, unknown>): ForareMaskinRad {
  return {
    forare: String(r.forare),
    atgard: r.atgard as IndexAtgard,
    maskin: String(r.maskin),
    antal_objekt: tal(r.antal_objekt) ?? 0,
    ar_fran: tal(r.ar_fran) ?? 0,
    ar_till: tal(r.ar_till) ?? 0,
    g15_h: tal(r.g15_h) ?? 0,
    viktat_index: tal(r.viktat_index),
    tu: tal(r.tu),
    antal_med_tu: tal(r.antal_med_tu) ?? 0,
    tu_rapporterad: tal(r.tu_rapporterad),
    m3_per_g15: tal(r.m3_per_g15),
  };
}

export const harNogData = (r: ForareMaskinRad) => r.g15_h >= GRANS_G15_H;

export type ForareVal = { forare: string; atgarder: IndexAtgard[] };

/**
 * Vilka förare och åtgärder som går att jämföra: minst två maskiner med minst GRANS_G15_H timmar. Inga tomma val: en förare med bara en maskin
 * över gränsen (eller med många maskiner men bara en med nog data) kommer inte med.
 */
export function urvalForare(rader: ForareMaskinRad[]): ForareVal[] {
  const per = new Map<string, Map<IndexAtgard, number>>();
  for (const r of rader) {
    if (!harNogData(r)) continue;
    const a = per.get(r.forare) ?? new Map<IndexAtgard, number>();
    a.set(r.atgard, (a.get(r.atgard) ?? 0) + 1);
    per.set(r.forare, a);
  }
  const ut: ForareVal[] = [];
  per.forEach((a, forare) => {
    const atgarder = INDEX_ATGARDER.filter((g) => (a.get(g) ?? 0) >= 2);
    if (atgarder.length) ut.push({ forare, atgarder });
  });
  return ut.sort((x, y) => x.forare.localeCompare(y.forare, "sv"));
}

/** Förarens maskiner i åtgärden, äldst först (startår, sedan slutår, sedan namn). Maskiner med för lite data är med: de visas som "För lite data". */
export function maskinerForForare(rader: ForareMaskinRad[], forare: string, atgard: IndexAtgard): ForareMaskinRad[] {
  return rader
    .filter((r) => r.forare === forare && r.atgard === atgard)
    .sort((a, b) => a.ar_fran - b.ar_fran || a.ar_till - b.ar_till || a.maskin.localeCompare(b.maskin, "sv"));
}

/** Förarens maskiner i åtgärden delade i de som visas (minst GRANS_G15_H timmar) och de som döljs. Ordningen (äldst först) bevaras i båda. */
export function delaMaskiner(maskiner: ForareMaskinRad[]): { visas: ForareMaskinRad[]; dolda: ForareMaskinRad[] } {
  return { visas: maskiner.filter(harNogData), dolda: maskiner.filter((r) => !harNogData(r)) };
}

/** Två år-spann överlappar om de delar minst ett år (2020–2022 och 2022–2023 delar 2022). */
export const ararOverlappar = (a: ForareMaskinRad, b: ForareMaskinRad) => a.ar_fran <= b.ar_till && b.ar_fran <= a.ar_till;

/**
 * Olika år: NÅGOT par av de visade maskinerna saknar gemensamma år. Då syns en grå rad om att förarens erfarenhet kan förklara en del av skillnaden.
 * Har alla par minst ett gemensamt år (helt eller delvis överlapp): ingen rad. Färre än två visade maskiner: ingen rad.
 */
export function olikaAr(kolumner: ForareMaskinRad[]): boolean {
  const med = kolumner.filter(harNogData);
  for (let i = 0; i < med.length; i++) for (let j = i + 1; j < med.length; j++) if (!ararOverlappar(med[i], med[j])) return true;
  return false;
}

export const TU_KALLA_PONSSE = "enligt Ponsse";
export const TU_KALLA_AVBROTT = "ur avbrott";
type TuKalla = typeof TU_KALLA_PONSSE | typeof TU_KALLA_AVBROTT;

/** TU och var det kommer ifrån. Ponsse (G15 / arbetstid) och avbrott är olika mått och jämförs aldrig med varandra. */
export function tuAv(r: ForareMaskinRad): { varde: number; kalla: TuKalla; osaker: boolean } | null {
  if (r.tu !== null) return { varde: r.tu, kalla: TU_KALLA_AVBROTT, osaker: r.antal_objekt > 0 && r.antal_med_tu / r.antal_objekt < MIN_ANDEL_STOPP };
  if (r.tu_rapporterad !== null) return { varde: r.tu_rapporterad, kalla: TU_KALLA_PONSSE, osaker: false };
  return null;
}

/** Maskinerna (index i kolumnlistan) som får "bäst" på TU: högst inom varje TU-källa, bara om källan har minst två maskiner med nog data. */
export function bastaTu(kolumner: ForareMaskinRad[]): Set<number> {
  const grupper = new Map<TuKalla, { i: number; v: number }[]>();
  kolumner.forEach((r, i) => {
    if (!harNogData(r)) return;
    const t = tuAv(r);
    if (!t || t.osaker) return;
    const g = grupper.get(t.kalla) ?? [];
    g.push({ i, v: t.varde });
    grupper.set(t.kalla, g);
  });
  const bast = new Set<number>();
  grupper.forEach((g) => {
    if (g.length < 2) return;
    const max = Math.max(...g.map((x) => x.v));
    g.filter((x) => x.v === max).forEach((x) => bast.add(x.i));
  });
  return bast;
}

/** Maskinerna med högst index (bara bland dem med nog data, och bara om minst två har index). */
export function bastaIndex(kolumner: ForareMaskinRad[]): Set<number> {
  const med = kolumner.map((r, i) => ({ i, v: harNogData(r) ? r.viktat_index : null })).filter((x): x is { i: number; v: number } => x.v !== null);
  if (med.length < 2) return new Set();
  const max = Math.max(...med.map((x) => x.v));
  return new Set(med.filter((x) => x.v === max).map((x) => x.i));
}

const FORLITE: JamforCell = { text: FOR_LITE_DATA, ord: true, notis: null, tal: null, bast: false };

/** Raderna under maskinnamnet: Index, TU, m³/G15, G15 timmar, Antal objekt. Åren står överst i kolumnen (se `kolumnRubrik`). */
export function sammaForareRader(kolumner: ForareMaskinRad[]): JamforRad[] {
  const bi = bastaIndex(kolumner);
  const bt = bastaTu(kolumner);
  const nog = kolumner.map(harNogData);
  const cell = (i: number, f: (r: ForareMaskinRad) => JamforCell): JamforCell => (nog[i] ? f(kolumner[i]) : FORLITE);
  const tom = (text: string): JamforCell => ({ text, ord: true, notis: null, tal: null, bast: false });
  return [
    {
      etikett: "Index",
      bastRiktning: "hog",
      celler: kolumner.map((r, i) => cell(i, (x) => {
        const t = fmt(x.viktat_index, 0);
        return t === null ? tom("Index saknas") : { text: t, ord: false, notis: null, tal: x.viktat_index, bast: bi.has(i) };
      })),
    },
    {
      etikett: "TU",
      bastRiktning: "hog",
      celler: kolumner.map((r, i) => cell(i, (x) => {
        const t = tuAv(x);
        if (!t) return tom("Saknas i formatet");
        return {
          text: procent(t.varde, 1) as string, ord: false, tal: t.varde, bast: bt.has(i), kalla: t.kalla,
          notis: t.osaker ? `TU osäker: stopp registrerade i ${procent(x.antal_med_tu / x.antal_objekt) ?? "?"} av rapporterna` : null,
        };
      })),
    },
    {
      etikett: "m³/G15",
      bastRiktning: null,
      celler: kolumner.map((r, i) => cell(i, (x) => {
        const t = fmt(x.m3_per_g15, 1);
        return t === null ? tom("Volym saknas") : { text: t, ord: false, notis: null, tal: x.m3_per_g15, bast: false };
      })),
    },
    {
      etikett: "G15 (h)",
      bastRiktning: null,
      // timmarna visas även under gränsen: de är skälet till "För lite data"
      celler: kolumner.map((r, i) => ({ text: fmt(r.g15_h, 0) as string, ord: false, notis: null, tal: r.g15_h, bast: false, kalla: nog[i] ? null : `under ${GRANS_G15_H} h` })),
    },
    {
      etikett: "Antal objekt",
      bastRiktning: null,
      celler: kolumner.map((r) => ({ text: String(r.antal_objekt), ord: false, notis: null, tal: r.antal_objekt, bast: false })),
    },
  ];
}

/** Åren överst i kolumnen, till exempel "2017–2023" (ett enda år står som "2025"). */
export const kolumnRubrik = (r: ForareMaskinRad) => arSpann(r.ar_fran, r.ar_till);

export const TEXT_OLIKA_AR = "Alla maskiner kördes inte samma år. Förarens erfarenhet kan förklara en del av skillnaden.";
export const TEXT_SAMMA_FORARE = "Samma förare på olika maskiner. Skillnaden beror mer på maskinen, men år och objekt skiljer sig fortfarande.";
