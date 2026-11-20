/**
 * ÅTGÄRDER — träffen före och efter varje markör (förarens åtgärd, reparation av mätsystemet). Ren funktion; rutten /api/kalibrering/bedomning läser
 * databasen och ger den punkterna.
 *
 * SAMMA REGLER som "Hjälpte åtgärden?" (`atgard` i samma svar) hade för den senaste markören:
 *   före  = 90 dagar före markören,
 *   efter = från markörens datum.
 * Nytt för en LISTA av markörer: `efter` slutar vid nästa markör (annars skulle åtgärd 1 få äran för det åtgärd 2 gjorde). Den sista markören har
 * ingen nästa, så för den är före/efter exakt `atgard` — de båda kan aldrig visa olika tal för samma markör.
 * Grind: under 30 mått på NÅGON sida → fore/efter = null och forTidigt = true; talen lämnar inte servern under grinden.
 */
import { statistik } from './statistik';
import type { AtgardPost } from './typer';

export const ATGARD_GRIND = 30;
export const ATGARD_FONSTER_DAGAR = 90;

export type Markor = { datum: string; kalla: 'reparation' | 'kalibrering' | 'atgard'; text: string };
/** En diametermätpunkt: kontrollens dag och maskin − operatör. */
export type DatumPunkt = { datum: string; avvik: number };

const dag = (s: string): string => String(s).slice(0, 10);
const minusDagar = (datum: string, n: number): string => new Date(new Date(`${datum}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

/** Markörerna utan dubbletter (samma datum, källa och text), äldst först. */
export const unikaMarkorer = (markorer: Markor[]): (Markor & { kalla: 'atgard' | 'reparation' | 'kalibrering' })[] => {
  const sedda = new Set<string>();
  const ut: (Markor & { kalla: 'atgard' | 'reparation' | 'kalibrering' })[] = [];
  for (const m of markorer) {
    const id = `${dag(m.datum)}|${m.kalla}|${m.text}`;
    if (sedda.has(id)) continue;
    sedda.add(id);
    ut.push({ ...m, datum: dag(m.datum), kalla: m.kalla });
  }
  return ut.sort((a, b) => a.datum.localeCompare(b.datum));
};

/** Tidigaste dag som behövs för att räkna "före" för alla markörer — rutten hämtar punkter från den. null utan markörer. */
export const tidigasteFore = (markorer: Markor[]): string | null => {
  const m = unikaMarkorer(markorer);
  return m.length ? minusDagar(m[0].datum, ATGARD_FONSTER_DAGAR) : null;
};

export const atgardPoster = (args: {
  markorer: Markor[]; punkter: DatumPunkt[]; tolTraff: number | null; tolGrov: number | null;
  /** Dagar då diameterkurvan kalibrerats (fakt_kalibrering_historik, typ=diameter) — de konkurrerar om förklaringen. */
  kalibreringar: string[];
}): AtgardPost[] => {
  const { punkter, tolTraff, tolGrov } = args;
  const markorer = unikaMarkorer(args.markorer);
  const kalibreringar = Array.from(new Set(args.kalibreringar.map(dag))).sort();
  return markorer.map((m, i) => {
    // `efter` slutar vid nästa markör. En kalibrering ur historiken (automatisk, ofta flera i veckan) bryter dock aldrig "efter" för förarens åtgärd eller en
    // reparation — annars skulle tryckändringen i juli få sin efter-period avskuren vid första kalibreringen. En kalibrering slutar vid nästa markör av vilket slag som helst.
    const nasta = markorer.slice(i + 1).find(x => x.datum > m.datum && (m.kalla === 'kalibrering' || x.kalla !== 'kalibrering'))?.datum ?? null;
    const foreFran = minusDagar(m.datum, ATGARD_FONSTER_DAGAR);
    const foreAv = punkter.filter(p => dag(p.datum) >= foreFran && dag(p.datum) < m.datum).map(p => p.avvik);
    const efterAv = punkter.filter(p => dag(p.datum) >= m.datum && (nasta == null || dag(p.datum) < nasta)).map(p => p.avvik);
    const fore = statistik(foreAv, tolTraff, tolGrov);
    const efter = statistik(efterAv, tolTraff, tolGrov);
    const forTidigt = fore.n < ATGARD_GRIND || efter.n < ATGARD_GRIND;
    return {
      datum: m.datum, text: m.text, kalla: m.kalla,
      fore: forTidigt ? null : fore, efter: forTidigt ? null : efter, forTidigt, nFore: fore.n, nEfter: efter.n,
      kalibreringarEfter: kalibreringar.filter(k => k >= m.datum && (nasta == null || k < nasta)),
    };
  });
};
