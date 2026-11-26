// Presentation for egenkontrollvyerna. Ren formatering - ingen datalogik.

import { arGammalRunda } from '@/lib/egenkontrollAvsluta';

const MANADER = [
  'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

/**
 * Lokal midnatt for en ISO-strang.
 *
 * avslutad_timestamp ar timestamptz och faktisk_slut ar date. Bada jamfors
 * som KALENDERDAGAR i lokal tid - raknar man i UTC hamnar en kvall i augusti
 * pa fel dygn och "15 dagar sedan" blir 16.
 */
function lokalMidnatt(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "4 aug" - ar utelamnas for innevarande ar, skrivs ut for aldre. */
export function kortDatum(iso: string): string {
  const d = lokalMidnatt(iso);
  if (!d) return 'okänt datum';
  const nu = new Date();
  const ar = d.getFullYear() === nu.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MANADER[d.getMonth()]}${ar}`;
}

/** "15 dagar sedan", "igår", "idag". */
export function dagarSedan(iso: string): string {
  const d = lokalMidnatt(iso);
  if (!d) return 'okänt hur länge';
  const nu = new Date();
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const dagar = Math.round((idag.getTime() - d.getTime()) / 86400000);
  if (dagar <= 0) return 'idag';
  if (dagar === 1) return 'igår';
  return `${dagar} dagar sedan`;
}

/**
 * Hela sanningen om en runda, inte halva.
 *
 * "inga avvikelser" ensamt ar sant men ofullstandigt nar en punkt star pa
 * "kan bli battre" - da later rundan anmarkningsfri fast den inte ar det.
 * Bada talen far darfor plats i samma rad.
 *
 *   2 avvikelser
 *   inga avvikelser — 1 kan bli bättre
 *   2 avvikelser — 1 kan bli bättre
 *   inga anmärkningar
 */
export function anmarkningsText(avvikelser: number, battre: number): string {
  if (avvikelser === 0 && battre === 0) return 'inga anmärkningar';
  const a = avvikelser === 0
    ? 'inga avvikelser'
    : `${avvikelser} ${avvikelser === 1 ? 'avvikelse' : 'avvikelser'}`;
  if (battre === 0) return a;
  return `${a} — ${battre} kan bli bättre`;
}

/**
 * Konsekvensen, i klartext, i bekräftelsen före ett avslut. Avslutsknappen är den vita primärknappen — det mest framträdande på skärmen —
 * och avslutet går inte att ta tillbaka: rundan låses i databasen (fyra lager) och blir rapporten till Vida. Konsekvensen står därför i
 * själva bekräftelsen och inte bara i en hjälprad.
 */
export const AVSLUTA_KONSEKVENS = 'Rundan låses och kan inte ändras.';

/** Rubriken på raden som säger att rundan är färdiggången. Svaret först: rundan ÄR klar, det som återstår är att avsluta den. */
export const AVSLUTA_RAD_RUBRIK = 'Rundan är klar';

/**
 * Noten i bekräftelsen när sista svaret ligger längre bak än GAMMAL_RUNDA_DAGAR.
 *
 * Avslutet sätter slutdagen till i dag — alltid, utan undantag: ett datum man inte har mätt ska inte hittas på. Men den som avslutar
 * Ulfsnäs i november ska veta att rapporten kommer att säga "28 aug – 13 nov" innan hen trycker, inte efteråt. Null när rundan gicks nyss
 * (då är i dag besöksdagen) eller när ingen punkt är besvarad.
 */
export function gammalRundaNot(sistaSvar: string | null, nu: Date = new Date()): string | null {
  if (!arGammalRunda(sistaSvar, nu)) return null;
  return `Sista svaret skrevs ${kortDatum(sistaSvar as string)}. Rundan avslutas i dag, så i dag blir slutdagen i rapporten.`;
}
