// Stämplingslängdens tal: en skriven uppgift per objekt, med enhet, jämförd med objektets volym.
//
// Stämplingslängden är i m³sk (skogskubikmeter, med bark/topp), appen räknar i m³fub (fast kubikmeter under bark). Skillnaden är ungefär 20 %
// och stod ingenstans — det räcker för att man ska tvivla på ett korrekt tal varje gång man jämför. Talet finns bara inuti en PDF och
// extraheras inte (ingen PDF-tolkning byggs): det skrivs in EN gång av en människa, med enhet, och appen räknar och visar jämförelsen sedan.

/**
 * Omräkningsfaktorn m³sk → m³fub. Utgångsvärde 0,83 (Martin 2026-10-20: 1 884 m³sk ≈ 1 560 m³fub). Det är en tumregel, inte en naturlag —
 * den varierar med trädslag och trakt. Faktorn visas i vyn bredvid varje omräknat tal, så den går att bedöma; ändras den här ändras
 * den överallt, och inget lagrat tal påverkas (det lagras alltid som det skrevs, med sin enhet).
 */
export const M3SK_TILL_M3FUB = 0.83;

/** Avviker de båda talen mer än så här (relativt stämplingslängden omräknad till m³fub) blir det en fråga. */
export const AVVIKELSE_GRANS = 0.15;

export const STAMPLINGS_ENHETER = ['m3sk', 'm3fub'] as const;
export type StamplingsEnhet = (typeof STAMPLINGS_ENHETER)[number];
export const ENHET_TEXT: Record<StamplingsEnhet, string> = { m3sk: 'm³sk', m3fub: 'm³fub' };

export const arEnhet = (e: unknown): e is StamplingsEnhet => e === 'm3sk' || e === 'm3fub';

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');
export const fmtVolym = sv;

/** Stämplingslängdens tal omräknat till m³fub. */
export function tillM3fub(tal: number, enhet: StamplingsEnhet): number {
  return enhet === 'm3sk' ? tal * M3SK_TILL_M3FUB : tal;
}

export interface Stamplingsjamforelse {
  /** Det som skrevs in, som det skrevs. */
  tal: number;
  enhet: StamplingsEnhet;
  /** Samma tal i m³fub. */
  fub: number;
  /** |volym − fub| / fub. null när volymen saknas. */
  avvikelse: number | null;
  avviker: boolean;
}

/** Jämförelsen, eller null när inget tal är inskrivet. `volym` är objektets volym i m³fub (Vidas). */
export function jamfor(volym: unknown, tal: unknown, enhet: unknown): Stamplingsjamforelse | null {
  const t = Number(tal);
  if (tal == null || !Number.isFinite(t) || t <= 0 || !arEnhet(enhet)) return null;
  const fub = tillM3fub(t, enhet);
  const v = Number(volym);
  const avvikelse = Number.isFinite(v) && v > 0 ? Math.abs(v - fub) / fub : null;
  return { tal: t, enhet, fub, avvikelse, avviker: avvikelse != null && avvikelse > AVVIKELSE_GRANS };
}

/** "1 884 m³sk ≈ 1 564 m³fub" — eller bara "1 560 m³fub" när talet redan är i m³fub. */
export function stamplingsText(j: Stamplingsjamforelse): string {
  return j.enhet === 'm3fub' ? `${sv(j.tal)} m³fub` : `${sv(j.tal)} ${ENHET_TEXT[j.enhet]} ≈ ${sv(j.fub)} m³fub`;
}

/** Omräkningen i klartext, med faktorn: "× 0,83". */
export const faktorText = (): string => `× ${M3SK_TILL_M3FUB.toLocaleString('sv-SE')}`;

/**
 * Domen i klartext medan talet skrivs: "Vida säger 1 734 m³fub. Stämmer bra." Den finns för att den som skriver in talet ska slippa
 * räkna om m³sk i huvudet och själv bedöma om det stämmer — omräkningen och jämförelsen görs på skärmen. null när något tal saknas.
 */
export function domText(volym: unknown, j: Stamplingsjamforelse | null): { text: string; avviker: boolean } | null {
  if (!j || j.avvikelse == null) return null;
  const vida = `Vida säger ${sv(Number(volym))} m³fub.`;
  return j.avviker
    ? { text: `${vida} Skiljer ${Math.round(j.avvikelse * 100)} % — kontrollera.`, avviker: true }
    : { text: `${vida} Stämmer bra.`, avviker: false };
}

/** Frågetexten när de två talen avviker, annars null. Båda talen och faktorn står i texten. */
export function avvikelseText(volym: unknown, j: Stamplingsjamforelse | null): string | null {
  if (!j || !j.avviker || j.avvikelse == null) return null;
  const pct = Math.round(j.avvikelse * 100);
  const omr = j.enhet === 'm3sk' ? ` (${faktorText()})` : '';
  return `Volymen ${sv(Number(volym))} m³fub avviker ${pct} % från stämplingslängden, ${stamplingsText(j)}${omr}. Kontrollera vilket tal som stämmer.`;
}
