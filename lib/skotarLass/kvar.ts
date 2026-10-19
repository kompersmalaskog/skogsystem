// Kvar, klar-dag och färdigskotad. Rena funktioner.
//
// KVAR = skördat (skördarens mätning, fakt_sortiment) minus summan av rapporterade lass, per sortiment. Visas alltid med "~": det är en
// uppskattning av förarens rapporterade hela m³. Lass som väntar på föraren räknas med (de är ifyllda som förra lasset) — de bekräftar
// sig självt eller rättas inom sekunder; de som är struken räknas aldrig.
import { sortimentNyckel, type SkordatSortiment } from './sortiment';
import { heltM3, lassTotalM3 } from './lassModell';
import type { Lass } from './typer';

export interface KvarSortiment {
  nyckel: string;
  namn: string;
  skordat: number;
  skotat: number;
  /** skördat − skotat. Negativ om föraren rapporterat mer än skördaren mätt. */
  kvar: number;
}

export interface Kvar {
  rader: KvarSortiment[];
  skordat: number;
  skotat: number;
  /** Det som återstår att köra: summan av positiva kvar per sortiment. */
  kvarTotal: number;
}

const raknasMed = (l: Lass) => l.status !== 'struket';

/** Förarens summa per sortiment över alla (icke-strukna) lass. */
export function skotatPerSortiment(lass: readonly Lass[]): Map<string, { namn: string; m3: number }> {
  const per = new Map<string, { namn: string; m3: number }>();
  for (const l of lass) {
    if (!raknasMed(l)) continue;
    for (const d of l.delar) for (const r of d.rader) {
      const n = sortimentNyckel(r.nyckel || r.namn);
      const g = per.get(n) ?? { namn: r.namn, m3: 0 };
      g.m3 += heltM3(r.m3);
      per.set(n, g);
    }
  }
  return per;
}

export function beraknaKvar(skordat: readonly SkordatSortiment[], lass: readonly Lass[]): Kvar {
  const skotat = skotatPerSortiment(lass);
  const rader: KvarSortiment[] = [];
  const sedda = new Set<string>();
  for (const s of skordat) {
    const k = skotat.get(s.nyckel)?.m3 ?? 0;
    sedda.add(s.nyckel);
    rader.push({ nyckel: s.nyckel, namn: s.namn, skordat: s.m3, skotat: k, kvar: s.m3 - k });
  }
  // Sortiment föraren rapporterat som skördaren inte mätt (skördat 0): finns med, kvar negativ.
  for (const [nyckel, g] of skotat) if (!sedda.has(nyckel)) rader.push({ nyckel, namn: g.namn, skordat: 0, skotat: g.m3, kvar: -g.m3 });
  rader.sort((a, b) => b.kvar - a.kvar);
  return {
    rader,
    skordat: rader.reduce((s, r) => s + r.skordat, 0),
    skotat: rader.reduce((s, r) => s + r.skotat, 0),
    kvarTotal: rader.reduce((s, r) => s + Math.max(0, r.kvar), 0),
  };
}

// ── Klar-dag ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const VECKODAG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'] as const;
const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'] as const;

const dagNr = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoFranDagNr = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const veckodag = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();
const arArbetsdag = (iso: string): boolean => { const d = veckodag(iso); return d !== 0 && d !== 6; };

export const KLAR_MIN_DAGAR = 2;
export const KLAR_SENASTE_DAGAR = 5;

export interface LassDag { datum: string; m3: number }

/** Lassens m³ per dag (icke-strukna). */
export function perDag(lass: readonly Lass[]): LassDag[] {
  const per = new Map<string, number>();
  for (const l of lass) if (raknasMed(l)) per.set(l.datum, (per.get(l.datum) ?? 0) + lassTotalM3(l));
  return Array.from(per, ([datum, m3]) => ({ datum, m3 })).filter((d) => d.m3 > 0).sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Snitt m³ per arbetsdag ur de senaste dagarna på trakten. Hela dagar (före idag); räcker inte de tas dagens med. Under KLAR_MIN_DAGAR → null. */
export function snittPerDag(dagar: readonly LassDag[], idag: string): number | null {
  const hela = dagar.filter((d) => d.datum < idag);
  const underlag = (hela.length >= KLAR_MIN_DAGAR ? hela : dagar.filter((d) => d.datum <= idag)).slice(-KLAR_SENASTE_DAGAR);
  if (underlag.length < KLAR_MIN_DAGAR) return null;
  const summa = underlag.reduce((s, d) => s + d.m3, 0);
  return summa > 0 ? summa / underlag.length : null;
}

/** Datumet trakten blir klar om kvar körs i snitt-takt, räknat i arbetsdagar med idag som dag 1 (om idag är en arbetsdag). */
export function klarDatum(kvarM3: number, snitt: number, idag: string): string | null {
  if (!(kvarM3 > 0) || !(snitt > 0)) return null;
  const antal = Math.max(1, Math.ceil(kvarM3 / snitt));
  let dag = dagNr(idag);
  let kvarDagar = antal;
  // dag 1 = idag om det är en arbetsdag, annars nästa arbetsdag
  for (let guard = 0; guard < 4000; guard++) {
    if (arArbetsdag(isoFranDagNr(dag))) { kvarDagar -= 1; if (kvarDagar === 0) return isoFranDagNr(dag); }
    dag += 1;
  }
  return null;
}

/** "idag", "i morgon", "onsdag" (inom en vecka), annars "3 nov". */
export function datumText(iso: string, idag: string): string {
  const diff = dagNr(iso) - dagNr(idag);
  if (diff <= 0) return 'idag';
  if (diff === 1) return 'i morgon';
  if (diff < 7) return VECKODAG[veckodag(iso)];
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MANAD[m - 1]}`;
}

export interface KvarSammanfattning {
  /** "Kvar ~121 m³" */
  kvarText: string;
  /** "Klar ~onsdag" — null tills det finns minst två dagars underlag. */
  klarText: string | null;
  kvarM3: number;
}

export function kvarSammanfattning(kvar: Kvar, lass: readonly Lass[], idag: string): KvarSammanfattning {
  const m3 = Math.round(kvar.kvarTotal);
  const snitt = snittPerDag(perDag(lass), idag);
  const datum = snitt != null ? klarDatum(kvar.kvarTotal, snitt, idag) : null;
  return {
    kvarM3: m3,
    kvarText: `Kvar ~${m3} m³`,
    klarText: datum ? `Klar ~${datumText(datum, idag)}` : null,
  };
}

/** "Idag: 7 lass · 131 m³" — maskinens lass på trakten i dag (alla skotare på trakten räknas i `lass`). */
export function idagText(lass: readonly Lass[], idag: string): { antal: number; m3: number; text: string } {
  const dagens = lass.filter((l) => raknasMed(l) && l.datum === idag);
  const m3 = dagens.reduce((s, l) => s + lassTotalM3(l), 0);
  return { antal: dagens.length, m3, text: `Idag: ${dagens.length} ${dagens.length === 1 ? 'lass' : 'lass'} · ${m3} m³` };
}

// ── Färdigskotad ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Gränsen för "Har du fått med allt?": mer än ca 3 % av skördat ELLER ca 10 m³ kvar. */
export const FARDIG_PROCENT = 0.03;
export const FARDIG_M3 = 10;

export interface FardigKontroll {
  /** true = kvar är litet nog: trakten kan avslutas utan fråga. */
  ok: boolean;
  kvarM3: number;
  procent: number;
  /** Sortimenten med kvar, mest först (för kortet: "Massa barr ~18, Kubb ~7"). */
  rader: KvarSortiment[];
}

export function farduskotatKontroll(kvar: Kvar): FardigKontroll {
  const rader = kvar.rader.filter((r) => r.kvar >= 0.5);
  const kvarM3 = kvar.kvarTotal;
  const procent = kvar.skordat > 0 ? kvarM3 / kvar.skordat : 0;
  return { ok: !(kvarM3 > FARDIG_M3 || procent > FARDIG_PROCENT), kvarM3, procent, rader };
}

// ── Skalning vid avslut ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * REGEL: när trakten avslutas är skotat EXAKT lika med skördat, per sortiment. Förarens rapporterade värden skalas proportionellt
 * (upp och ner) med faktor = skördat / rapporterat. Rapporterat 0 men skördat > 0 går inte att skala (0 × x = 0): skillnaden läggs
 * som ett tillägg på sortimentet så att summan ändå blir skördat. Skördat 0 men rapporterat > 0: faktor 0. Förarens ursprungliga
 * värden ändras aldrig — faktorerna bor i en egen rad (skotar_trakt_avslut) och det skalade värdet räknas ur dem.
 */
export interface Skalning {
  faktorer: Record<string, number>;
  tillagg: Record<string, number>;
}

export function skalningsfaktorer(skordat: readonly SkordatSortiment[], lass: readonly Lass[]): Skalning {
  const rapporterat = skotatPerSortiment(lass);
  const faktorer: Record<string, number> = {};
  const tillagg: Record<string, number> = {};
  const skordatPer = new Map(skordat.map((s) => [s.nyckel, s.m3]));
  const nycklar = new Set<string>([...skordatPer.keys(), ...rapporterat.keys()]);
  for (const n of nycklar) {
    const s = skordatPer.get(n) ?? 0;
    const r = rapporterat.get(n)?.m3 ?? 0;
    if (r > 0) faktorer[n] = s / r;
    else if (s > 0) tillagg[n] = s;
  }
  return { faktorer, tillagg };
}

export const skalatVarde = (m3: number, faktor: number | undefined): number => (faktor == null ? m3 : m3 * faktor);
