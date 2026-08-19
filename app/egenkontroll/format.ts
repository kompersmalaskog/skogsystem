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

/** "inga avvikelser" / "1 avvikelse" / "2 avvikelser". */
export function avvikelseText(antal: number): string {
  if (antal === 0) return 'inga avvikelser';
  return `${antal} ${antal === 1 ? 'avvikelse' : 'avvikelser'}`;
}
