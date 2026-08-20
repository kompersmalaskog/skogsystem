// Presentation for egenkontrollvyerna. Ren formatering - ingen datalogik.

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
