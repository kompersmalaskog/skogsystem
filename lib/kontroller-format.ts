// Vy-hjälpare för /kontroller (client-safe — inga server-importer).
// Formatering + typ/grupp-etiketter enligt Figma-designen.

import type { Resurstyp } from './kontrolltyper';

export const FF = "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif";

// Designtokens ur Figma (hxPgtHSnuZdiOGAuHcnI4t).
export const FARG = {
  bg: '#000',
  kort: '#1c1c1e',
  falt: '#2c2c2e',
  seg: '#636366',
  avdelare: '#38383a',
  text: '#fff',
  grer: '#8e8e93',
  svagGrer: '#636366',
  chevron: '#48484a',
  rod: '#ff453a',
  orange: '#ff9f0a',
  bla: '#0a84ff',
} as const;

export const TYP_LABEL: Record<Resurstyp, string> = {
  bil: 'Bil',
  lastbil: 'Lastbil',
  slap: 'Släp',
  maskin: 'Maskin',
  cistern: 'Cistern',
};

// Alla-vyns grupper + chip-filtren delar typmängder.
export const GRUPPER: { key: string; label: string; typer: Resurstyp[] }[] = [
  { key: 'bilar', label: 'BILAR & LASTBILAR', typer: ['bil', 'lastbil'] },
  { key: 'slap', label: 'SLÄP', typer: ['slap'] },
  { key: 'maskiner', label: 'MASKINER', typer: ['maskin'] },
  { key: 'cisterner', label: 'CISTERNER', typer: ['cistern'] },
];

export const CHIPS: { key: string; label: string; typer: Resurstyp[] | null }[] = [
  { key: 'alla', label: 'Alla', typer: null },
  { key: 'bilar', label: 'Bilar', typer: ['bil', 'lastbil'] },
  { key: 'slap', label: 'Släp', typer: ['slap'] },
  { key: 'maskiner', label: 'Maskiner', typer: ['maskin'] },
  { key: 'cisterner', label: 'Cisterner', typer: ['cistern'] },
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

export function fmtRelativDagar(dagar: number): string {
  if (dagar < 0) return `${Math.abs(dagar)} ${Math.abs(dagar) === 1 ? 'dag' : 'dagar'} sen`;
  if (dagar === 0) return 'idag';
  return `om ${dagar} ${dagar === 1 ? 'dag' : 'dagar'}`;
}

export function enhetKort(enhet: 'timmar' | 'km'): string {
  return enhet === 'timmar' ? 'tim' : 'km';
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

/** Titel + underrad i Alla-listan (titel = regnr, annars namn). */
export function resursIdentitet(r: Resurs): { titel: string; underrad: string } {
  const titel = r.regnr || r.namn;
  const marmod = [r.marke, r.modell].filter(Boolean).join(' ');
  let underrad: string;
  if (r.typ === 'maskin') {
    const metar = r.matarstallning != null ? `${fmtHeltal(r.matarstallning)} tim` : '';
    underrad = [marmod, metar].filter(Boolean).join(' · ') || TYP_LABEL[r.typ];
  } else if (r.typ === 'bil' || r.typ === 'lastbil') {
    underrad = marmod ? `${marmod} · ${TYP_LABEL[r.typ]}` : TYP_LABEL[r.typ];
  } else if (r.typ === 'slap') {
    underrad = r.regnr ? (r.namn || TYP_LABEL[r.typ]) : TYP_LABEL[r.typ];
  } else {
    underrad = r.regnr ? (r.namn || TYP_LABEL[r.typ]) : (r.anteckning || TYP_LABEL[r.typ]);
  }
  return { titel, underrad };
}

/** Rubrik + underrad på resurssidan ("GHI 789" / "Kilafors kärra · Släp · 2016"). */
export function resursRubrik(r: Resurs): { titel: string; underrad: string } {
  const titel = r.regnr || r.namn;
  const bitar: string[] = [];
  if (r.regnr && r.namn) bitar.push(r.namn);
  bitar.push(TYP_LABEL[r.typ]);
  if (r.arsmodell) bitar.push(String(r.arsmodell));
  return { titel, underrad: bitar.join(' · ') };
}
