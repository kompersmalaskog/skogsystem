// Formatering och etiketter för Fordon (/kontroller). Client-safe — inga server-importer.
// Färger, typsnitt och storlekar kommer ur lib/design/tokens — aldrig härifrån.

import type { Resurstyp } from './kontrolltyper';

/** Vad fordonet heter i vardagsord. Nyckeln `cistern` finns i databasen; förarna säger tank. */
export const TYP_LABEL: Record<Resurstyp, string> = {
  bil: 'Bil',
  lastbil: 'Lastbil',
  slap: 'Släp',
  maskin: 'Maskin',
  cistern: 'Tank',
};

/** Alla fordon, grupperade som förarna tänker på dem. */
export const GRUPPER: { key: string; label: string; typer: Resurstyp[] }[] = [
  { key: 'bilar', label: 'Bilar och lastbilar', typer: ['bil', 'lastbil'] },
  { key: 'slap', label: 'Släp', typer: ['slap'] },
  { key: 'maskiner', label: 'Maskiner', typer: ['maskin'] },
  { key: 'tankar', label: 'Tankar', typer: ['cistern'] },
];

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

export function fmtHeltal(n: number): string {
  return n.toLocaleString('sv-SE');
}

export function fmtDatumLang(datum: string): string {
  const d = new Date(datum + 'T00:00:00');
  return `${d.getDate()} ${MANADER[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDatumKort(datum: string): string {
  const d = new Date(datum + 'T00:00:00');
  return `${d.getDate()} ${MANADER[d.getMonth()]}`;
}

/** "om 12 dagar", "idag", "i morgon", "3 dagar sen". */
export function fmtRelativDagar(dagar: number): string {
  if (dagar < -1) return `${Math.abs(dagar)} dagar sen`;
  if (dagar === -1) return 'i går';
  if (dagar === 0) return 'idag';
  if (dagar === 1) return 'i morgon';
  return `om ${dagar} dagar`;
}

export type Resurs = {
  id: string;
  namn: string;
  typ: Resurstyp;
  regnr: string | null;
  serienr?: string | null;
  marke: string | null;
  modell: string | null;
  arsmodell: number | null;
  avstalld?: boolean;
  matarstallning: number | null;
  matare_avlast?: string | null;
  anteckning: string | null;
  inkopsdatum?: string | null;
  inkopspris?: number | null;
  kontroll?: any[];
};

/** Fordonets namn i en lista: namnet om det finns, regnumret annars. */
export function fordonNamn(r: Resurs): string {
  return r.namn || r.regnr || TYP_LABEL[r.typ];
}

/** Raden under namnet: regnummer · märke modell, annars typen. */
export function fordonUnder(r: Resurs): string {
  const bitar: string[] = [];
  if (r.regnr && r.namn) bitar.push(r.regnr);
  const marmod = [r.marke, r.modell].filter(Boolean).join(' ');
  if (marmod) bitar.push(marmod);
  return bitar.join(' · ') || TYP_LABEL[r.typ];
}

/** Rubrik + underrad på fordonets sida ("Volvo FH" / "ABC123 · Lastbil · 2016"). */
export function resursRubrik(r: Resurs): { titel: string; underrad: string } {
  const bitar: string[] = [];
  if (r.regnr && r.namn) bitar.push(r.regnr);
  bitar.push(TYP_LABEL[r.typ]);
  if (r.arsmodell) bitar.push(String(r.arsmodell));
  return { titel: fordonNamn(r), underrad: bitar.join(' · ') };
}
