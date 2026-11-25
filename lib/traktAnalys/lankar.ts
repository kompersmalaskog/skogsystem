// Länken bakom en träff i traktanalysen (flyttad ur den gamla bottenpanelen 2026-11-25 — traktanalysen bor nu bara i traktkortets rad).
// Länktexten följer det FAKTISKA målet: djuplänk → "Föreskrifter" (vatten, reservat) / "Visa området", topp-nivå (t.ex. Natura 2000 utan id) →
// "Sök i …" så föraren vet att den får leta själv.

const SKYDDAD_NATUR = 'https://skyddadnatur.naturvardsverket.se/';
const SKOGENS_PARLOR = 'https://www.skogsstyrelsen.se/skogensparlor';

/** Reservlänk per kontroll när träffen själv saknar adress. */
const STANDARDLANK: Record<string, string> = {
  vattenskydd: SKYDDAD_NATUR,
  naturreservat: SKYDDAD_NATUR,
  natura2000: SKYDDAD_NATUR,
  nyckelbiotop: SKOGENS_PARLOR,
  biotopskydd: SKOGENS_PARLOR,
};

export interface TraktLank { url: string; text: string }

export function traktAnalysLank(type: string, url?: string | null): TraktLank | null {
  const mal = url || STANDARDLANK[type] || '';
  if (!mal) return null;
  const toppniva = mal === SKYDDAD_NATUR || mal === SKOGENS_PARLOR;
  const text = toppniva
    ? (mal.includes('skogsstyrelsen') ? 'Sök hos Skogsstyrelsen' : 'Sök i Skyddad natur')
    : (type === 'vattenskydd' || type === 'naturreservat' ? 'Föreskrifter' : 'Visa området');
  return { url: mal, text };
}
