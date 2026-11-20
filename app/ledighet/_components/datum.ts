// Datumhjälpare för ledighet. Röda dagar kommer från lib/roda-dagar — EN
// källa för kalendern, helglönen, bytesdagen och den här vyn. (Förr hade den
// här filen en egen påskalgoritm och egen lista: två källor för samma sak är
// samma fälla som tre veckonummer.)
import { getRödaDagar } from '@/lib/roda-dagar';

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

const aftnarCache = new Map<number, Set<string>>();

/**
 * Arbetsfria aftnar: julafton, nyårsafton och midsommarafton. Inte formellt
 * röda, men lediga i praktiken — kapacitets- och ledighetsräkningen ska räkna
 * dem lika över hela appen. lib/roda-dagar listar dem bland de röda (de ger
 * helglön); här hålls de isär så "röd" och "afton" kan färgas olika.
 */
export function arbetsfriaAftnar(ar: number): Set<string> {
  const cached = aftnarCache.get(ar);
  if (cached) return cached;
  const s = new Set<string>();
  for (const [datum, namn] of Object.entries(getRödaDagar(ar))) {
    if (namn === 'Julafton' || namn === 'Nyårsafton' || namn === 'Midsommarafton') s.add(datum);
  }
  aftnarCache.set(ar, s);
  return s;
}

const rodaDagarCache = new Map<number, Set<string>>();

/** Svenska röda dagar (allmänna helgdagar) för ett år — lib/roda-dagar minus aftnarna. */
export function rodaDagar(ar: number): Set<string> {
  const cached = rodaDagarCache.get(ar);
  if (cached) return cached;
  const aftnar = arbetsfriaAftnar(ar);
  const s = new Set<string>(Object.keys(getRödaDagar(ar)).filter(d => !aftnar.has(d)));
  rodaDagarCache.set(ar, s);
  return s;
}

export function arRodDag(iso: string): boolean {
  return rodaDagar(parseInt(iso.substring(0, 4), 10)).has(iso);
}

const ledigaDagarCache = new Map<number, Set<string>>();

/** Röda dagar + arbetsfria aftnar. EN källa för "räknas inte som arbetsdag". */
export function ledigaDagar(ar: number): Set<string> {
  const cached = ledigaDagarCache.get(ar);
  if (cached) return cached;
  const s = new Set<string>([...rodaDagar(ar), ...arbetsfriaAftnar(ar)]);
  ledigaDagarCache.set(ar, s);
  return s;
}

export function arLedigDag(iso: string): boolean {
  return ledigaDagar(parseInt(iso.substring(0, 4), 10)).has(iso);
}

/**
 * Arbetsdagar (ISO-datum) i en månad: mån–fre som varken är röd dag eller
 * arbetsfri afton. 1-indexerad månad.
 */
export function arbetsdagarIManad(ar: number, manad: number): string[] {
  const antalDagar = new Date(ar, manad, 0).getDate();
  const ut: string[] = [];
  for (let dag = 1; dag <= antalDagar; dag++) {
    const iso = toISO(new Date(ar, manad - 1, dag));
    if (!arHelg(iso) && !arLedigDag(iso)) ut.push(iso);
  }
  return ut;
}

/** Antal lediga vardagar (röda + aftnar som infaller mån–fre) i månaden. */
export function ledigaVardagarIManad(ar: number, manad: number): number {
  const antalDagar = new Date(ar, manad, 0).getDate();
  let n = 0;
  for (let dag = 1; dag <= antalDagar; dag++) {
    const iso = toISO(new Date(ar, manad - 1, dag));
    if (!arHelg(iso) && arLedigDag(iso)) n++;
  }
  return n;
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
 * Arbetsdagar i intervallet: mån–fre som varken är röd dag eller arbetsfri afton.
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
    if (!arHelg(iso) && !arLedigDag(iso)) antal++;
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
