// ─────────────────────────────────────────────────────────────
// ÅRETS ÖVERTID — FYRA MODELLER, AVTALETS ÄR DEN FJÄRDE (2026-09-17).
//
// Första dry_run (2026-09-13) visade att systemet svarade olika på "hur mycket
// övertid har Stefan i år" beroende på var man tittade, och att föraren såg
// det LÄGSTA talet medan exporten skulle rapportera ett tal ÖVER taket:
//
//   vardagar    per månad: timmar − kalenderns vardagar (ej röda) × 8, negativa
//               månader nollas — vad Min tid räknar                 Stefan 172,5
//   dagar       per månad: timmar − arbetade dagar (≥ 60 min) × 8 — vad
//               Fortnox-exporten rapporterar som 1435/1436            Stefan 270,9
//   vecka       per ISO-vecka: timmar över 40                          Stefan 311
//   genomsnitt  AVTALET, Skogsavtalet §5 mom 2 (docs/lonesystem/skogsavtalet-
//               arbetstid.md): ordinarie tid är 40 tim/vecka "sett som ett
//               genomsnitt för en sammanhängande beräkningsperiod av högst 16
//               veckor". Räknas här per block om 16 ISO-veckor från v1
//               (v1–16, v17–32, v33–48, v49–) — ANTAGEN period; vilken som
//               tillämpas är Martins beslut (utjämningen ska vara överenskommen).
//
// INGEN av de tre första är avtalets. Gävle/Dalarna våren 2026 (80-timmars-
// veckor växlade med lediga veckor) ger 34–38 tim/vecka i snitt — under 40.
// Dessutom: tid som kompenseras med ledighet enligt §8 mom 3 (1,4 tim per
// övertidstimme) "skall inte betraktas som övertid enligt Arbetstidslagen"
// (§5 mom 5 anm 3). Komp-uttag finns inte i data än (frånvaromodellen), så
// alla fyra talen är sannolikt FÖR HÖGA. Därför: inget rött "passerat taket"
// i admin förrän modellen är vald och komp är avdragen. Taket
// (gs_avtal.max_overtid_ar_h, 250) är en lagstadgad gräns, inte ett mål.
//
// Räknas ALDRIG med skarp-start-golv: kalenderåret är kalenderåret.
// ─────────────────────────────────────────────────────────────
import { getRödaDagar } from "../roda-dagar";
import { isoVecka } from "../vilobrott";
import { arArbetsdag } from "../arbetsdagRegler";
import { FRANVARO_DAGTYPER_ALLA } from "../franvaro";

export type OvertidModell = "vardagar" | "dagar" | "vecka" | "genomsnitt";

/** Avtalets beräkningsperiod (§5 mom 2): högst 16 veckor. Blocken antas börja v1. */
export const BERAKNINGSPERIOD_VECKOR = 16;

export const OVERTID_MODELLER: { key: OvertidModell; namn: string; beskrivning: string; anvandsAv: string; avtalet: boolean }[] = [
  { key: "vardagar",   namn: "Vardagar × 8",        beskrivning: "per månad: timmar minus kalenderns vardagar × 8", anvandsAv: "Min tid (förarens vy)", avtalet: false },
  { key: "dagar",      namn: "Arbetade dagar × 8",  beskrivning: "per månad: timmar minus arbetade dagar × 8", anvandsAv: "Fortnox-exporten (löneart 1435/1436)", avtalet: false },
  { key: "vecka",      namn: "Över 40 tim/vecka",   beskrivning: "per ISO-vecka: timmar över 40, ingen utjämning", anvandsAv: "ingen", avtalet: false },
  { key: "genomsnitt", namn: "Genomsnitt 16 v",     beskrivning: `avtalet §5 mom 2: timmar över 40 × veckor per beräkningsperiod om ${BERAKNINGSPERIOD_VECKOR} veckor (antaget v1–16, v17–32, …)`, anvandsAv: "Skogsavtalet — komp-uttag ej avdragna", avtalet: true },
];

export type ArsovertidDag = { datum: string; arbetad_min: number | null; dagtyp?: string | null; start_tid?: string | null };
export type ArsovertidExtra = { datum: string | null; minuter: number | null };

export type Arsovertid = {
  ar: number;
  tomDatum: string;
  timmar: number;                       // totalt maskin + extra, hela året hittills
  modeller: Record<OvertidModell, number>;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Räknar årets övertid enligt alla tre modeller för EN medarbetare.
 * `dagar` och `extra` = medarbetarens rader för kalenderåret `ar` t.o.m. `tomDatum`.
 */
export function beraknaArsovertid(
  dagar: ArsovertidDag[],
  extra: ArsovertidExtra[],
  ar: number,
  tomDatum: string,
): Arsovertid {
  const FRANVARO = new Set<string>(FRANVARO_DAGTYPER_ALLA);
  const roda = getRödaDagar(ar);
  const arStart = `${ar}-01-01`;

  // Minuter per datum: maskin (frånvarodagar räknas inte) + extra
  const minPerDatum = new Map<string, number>();
  const maskinPerDatum = new Map<string, number>();
  for (const d of dagar) {
    if (!d.datum || d.datum < arStart || d.datum > tomDatum) continue;
    if (FRANVARO.has(String(d.dagtyp || "").toLowerCase())) continue;
    const m = d.arbetad_min || 0;
    maskinPerDatum.set(d.datum, (maskinPerDatum.get(d.datum) || 0) + m);
    minPerDatum.set(d.datum, (minPerDatum.get(d.datum) || 0) + m);
  }
  for (const e of extra) {
    if (!e.datum || e.datum < arStart || e.datum > tomDatum) continue;
    minPerDatum.set(e.datum, (minPerDatum.get(e.datum) || 0) + (e.minuter || 0));
  }

  // Per månad
  const manader = new Map<string, { min: number; arbetsdagar: number; kortpassMin: number }>();
  for (const [datum, min] of Array.from(minPerDatum.entries())) {
    const mp = datum.slice(0, 7);
    const m = manader.get(mp) || { min: 0, arbetsdagar: 0, kortpassMin: 0 };
    m.min += min;
    if (arArbetsdag(min)) m.arbetsdagar++;
    else m.kortpassMin += maskinPerDatum.get(datum) || 0; // kortpass = timlön, aldrig övertid (loneberakning)
    manader.set(mp, m);
  }
  const [tÅ, tM, tD] = tomDatum.split("-").map(Number);
  let ovVardagar = 0, ovDagar = 0;
  for (let mon = 0; mon < 12; mon++) {
    const mp = `${ar}-${String(mon + 1).padStart(2, "0")}`;
    if (mp > tomDatum.slice(0, 7)) break;
    const m = manader.get(mp) || { min: 0, arbetsdagar: 0, kortpassMin: 0 };
    // Kalenderns vardagar i månaden fram t.o.m. tomDatum, ej röda
    const sista = (ar === tÅ && mon === tM - 1) ? tD : new Date(ar, mon + 1, 0).getDate();
    let vardagar = 0;
    for (let d = 1; d <= sista; d++) {
      const dt = new Date(ar, mon, d);
      const dow = dt.getDay();
      const k = `${ar}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dow !== 0 && dow !== 6 && !roda[k]) vardagar++;
    }
    ovVardagar += Math.max(0, m.min / 60 - vardagar * 8);
    ovDagar += Math.max(0, (m.min - m.kortpassMin) / 60 - m.arbetsdagar * 8);
  }

  // Per ISO-vecka: bara dagar inom året (en vecka över årsskiftet räknas till
  // sina dagar i det här året — approximation, sagd)
  const veckor = new Map<string, number>();
  for (const [datum, min] of Array.from(minPerDatum.entries())) {
    const v = isoVecka(new Date(datum + "T00:00:00"));
    const k = `${v.år}-${v.vecka}`;
    veckor.set(k, (veckor.get(k) || 0) + min);
  }
  let ovVecka = 0;
  for (const min of Array.from(veckor.values())) ovVecka += Math.max(0, min / 60 - 40);

  // Genomsnitt över beräkningsperiod (avtalet §5 mom 2): block om 16 ISO-veckor
  // från v1. Basen = 40 × antal veckor i blocket som hunnit börja t.o.m. tomDatum
  // (ett pågående block räknas på de veckor som gått). Veckor utan arbete räknas
  // med i basen — det är hela poängen: en ledig vecka efter en 80-timmarsvecka
  // ger noll, inte 40.
  const idagV = isoVecka(new Date(tomDatum + "T00:00:00"));
  const sistaVecka = idagV.år === ar ? idagV.vecka : (idagV.år > ar ? 53 : 0);
  const perBlock = new Map<number, number>(); // blockindex → minuter
  for (const [k, min] of Array.from(veckor.entries())) {
    const [vÅr, vNr] = k.split("-").map(Number);
    if (vÅr !== ar) continue;
    const block = Math.floor((vNr - 1) / BERAKNINGSPERIOD_VECKOR);
    perBlock.set(block, (perBlock.get(block) || 0) + min);
  }
  let ovGenomsnitt = 0;
  for (const [block, min] of Array.from(perBlock.entries())) {
    const forsta = block * BERAKNINGSPERIOD_VECKOR + 1;
    const sista = Math.min(forsta + BERAKNINGSPERIOD_VECKOR - 1, sistaVecka);
    const veckorIBlock = Math.max(1, sista - forsta + 1);
    ovGenomsnitt += Math.max(0, min / 60 - 40 * veckorIBlock);
  }

  const timmar = Array.from(minPerDatum.values()).reduce((a, b) => a + b, 0) / 60;
  return {
    ar, tomDatum,
    timmar: r1(timmar),
    modeller: { vardagar: r1(ovVardagar), dagar: r1(ovDagar), vecka: r1(ovVecka), genomsnitt: r1(ovGenomsnitt) },
  };
}
