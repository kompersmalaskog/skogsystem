// Framsteget som markägaren ser överst på besökssidan: "62 % klart · klart ca fredag". Räknas på servern ur volymer som aldrig lämnar servern — sidan får bara procenten och dagen.
//
//   Klart = hälften skördat och hälften skotat (båda mot planerad volym, var för sig högst 100 %). Skotat noll = skotningen ännu inte börjat.
//   Klart ca = den senare av när skördningen och skotningen väntas bli klara, räknat i ARBETSDAGAR (mån–fre) på takten de senaste dagarna med produktion. Går skotningens takt inte
//   att mäta antas den bli klar SKOTNING_EFTER_DAGAR arbetsdagar efter skördningen. Saknas takt för skördningen (färre än två dagar med produktion) sägs ingen dag — ärligt tomt, ingen gissning.

import { dagarMellan } from '@/lib/grotvy/format';
import { SKOTNING_EFTER_DAGAR, TAKT_DAGAR } from './konstanter';

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

/** Snitt m³ per dag med produktion, på de senaste TAKT_DAGAR dagarna; null när färre än två dagar finns (en enda dag är ingen takt). */
export function takt(dagar: DagVolym[]): number | null {
  const med = dagar.filter((d) => Number.isFinite(d.m3) && d.m3 > 0).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, TAKT_DAGAR);
  if (med.length < 2) return null;
  return med.reduce((s, d) => s + d.m3, 0) / med.length;
}

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

  const taktSk = takt(i.skordatPerDag);
  if (taktSk == null) return { procent, klartCa: null };
  const kvarSk = Math.max(0, plan - (i.skordatM3 ?? 0));
  const dagarSk = kvarSk > 0 ? Math.ceil(kvarSk / taktSk) : 0;

  const taktSt = takt(i.skotatPerDag);
  const kvarSt = Math.max(0, plan - (i.skotatM3 ?? 0));
  const dagarSt = kvarSt <= 0 ? 0 : taktSt != null ? Math.ceil(kvarSt / taktSt) : dagarSk + SKOTNING_EFTER_DAGAR;

  const dagar = Math.max(dagarSk, dagarSt);
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
