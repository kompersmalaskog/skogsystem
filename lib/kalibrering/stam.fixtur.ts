import type { StockRow } from '@/app/api/kalibrering/kontroll/route';

type Mp = [number, number | null, number | null];
export const stock = (nr: number, langd: number, topp: [number | null, number | null], mp: Mp[], o: Partial<StockRow> = {}): StockRow => ({
  id: 100 + nr, stam_nummer: 1, stock_nummer: nr, sortiment_namn: 'Vislanda_195_1-2_V3', sortiment_grupp: 'Timmer', sortiment_kod: null,
  maskin_langd_cm: langd, operator_langd_cm: langd, langd_avvikelse_cm: 0, maskin_toppdia_mm: topp[0], operator_toppdia_mm: topp[1],
  dia_avvikelse_mm: topp[0] != null && topp[1] ? topp[0] - topp[1] : null,
  matpunkter: mp.map(([p, m, op]) => ({ position_cm: p, diameter_maskin_mm: m, diameter_operator_mm: op, klave_first_mm: null, klave_second_mm: null })),
  ...o,
} as unknown as StockRow);

// Skälviken RP J-Hus, Giant 2026-10-21, stam 1: fem stockar, 21,8 m (riktig kontroll ur prod).
export const SKALVIKEN: StockRow[] = [
  stock(1, 610, [296, 294], [[200, 331, 321], [300, 319, 315], [400, 311, 304], [500, 302, 294]]),
  stock(2, 610, [237, 234], [[100, 283, 285], [200, 279, 279], [300, 268, 272], [400, 260, 261], [500, 247, 252]]),
  stock(3, 308, [203, 203], [[100, 227, 223], [200, 218, 212]], { sortiment_grupp: 'Kubb', sortiment_namn: 'Alvesta305_V3' }),
  stock(4, 310, [153, 142], [[100, 184, 182], [200, 173, 169]], { sortiment_grupp: 'Kubb', sortiment_namn: 'Alvesta305_V3' }),
  stock(5, 341, [79, 77], [[100, 126, 128], [200, 106, 108], [300, 86, 78]], { sortiment_grupp: 'Massa', sortiment_namn: 'BmavFall_V3' }),
];
