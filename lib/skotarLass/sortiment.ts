// Sortiment i lassrapporteringen: namnen är SKÖRDARENS ("Timmer: Vislanda Tall_V3"), så föraren ser det han känner igen och så
// "kvar" kan räknas per sortiment mot det skördaren kapat. Ingen standardlista — valen är traktens egna sortiment.
import type { SortimentRad } from './typer';

export const VED_MARKAGARE_NYCKEL = 'ved_markagare';
export const VED_MARKAGARE_NAMN = 'Ved markägare';

/** Nyckeln sortiment grupperas på: skördarens namn, städat (ingen skillnad i mellanslag/versaler). Markägarens ved är ett eget val. */
export function sortimentNyckel(namn: string): string {
  const s = String(namn ?? '').trim().replace(/\s+/g, ' ');
  if (/hemved/i.test(s) || s.toLowerCase() === VED_MARKAGARE_NAMN.toLowerCase()) return VED_MARKAGARE_NYCKEL;
  return s.toLowerCase();
}

const stor = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Läsbart namn ur skördarens: "Talltimmer: Vislanda kort V3" → "Talltimmer kort · Vislanda", "Timmer: Vislanda_195_1-2_V3" →
 * "Timmer 195 1-2 · Vislanda", "Massa: BmavFall_V3" → "Massa · BmavFall". Versionsmärket (_V3) är ingen skillnad man ska läsa.
 * Går namnet inte att tolka visas det städat som det är — aldrig ett påhittat namn.
 */
export function sortimentVisning(namn: string): string {
  const s = String(namn ?? '').trim();
  if (!s) return '';
  if (sortimentNyckel(s) === VED_MARKAGARE_NYCKEL) return VED_MARKAGARE_NAMN;
  const [fore, efter] = s.includes(':') ? s.split(/:\s*/, 2) : ['', s];
  const rest0 = efter.replace(/[_ ]?V\d+\s*$/i, '').trim();
  const ort = (rest0.match(/^[A-Za-zÅÄÖåäö]+/) ?? [''])[0];
  if (!fore || !ort) return stor(rest0.replace(/_/g, ' ').trim() || s);
  const tillagg = rest0.slice(ort.length).replace(/_/g, ' ').trim();
  const forePart = stor(fore.replace(/\s+/g, '').toLowerCase());
  return `${forePart}${tillagg ? ` ${tillagg}` : ''} · ${ort}`;
}

/** Två nivåer ur samma namn: sortimentet ("Timmer 195 1-2", vitt/semibold) och mottagaren ("Vislanda", grått efter). Mottagare saknas → null. */
export function sortimentDelar(namn: string): { sortiment: string; mottagare: string | null } {
  const v = sortimentVisning(namn);
  const i = v.indexOf(' · ');
  return i < 0 ? { sortiment: v, mottagare: null } : { sortiment: v.slice(0, i), mottagare: v.slice(i + 3) };
}

export interface SkordatSortiment {
  nyckel: string;
  namn: string;
  m3: number;
  /** Köparens kod (dim_sortiment.kundkod, t.ex. "012-VVI") för sortimentets id:n. Kopplar skördarens sortiment till skotarens i Opti-lassen. */
  kundkoder?: string[];
}

export const OKLASSAT_NYCKEL = 'unclassified';
/** Skördarens "Unclassified": visas aldrig för föraren med eget namn — det räknas in i Övrigt. */
export const arOklassat = (nyckel: string): boolean => nyckel === OKLASSAT_NYCKEL;

/** Skördat per sortiment ur fakt_sortiment (volym_m3sub) + dim_sortiment.namn. Samma nyckel ⇒ en rad. */
export function skordatPerSortiment(
  rader: ReadonlyArray<{ sortiment_id: string | null; volym_m3sub: number | string | null }>,
  namnPerId: ReadonlyMap<string, string>,
  kodPerId?: ReadonlyMap<string, string | null>,
): SkordatSortiment[] {
  const per = new Map<string, SkordatSortiment>();
  for (const r of rader) {
    const id = r.sortiment_id ?? '';
    const namn = namnPerId.get(id);
    const volym = Number(r.volym_m3sub ?? 0);
    if (!namn || !Number.isFinite(volym)) continue;
    const nyckel = sortimentNyckel(namn);
    const g = per.get(nyckel) ?? { nyckel, namn: nyckel === VED_MARKAGARE_NYCKEL ? VED_MARKAGARE_NAMN : namn, m3: 0, kundkoder: [] };
    g.m3 += volym;
    const kod = kodPerId?.get(id);
    if (kod && !g.kundkoder!.includes(kod)) g.kundkoder!.push(kod);
    per.set(nyckel, g);
  }
  return Array.from(per.values()).filter((g) => g.m3 > 0).sort((a, b) => b.m3 - a.m3);
}

/** Sortimenten föraren kan välja mellan i Ändra: traktens egna (störst först) + "Ved markägare" när trakten har markägarved. */
export function valbaraSortiment(skordat: readonly SkordatSortiment[], harMarkagarVed: boolean): SortimentRad[] {
  const ut: SortimentRad[] = skordat.filter((s) => !arOklassat(s.nyckel)).map((s) => ({ nyckel: s.nyckel, namn: s.namn, m3: 0 }));
  if (harMarkagarVed && !ut.some((u) => u.nyckel === VED_MARKAGARE_NYCKEL)) ut.push({ nyckel: VED_MARKAGARE_NYCKEL, namn: VED_MARKAGARE_NAMN, m3: 0 });
  return ut;
}
