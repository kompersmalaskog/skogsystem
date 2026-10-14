// Objektlistan i planeringsvyn (ark under 900 px, panel från 900 px) — gruppering, sökning och radtext. Rena funktioner, ingen DB.
//
// GRUPPERNA UTGÅR FRÅN objekt.status — med TVÅ undantag som båda hämtats tillbaka från den gamla väljaren:
//  1. SKOTNING KVAR: ett objekt med status 'avslutat' där skotningen inte är klar (virke kvar på backen, lib/skotningKvar) visas under
//     Pågår med etiketten "Skotning kvar". När skotningen är klar flyttar det till Avslutade. Det är det ENDA som får hamna i en aktiv
//     grupp trots status 'avslutat'. (Felet som rättades i första versionen av listan: den gamla väljaren delade efter `ar && manad`
//     och lät avslutade ligga kvar under Planerade — här gäller skotning-kvar-regeln uttryckligen och bara för Pågår.)
//  2. HÄR: ligger enhetens GPS-position innanför ett objekts traktgräns visas det objektet överst under rubriken "Här", oavsett status —
//     utom avslutade utan virke kvar. EN grupp; ett objekt står i exakt en grupp. Samma träfflogik som förarlistans gamla Här-grupp
//     (objektTraffPunkt: innanför traktgränsen, eller inom 300 m från punkten när gräns saknas). Ingen position / ingen träff → ingen "Här".
//
// Gammal status 'klar' räknas som avslutad och har aldrig skotning kvar (den gamla väljaren behandlade bara 'avslutat' så).

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

/** Är objektet avslutat men skotningen inte klar? `skotningKvar` = lib/skotningKvar (nyckel vo_nummer). Bara status 'avslutat'. */
export function arSkotningKvar(
  o: { status?: string | null; vo_nummer?: string | null },
  skotningKvar?: ReadonlySet<string> | null,
): boolean {
  return (o.status ?? '').trim().toLowerCase() === 'avslutat' && !!o.vo_nummer && !!skotningKvar?.has(o.vo_nummer);
}

/** Gruppen en rad hör till utan hänsyn till "Här": status, men avslutat + skotning kvar räknas som Pågår. */
export function effektivGrupp(
  o: { status?: string | null; vo_nummer?: string | null },
  skotningKvar?: ReadonlySet<string> | null,
): ObjektGrupp {
  return arSkotningKvar(o, skotningKvar) ? 'pagar' : statusGrupp(o.status);
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

export type ObjektGrupper<T> = Record<ObjektGrupp, T[]> & { har: T[] };

/**
 * Delar upp efter status (se huvudkommentaren: skotning kvar → Pågår, GPS i traktgränsen → Här). Inom en aktiv grupp (och Här):
 * närmast först (avstandKm; objekt utan avstånd sist, sedan namn). Avslutade: senast avslutat först. `sok` filtrerar alla grupper.
 * `arHar` anropas aldrig för avslutade objekt utan virke kvar — de kan inte hamna i Här.
 */
export function grupperaObjekt<T extends ListObjekt>(
  objekt: readonly T[],
  opt: {
    sok?: string;
    avstandKm?: (o: T) => number | null | undefined;
    skotningKvar?: ReadonlySet<string> | null;
    arHar?: (o: T) => boolean;
  } = {},
): ObjektGrupper<T> {
  const ut: ObjektGrupper<T> = { har: [], pagar: [], planerade: [], oplanerade: [], avslutade: [] };
  for (const o of objekt) {
    if (!sokTraff(o, opt.sok ?? '')) continue;
    const g = effektivGrupp(o, opt.skotningKvar);
    if (g !== 'avslutade' && opt.arHar?.(o)) ut.har.push(o);
    else ut[g].push(o);
  }
  const avst = (o: T) => {
    const d = opt.avstandKm?.(o);
    return typeof d === 'number' && Number.isFinite(d) ? d : Infinity;
  };
  for (const g of ['har', 'pagar', 'planerade', 'oplanerade'] as const) {
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
