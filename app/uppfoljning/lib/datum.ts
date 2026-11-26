// Dagens datum i Sverige — EN regel för hela Uppföljning.
// `new Date().toISOString()` ger UTC-dagen: mellan 00:00 och 01:00 (vinter) /
// 02:00 (sommar) svensk tid är det fortfarande gårdagen, och "kör idag",
// "senaste 7 dagarna" och "hämtat senaste 60 dagarna" räknades då fel.
import { sthlmDelar } from '@/lib/sthlmTid';

/** Svensk dag "YYYY-MM-DD" för ett ögonblick (standard: nu). */
export function svenskIdag(nu: Date = new Date()): string {
  return sthlmDelar(nu)?.datum ?? nu.toISOString().slice(0, 10);
}

/** Dagen n kalenderdagar före `dag` ("YYYY-MM-DD"). Räknas på datum, aldrig på millisekunder. */
export function dagarFore(dag: string, n: number): string {
  const [a, m, d] = dag.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}
