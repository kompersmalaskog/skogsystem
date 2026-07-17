// Datumhjälpare för ledighet. Röda dagar beräknas (Gauss påskalgoritm) i
// stället för att hårdkodas per år — gamla vyn hade bara 2026 inskrivet.

export const MANADSNAMN = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "2026-04-13" → "13 apr" */
export function fmtDatum(iso: string): string {
  const p = iso.split('-');
  const man = MANADSNAMN[parseInt(p[1], 10) - 1] ?? '';
  return `${parseInt(p[2], 10)} ${man.substring(0, 3)}`;
}

/** "2026-07-14T09:12:00Z" → "14 jul" (för "uppdaterad ..."-etiketter) */
export function fmtTidpunkt(ts: string): string {
  return fmtDatum(ts.substring(0, 10));
}

/** Påskdagen enligt anonym gregoriansk algoritm (Gauss). */
export function paskdagen(ar: number): Date {
  const a = ar % 19;
  const b = Math.floor(ar / 100);
  const c = ar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const manad = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = april
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ar, manad - 1, dag);
}

const rodaDagarCache = new Map<number, Set<string>>();

/** Svenska röda dagar (allmänna helgdagar) för ett år. */
export function rodaDagar(ar: number): Set<string> {
  const cached = rodaDagarCache.get(ar);
  if (cached) return cached;

  const s = new Set<string>();
  const pask = paskdagen(ar);
  const plus = (dagar: number) => {
    const d = new Date(pask);
    d.setDate(d.getDate() + dagar);
    return toISO(d);
  };

  s.add(`${ar}-01-01`); // Nyårsdagen
  s.add(`${ar}-01-06`); // Trettondedag jul
  s.add(plus(-2));      // Långfredagen
  s.add(plus(0));       // Påskdagen
  s.add(plus(1));       // Annandag påsk
  s.add(`${ar}-05-01`); // Första maj
  s.add(plus(39));      // Kristi himmelsfärdsdag
  s.add(plus(49));      // Pingstdagen
  s.add(`${ar}-06-06`); // Nationaldagen
  // Midsommardagen: lördagen 20–26 juni
  for (let d = 20; d <= 26; d++) {
    if (new Date(ar, 5, d).getDay() === 6) { s.add(toISO(new Date(ar, 5, d))); break; }
  }
  // Alla helgons dag: lördagen 31 okt–6 nov
  for (let d = 0; d <= 6; d++) {
    const dat = new Date(ar, 9, 31 + d);
    if (dat.getDay() === 6) { s.add(toISO(dat)); break; }
  }
  s.add(`${ar}-12-25`); // Juldagen
  s.add(`${ar}-12-26`); // Annandag jul

  rodaDagarCache.set(ar, s);
  return s;
}

export function arRodDag(iso: string): boolean {
  return rodaDagar(parseInt(iso.substring(0, 4), 10)).has(iso);
}

export function arHelg(iso: string): boolean {
  const dag = new Date(iso + 'T00:00:00').getDay();
  return dag === 0 || dag === 6;
}

/** Kalenderdagar inkl. start och slut. */
export function kalenderdagar(startIso: string, slutIso: string): number {
  const s = new Date(startIso + 'T00:00:00');
  const e = new Date(slutIso + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

/**
 * Arbetsdagar i intervallet: mån–fre som inte är röd dag.
 * Används BARA för att visa en ansökans längd — aldrig för saldomatte
 * (saldot är auktoritativt i medarbetare_saldo, sätts manuellt/via Fortnox).
 */
export function arbetsdagar(startIso: string, slutIso: string): number {
  if (!startIso || !slutIso || slutIso < startIso) return 0;
  let antal = 0;
  const d = new Date(startIso + 'T00:00:00');
  const slut = new Date(slutIso + 'T00:00:00');
  while (d <= slut) {
    const iso = toISO(d);
    if (!arHelg(iso) && !arRodDag(iso)) antal++;
    d.setDate(d.getDate() + 1);
  }
  return antal;
}

/** "3 – 6 juli", "29 juni – 2 juli", eller "3 juli" för en enskild dag. */
export function fmtPeriod(startIso: string, slutIso: string): string {
  const [, sm, sd] = startIso.split('-').map(n => parseInt(n, 10));
  const [, em, ed] = slutIso.split('-').map(n => parseInt(n, 10));
  if (startIso === slutIso) return `${sd} ${MANADSNAMN[sm - 1]}`;
  if (sm === em) return `${sd} – ${ed} ${MANADSNAMN[sm - 1]}`;
  return `${sd} ${MANADSNAMN[sm - 1]} – ${ed} ${MANADSNAMN[em - 1]}`;
}

/** "3 arbetsdagar" / "1 arbetsdag" (+ kalenderdagar i parentes när de skiljer). */
export function fmtLangd(startIso: string, slutIso: string): string {
  const ad = arbetsdagar(startIso, slutIso);
  const kd = kalenderdagar(startIso, slutIso);
  const bas = `${ad} arbetsdag${ad === 1 ? '' : 'ar'}`;
  return kd !== ad ? `${bas} (${kd} dagar totalt)` : bas;
}
