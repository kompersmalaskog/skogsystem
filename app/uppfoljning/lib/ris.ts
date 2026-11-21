// "Ris att skota" — vilka trakter som har ris kvar, och hur det går.
//
// REN LOGIK, ingen databas och ingen klocka (idag skickas in).
//
// En trakt är med när den är grot-anpassad, inte själv ett risjobb och har
// skördad volym. Varje rad svarar på EN sak:
//   • Hämtat  — dim_objekt.grot_hamtad är satt (den enda sanningen; timjobbet
//               grot_auto sätter den när risjobbet är färdigskotat).
//   • Skotas  — ett kopplat risjobb (grot_koppling) har riktiga lass.
//   • Kvar    — inget lass än. Volymen är Skogforsk-schablonen och märks ≈.
// Schablonen är bara en platshållare tills första lasset, aldrig ett slutvärde.
//
// Ett risjobb som är kopplat till flera trakter går inte att dela upp: då sägs
// lassen inte per trakt (delas = true) och schablonen står kvar i summan.
import { arRisjobb } from '@/lib/objekt/typ';
import { uppskattaGrotM3fub } from '@/lib/grot';

export interface RisObjekt {
  grotAnpassad: boolean;
  grotHamtad: string | null;
  volymSkordare: number;
  sistaAvverkning: string | null;
  grotSkotning?: boolean;
  /** Summa lass (m³fub) på kopplade risjobb. null = inget kopplat risjobb med lass. */
  risSkotatM3?: number | null;
  /** Något kopplat risjobb gäller också andra trakter. */
  risDelas?: boolean;
}

export type RisLage =
  | { lage: 'hamtat'; datum: string; m3: number | null }
  | { lage: 'skotas'; m3: number; delas: boolean }
  | { lage: 'kvar'; schablon: number | null };

/** Hör trakten till rislistan över huvud taget? */
export function arRisTrakt(o: RisObjekt): boolean {
  return o.grotAnpassad === true && !arRisjobb(o) && o.volymSkordare > 0;
}

export function risLage(o: RisObjekt, faktor: number): RisLage {
  const skotat = o.risSkotatM3 != null && o.risSkotatM3 > 0 ? o.risSkotatM3 : null;
  if (o.grotHamtad) {
    return { lage: 'hamtat', datum: o.grotHamtad, m3: skotat != null && !o.risDelas ? skotat : null };
  }
  if (skotat != null) return { lage: 'skotas', m3: skotat, delas: o.risDelas === true };
  return { lage: 'kvar', schablon: uppskattaGrotM3fub(o.volymSkordare, faktor) };
}

/** Uppskattat ris kvar på trakten (≈). Hämtat = 0. Skotas: schablon minus det
 *  som körts, aldrig under 0 — utom när risjobbet delas, då går lassen inte att
 *  fördela och schablonen står kvar. */
export function risKvarM3(o: RisObjekt, faktor: number): number {
  const l = risLage(o, faktor);
  if (l.lage === 'hamtat') return 0;
  const schablon = uppskattaGrotM3fub(o.volymSkordare, faktor) || 0;
  if (l.lage === 'skotas' && !l.delas) return Math.max(0, schablon - l.m3);
  return schablon;
}

const DAG = 864e5;

export const HAMTAT_VISAS_DAGAR = 60;

/** Delar trakterna: kvar (skotas först, sedan äldst avverkat) och nyss hämtat
 *  (senaste HAMTAT_VISAS_DAGAR dagarna, nyast först). Äldre hämtade visas inte. */
export function risLista<T extends RisObjekt>(objekt: T[], faktor: number, idag: string): { kvar: T[]; hamtat: T[] } {
  const kvar: T[] = [];
  const hamtat: T[] = [];
  const idagMs = Date.parse(idag);
  for (const o of objekt) {
    if (!arRisTrakt(o)) continue;
    const l = risLage(o, faktor);
    if (l.lage === 'hamtat') {
      const alder = (idagMs - Date.parse(l.datum)) / DAG;
      if (alder <= HAMTAT_VISAS_DAGAR) hamtat.push(o);
    } else {
      kvar.push(o);
    }
  }
  const rang = (o: T) => (risLage(o, faktor).lage === 'skotas' ? 0 : 1);
  kvar.sort((a, b) => rang(a) - rang(b)
    || (!a.sistaAvverkning ? 1 : !b.sistaAvverkning ? -1 : a.sistaAvverkning.localeCompare(b.sistaAvverkning)));
  hamtat.sort((a, b) => (b.grotHamtad || '').localeCompare(a.grotHamtad || ''));
  return { kvar, hamtat };
}
