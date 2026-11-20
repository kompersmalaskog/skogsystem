// Algoritmen är specifik för slutavverkning. Bmav-detektion fungerar inte
// i gallring där Bmav är default-sortiment för klent virke. Bygg inte ihop dem.

import type { RotTyp } from './types';

const BMAV_RE = /\bbmav/i;
const AVKAP_RE = /\bavkap/i;

export const isBmav = (namn: string | null | undefined): boolean =>
  !!namn && BMAV_RE.test(namn);

export const isAvkap = (namn: string | null | undefined): boolean =>
  !!namn && AVKAP_RE.test(namn);

export function normalizeTradslag(t: string | null | undefined): string {
  if (!t) return '';
  return t.trim().toUpperCase().replace(/_/g, ' ');
}

export function tradslagDisplay(normalized: string): string {
  switch (normalized) {
    case 'GRAN': return 'Gran';
    case 'TALL': return 'Tall';
    case 'BJÖRK': return 'Björk';
    case 'ÖVR LÖV': return 'Övr löv';
    default:
      if (!normalized) return '';
      return normalized.charAt(0) + normalized.slice(1).toLowerCase();
  }
}

export interface StemForDetect {
  tradslag: string;
  dbh_mm: number | null;
  firstStockNamn: string;
  stemGrade: number | null;
}

export function detectRot(stem: StemForDetect): RotTyp {
  const ts = stem.tradslag;

  if (isAvkap(stem.firstStockNamn) && (ts === 'GRAN' || ts === 'TALL')) {
    return 'avkap';
  }
  if (isBmav(stem.firstStockNamn) && ts === 'GRAN' && (stem.dbh_mm ?? 0) >= 180) {
    return 'bmav';
  }
  if ((stem.stemGrade ?? 0) >= 9) {
    return 'grade9';
  }
  return null;
}
