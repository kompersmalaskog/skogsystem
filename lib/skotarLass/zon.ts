// Står maskinen vid ett avlägg? Samma zon som lossningsupptäckten hade (AVLAGG.RADIE_M = 50 m runt avläggets punkt) — men den avgör numera BARA när knappen
// "Lossa · Avlägg 2" visas och vilket avlägg den gäller. Upptäckten skapar aldrig ett lass (Martin 2026-10-26: Elefanten i Mölleryd fick kortet 13 gånger, 2 var riktiga lass).
// Ren funktion — inga timers, ingen state.
import { AVLAGG, traffaAvlagg } from './avlagg';
import type { Avlagg, LatLng } from './typer';

export const ZON = {
  /** Bara en färsk fix räknas: ingen position = ingen knapp, och vi hittar aldrig på att maskinen står vid ett avlägg. */
  FERSK_FIX_MS: 10_000,
  /** In i zonen vid 50 m, ut först vid 60 m: GPS-brus vid kanten får inte blinka knappen under fingret. */
  UT_EXTRA_M: 10,
} as const;

export interface ZonTraff {
  /** Närmaste avlägg — det knappen gäller. */
  avlagg: Avlagg;
  /** Fler än ett avlägg ligger nära (≤ TVETYDIGT_M från varandra): lasskortet har Byt avlägg, knappen föreslår det närmaste. */
  kandidater: Avlagg[];
  tvetydigt: boolean;
}

/** Avläggets zon som maskinen står i. `redanInne` ger lite marginal ut (hysteres). null = inte vid något avlägg. */
export function avlaggIZon(pos: LatLng | null, avlagg: readonly Avlagg[], redanInne: boolean): ZonTraff | null {
  if (!pos || avlagg.length === 0) return null;
  const t = traffaAvlagg(pos, avlagg, AVLAGG.RADIE_M + (redanInne ? ZON.UT_EXTRA_M : 0));
  return t.narmaste ? { avlagg: t.narmaste, kandidater: t.kandidater, tvetydigt: t.tvetydigt } : null;
}

/** Knappens text: "Lossa · Avlägg 2". Avläggets nummer saknas → bara "Lossa". */
export const lossaText = (a: Pick<Avlagg, 'nummer'> | null | undefined): string => (a?.nummer ? `Lossa · Avlägg ${a.nummer}` : 'Lossa');
