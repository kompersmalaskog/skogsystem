/**
 * KALENDERN — vad en dag och en månad betyder, filtrerat på vald maskin. Flyttat ur app/kalibrering/page.tsx, oförändrat.
 */
import type { CalDag, CalDagstatus, CalResponse, CalSammanfattning } from './typer';

export const dagstatusText = (s: CalDagstatus): string => {
  if (s === 'komplett') return 'Inom tolerans';
  if (s === 'saknas') return 'Saknad kontrollstam';
  if (s === 'varning') return 'Varning från kontroll';
  return 'Inaktiv';
};

export const maskinStatusText = (s: CalDagstatus): string => {
  if (s === 'komplett') return 'Kontroll lämnad';
  if (s === 'saknas') return 'Saknas';
  if (s === 'varning') return 'Varning';
  return 'Inaktiv';
};

/** Dagens status för vald maskin ('all' = dagens egen); en maskin utan rad den dagen är inaktiv. */
export const aggregeraDagFiltrerat = (dag: CalDag, valdMaskinId: string | 'all'): CalDagstatus => {
  if (valdMaskinId === 'all') return dag.status;
  const m = dag.maskiner.find(x => x.maskin_id === valdMaskinId);
  if (!m) return 'inaktiv';
  return m.status;
};

/** Månadens sammanfattning omräknad efter maskinfiltret. */
export const filtreradSammanfattning = (calData: CalResponse, valdMaskinId: string | 'all'): CalSammanfattning => {
  if (valdMaskinId === 'all') return calData.sammanfattning;
  const rader = calData.dagar.map(d => {
    const status = aggregeraDagFiltrerat(d, valdMaskinId);
    const m = d.maskiner.find(x => x.maskin_id === valdMaskinId);
    return { status, huvudtyp_okand: !!m?.huvudtyp_okand };
  });
  return {
    produktionsdagar: rader.filter(r => r.status !== 'inaktiv').length,
    kompletta: rader.filter(r => r.status === 'komplett').length,
    saknas: rader.filter(r => r.status === 'saknas').length,
    varningar: rader.filter(r => r.status === 'varning').length,
    okand_huvudtyp_dagar: rader.filter(r => r.huvudtyp_okand).length,
  };
};

/** Rutnätets tomma celler före första och efter sista dagen (veckan börjar på måndag). */
export const tommaCeller = (calData: CalResponse): { leadingEmpty: number; trailingEmpty: number } => {
  const leadingEmpty = calData.dagar.length > 0 ? calData.dagar[0].veckodag - 1 : 0;
  const totalCells = leadingEmpty + calData.dagar.length;
  return { leadingEmpty, trailingEmpty: (7 - (totalCells % 7)) % 7 };
};

/** Legenden visar bara de statusar som faktiskt finns i rutnätet den här månaden. */
export const LEGEND_STATUS: { st: CalDagstatus; text: string }[] = [
  { st: 'komplett', text: 'Kontroll lämnad' },
  { st: 'saknas', text: 'Saknas' },
  { st: 'varning', text: 'Varning' },
];
export const legendRader = (calData: CalResponse, valdMaskinId: string | 'all') => {
  const iManaden = new Set(calData.dagar.map(d => aggregeraDagFiltrerat(d, valdMaskinId)));
  return LEGEND_STATUS.filter(r => iManaden.has(r.st));
};
