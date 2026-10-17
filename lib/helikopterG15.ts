// KAPACITET I G15 — gemensam för /helikopter och /helikopter-v2 (förut 8 h × arbetsdagar i båda).
//
// Prognosfälten (objekt.manuell_prognos) är G15-timmar, så kapaciteten är UPPMÄTT G15 per arbetsdag per maskin ur fakt_tid (RPC helikopter_ny_g15_per_arbetsdag,
// migration 20261017130000): de senaste 12 månaderna, nämnare = maskinens arbetsdagar (helikopterns egen definition, minus registrerade maskinstopp, från maskinens första
// G15-dag), täljare = all uppmätt G15 de dagarna. Det är G15 per ARBETSDAG, inte per körd dag — flyttdagar, service och glapp ligger redan i talet, så flyttid dras
// INTE av separat (dubbelräkning). En maskin utan mätning (810E, manuell) eller med för få dagar räknas som "ej mätt" på 8 h, och det SÄGS.

export const G15_FONSTER_MANADER = 12;
/** Färre arbetsdagar än så i fönstret räcker inte för ett tal: maskinen räknas som "ej mätt". */
export const G15_MIN_DAGAR = 20;
/** Reserven för en maskin som inte går att mäta — det gamla planeringsgolvet. */
export const OMATT_TIM_PER_DAG = 8;

export interface G15DagRad { maskin_id: string; g15_per_dag: unknown; dagar: unknown }

export type G15Tabell = { lage: 'ok' | 'fel'; perMaskin: Record<string, number> };

const tal = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };

/** Rader ur RPC:n → tabell. Bara maskiner med minst G15_MIN_DAGAR arbetsdagar och ett positivt tal; resten saknas i tabellen (= ej mätt). */
export function g15Tabell(rader: ReadonlyArray<G15DagRad> | null | undefined): G15Tabell {
  if (!Array.isArray(rader)) return { lage: 'fel', perMaskin: {} };
  const perMaskin: Record<string, number> = {};
  for (const r of rader) {
    const dagar = tal(r.dagar), perDag = tal(r.g15_per_dag);
    if (dagar != null && dagar >= G15_MIN_DAGAR && perDag != null && perDag > 0) perMaskin[r.maskin_id] = perDag;
  }
  return { lage: 'ok', perMaskin };
}

export const G15_TOM: G15Tabell = { lage: 'fel', perMaskin: {} };

/** G15-timmar per arbetsdag för en maskin; `ejMatt` när den saknar mätning (då gäller reserven 8) eller hela tabellen inte gick att läsa. */
export function g15PerDagFor(maskinId: string, tabell: G15Tabell): { perDag: number; ejMatt: boolean } {
  const v = tabell.perMaskin[maskinId];
  return v != null ? { perDag: v, ejMatt: false } : { perDag: OMATT_TIM_PER_DAG, ejMatt: true };
}

/** "7,1" — en decimal, decimalkomma. */
export const fmtPerDag = (v: number): string => v.toFixed(1).replace('.', ',');

/** Genomsnittet för flera maskiner (till "extra skift" på typnivå där flera maskiner delar bristen). */
export function snittPerDag(perDag: number[]): number {
  return perDag.length === 0 ? OMATT_TIM_PER_DAG : perDag.reduce((s, x) => s + x, 0) / perDag.length;
}

/** Raden under kapaciteten: vilken kapacitet som gäller och vad som inte är mätt. null = inget att säga. */
export function g15KapacitetNot(tabell: G15Tabell, maskiner: ReadonlyArray<{ maskin_id: string; namn: string }>): string | null {
  if (tabell.lage === 'fel') return 'G15 per arbetsdag gick inte att läsa — kapaciteten räknas på 8 h per arbetsdag';
  const del = maskiner.map((m) => {
    const { perDag, ejMatt } = g15PerDagFor(m.maskin_id, tabell);
    return ejMatt ? `${m.namn} ${OMATT_TIM_PER_DAG} (ej mätt)` : `${m.namn} ${fmtPerDag(perDag)}`;
  });
  return del.length === 0 ? null : `Kapacitet = uppmätt G15 per arbetsdag, ${G15_FONSTER_MANADER} mån: ${del.join(' · ')}`;
}
