// Lönekvot — hur mycket av betald tid som blev maskintid (G15 under förarens inloggning). EN uppställning för Dagar (alla förare,
// en rad var) och Förare · Månad (en förare), så att samma förare och månad alltid visar samma tal. Inget här räknar om
// lönen: täljaren är maskintiden lönemotorn redan lagt på varje dag (`maskintid`), nämnaren är dagens betalda tid.
//
// Lönekvoten räknas BARA över dagar där maskinen skickar filer (kalla 'fil') och där föraren har betald tid — filfria maskiner
// (810E) och dagar utan maskin står utanför. Hellre ett ärligt tal med antalet dagar bredvid än ett som blandar in dem.
// Under KVOT_MIN_DAGAR sådana dagar visas ingen procent ("för få dagar"): 66 % över en dag är inget att dra slutsatser av.
// Täljaren är G15, inte branschens G0 — docs/lonesystem/lonekvot.md.
import { minText } from "@/lib/lonesystem/forarText";

/** Under så här många fil-dagar visas ingen lönekvot (Martin 2026-10-02: en pågående period ser annars färdig ut). */
export const KVOT_MIN_DAGAR = 5;

export type Maskintid = { min: number; kalla: "fil" | "ingen_fil" | "ingen_maskin"; maskinens_min?: number };

export type KvotSumma = {
  /** Dagar med betald tid. */
  dagar: number;
  /** All betald tid (minuter) — också dagar utan maskinfiler. */
  min: number;
  /** Dagar med filmaskin och betald tid: de som lönekvoten räknas över. */
  kvotDagar: number;
  /** Betald tid på just de dagarna. */
  kvotBetald: number;
  /** Maskintid (G15) på just de dagarna. */
  kvotMaskin: number;
  /** Av kvotDagar: dagar där förarens inloggning inte gav någon maskintid. */
  utanMaskintid: number;
};

export const tomKvot = (): KvotSumma => ({ dagar: 0, min: 0, kvotDagar: 0, kvotBetald: 0, kvotMaskin: 0, utanMaskintid: 0 });

/** Lägger en dag till summan. `min` = betald tid den dagen (maskintid vid maskinen + extra tid). */
export function laggTillDag(s: KvotSumma, min: number, maskintid?: Maskintid | null): KvotSumma {
  if (min > 0) s.dagar++;
  s.min += min;
  if (maskintid && maskintid.kalla === "fil" && min > 0) {
    s.kvotDagar++; s.kvotBetald += min; s.kvotMaskin += maskintid.min;
    if (maskintid.min === 0) s.utanMaskintid++;
  }
  return s;
}

export function summeraKvot(dagar: { min: number; maskintid?: Maskintid | null }[]): KvotSumma {
  const s = tomKvot();
  for (const d of dagar) laggTillDag(s, d.min, d.maskintid);
  return s;
}

export function summaAvKvot(lista: KvotSumma[]): KvotSumma {
  const t = tomKvot();
  for (const s of lista) {
    t.dagar += s.dagar; t.min += s.min; t.kvotDagar += s.kvotDagar; t.kvotBetald += s.kvotBetald; t.kvotMaskin += s.kvotMaskin; t.utanMaskintid += s.utanMaskintid;
  }
  return t;
}

/** Hel procent, eller null när nämnaren saknas. */
export const pct = (taljareMin: number, namnareMin: number): number | null => (namnareMin > 0 ? Math.round((taljareMin / namnareMin) * 100) : null);

export type KvotLage = "ok" | "for_fa" | "ingen";
export function kvotLage(s: KvotSumma): KvotLage {
  return s.kvotDagar >= KVOT_MIN_DAGAR ? "ok" : s.kvotDagar > 0 ? "for_fa" : "ingen";
}

/** Procenten — bara när det finns underlag nog. Aldrig 0 % för "ingen maskintid rapporteras". */
export function kvotProcent(s: KvotSumma): number | null {
  return kvotLage(s) === "ok" ? pct(s.kvotMaskin, s.kvotBetald) : null;
}

/** Talet som står i cellen: "78 %", "för få dagar" eller "–". */
export function kvotVarde(s: KvotSumma): string {
  const lage = kvotLage(s);
  if (lage === "for_fa") return "för få dagar";
  const p = kvotProcent(s);
  return p == null ? "–" : `${p} %`;
}

/** Maskintiden i cellen "Maskin": summan över filmaskin-dagarna, eller "–" när ingen dag har filmaskin. */
export function kvotMaskinText(s: KvotSumma): string {
  return s.kvotDagar > 0 ? minText(s.kvotMaskin) : "–";
}

/** Förklaringen under talet: vad kvoten räknas över, och varför den ibland saknas. Samma ord i Dagar och Förare · Månad. */
export function kvotDetalj(s: KvotSumma): string {
  const lage = kvotLage(s);
  if (lage === "ingen") return "Inga dagar med maskinfiler";
  if (lage === "for_fa") return `Kräver minst ${KVOT_MIN_DAGAR} dagar med maskinfiler (${s.kvotDagar} hittills)`;
  return `${minText(s.kvotMaskin)} maskintid av ${minText(s.kvotBetald)} betald · ${s.kvotDagar} ${s.kvotDagar === 1 ? "dag" : "dagar"} med maskinfiler${s.utanMaskintid ? ` · ${s.utanMaskintid} utan maskintid` : ""}`;
}

/** Raden under en förare i Dagar: bara när den berättar något som tabellens tre tal inte gör (kvoten räknas över färre dagar än betald tid,
 *  för få dagar, eller inga). Annars null — Maskin delat med Betalt är då kvoten. */
export function kvotNot(s: KvotSumma): string | null {
  const lage = kvotLage(s);
  if (lage !== "ok") return kvotDetalj(s).replace(/^./, c => c.toLowerCase());
  const delmangd = s.kvotBetald !== s.min;
  if (!delmangd && !s.utanMaskintid) return null;
  return `kvoten räknas över ${s.kvotDagar} av ${s.dagar} ${s.dagar === 1 ? "dag" : "dagar"} (de med maskinfiler)${s.utanMaskintid ? ` · ${s.utanMaskintid} utan maskintid` : ""}`;
}
