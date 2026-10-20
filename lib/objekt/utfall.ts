// Utfall: det maskinerna faktiskt skördat på ett objekt (SUM fakt_produktion.volym_m3sub = m³fub), jämfört med den planerade volymen (Vidas tal).
//
// Två oberoende källor — planen kommer från Vidas objektfil, utfallet från maskinernas egna filer — och det är därför en starkare signal än
// volym/areal (lib/trakt/rimlighet.ts). Mätt i prod 2026-10-20 över de 54 av 67 objekt som har utfall under sitt VO-nummer (fakt_produktion.objekt_id
// är VO-numret som text; objekt.id är en uuid och joinar aldrig): kvoten planerat/utfall på avslutade slutavverkningar har kvartiler 0,86–0,97–1,11
// (n=21). 0,97 BEVISAR att Vidas tal är m³fub: vore de m³sk låg kvoten kring 1,20. Utfallet ersätter ALDRIG planen av sig självt — det föreslås,
// och en människa godkänner (knappen "Använd utfallet").
//
// Räknebasen i beställningens täckning är fortfarande planen: 13 av 67 objekt saknar utfall och minst två av utfallstalen ser ofullständiga ut
// (Kroksjömåla, Bjällerhult). Att byta bas blint skulle införa nya fel; det är ett eget beslut när de fem misstänkta trakterna setts över.

/** Avviker planen mer än så här från utfallet (relativt utfallet) blir det en fråga. */
export const UTFALL_AVVIKELSE_GRANS = 0.4;

export const AVVIKANDE_UTFALL_NYCKEL = 'avvikande_utfall';

const sv = (n: number, d = 0) => n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Är objektet avslutat (utfallet är då slutgiltigt)? Pågående och planerade har bara ett delutfall. */
export const arAvslutat = (status: string | null | undefined): boolean => status === 'avslutat' || status === 'klar';

export interface UtfallUnderlag {
  status: string | null;
  volym: number | null;
  areal: number | null;
  /** m³fub ur fakt_produktion. null/undefined = inget utfall finns (eller kunde inte läsas). */
  utfall?: number | null;
}

export interface AvvikandeUtfall {
  text: string;
  /** Avvikelsen relativt utfallet, 0,5 = 50 %. */
  avvikelse: number;
  /** Utfallet i hela m³fub, att föreslå som volym. Bara för ett avslutat objekt — ett pågående objekts utfall är inte klart. */
  forslag: number | null;
}

/**
 * Planerat mot utfall. null när något av talen saknas, när avvikelsen är högst 40 %, eller — för ett objekt som inte är avslutat — när utfallet
 * ännu är MINDRE än planen (en pågående trakt har naturligt skördat mindre än planen; bara ett utfall som redan överstiger planen är en signal).
 */
export function avvikandeUtfall(o: UtfallUnderlag): AvvikandeUtfall | null {
  const plan = Number(o.volym), utfall = Number(o.utfall);
  if (o.utfall == null || !Number.isFinite(plan) || plan <= 0 || !Number.isFinite(utfall) || utfall < 1) return null;
  if (!arAvslutat(o.status) && utfall <= plan) return null;
  const avvikelse = Math.abs(plan - utfall) / utfall;
  if (avvikelse <= UTFALL_AVVIKELSE_GRANS) return null;
  const areal = Number(o.areal);
  const perHa = (v: number) => (Number.isFinite(areal) && areal > 0 ? ` (${sv(v / areal)} per hektar)` : '');
  const klar = arAvslutat(o.status);
  const text = `Planen är ${sv(plan)} m³fub${perHa(plan)} och utfallet från maskinerna ${klar ? '' : 'hittills '}${sv(utfall)} m³fub${perHa(utfall)}. De avviker ${Math.round(avvikelse * 100)} %.`;
  return { text, avvikelse, forslag: klar ? Math.round(utfall) : null };
}
