// Periodväxlaren för ekonomivyerna — EN sanning för Dag/Vecka/Månad/Kvartal/År
// med offset-navigering. Översikt, per-objekt och resultat hade identiska
// kopior; de pekar hit nu. Ny ekonomivy: importera härifrån, kopiera inte.

export type PeriodType = 'D' | 'V' | 'M' | 'K' | 'A';

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function getPeriodDates(p: PeriodType, offset: number): { start: string; end: string } {
  const now = new Date();
  if (p === 'D') {
    const d = new Date(now); d.setDate(now.getDate() + offset);
    const s = fmtDate(d);
    return { start: s, end: s };
  }
  if (p === 'V') {
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: fmtDate(mon), end: fmtDate(sun) };
  }
  if (p === 'K') {
    const cq = Math.floor(now.getMonth() / 3);
    const tq = now.getFullYear() * 4 + cq + offset;
    const y = Math.floor(tq / 4);
    const qi = ((tq % 4) + 4) % 4;
    return { start: fmtDate(new Date(y, qi * 3, 1)), end: fmtDate(new Date(y, qi * 3 + 3, 0)) };
  }
  if (p === 'A') {
    const y = now.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtDate(ms), end: fmtDate(me) };
}

export function getPeriodLabel(p: PeriodType, offset: number): string {
  const { start } = getPeriodDates(p, offset);
  const d = new Date(start);
  if (p === 'D') return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (p === 'V') {
    const oj = new Date(d.getFullYear(), 0, 1);
    const wn = Math.ceil(((d.getTime() - oj.getTime()) / 86400000 + oj.getDay() + 1) / 7);
    return `V${wn} ${d.getFullYear()}`;
  }
  if (p === 'M') return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (p === 'K') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return `${d.getFullYear()}`;
}

// Paginerad hämtning — Supabase kapar tyst vid 1000 rader utan .range().
// Loopar tills en sida är kortare än sidstorleken, så inget kapas. Fel
// KASTAS — en tyst tom lista skulle se ut som "ingen data" i vyn.
export async function fetchAllRows(queryFn: (from: number, to: number) => PromiseLike<{ data: any[] | null; error?: { message: string } | null }>): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
