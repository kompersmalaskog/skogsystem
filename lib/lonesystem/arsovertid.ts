// ─────────────────────────────────────────────────────────────
// ÅRETS ÖVERTID — FYRA MODELLER, AVTALETS ÄR DEN FJÄRDE (2026-09-18).
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
//               veckor". Beräkningsperioderna är:
//                 - MARKERADE utjämningsperioder (tabellen utjamningsperiod,
//                   hela ISO-veckor) — fakta om vad som gjordes, och
//                 - för veckorna däremellan: block om högst 16 veckor räknat
//                   från blockets första lediga vecka — ANTAGET; vilken period
//                   som tillämpas är Martins beslut (utjämningen ska vara
//                   överenskommen).
//
// INGEN av de tre första är avtalets. Gävle våren 2026 (v17–27: 72–80 timmar
// varannan vecka, tom vecka emellan, lön enligt schema) var ordinarie tid
// utlagd ojämnt enligt §5 mom 2 — INTE kompensationsledighet. Med perioden
// markerad ger den noll övertid för alla; Stefans tal kommer från v1–16 och
// från sensommaren, inte från Gävle. Fasta block från v1 kapade perioden mitt
// itu och gav 92 i stället för 44.
//
// FÖRBEHÅLL (står också i tabellens kommentar): en tom vecka räknas i basen
// bara om den är utjämnad ordinarie tid. Var den semester ska den inte vara
// med, och då stiger övertiden. Inom en markerad period vet appen vad en tom
// vecka betyder — utanför vet den det inte. Frånvaro per vecka dras inte av
// än (frånvaromodellen steg 3).
//
// Komp (§8 mom 3, 1,4×) räknas inte som övertid enligt ATL (§5 mom 5 anm 3)
// och finns inte i data. Därför inget rött "passerat taket" i admin. Taket
// (gs_avtal.max_overtid_ar_h, 250) är en lagstadgad gräns, inte ett mål.
//
// Räknas ALDRIG med skarp-start-golv: kalenderåret är kalenderåret.
// ─────────────────────────────────────────────────────────────
import { getRödaDagar } from "../roda-dagar";
import { isoVecka } from "../vilobrott";
import { arArbetsdag } from "../arbetsdagRegler";
import { FRANVARO_DAGTYPER_ALLA } from "../franvaro";

export type OvertidModell = "vardagar" | "dagar" | "vecka" | "genomsnitt";

/** Avtalets längsta beräkningsperiod (§5 mom 2) utan lokal överenskommelse. */
export const BERAKNINGSPERIOD_VECKOR = 16;

export const OVERTID_MODELLER: { key: OvertidModell; namn: string; beskrivning: string; anvandsAv: string; avtalet: boolean }[] = [
  { key: "vardagar",   namn: "Vardagar × 8",        beskrivning: "per månad: timmar minus kalenderns vardagar × 8", anvandsAv: "Min tid (förarens vy)", avtalet: false },
  { key: "dagar",      namn: "Arbetade dagar × 8",  beskrivning: "per månad: timmar minus arbetade dagar × 8", anvandsAv: "Fortnox-exporten (löneart 1435/1436)", avtalet: false },
  { key: "vecka",      namn: "Över 40 tim/vecka",   beskrivning: "per ISO-vecka: timmar över 40, ingen utjämning", anvandsAv: "ingen", avtalet: false },
  { key: "genomsnitt", namn: "Genomsnitt",          beskrivning: `avtalet §5 mom 2: timmar över 40 × veckor per beräkningsperiod — markerade utjämningsperioder som egna, däremellan antagna block om högst ${BERAKNINGSPERIOD_VECKOR} veckor`, anvandsAv: "Skogsavtalet — frånvaro och komp ej avdragna", avtalet: true },
];

export type ArsovertidDag = { datum: string; arbetad_min: number | null; dagtyp?: string | null; start_tid?: string | null };
export type ArsovertidExtra = { datum: string | null; minuter: number | null };

/** En rad ur tabellen utjamningsperiod (anroparen har redan filtrerat på medarbetare). */
export type Utjamningsperiod = { startdatum: string; slutdatum: string; anteckning?: string | null };

/** En beräkningsperiod i genomsnittsmodellen, för kortets förklaring. */
export type Berakningsperiod = {
  fran: number;        // ISO-vecka
  till: number;        // ISO-vecka (t.o.m. innevarande vecka om perioden pågår)
  veckor: number;
  timmar: number;
  overtid: number;
  markerad: boolean;   // true = ur utjamningsperiod (faktum), false = antaget block
  anteckning?: string | null;
};

export type Arsovertid = {
  ar: number;
  tomDatum: string;
  timmar: number;                       // totalt maskin + extra, hela året hittills
  modeller: Record<OvertidModell, number>;
  perioder: Berakningsperiod[];         // genomsnittsmodellens perioder, i ordning
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Räknar årets övertid enligt alla fyra modeller för EN medarbetare.
 * `dagar` och `extra` = medarbetarens rader för kalenderåret `ar` t.o.m. `tomDatum`.
 * `perioder` = markerade utjämningsperioder som gäller medarbetaren (alla eller egna).
 */
export function beraknaArsovertid(
  dagar: ArsovertidDag[],
  extra: ArsovertidExtra[],
  ar: number,
  tomDatum: string,
  perioder: Utjamningsperiod[] = [],
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

  // ── Genomsnitt över beräkningsperiod (avtalet §5 mom 2) ──
  // Veckorna 1..idag delas i beräkningsperioder: markerade utjämningsperioder
  // först (fakta), resten i block om högst 16 veckor från blockets första
  // vecka (antaget). Basen = 40 × veckor i perioden t.o.m. idag; veckor utan
  // arbete räknas med i basen — se förbehållet i filhuvudet.
  const idagV = isoVecka(new Date(tomDatum + "T00:00:00"));
  const sistaVecka = idagV.år === ar ? idagV.vecka : (idagV.år > ar ? 53 : 0);
  const minPerVecka = (v: number) => veckor.get(`${ar}-${v}`) || 0;

  const agare = new Map<number, number>(); // vecka → index i `markerade`
  const markerade: { fran: number; till: number; anteckning?: string | null }[] = [];
  for (const p of perioder) {
    const s = isoVecka(new Date(p.startdatum + "T00:00:00"));
    const e = isoVecka(new Date(p.slutdatum + "T00:00:00"));
    // Bara den del som ligger i året (en period över årsskiftet räknas per år — approximation, sagd)
    const fran = s.år < ar ? 1 : s.år > ar ? Infinity : s.vecka;
    const till = e.år > ar ? 53 : e.år < ar ? -Infinity : e.vecka;
    if (fran > sistaVecka || till < 1) continue;
    const idx = markerade.push({ fran: Math.max(1, fran), till: Math.min(till, sistaVecka), anteckning: p.anteckning }) - 1;
    for (let v = markerade[idx].fran; v <= markerade[idx].till; v++) if (!agare.has(v)) agare.set(v, idx);
  }

  const perioderUt: Berakningsperiod[] = [];
  const laggTill = (fran: number, till: number, markerad: boolean, anteckning?: string | null) => {
    let min = 0;
    for (let v = fran; v <= till; v++) min += minPerVecka(v);
    const n = till - fran + 1;
    perioderUt.push({ fran, till, veckor: n, timmar: r1(min / 60), overtid: r1(Math.max(0, min / 60 - 40 * n)), markerad, anteckning: anteckning ?? undefined });
  };
  let v = 1;
  while (v <= sistaVecka) {
    const m = agare.get(v);
    if (m != null) {
      const p = markerade[m];
      let till = v;
      while (till + 1 <= p.till && agare.get(till + 1) === m) till++;
      laggTill(v, till, true, p.anteckning);
      v = till + 1;
    } else {
      let till = v;
      while (till + 1 <= sistaVecka && !agare.has(till + 1) && till + 1 - v < BERAKNINGSPERIOD_VECKOR) till++;
      laggTill(v, till, false);
      v = till + 1;
    }
  }
  const ovGenomsnitt = perioderUt.reduce((s, p) => s + p.overtid, 0);

  const timmar = Array.from(minPerDatum.values()).reduce((a, b) => a + b, 0) / 60;
  return {
    ar, tomDatum,
    timmar: r1(timmar),
    modeller: { vardagar: r1(ovVardagar), dagar: r1(ovDagar), vecka: r1(ovVecka), genomsnitt: r1(ovGenomsnitt) },
    perioder: perioderUt,
  };
}
