// ─────────────────────────────────────────────────────────────
// ÅRETS ÖVERTID — FYRA MODELLER, AVTALETS ÄR DEN FJÄRDE (2026-09-18).
//
// Första dry_run (2026-09-13) visade att systemet svarade olika på "hur mycket
// övertid har Stefan i år" beroende på var man tittade, och att föraren såg
// det LÄGSTA talet medan exporten skulle rapportera ett tal ÖVER taket:
//
//   vardagar    per månad: timmar − kalenderns vardagar (ej röda) × 8, negativa
//               månader nollas — vad Min tid räknade före 2026-10-19  Stefan 172,5
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
// BAS (rättad 2026-10-09): basen per vecka är 40 tim MINUS FRÅNVARO (semester,
// sjuk, VAB, föräldraledig, ATK, komp, tjänstledig, permission; 8 tim/dag ur
// lib/franvaro) och MINUS RÖDA VARDAGAR (lib/roda-dagar, 8 tim/dag) — både i
// markerade perioder och antagna block. Förr räknades varje vecka som 40 tim,
// även semestervecka: Stefans v28–29 (semester 29/6–17/7) tog 80 tim övertid
// ur blocket och v1 (nyår, 1,7 tim arbetat) räknades som full vecka — 74,5 i
// stället för ca 190. Kvarstående förbehåll: en tom vecka UTAN registrerad
// frånvaro räknas fortfarande i basen (appen vet inte att den var ledig).
//
// Komp (§8 mom 3, 1,4×) räknas inte som övertid enligt ATL (§5 mom 5 anm 3)
// och finns inte i data. Därför inget rött "passerat taket" i admin. Taket
// (gs_avtal.max_overtid_ar_h, 250) är en lagstadgad gräns, inte ett mål.
//
// FEMTE MODELLEN, `manad` — DEN LAGKONTROLLEN OCH MIN TID RÄKNAR MED (Martin 2026-10-19): samma regel som lönen (#824). Övertid uppstår
//   per kalendermånad först när månadens ORDINARIE timmar är fyllda (lib/lonesystem/manadsordinarie — återanvänd, kopiera aldrig):
//   vardagar × 8 − röda vardagar − frånvaro − dagar före anställning − deldagens timmar; övertid = max(0, arbetat − ordinarie).
//     - En AVSLUTAD månad ger exakt lönens övertid (paritetstest mot beraknaLoneunderlag).
//     - Den PÅGÅENDE månaden är "ställning hittills": arbetat hittills − ordinarie för vardagarna hittills (idag räknas först när den
//       har registrerad tid, annars står ställningen på minus varje morgon). Kan bli gul, aldrig röd (lib/arbetstidsgranser).
//     - En månad som överlappar en MARKERAD utjämningsperiod behåller genomsnittsmodellens fördelning (som lönen behåller sin gamla
//       formel där): `manader[].modell === "utjamning"`.
//   Årets tal = summan av månadernas tal (overtidPerManad), varje månad avrundad till en decimal först.
//
// Räknas ALDRIG med skarp-start-golv: kalenderåret är kalenderåret.
// ─────────────────────────────────────────────────────────────
import { getRödaDagar } from "../roda-dagar";
import { isoVecka } from "../vilobrott";
import { arArbetsdag } from "../arbetsdagRegler";
import { franvaroPerDatum, deldagarPerDatum, deldagTimmar, hemskickadMinuter, arDeldag, schemaTimmarPerDag, FRANVARO_STATUS_GALLER, type FranvaroRad } from "../franvaro";
import { manadensOrdinarie, overlapparUtjamning, type OrdinarieLedighet } from "./manadsordinarie";
import { helglonDagar } from "./helglon";

export type OvertidModell = "vardagar" | "dagar" | "vecka" | "genomsnitt" | "manad";

/** Avtalets längsta beräkningsperiod (§5 mom 2) utan lokal överenskommelse. */
export const BERAKNINGSPERIOD_VECKOR = 16;

export const OVERTID_MODELLER: { key: OvertidModell; namn: string; beskrivning: string; anvandsAv: string; avtalet: boolean }[] = [
  { key: "vardagar",   namn: "Vardagar × 8",        beskrivning: "per månad: timmar minus kalenderns vardagar × 8", anvandsAv: "ingen (Min tid använde den före 2026-10-19)", avtalet: false },
  { key: "dagar",      namn: "Arbetade dagar × 8",  beskrivning: "per månad: timmar minus arbetade dagar × 8", anvandsAv: "Fortnox-exporten (löneart 1435/1436)", avtalet: false },
  { key: "vecka",      namn: "Över 40 tim/vecka",   beskrivning: "per ISO-vecka: timmar över 40, ingen utjämning", anvandsAv: "ingen", avtalet: false },
  { key: "genomsnitt", namn: "Genomsnitt",          beskrivning: `avtalet §5 mom 2: timmar över 40 × veckor per beräkningsperiod — markerade utjämningsperioder som egna, däremellan antagna block om högst ${BERAKNINGSPERIOD_VECKOR} veckor`, anvandsAv: "Utjämningsmånader i lagkontrollen (Skogsavtalet §5 mom 2)", avtalet: true },
  { key: "manad",      namn: "Månadens ordinarie",  beskrivning: "per kalendermånad: arbetad tid minus månadens ordinarie timmar (vardagar × 8 − röda dagar − frånvaro − före anställning), utjämningsmånader som genomsnitt", anvandsAv: "Lönen, lagkontrollen och Min tid", avtalet: false },
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
  /** Basen i timmar: 40 per vecka minus frånvaro och röda vardagar (8 tim/dag). */
  bas: number;
  /** Av basen: timmar som drogs för frånvaro resp. röda vardagar i perioden. */
  franvaroTimmar: number;
  rodaTimmar: number;
  overtid: number;
  markerad: boolean;   // true = ur utjamningsperiod (faktum), false = antaget block
  anteckning?: string | null;
  /** Periodens sista vecka är slut (söndagen ≤ tomDatum). En pågående period har ännu ingen fastställd övertid. */
  avslutad: boolean;
};

/** Det beräkningen behöver utöver dagar, extra tid och frånvaro: det lönemotorn också läser ur medarbetare och avtal. Saknas det gäller avtalets standard. */
export type ArsovertidKontext = {
  /** medarbetare.anstallningsdatum: vardagar före det räknas inte i månadens ordinarie. */
  anstallningsdatum?: string | null;
  /** gs_avtal.helglon_dagar: avtalets röda dagar (de som dras ur månadens ordinarie). Saknas den gäller avtalets tolv. */
  helglonNamn?: string | null;
  /** gs_avtal.ordinarie_vecka_h: schematimmarna per dag för en deldag (40 → 8). */
  ordinarieVeckaH?: number | null;
};

/** En kalendermånad i månadsmodellen. */
export type ArsovertidManad = {
  manad: string;                     // YYYY-MM
  /** 'manad' = lönens regel. 'utjamning' = månaden överlappar en markerad utjämningsperiod och följer genomsnittets fördelning. */
  modell: "manad" | "utjamning";
  /** Arbetad tid i månaden (t.o.m. tomDatum): maskin + extra + hemskickad. Två decimaler, som lönen. */
  arbetadH: number;
  /** Månadens ordinarie timmar; i den pågående månaden bara vardagarna hittills. null för utjämningsmånader. */
  ordinarieH: number | null;
  /** Övertid i månaden (aldrig negativ); i den pågående månaden = max(0, ställning). null för utjämningsmånader. */
  overtid: number | null;
  /** Bara den pågående månaden: arbetat hittills − ordinarie hittills (kan vara negativ). */
  stallning: number | null;
  /** Månaden är tomDatums månad — inte slut än. */
  pagaende: boolean;
};

/** Veckan som den ingår i basen: arbetade timmar och basen (40 − frånvaro − röda vardagar). */
export type ArsovertidVecka = { vecka: number; timmar: number; bas: number };

export type Arsovertid = {
  ar: number;
  tomDatum: string;
  timmar: number;                       // totalt maskin + extra, hela året hittills
  modeller: Record<OvertidModell, number>;
  /** Månadsmodellen månad för månad (januari t.o.m. tomDatums månad). Källan till `modeller.manad` och till lagkontrollens månadsstatus. */
  manader: ArsovertidManad[];
  perioder: Berakningsperiod[];         // genomsnittsmodellens perioder, i ordning
  /** Vecka 1..innevarande, för den som ska fördela periodens övertid på veckor (lib/arbetstidsgranser). */
  veckor: ArsovertidVecka[];
  /** Hela årets (t.o.m. tomDatum) avdrag ur basen: frånvaro och röda vardagar, i timmar à 8 tim/dag. */
  basavdrag: { franvaroTimmar: number; rodaTimmar: number };
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

// ── Övertid per kalendermånad (lagkontrollens gräns 3, årets tal i gräns 1 och 2) ──
export type ManadsOvertid = Record<string, { fast: number; uppskattad: number; stallning?: true }>;

const isoLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lokalDatum = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const plusDagarIso = (s: string, n: number) => { const d = lokalDatum(s); d.setDate(d.getDate() + n); return isoLokal(d); };

/** Måndagen i ISO-vecka `vecka` i ISO-året `ar` (vecka 1 är den som innehåller 4 januari). */
export function isoVeckaMandag(ar: number, vecka: number): Date {
  const d = new Date(ar, 0, 4);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (vecka - 1) * 7);
  return d;
}

/**
 * Årets övertid fördelad på kalendermånader (nycklar "YYYY-MM"). Se filhuvudet för månadsregeln.
 *   - Månad med månadsregeln (`manader`, modell 'manad'): avslutad = fastställd, pågående = uppskattad ställning hittills.
 *   - Månad i en markerad utjämningsperiod, och varje månad som `manader` inte nämner (äldre anrop utan månadsmodell): genomsnittets
 *     fördelning — ej markerade block per vecka som fastställda (veckans torsdag avgör månaden), markerade perioder hela på
 *     slutmånaden som uppskattad (pågående period: innevarande månad).
 */
export function overtidPerManad(a: Pick<Arsovertid, "ar" | "tomDatum" | "perioder" | "veckor"> & { manader?: ArsovertidManad[] }): ManadsOvertid {
  const gen: ManadsOvertid = {};
  const lagg = (ym: string, slag: "fast" | "uppskattad", h: number) => {
    const m = gen[ym] || (gen[ym] = { fast: 0, uppskattad: 0 });
    m[slag] += h;
  };
  const veckaManad = (v: number) => plusDagarIso(isoLokal(isoVeckaMandag(a.ar, v)), 3).slice(0, 7);   // torsdagen avgör
  const veckaSondag = (v: number) => plusDagarIso(isoLokal(isoVeckaMandag(a.ar, v)), 6);
  const perVecka = new Map(a.veckor.map(v => [v.vecka, Math.max(0, v.timmar - v.bas)]));

  for (const p of a.perioder) {
    if (!(p.overtid > 0)) continue;
    if (p.markerad) {
      const dag = p.avslutad ? veckaSondag(p.till) : a.tomDatum;
      lagg(dag.slice(0, 7), "uppskattad", p.overtid);
      continue;
    }
    let summa = 0;
    for (let v = p.fran; v <= p.till; v++) summa += perVecka.get(v) || 0;
    if (!(summa > 0)) { lagg(veckaManad(p.till), "fast", p.overtid); continue; }   // inget veckoöverskott att fördela på: ingen timme får tappas
    for (let v = p.fran; v <= p.till; v++) {
      const s = perVecka.get(v) || 0;
      if (s > 0) lagg(veckaManad(v), "fast", (p.overtid * s) / summa);
    }
  }
  for (const m of Object.values(gen)) { m.fast = r1(m.fast); m.uppskattad = r1(m.uppskattad); }
  if (!a.manader || a.manader.length === 0) return gen;

  const ut: ManadsOvertid = {};
  const manadsregel = new Map(a.manader.filter(m => m.modell === "manad").map(m => [m.manad, m]));
  for (const [ym, v] of Object.entries(gen)) if (!manadsregel.has(ym)) ut[ym] = v;
  manadsregel.forEach((m, ym) => {
    const h = r1(m.overtid ?? 0);
    if (!(h > 0)) return;   // noll och negativt ger ingen post
    ut[ym] = m.pagaende ? { fast: 0, uppskattad: h, stallning: true } : { fast: h, uppskattad: 0 };
  });
  return ut;
}

/**
 * Räknar årets övertid enligt alla fem modeller för EN medarbetare.
 * `dagar` och `extra` = medarbetarens rader för kalenderåret `ar` t.o.m. `tomDatum`.
 * `perioder` = markerade utjämningsperioder som gäller medarbetaren (alla eller egna).
 */
export function beraknaArsovertid(
  dagar: ArsovertidDag[],
  extra: ArsovertidExtra[],
  ar: number,
  tomDatum: string,
  perioder: Utjamningsperiod[] = [],
  franvaro: FranvaroRad[] = [],
  kontext: ArsovertidKontext = {},
): Arsovertid {
  // arbetsdag.dagtyp läses inte (steg 3, 2026-09-25): frånvaro i sig läses
  // inte här än — veckor med frånvaro dras inte av basen (förbehållet i
  // filhuvudet). En rad utan tid bidrar med 0 minuter och räknas inte som
  // arbetsdag (arArbetsdag).
  const roda = getRödaDagar(ar);
  const arStart = `${ar}-01-01`;

  // Minuter per datum: maskin + extra
  const minPerDatum = new Map<string, number>();
  const maskinPerDatum = new Map<string, number>();
  for (const d of dagar) {
    if (!d.datum || d.datum < arStart || d.datum > tomDatum) continue;
    const m = d.arbetad_min || 0;
    maskinPerDatum.set(d.datum, (maskinPerDatum.get(d.datum) || 0) + m);
    minPerDatum.set(d.datum, (minPerDatum.get(d.datum) || 0) + m);
  }
  for (const e of extra) {
    if (!e.datum || e.datum < arStart || e.datum > tomDatum) continue;
    minPerDatum.set(e.datum, (minPerDatum.get(e.datum) || 0) + (e.minuter || 0));
  }

  // HEMSKICKAD (typ 'hemskickad', del av dag): ingen frånvaro — dagen fylls upp till 8 tim och räknas som arbetad tid, som i lönemotorn
  // (loneberakning: betalas som timlön, ordinarie, aldrig övertid av sig själv). Minuterna härleds ur den arbetade tiden den dagen. Om
  // dagen är en arbetsdag avgörs av den ARBETADE tiden (före påfyllningen): en dag under 60 min är kortpass även med hemskickad.
  const arbetadPerDatum = new Map(minPerDatum);
  const hemPerDatum = new Map<string, number>();
  for (const r of franvaro) {
    if (r.typ !== "hemskickad" || !arDeldag(r) || !(FRANVARO_STATUS_GALLER as readonly string[]).includes(r.status)) continue;
    const d = r.startdatum;
    if (!d || d < arStart || d > tomDatum || hemPerDatum.has(d)) continue;
    hemPerDatum.set(d, hemskickadMinuter(minPerDatum.get(d) || 0));
  }
  hemPerDatum.forEach((hemMin, datum) => { if (hemMin > 0) minPerDatum.set(datum, (minPerDatum.get(datum) || 0) + hemMin); });

  // Per månad
  const manader = new Map<string, { min: number; arbetsdagar: number; kortpassMin: number }>();
  for (const [datum, min] of Array.from(minPerDatum.entries())) {
    const mp = datum.slice(0, 7);
    const m = manader.get(mp) || { min: 0, arbetsdagar: 0, kortpassMin: 0 };
    m.min += min;
    if (arArbetsdag(arbetadPerDatum.get(datum) || 0)) m.arbetsdagar++;
    else m.kortpassMin += (maskinPerDatum.get(datum) || 0) + (hemPerDatum.get(datum) || 0); // kortpass + hemskickad på en dag utan ×8 = timlön, aldrig övertid (loneberakning)
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
  // vecka (antaget). BASEN per vecka = 40 tim minus FRÅNVARO (semester, sjuk,
  // VAB, föräldraledig, ATK, komp, tjänstledig, permission) minus RÖDA VARDAGAR,
  // 8 tim per dag (se basPerVecka nedan). Förr var basen 40 × veckor rakt av.
  const idagV = isoVecka(new Date(tomDatum + "T00:00:00"));
  const sistaVecka = idagV.år === ar ? idagV.vecka : (idagV.år > ar ? 53 : 0);
  const minPerVecka = (v: number) => veckor.get(`${ar}-${v}`) || 0;

  // ── Basen per ISO-vecka ──
  // Ordinarie tid är 40 tim/vecka = 8 tim per vardag. En vardag som är röd eller frånvaro är ingen ordinarie arbetsdag:
  // basen minskar med 8 (en gång per dag, även om den både är röd och täcks av en semesterrad). Veckan är ISO-veckan med
  // alla sina fem vardagar (v1 börjar måndagen före nyår, så 29–31/12 räknas dit — som varje annan ledig vardag utan
  // registrerad frånvaro) och räknas t.o.m. tomDatum: den pågående veckan är ingen hel vecka. Frånvaro: hamtaFranvaro-rader
  // som gäller (godkänd/registrerad); 'inarbetad' (skoftning) är ingen frånvaro. ARBETE VINNER: en heldagsrad över en
  // arbetad dag drar inget; en deldag drar schematimmar minus arbetade (lib/franvaro.deldagTimmar).
  const DAG_H = 40 / 5;
  const gallande = franvaro.filter(r => (FRANVARO_STATUS_GALLER as readonly string[]).includes(r.status) && r.typ !== "inarbetad" && r.typ !== "hemskickad");
  // v1 börjar måndagen i ISO-vecka 1 (4 januari ligger alltid i den).
  const vecka1Start = new Date(ar, 0, 4);
  vecka1Start.setDate(vecka1Start.getDate() - ((vecka1Start.getDay() + 6) % 7));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const basFran = iso(vecka1Start);
  const rodaBas = { ...getRödaDagar(ar - 1), ...roda };
  const heldagFr = franvaroPerDatum(gallande, basFran, tomDatum);
  const deldagFr = deldagarPerDatum(gallande, basFran, tomDatum);
  const basPerVecka = new Map<number, { bas: number; franvaro: number; roda: number }>();
  for (const d = new Date(vecka1Start); ; d.setDate(d.getDate() + 1)) {
    const k = iso(d);
    if (k > tomDatum) break;
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iv = isoVecka(d);
    if (iv.år !== ar) continue;
    const e = basPerVecka.get(iv.vecka) || { bas: 0, franvaro: 0, roda: 0 };
    let avdrag = 0;
    if (rodaBas[k]) { avdrag = DAG_H; e.roda += DAG_H; }
    else {
      const min = arbetadPerDatum.get(k) || 0;   // den ARBETADE tiden (hemskickad är inte frånvaro och fyller inte upp en heldagsrad)
      if (heldagFr[k] && !arArbetsdag(min)) avdrag = DAG_H;
      else if (deldagFr[k]) avdrag = deldagTimmar(DAG_H, min);
      e.franvaro += avdrag;
    }
    e.bas += DAG_H - avdrag;
    basPerVecka.set(iv.vecka, e);
  }
  let avdragFranvaro = 0, avdragRoda = 0;
  basPerVecka.forEach(e => { avdragFranvaro += e.franvaro; avdragRoda += e.roda; });

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
    let min = 0, bas = 0, frH = 0, rodaH = 0;
    for (let v = fran; v <= till; v++) {
      min += minPerVecka(v);
      const b = basPerVecka.get(v);
      if (b) { bas += b.bas; frH += b.franvaro; rodaH += b.roda; }
    }
    const n = till - fran + 1;
    const sondag = new Date(vecka1Start);
    sondag.setDate(sondag.getDate() + (till - 1) * 7 + 6);
    perioderUt.push({
      fran, till, veckor: n, timmar: r1(min / 60), bas: r1(bas), franvaroTimmar: r1(frH), rodaTimmar: r1(rodaH),
      overtid: r1(Math.max(0, min / 60 - bas)), markerad, anteckning: anteckning ?? undefined,
      avslutad: iso(sondag) <= tomDatum,
    });
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
  const veckorUt: ArsovertidVecka[] = Array.from({ length: sistaVecka }, (_, i) => ({ vecka: i + 1, timmar: r1(minPerVecka(i + 1) / 60), bas: r1(basPerVecka.get(i + 1)?.bas ?? 0) }));

  // ── Månadsregeln: lönens (lib/lonesystem/manadsordinarie), månad för månad ──
  const rodaAvtal = Object.keys(helglonDagar(kontext.helglonNamn ?? null, ar));
  const gallandeFr = franvaro.filter(r => (FRANVARO_STATUS_GALLER as readonly string[]).includes(r.status));
  const ledigheter: OrdinarieLedighet[] = gallandeFr.map(r => ({ typ: r.typ, startdatum: r.startdatum, slutdatum: r.slutdatum, fran_tid: r.fran_tid, till_tid: r.till_tid }));
  const arbetadeDatum = new Set<string>();
  maskinPerDatum.forEach((min, datum) => { if (min > 0) arbetadeDatum.add(datum); });   // som lönen: dagar med maskinpass (arbetad_min > 0)
  const schemaH = schemaTimmarPerDag(kontext.ordinarieVeckaH);
  const deldagar = gallandeFr
    .filter(r => arDeldag(r) && r.typ !== "inarbetad" && r.typ !== "hemskickad" && !!r.startdatum)
    .map(r => ({ datum: r.startdatum, timmar: deldagTimmar(schemaH, maskinPerDatum.get(r.startdatum) || 0) }));
  const manadsLista: ArsovertidManad[] = [];
  const sistaManad = tomDatum.slice(0, 7);
  for (let mon = 0; mon < 12; mon++) {
    const ym = `${ar}-${String(mon + 1).padStart(2, "0")}`;
    if (ym > sistaManad) break;
    const pagaende = ym === sistaManad;
    const arbetadH = r2((manader.get(ym)?.min || 0) / 60);
    if (overlapparUtjamning(ym, perioder)) {
      manadsLista.push({ manad: ym, modell: "utjamning", arbetadH, ordinarieH: null, overtid: null, stallning: null, pagaende });
      continue;
    }
    // Pågående månad: ordinarie hittills. Idag räknas först när den har registrerad tid (annars står ställningen på minus varje morgon).
    const ordinarieTom = pagaende ? ((minPerDatum.get(tomDatum) || 0) > 0 ? tomDatum : plusDagarIso(tomDatum, -1)) : undefined;
    const ord = manadensOrdinarie({
      arbetsperiod: ym, rodaDagar: rodaAvtal.filter(d => d.startsWith(ym)), ledigheter, arbetadeDatum, deldagar,
      anstallningsdatum: kontext.anstallningsdatum ?? null, tomDatum: ordinarieTom,
    });
    const stallning = r2(arbetadH - ord.timmar);
    manadsLista.push({ manad: ym, modell: "manad", arbetadH, ordinarieH: ord.timmar, overtid: r2(Math.max(0, stallning)), stallning: pagaende ? stallning : null, pagaende });
  }
  const perManad = overtidPerManad({ ar, tomDatum, perioder: perioderUt, veckor: veckorUt, manader: manadsLista });
  const ovManad = Object.values(perManad).reduce((s, m) => s + m.fast + m.uppskattad, 0);

  const timmar = Array.from(minPerDatum.values()).reduce((a, b) => a + b, 0) / 60;
  return {
    ar, tomDatum,
    timmar: r1(timmar),
    modeller: { vardagar: r1(ovVardagar), dagar: r1(ovDagar), vecka: r1(ovVecka), genomsnitt: r1(ovGenomsnitt), manad: r1(ovManad) },
    manader: manadsLista,
    perioder: perioderUt,
    veckor: veckorUt,
    basavdrag: { franvaroTimmar: r1(avdragFranvaro), rodaTimmar: r1(avdragRoda) },
  };
}
