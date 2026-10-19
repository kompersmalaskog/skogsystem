// Väder och morgonkort för skotaren. Rena funktioner — hämtningen (SMHI pmp3g/fwif1g) görs av hooken.
//
// Morgonkortet visas högst EN gång per dag, vid första starten, och bara om något gäller:
//   • ≥ 10 mm regn väntas närmaste 24 timmarna, och/eller
//   • brandrisk ≥ 3 idag.
// Gäller inget visas inget kort — och inget väder på kartan i övrigt (det ligger bakom ⓘ).

export const MORGONKORT = {
  REGN_MM: 10,
  BRANDKLASS: 3,
  HORISONT_H: 24,
} as const;

export interface PmpTimeSeries {
  validTime: string;
  parameters?: Array<{ name: string; values?: number[] }>;
}

const param = (ts: PmpTimeSeries, namn: string): number | null => {
  const v = ts.parameters?.find((p) => p.name === namn)?.values?.[0];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Regn (mm) under de närmaste `timmar` timmarna ur SMHI pmp3g: `pmean` är medelintensitet i mm/h över steget fram till nästa tidpunkt
 * (steget är 1 h de första dygnen, sedan 3 och 6 h) — därför viktas den med stegets längd i stället för att summeras rakt av.
 * Saknas data returneras null (aldrig 0: "inget regn" och "vet inte" är olika svar).
 */
export function regnMm(serie: readonly PmpTimeSeries[] | null | undefined, nuMs: number, timmar: number = MORGONKORT.HORISONT_H): number | null {
  if (!serie?.length) return null;
  const till = nuMs + timmar * 3_600_000;
  const punkter = serie
    .map((t) => ({ ms: Date.parse(t.validTime), pmean: param(t, 'pmean') }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  if (punkter.length < 2) return null;
  let summa = 0;
  let sett = false;
  for (let i = 0; i < punkter.length; i++) {
    const start = punkter[i].ms;
    // Sista punktens steg antas lika långt som det före.
    const slut = i + 1 < punkter.length ? punkter[i + 1].ms : start + (start - punkter[i - 1].ms);
    const a = Math.max(start, nuMs);
    const b = Math.min(slut, till);
    if (b <= a || punkter[i].pmean == null) continue;
    summa += (punkter[i].pmean as number) * ((b - a) / 3_600_000);
    sett = true;
  }
  return sett ? summa : null;
}

export interface VaderDag {
  datum: string; regnMm: number | null; tempMax: number | null; tempMin: number | null;
  /** SMHI Wsymb2 (1–27) för tidpunkten närmast lunch, null = saknas. */
  symbol: number | null;
}

export type VaderIkon = 'sol' | 'halvklart' | 'moln' | 'dimma' | 'regn' | 'snoblandat' | 'aska';

/** SMHI Wsymb2 → en av sju enkla ikoner. Okänd symbol → null (ingen ikon hellre än fel ikon). */
export function vaderIkon(symbol: number | null | undefined): VaderIkon | null {
  if (symbol == null || !Number.isInteger(symbol) || symbol < 1 || symbol > 27) return null;
  if (symbol <= 2) return 'sol';
  if (symbol <= 4) return 'halvklart';
  if (symbol <= 6) return 'moln';
  if (symbol === 7) return 'dimma';
  if (symbol === 11 || symbol === 21) return 'aska';
  if ((symbol >= 8 && symbol <= 10) || (symbol >= 18 && symbol <= 20)) return 'regn';
  return 'snoblandat';   // 12–17 byar av snöblandat regn/snö, 22–27 snöblandat regn/snöfall
}

/** Kommande dagar för ⓘ-panelen: regn (mm), högsta och lägsta temperatur per dag. `datumAv` ger lokalt datum för en tidpunkt. */
export function vaderPerDag(serie: readonly PmpTimeSeries[] | null | undefined, datumAv: (ms: number) => string, antal: number = 3): VaderDag[] {
  if (!serie?.length) return [];
  const punkter = serie
    .map((t) => ({ ms: Date.parse(t.validTime), pmean: param(t, 'pmean'), t: param(t, 't'), sym: param(t, 'Wsymb2') }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  const per = new Map<string, VaderDag>();
  const lunchAvstand = new Map<string, number>();
  for (let i = 0; i < punkter.length; i++) {
    const p = punkter[i];
    const slut = i + 1 < punkter.length ? punkter[i + 1].ms : p.ms + (i > 0 ? p.ms - punkter[i - 1].ms : 3_600_000);
    const datum = datumAv(p.ms);
    const d = per.get(datum) ?? { datum, regnMm: null, tempMax: null, tempMin: null, symbol: null };
    // Dagens ikon = symbolen närmast lunch (10:30 UTC ≈ 12:30 sommartid / 11:30 vintertid).
    if (p.sym != null) {
      const avst = Math.abs(p.ms - Date.parse(`${datum}T10:30:00Z`));
      if (avst < (lunchAvstand.get(datum) ?? Infinity)) { lunchAvstand.set(datum, avst); d.symbol = p.sym; }
    }
    if (p.pmean != null) d.regnMm = (d.regnMm ?? 0) + p.pmean * ((slut - p.ms) / 3_600_000);
    if (p.t != null) {
      d.tempMax = d.tempMax == null ? p.t : Math.max(d.tempMax, p.t);
      d.tempMin = d.tempMin == null ? p.t : Math.min(d.tempMin, p.t);
    }
    per.set(datum, d);
  }
  return Array.from(per.values()).sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, antal);
}

export interface MorgonkortIn {
  /** Regn närmaste 24 h (mm), null = okänt. */
  regnMm: number | null;
  /** Brandriskklass idag (1–6), null = okänt. */
  brandklass: number | null;
  /** Har ett morgonkort redan visats i dag? */
  redanVisatIdag: boolean;
}

export interface Morgonkort { rubrik: string; rader: string[] }

/**
 * Morgonkortet, eller null. Regn först (det styr vad man kör idag), brandrisk efter. Ett kort med OK — aldrig flera kort.
 * Kortet kan avgöras bara om minst ett av underlagen är känt; okänt väder ger inget kort (vi hittar aldrig på varningar).
 */
export function morgonkort(i: MorgonkortIn): Morgonkort | null {
  if (i.redanVisatIdag) return null;
  const rader: string[] = [];
  if (i.regnMm != null && i.regnMm >= MORGONKORT.REGN_MM) {
    rader.push(`Regn i morgon, ~${Math.round(i.regnMm)} mm – kör de blöta partierna idag`);
  }
  if (i.brandklass != null && i.brandklass >= MORGONKORT.BRANDKLASS) {
    rader.push(`Brandrisk ${i.brandklass} idag`);
  }
  return rader.length ? { rubrik: 'Idag', rader } : null;
}

/**
 * Provkörning av morgonkortet (testbannern, admin): samma kort som riktiga med samma tröskelregler; gäller inget visas ett tydligt märkt provkort med de
 * värden som finns, så man ser både kortet och varför det annars inte skulle ha visats. Räknas aldrig som "visat idag".
 */
export function morgonkortProv(regnMm: number | null, brandklass: number | null): Morgonkort {
  const riktigt = morgonkort({ regnMm, brandklass, redanVisatIdag: false });
  if (riktigt) return riktigt;
  const del = (namn: string, v: number | null, enhet: string) => `${namn} ${v == null ? 'okänt' : `${Math.round(v)}${enhet}`}`;
  return { rubrik: 'Idag', rader: [`Provkörning – inget kort hade visats nu (${del('regn', regnMm, ' mm')}, ${del('brandrisk', brandklass, '')})`] };
}

/** Datumnyckeln "redan visat" sparas under: ett kort per dag och enhet. */
export const MORGONKORT_NYCKEL = 'skotar_morgonkort_v1';
