// EN VARNING PER HINDER (Martin 2026-11-16). Förarna fick trycka Sett gång på gång; den som inte tryckte fick samma varning vid varje närmande.
// Nu varnar allt utom Fara EN gång: när kortet visats och föraren kört därifrån — eller kortet stått uppe i VISAT_EFTER_MS — räknas hindret som varnat,
// vare sig han tryckte Sett eller inte. Ringen på kartan lyser fortfarande när man är nära.
//
// Minnet ligger PÅ ENHETEN (per trakt och förare), inte i databasen: tabellen korvy_kvittens_forare är beviset på att föraren själv tryckte Sett, och
// det ska den fortsätta vara. Ändras hindrets innehåll (typ eller kommentar → ny hash) varnar det en gång till. Fara finns aldrig här.

export const VISAT_NYCKEL = 'larm_visat_v1';
/** Så länge står kortet uppe innan hindret räknas som varnat även om föraren står kvar intill (arbetar längs en stenmur). */
export const VISAT_EFTER_MS = 30_000;

export type VisatKarta = Record<string, string>;   // markeringens id → innehållets hash när det varnades
type Minne = Pick<Storage, 'getItem' | 'setItem'>;
const nyckel = (objektId: string, forareId: string) => `${VISAT_NYCKEL}:${objektId}:${forareId}`;
const minne = (): Minne | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function lasVisat(objektId: string, forareId: string, m: Minne | null = minne()): VisatKarta {
  try {
    const v = JSON.parse(m?.getItem(nyckel(objektId, forareId)) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as VisatKarta) : {};
  } catch { return {}; }
}

export function sparaVisat(objektId: string, forareId: string, karta: VisatKarta, m: Minne | null = minne()): void {
  try { m?.setItem(nyckel(objektId, forareId), JSON.stringify(karta)); } catch { /* fullt eller blockerat: varningen kommer en gång till, inget värre */ }
}

/** Id:na som redan är varnade med SAMMA innehåll som nu. */
export function visadeNu(karta: VisatKarta, objekt: readonly { id: string; hash: string }[]): Set<string> {
  const ut = new Set<string>();
  for (const o of objekt) if (karta[o.id] === o.hash) ut.add(o.id);
  return ut;
}
