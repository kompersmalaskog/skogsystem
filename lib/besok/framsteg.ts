// Framsteget som markägaren ser överst på besökssidan: "62 % klart · klart ca fredag". Räknas på servern ur volymer som aldrig lämnar servern — sidan får bara procenten och dagen.
//
//   Klart = hälften skördat och hälften skotat (båda mot planerad volym, var för sig högst 100 %). Skotat noll = skotningen ännu inte börjat.
//   Klart ca = den senare av när skördningen och skotningen väntas bli klara, räknat i ARBETSDAGAR (mån–fre) på takten de senaste TAKT_DAGAR dagarna med produktion.
//   Dagen sägs BARA när prognosen håller (uppstramning 2026-10-23) — annars står bara "% klart". Alla villkor måste gälla för varje del som återstår:
//     1. minst TAKT_DAGAR dagar med produktion (färre = ingen takt),
//     2. takten stabil: varje av de dagarna ligger inom ±PROGNOS.TAKT_STABIL av snittet (en dag med 10 m³ bland dagar på 100 är ingen takt),
//     3. senaste produktionsdagen högst PROGNOS.SENASTE_DAG_MAX kalenderdagar gammal (en maskin som står still ger ingen prognos),
//     4. högst PROGNOS.HORISONT_MAX arbetsdagar kvar (längre fram är det en gissning).
//   Ingen antagen eftersläpning för skotningen längre: kan skotningens takt inte mätas (och något återstår att skota) sägs ingen dag.

import { dagarMellan } from '@/lib/grotvy/format';
import { PROGNOS, TAKT_DAGAR } from './konstanter';

export type DagVolym = { datum: string; m3: number };

export type FramstegIndata = {
  planeradM3: number | null | undefined;
  skordatM3: number | null | undefined;
  skotatM3: number | null | undefined;
  skordatPerDag: DagVolym[];
  skotatPerDag: DagVolym[];
  /** YYYY-MM-DD, svensk dag */
  idag: string;
};

export type Framsteg = { procent: number | null; klartCa: string | null };

const VECKODAG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

const utc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const arArbetsdag = (d: Date) => { const v = d.getUTCDay(); return v !== 0 && v !== 6; };

/** Dagen `n` arbetsdagar efter `fran` (n = 0 → samma dag, eller nästa arbetsdag om den är en helg). */
export function plusArbetsdagar(fran: string, n: number): string {
  const d = utc(fran);
  while (!arArbetsdag(d)) d.setUTCDate(d.getUTCDate() + 1);
  for (let k = 0; k < n; k++) { do { d.setUTCDate(d.getUTCDate() + 1); } while (!arArbetsdag(d)); }
  return iso(d);
}

/** Dagarna takten räknas på: de senaste TAKT_DAGAR med produktion. */
const taktDagar = (dagar: DagVolym[]) => dagar.filter((d) => Number.isFinite(d.m3) && d.m3 > 0).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, TAKT_DAGAR);

/** Snitt m³ per dag med produktion, på de senaste TAKT_DAGAR dagarna; null när färre än två dagar finns (en enda dag är ingen takt). */
export function takt(dagar: DagVolym[]): number | null {
  const med = taktDagar(dagar);
  if (med.length < 2) return null;
  return med.reduce((s, d) => s + d.m3, 0) / med.length;
}

/** Takten som prognosen får bygga på: exakt TAKT_DAGAR dagar, stabil, och senaste dagen färsk. null = prognosen håller inte. */
export function hallandeTakt(dagar: DagVolym[], idag: string): number | null {
  const med = taktDagar(dagar);
  if (med.length < TAKT_DAGAR) return null;
  const snitt = med.reduce((s, d) => s + d.m3, 0) / med.length;
  if (med.some((d) => Math.abs(d.m3 - snitt) > snitt * PROGNOS.TAKT_STABIL)) return null;
  if (dagarMellan(med[0].datum, idag) > PROGNOS.SENASTE_DAG_MAX) return null;
  return snitt;
}

/** Hur "klart ca" räknas – står på sidan under raden så markägaren ser vad dagen bygger på. */
export const KLART_CA_FORKLARING = `Räknat på de senaste ${TAKT_DAGAR} dagarna med arbete. Ändras med vädret och maskinerna.`;

/** "fredag" inom en vecka, annars "den 3 november". */
export function dagText(dag: string, idag: string): string {
  if (dagarMellan(idag, dag) <= 6) return VECKODAG[utc(dag).getUTCDay()];
  return `den ${Number(dag.slice(8, 10))} ${MANADER[Number(dag.slice(5, 7)) - 1]}`;
}

export function beraknaFramsteg(i: FramstegIndata): Framsteg {
  const plan = i.planeradM3 ?? 0;
  if (!(plan > 0) || i.skordatM3 == null || !Number.isFinite(i.skordatM3)) return { procent: null, klartCa: null };
  const andel = (v: number | null | undefined) => Math.max(0, Math.min(1, (v ?? 0) / plan));
  const sk = andel(i.skordatM3);
  const st = andel(i.skotatM3);
  const procent = Math.round(((sk + st) / 2) * 100);
  if (sk >= 1 && st >= 1) return { procent, klartCa: null };

  const kvarSk = Math.max(0, plan - (i.skordatM3 ?? 0));
  const kvarSt = Math.max(0, plan - (i.skotatM3 ?? 0));
  let dagar = 0;
  if (kvarSk > 0) {
    const t = hallandeTakt(i.skordatPerDag, i.idag);
    if (t == null) return { procent, klartCa: null };
    dagar = Math.max(dagar, Math.ceil(kvarSk / t));
  }
  if (kvarSt > 0) {
    const t = hallandeTakt(i.skotatPerDag, i.idag);
    if (t == null) return { procent, klartCa: null };
    dagar = Math.max(dagar, Math.ceil(kvarSt / t));
  }
  if (dagar > PROGNOS.HORISONT_MAX) return { procent, klartCa: null };
  return { procent, klartCa: dagText(plusArbetsdagar(i.idag, dagar), i.idag) };
}

/** Raden överst: "62 % klart · klart ca fredag" (delarna som saknas utelämnas). */
export function framstegText(f: Framsteg): string | null {
  const delar = [f.procent != null ? `${f.procent} % klart` : null, f.klartCa ? `klart ca ${f.klartCa}` : null].filter(Boolean);
  return delar.length ? delar.join(' · ') : null;
}

/** "Kompersmåla Skog åt Vida" — bolaget ur objektet; privat eller okänt bolag ger bara företagsnamnet. */
export function utforareText(bolag: string | null | undefined): string {
  const b = (bolag ?? '').trim();
  if (!b || /^privat$/i.test(b) || /^(none|not known)$/i.test(b)) return 'Kompersmåla Skog';
  return `Kompersmåla Skog åt ${/vida/i.test(b) ? 'Vida' : b}`;
}
