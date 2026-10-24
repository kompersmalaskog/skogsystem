/**
 * URVAL OCH RAPPORTTAL — flyttat ur app/kalibrering/page.tsx (2026-10), oförändrat.
 * Historik och Rapport räknar på det FILTRERADE urvalet (vald maskin, annars alla aktiva); Senaste-fliken på hela datasetet.
 */
import type { AlleMaskin, BedomningResp, FaktKalibrering, TradslagData } from './typer';
import { idagStr } from './datum';
import { avvikelseStatus, bedomProfil, TRADSLAG_GRIND } from './bedomning';

/** Sålda maskiner (aktiv_till i det förflutna) döljs från väljaren och 'alla'-aggregatet. Historiken finns kvar i DB. */
export const aktivaMaskinIds = (maskiner: AlleMaskin[]): string[] =>
  maskiner.filter(m => !(m.aktiv_till && m.aktiv_till < idagStr())).map(m => m.maskin_id);

/** Faller tillbaka till 'all' om vald maskin inte längre finns. */
export const effektivMaskin = (vald: string | 'all', maskiner: AlleMaskin[]): string | 'all' =>
  vald === 'all' || maskiner.some(m => m.maskin_id === vald) ? vald : 'all';

/** Filtrerade datakällor: vald maskin, eller alla AKTIVA maskiner. */
export const filtreraKalib = (all: FaktKalibrering[], effektiv: string | 'all', arAktiv: (id: string) => boolean): FaktKalibrering[] =>
  effektiv === 'all' ? all.filter(k => arAktiv(k.maskin_id)) : all.filter(k => k.maskin_id === effektiv);

/** Senaste-fliken bedöms alltid per maskin. 'all' → senaste kontrollen från en AKTIV maskin; annars den valda.
 *  (allKalib är sorterad datum desc.) */
export const heroMaskinId = (effektiv: string | 'all', all: FaktKalibrering[], arAktiv: (id: string) => boolean): string | null =>
  effektiv !== 'all' ? effektiv : (all.find(k => arAktiv(k.maskin_id))?.maskin_id ?? null);

export const heroFilnamnFor = (heroMaskin: string | null, all: FaktKalibrering[]): string | null =>
  heroMaskin ? (all.find(k => k.maskin_id === heroMaskin)?.filnamn ?? null) : (all[0]?.filnamn ?? null);

/** Per-trädslag-snitt (viktat på antal_kontrollstockar) — Historik-staplar och artarket. */
export type ArtSnitt = { count: number; totalStockar: number; lenDiff: number; diaDiff: number };
export const artSnitt = (filtrerat: FaktKalibrering[]): Record<string, ArtSnitt> => {
  const speciesData: Record<string, ArtSnitt> = {};
  filtrerat.forEach(k => {
    const key = k.tradslag.toLowerCase();
    if (!speciesData[key]) speciesData[key] = { count: 0, totalStockar: 0, lenDiff: 0, diaDiff: 0 };
    speciesData[key].count++;
    speciesData[key].totalStockar += k.antal_kontrollstockar;
    speciesData[key].lenDiff += k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar;
    speciesData[key].diaDiff += k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar;
  });
  Object.values(speciesData).forEach(v => {
    if (v.totalStockar > 0) {
      v.lenDiff = Math.round(v.lenDiff / v.totalStockar * 10) / 10;
      v.diaDiff = Math.round(v.diaDiff / v.totalStockar * 10) / 10;
    }
  });
  return speciesData;
};

/** Rapportens viktade medelvärden. */
export const rapportSnitt = (filtrerat: FaktKalibrering[]): { totalStockar: number; avgLen: number; avgDia: number } => {
  const totalStockar = filtrerat.reduce((a, k) => a + k.antal_kontrollstockar, 0);
  const avgLen = totalStockar > 0 ? Math.round(filtrerat.reduce((a, k) => a + k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;
  const avgDia = totalStockar > 0 ? Math.round(filtrerat.reduce((a, k) => a + k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;
  return { totalStockar, avgLen, avgDia };
};

/** Rapport-headline bedöms mot profilen när EN maskin är vald. Aggregatet 'alla' har ingen enskild profil → faller
 *  tillbaka på snitt-toleransen som förr. */
export const rapportBedomning = (effektiv: string | 'all', bedomning: BedomningResp | null): BedomningResp | null =>
  effektiv !== 'all' && bedomning && bedomning.maskin_id === effektiv ? bedomning : null;

export const rapportDom = (reportBed: BedomningResp | null, avgLen: number, avgDia: number) => {
  const diaBed = reportBed ? bedomProfil(reportBed.diameter, 'diameter', reportBed.trosklar) : null;
  const lenBed = reportBed ? bedomProfil(reportBed.langd, 'langd', reportBed.trosklar) : null;
  const inomTolerans = reportBed
    ? [diaBed, lenBed].filter((b): b is NonNullable<typeof b> => !!b && !b.larmTyst).every(b => b.status === 'ok')
    : avvikelseStatus({ värde: avgLen, enhet: 'len' }) === 'ok'
      && avvikelseStatus({ värde: avgDia, enhet: 'dia' }) === 'ok';
  return { diaBed, lenBed, inomTolerans };
};

/** Rader utan underlag (båda cellerna under grind 30) göms — "Björk · n 0" sa inget. */
export const tradslagRader = (trData: TradslagData | null) =>
  trData ? trData.tradslag.filter(t => t.diameter.n >= TRADSLAG_GRIND || t.langd.n >= TRADSLAG_GRIND) : [];

/** Sidfotens "sedan …" = första kontrollen i urvalet. */
export const rapportSedan = (filtrerat: FaktKalibrering[]): string => {
  const forsta = filtrerat.reduce<string | null>((m, k) => (m == null || k.datum < m ? k.datum : m), null);
  return forsta ? new Date(forsta).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }) : '–';
};
