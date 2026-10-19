// Väder och morgonkort för skotaren. Rena funktioner — hämtningen (SMHI SNOW1gv1, lib/smhi-prognos; brandrisk fwif1g) görs av hooken.
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

import { nederbordMellan, nederbordPerDatum, type PrognosSteg } from '@/lib/smhi-prognos';

/**
 * Regn (mm) under de närmaste `timmar` timmarna ur SMHI SNOW1gv1: nederbörden är en MÄNGD över ett intervall (inte en intensitet), så varje intervall räknas
 * med den del som ligger inom fönstret (fördelat jämnt på intervallet). Saknas data returneras null (aldrig 0: "inget regn" och "vet inte" är olika svar).
 */
export function regnMm(steg: readonly PrognosSteg[] | null | undefined, nuMs: number, timmar: number = MORGONKORT.HORISONT_H): number | null {
  if (!steg?.length) return null;
  return nederbordMellan(steg, nuMs, nuMs + timmar * 3_600_000);
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

/** Kommande dagar för ⓘ-panelen: regn (mm), högsta och lägsta temperatur och dagens vädersymbol. `datumAv` ger lokalt datum för en tidpunkt. */
export function vaderPerDag(steg: readonly PrognosSteg[] | null | undefined, datumAv: (ms: number) => string, antal: number = 3): VaderDag[] {
  if (!steg?.length) return [];
  const regn = nederbordPerDatum(steg, datumAv);
  const per = new Map<string, VaderDag>();
  const lunchAvstand = new Map<string, number>();
  const dagAv = (datum: string): VaderDag => {
    let d = per.get(datum);
    if (!d) { d = { datum, regnMm: regn.get(datum) ?? null, tempMax: null, tempMin: null, symbol: null }; per.set(datum, d); }
    return d;
  };
  for (const p of steg) {
    const datum = datumAv(p.ms);
    const d = dagAv(datum);
    // Dagens ikon = symbolen närmast lunch (10:30 UTC ≈ 12:30 sommartid / 11:30 vintertid).
    if (p.symbol != null) {
      const avst = Math.abs(p.ms - Date.parse(`${datum}T10:30:00Z`));
      if (avst < (lunchAvstand.get(datum) ?? Infinity)) { lunchAvstand.set(datum, avst); d.symbol = p.symbol; }
    }
    if (p.temp != null) {
      d.tempMax = d.tempMax == null ? p.temp : Math.max(d.tempMax, p.temp);
      d.tempMin = d.tempMin == null ? p.temp : Math.min(d.tempMin, p.temp);
    }
  }
  // Ett datum som bara har nederbörd (intervall utan egen tidpunkt i serien) tas också med.
  for (const datum of regn.keys()) dagAv(datum);
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
