// ─────────────────────────────────────────────────────────────
// ÅRETS ÖVERTID — TRE MODELLER, INGEN VALD (2026-09-13).
//
// Första dry_run visade att systemet svarade olika på "hur mycket övertid har
// Stefan i år" beroende på var man tittade, och att föraren såg det LÄGSTA
// talet ("god marginal") medan exporten skulle rapportera ett tal ÖVER taket:
//
//   vardagar  per månad: timmar − kalenderns vardagar (ej röda) × 8, negativa
//             månader nollas — vad Min tid räknade                 Stefan 172,5
//   dagar     per månad: timmar − arbetade dagar (≥ 60 min) × 8 — vad
//             Fortnox-exporten rapporterar som 1435/1436            Stefan 270,9
//   vecka     per ISO-vecka: timmar över 40 — avtalets ordinarie
//             arbetstid är 40 tim/vecka                             Stefan 307,3
//
// Vilken som gäller är en AVTALSFRÅGA (vad är ordinarie tid för en förare
// utan schema?) som Martin tar med löneansvariga. Tills den är svarad visas
// alla tre i admin, och ingen vy får byta modell på egen hand — det vore att
// byta en gissning mot en annan. Taket (gs_avtal.max_overtid_ar_h, 250) är en
// lagstadgad gräns, inte ett mål.
//
// Räknas ALDRIG med skarp-start-golv: kalenderåret är kalenderåret.
// ─────────────────────────────────────────────────────────────
import { getRödaDagar } from "../roda-dagar";
import { isoVecka } from "../vilobrott";
import { arArbetsdag } from "../arbetsdagRegler";
import { FRANVARO_DAGTYPER_ALLA } from "../franvaro";

export type OvertidModell = "vardagar" | "dagar" | "vecka";

export const OVERTID_MODELLER: { key: OvertidModell; namn: string; beskrivning: string; anvandsAv: string }[] = [
  { key: "vardagar", namn: "Vardagar × 8", beskrivning: "per månad: timmar minus kalenderns vardagar × 8", anvandsAv: "Min tid (förarens vy)" },
  { key: "dagar",    namn: "Arbetade dagar × 8", beskrivning: "per månad: timmar minus arbetade dagar × 8", anvandsAv: "Fortnox-exporten (löneart 1435/1436)" },
  { key: "vecka",    namn: "Över 40 tim/vecka", beskrivning: "per ISO-vecka: timmar över 40", anvandsAv: "ingen ännu — avtalets ordinarie tid" },
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

  const timmar = Array.from(minPerDatum.values()).reduce((a, b) => a + b, 0) / 60;
  return {
    ar, tomDatum,
    timmar: r1(timmar),
    modeller: { vardagar: r1(ovVardagar), dagar: r1(ovDagar), vecka: r1(ovVecka) },
  };
}
