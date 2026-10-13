// Objektlistan i planeringsvyn (ark under 900 px, panel från 900 px) — gruppering, sökning och radtext. Rena funktioner, ingen DB.
//
// GRUPPERNA UTGÅR FRÅN objekt.status och inget annat. Den gamla väljaren (ObjektValjare) delade i flikar efter `ar && manad`
// ("planerad månad") och undantog bara avslutade objekt när skotningen var klar (`skotKvarVo`): ett objekt med status 'avslutat'
// men virke kvar på backen blev därför kvar under Planerade (admin) / Pågående (förare), och en gammal status som 'klar' räknades
// aldrig som avslutad. Här finns ingen sådan väg: avslutat = status avslutat (eller den gamla 'klar') och hamnar ALDRIG i en aktiv grupp.

import { objektHuvudtyp } from './objektPlats';
import { typLabel } from './objekt/typ';

export type ObjektGrupp = 'pagar' | 'planerade' | 'oplanerade' | 'avslutade';

/** objekt.status → grupp. CHECK-värdena är planerad / pagaende / skotning / avslutat; äldre värden (skordning, klar) kan finnas i gammal data.
 *  skotning och skordning = arbete pågår → Pågår. Saknad/okänd status = Oplanerade (aldrig tyst Planerade: planerad betyder "klar att köra"). */
export function statusGrupp(status: string | null | undefined): ObjektGrupp {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'pagaende' || s === 'skotning' || s === 'skordning') return 'pagar';
  if (s === 'planerad') return 'planerade';
  if (s === 'avslutat' || s === 'klar') return 'avslutade';
  return 'oplanerade';
}

export interface ListObjekt {
  id: string;
  namn?: string | null;
  status?: string | null;
  typ?: string | null;
  avverkningsform?: string | null;
  grot?: boolean | null;
  bolag?: string | null;
  volym?: number | string | null;
  vo_nummer?: string | null;
  lat?: number | null;
  lng?: number | null;
  avslutad_timestamp?: string | null;
}

const sv = (a: string, b: string) => a.localeCompare(b, 'sv');

/** Typetiketten på raden. Okänd typ visas inte alls (aldrig gissad). GROT och energiklippning har egna etiketter. */
export function typText(o: ListObjekt): string {
  const h = objektHuvudtyp(o);
  return h ? typLabel(h) : '';
}

/** 1 200 m³ — tusentalsavgränsare med hårt mellanrum. Saknad/0 volym → tom sträng (raden visar bara det som finns). */
export function volymText(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} m³`;
}

/** Raden under namnet: typ · källa · m³ (det som saknas utelämnas, ingen "–"). Källa = objekt.bolag, som i dagens rad. */
export function radMeta(o: ListObjekt): string {
  return [typText(o), (o.bolag ?? '').trim(), volymText(o.volym)].filter(Boolean).join(' · ');
}

/** 19,8 km (decimalkomma). Under 1 km i meter. `ungefar` = fågelväg i väntan på vägavståndet → "~". null → tom. */
export function kmText(km: number | null | undefined, ungefar = false): string {
  if (km == null || !Number.isFinite(km)) return '';
  const t = km < 1 ? `${Math.round(km * 1000)} m` : `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} km`;
  return ungefar ? `~${t}` : t;
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

/** Sökträff: namn, källa, VO-nummer eller typ. Tom sökning = alla. */
export function sokTraff(o: ListObjekt, sok: string): boolean {
  const q = norm(sok).trim();
  if (!q) return true;
  return [o.namn, o.bolag, o.vo_nummer, typText(o)].some((f) => norm(f).includes(q));
}

export type ObjektGrupper<T> = Record<ObjektGrupp, T[]>;

/**
 * Delar upp efter status. Inom en aktiv grupp: närmast först (avstandKm; objekt utan avstånd sist, sedan namn).
 * Avslutade: senast avslutat först. `sok` filtrerar alla grupper.
 */
export function grupperaObjekt<T extends ListObjekt>(
  objekt: readonly T[],
  opt: { sok?: string; avstandKm?: (o: T) => number | null | undefined } = {},
): ObjektGrupper<T> {
  const ut: ObjektGrupper<T> = { pagar: [], planerade: [], oplanerade: [], avslutade: [] };
  for (const o of objekt) {
    if (!sokTraff(o, opt.sok ?? '')) continue;
    ut[statusGrupp(o.status)].push(o);
  }
  const avst = (o: T) => {
    const d = opt.avstandKm?.(o);
    return typeof d === 'number' && Number.isFinite(d) ? d : Infinity;
  };
  for (const g of ['pagar', 'planerade', 'oplanerade'] as const) {
    ut[g].sort((a, b) => (avst(a) - avst(b)) || sv(a.namn ?? '', b.namn ?? ''));
  }
  ut.avslutade.sort((a, b) => (b.avslutad_timestamp ?? '').localeCompare(a.avslutad_timestamp ?? '') || sv(a.namn ?? '', b.namn ?? ''));
  return ut;
}

/** Fågelavstånd i km (haversine). */
export function fagelKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Använder vyn den NYA objektlistan (ark/panel över kartan) — eller den gamla vägen (ObjektValjare-sidan / förarlistan)?
 * Bara planeringsvyn på telefon och dator. Maskinläget (maskindator, "öppna som maskin") och /maskin behåller sin förarlista, och körvyn
 * (även den som en förare öppnar i planeringsvyn) rörs inte: de ska bete sig exakt som före listan.
 */
export function anvandObjektLista(a: { maskinlage: boolean; maskinSom: boolean; korvyActive: boolean }): boolean {
  return !a.maskinlage && !a.maskinSom && !a.korvyActive;
}
