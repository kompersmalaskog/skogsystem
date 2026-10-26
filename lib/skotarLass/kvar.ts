// Kvar, klar-dag och färdigskotad. Rena funktioner.
//
// KVAR = skördat (skördarens mätning, fakt_sortiment) minus skotat, per sortiment. Skotat = Opti-lassen (fakt_lass) för tiden INNAN appen började
// rapportera lass på trakten för maskinen + appens lass därefter (lib/skotarLass/opti.ts: ingen dubbelräkning). Visas alltid med "~": det är en
// uppskattning. Lass som väntar på föraren räknas med (de är ifyllda som förra lasset) — de bekräftar sig självt eller rättas inom sekunder;
// de som är struken räknas aldrig, och inte heller de som den gamla självbekräftelsen satte (bekraftad_av 'auto') förrän en planerare granskat dem. Kvar blir aldrig negativt: skotat mer än skördat på ett sortiment är "klart", aldrig "X över".
import { arOklassat, sortimentNyckel, type SkordatSortiment } from './sortiment';
import { heltM3, lassTotalM3, raknasSomSkotat } from './lassModell';
import { appStartPerMaskin, fordelaOpti, optiPerDag, raknadeOptiLass, type OptiLass } from './opti';
import type { Lass } from './typer';

export interface KvarSortiment {
  nyckel: string;
  namn: string;
  skordat: number;
  /** Skotat räknat mot skördat (aldrig mer än skördat). */
  skotat: number;
  skotatApp: number;
  skotatOpti: number;
  /** skördat − skotat, aldrig negativt. */
  kvar: number;
  /** Allt skördat är skotat (inom en halv m³). */
  klart: boolean;
  /** Skördarens "Unclassified": visas aldrig med eget namn, räknas i Övrigt. */
  oklassat: boolean;
}

export interface Kvar {
  rader: KvarSortiment[];
  skordat: number;
  /** Skotat räknat mot skördat, summerat över sortimenten (aldrig mer än skördat). */
  skotat: number;
  /** Det som återstår att köra: summan av kvar per sortiment. */
  kvarTotal: number;
}

/** Bara bekräftade lass räknas (lassModell.raknasSomSkotat): obesvarade, strukna och det gamla automatiska (bekraftad_av 'auto') aldrig. */
const raknasMed = (l: Lass) => raknasSomSkotat(l);

/** Finns det något skördat alls? Utan det finns inget att räkna kvar på: "Kvar ~0 m³" skulle säga att trakten är klar fast skördaren inte kommit dit. */
export const harSkordat = (skordat: readonly SkordatSortiment[] | null | undefined): boolean => !!skordat && skordat.some((s) => s.m3 > 0);

/** Förarens summa per sortiment över alla lass som räknas (bara bekräftade). */
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

/**
 * Kvar per sortiment. `opti` är trakten Opti-lass (alla maskiner): de som ligger före maskinens första app-lass räknas, resten inte.
 * Utan Opti-lass (tom lista) är det som förut: bara appens lass.
 */
export function beraknaKvar(skordat: readonly SkordatSortiment[], lass: readonly Lass[], opti: readonly OptiLass[] = []): Kvar {
  const app = skotatPerSortiment(lass);
  const optiSkotat = fordelaOpti(skordat, raknadeOptiLass(opti, appStartPerMaskin(lass)));
  const rader: KvarSortiment[] = skordat.map((s) => {
    const skotatApp = app.get(s.nyckel)?.m3 ?? 0;
    const skotatOpti = optiSkotat.get(s.nyckel) ?? 0;
    const skotat = Math.min(s.m3, skotatApp + skotatOpti);
    const kvar = Math.max(0, s.m3 - skotat);
    return { nyckel: s.nyckel, namn: s.namn, skordat: s.m3, skotat, skotatApp, skotatOpti, kvar, klart: kvar < 0.5, oklassat: arOklassat(s.nyckel) };
  });
  rader.sort((a, b) => b.kvar - a.kvar || b.skordat - a.skordat);
  return {
    rader,
    skordat: rader.reduce((s, r) => s + r.skordat, 0),
    skotat: rader.reduce((s, r) => s + r.skotat, 0),
    kvarTotal: rader.reduce((s, r) => s + r.kvar, 0),
  };
}

// ── Vad föraren ser: de största sortimenten + "Övrigt" ───────────────────────────────────────────────────────────────

/** Så många sortiment visas på egen rad; resten (och skördarens Unclassified) samlas i "Övrigt". */
export const KVAR_SYNLIGA = 6;

export interface KvarVy {
  /** På egen rad: sortimenten med kvar först (mest först), sedan klara (✓) tills raderna är fulla. */
  synliga: KvarSortiment[];
  /** Resten, samlat. null när allt fick plats. */
  ovrigt: { kvar: number; klart: boolean; rader: KvarSortiment[] } | null;
}

export function kvarVy(kvar: Kvar, max: number = KVAR_SYNLIGA): KvarVy {
  const namngivna = kvar.rader.filter((r) => !r.oklassat);
  const medKvar = namngivna.filter((r) => !r.klart).sort((a, b) => b.kvar - a.kvar);
  const klara = namngivna.filter((r) => r.klart).sort((a, b) => b.skordat - a.skordat);
  const synliga = [...medKvar, ...klara].slice(0, max);
  const resten = [...medKvar, ...klara].slice(max);
  const ovrigtRader = [...resten, ...kvar.rader.filter((r) => r.oklassat)].sort((a, b) => b.kvar - a.kvar || b.skordat - a.skordat);
  const ovrigtKvar = ovrigtRader.reduce((s, r) => s + r.kvar, 0);
  return {
    synliga,
    ovrigt: ovrigtRader.length ? { kvar: ovrigtKvar, klart: ovrigtKvar < 0.5, rader: ovrigtRader } : null,
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

/** Dagarna takten räknas på: appens lass + Opti-lassen som räknas (före appens start) — på pågående trakter syns klar-dag direkt. */
export function skotningPerDag(lass: readonly Lass[], opti: readonly OptiLass[] = []): LassDag[] {
  const per = new Map<string, number>();
  for (const d of perDag(lass)) per.set(d.datum, (per.get(d.datum) ?? 0) + d.m3);
  for (const d of optiPerDag(raknadeOptiLass(opti, appStartPerMaskin(lass)))) per.set(d.datum, (per.get(d.datum) ?? 0) + d.m3);
  return Array.from(per, ([datum, m3]) => ({ datum, m3 })).filter((d) => d.m3 > 0).sort((a, b) => a.datum.localeCompare(b.datum));
}

export function kvarSammanfattning(kvar: Kvar, lass: readonly Lass[], idag: string, opti: readonly OptiLass[] = []): KvarSammanfattning {
  const m3 = Math.round(kvar.kvarTotal);
  const snitt = snittPerDag(skotningPerDag(lass, opti), idag);
  const datum = snitt != null ? klarDatum(kvar.kvarTotal, snitt, idag) : null;
  return {
    kvarM3: m3,
    kvarText: `Kvar ~${m3} m³`,
    klarText: datum ? `Klar ~${datumText(datum, idag)}` : null,
  };
}

/** "Idag: 7 lass · 131 m³" — DEN EGNA maskinens lass på trakten i dag (kvar och "skotat X av Y" gäller hela trakten, "Idag" bara maskinen). */
export function idagText(lass: readonly Lass[], idag: string, maskinId: string): { antal: number; m3: number; text: string; lass: Lass[] } {
  const dagens = lass.filter((l) => raknasMed(l) && l.datum === idag && l.maskinId === maskinId);
  const m3 = dagens.reduce((s, l) => s + lassTotalM3(l), 0);
  return { antal: dagens.length, m3, text: `Idag: ${dagens.length} lass · ${m3} m³`, lass: dagens };
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

/**
 * Skalfaktorerna vid Färdigskotad. Målet för APPENS lass per sortiment är skördat − Opti-lassen före appens start (`opti`, aldrig under 0, aldrig över skördat),
 * så Opti + appens skalade lass = skördat. Utan Opti (trakten började i appen) är målet hela skördat. Samma räkning som SQL:en `skotar_avslut_berakna(p_objekt, p_opti)`.
 */
export function skalningsfaktorer(skordat: readonly SkordatSortiment[], lass: readonly Lass[], opti: Readonly<Record<string, number>> = {}): Skalning {
  const rapporterat = skotatPerSortiment(lass);
  const faktorer: Record<string, number> = {};
  const tillagg: Record<string, number> = {};
  const skordatPer = new Map(skordat.map((s) => [s.nyckel, s.m3]));
  const nycklar = new Set<string>([...skordatPer.keys(), ...rapporterat.keys()]);
  for (const n of nycklar) {
    const s = skordatPer.get(n) ?? 0;
    const r = rapporterat.get(n)?.m3 ?? 0;
    const mal = s - Math.min(Math.max(opti[n] ?? 0, 0), s);
    if (r > 0) faktorer[n] = mal / r;
    else if (mal > 0) tillagg[n] = mal;
  }
  return { faktorer, tillagg };
}

export const skalatVarde = (m3: number, faktor: number | undefined): number => (faktor == null ? m3 : m3 * faktor);


// ── Skotat mer än skördat (info till planeraren) ───────────────────────────────────────────────────────────────────────

/** Skotat får överstiga skördat med så här mycket (andel OCH m³) innan planeraren får en rad om det. Skördarens mätning och lassens m³ är aldrig exakt lika. */
export const SKOTAT_OVER_PROCENT = 0.03;
export const SKOTAT_OVER_M3 = 10;

export interface SkotatMerAnSkordat {
  skordat: number;
  skotat: number;
  /** skotat − skördat (m³, positivt). */
  over: number;
}

/** Opti-lassets volym: sortimentsraderna, annars lassets egen volym. */
const optiVolym = (o: OptiLass): number => {
  const rader = o.rader.reduce((s, r) => s + r.m3, 0);
  return rader > 0 ? rader : (o.volymM3 ?? 0);
};

/**
 * Är mer skotat än skördat på trakten? Samma skotat som "kvar" räknar med — Opti före appens start + appens lass som räknas — men
 * OKAPPAT: `beraknaKvar` kapar varje sortiment vid skördat (kvar blir aldrig negativt) och visar därför aldrig överskottet.
 * Bara info, ingen spärr. null = inget att varna för (eller inget skördat att jämföra mot).
 */
export function skotatMerAnSkordat(skordat: readonly SkordatSortiment[], lass: readonly Lass[], opti: readonly OptiLass[] = []): SkotatMerAnSkordat | null {
  const sk = skordat.reduce((s, r) => s + r.m3, 0);
  if (!(sk > 0)) return null;
  const app = Array.from(skotatPerSortiment(lass).values()).reduce((s, g) => s + g.m3, 0);
  const optiSumma = raknadeOptiLass(opti, appStartPerMaskin(lass)).reduce((s, o) => s + optiVolym(o), 0);
  const skotat = app + optiSumma;
  const over = skotat - sk;
  if (over <= SKOTAT_OVER_M3 || over / sk <= SKOTAT_OVER_PROCENT) return null;
  return { skordat: sk, skotat, over };
}
