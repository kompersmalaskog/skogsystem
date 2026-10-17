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

import { arTilldelad, maskinKlararObjekt, objektHuvudtyp, type KlararTyp } from './objektPlats';
import { typLabel } from './objekt/typ';

export type ObjektGrupp = 'pagar' | 'planerade' | 'oplanerade' | 'avslutade';

/** objekt.status → grupp. CHECK-värdena är oplanerad / planerad / pagaende / skotning / avslutat; äldre värden (skordning, klar) kan finnas i gammal data.
 *  skotning och skordning = arbete pågår → Pågår. 'oplanerad' (nytt objekt, ingen har tryckt "Klar för maskin") och saknad/okänd status = Oplanerade
 *  (aldrig tyst Planerade: planerad betyder "klar att köra"). */
export function statusGrupp(status: string | null | undefined): ObjektGrupp {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'pagaende' || s === 'skotning' || s === 'skordning') return 'pagar';
  if (s === 'planerad') return 'planerade';
  if (s === 'avslutat' || s === 'klar') return 'avslutade';
  return 'oplanerade'; // 'oplanerad' och allt okänt
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
  /** ögonblicksbild av "N kvar" ur Klar med trakten? (objekt.klar_kvar_antal) — null = kortet har inte öppnats */
  klar_kvar_antal?: number | null;
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
    /** Maskinläge: sorteringsnyckel som går FÖRE avståndet inom varje aktiv grupp (lägre först) — se maskinRang. */
    rang?: (o: T) => number;
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
    ut[g].sort((a, b) => ((opt.rang?.(a) ?? 0) - (opt.rang?.(b) ?? 0)) || (avst(a) - avst(b)) || sv(a.namn ?? '', b.namn ?? ''));
  }
  ut.avslutade.sort((a, b) => (b.avslutad_timestamp ?? '').localeCompare(a.avslutad_timestamp ?? '') || sv(a.namn ?? '', b.namn ?? ''));
  return ut;
}

// ---- Avslutade: växlare per typ ------------------------------------------------------------------------------------------------
// Avslutade-vyn har överst en segmentväxlare med de typer som FINNS bland avslutade objekt ("Slutavverkning 38 · Gallring 18 · GROT 1"),
// förvald är den med flest. Under den: objekten av vald typ, senast avslutade först, med avslutsdatum på raden. Sök söker i alla typer
// (växlaren göms medan man söker; raden visar då typen). Pågår/Planerade berörs inte.

export type AvslutadTyp = 'slutavverkning' | 'gallring' | 'grot' | 'energiklippning' | 'okand';

/** Fast ordning — avgör bara lika antal. */
const AVSLUTAD_TYP_ORDNING: readonly AvslutadTyp[] = ['slutavverkning', 'gallring', 'grot', 'energiklippning', 'okand'];

export const AVSLUTAD_TYP_ETIKETT: Record<AvslutadTyp, string> = {
  slutavverkning: 'Slutavverkning',
  gallring: 'Gallring',
  grot: 'GROT',
  energiklippning: 'Energiklippning',
  okand: 'Okänd typ',
};

/** Objektets typ för växlaren: samma huvudtyp som raden visar (objektHuvudtyp). Saknad/okänd typ = 'okand' — aldrig gissad som Gallring. */
export function avslutadTyp(o: ListObjekt): AvslutadTyp {
  return objektHuvudtyp(o) ?? 'okand';
}

/** Typerna som finns bland objekten, flest först (lika antal: fast ordning). Typer utan objekt finns inte. */
export function avslutadeTyper(objekt: readonly ListObjekt[]): { typ: AvslutadTyp; etikett: string; antal: number }[] {
  const antal = new Map<AvslutadTyp, number>();
  for (const o of objekt) { const t = avslutadTyp(o); antal.set(t, (antal.get(t) ?? 0) + 1); }
  return AVSLUTAD_TYP_ORDNING
    .filter((t) => (antal.get(t) ?? 0) > 0)
    .map((t) => ({ typ: t, etikett: AVSLUTAD_TYP_ETIKETT[t], antal: antal.get(t)! }))
    .sort((a, b) => b.antal - a.antal);   // stabil sortering: lika antal behåller den fasta ordningen
}

/** Vald typ om den finns bland objekten, annars den med flest. null = inga objekt. */
export function valdAvslutadTyp(objekt: readonly ListObjekt[], vald: AvslutadTyp | null | undefined): AvslutadTyp | null {
  const typer = avslutadeTyper(objekt);
  if (typer.length === 0) return null;
  return vald && typer.some((t) => t.typ === vald) ? vald : typer[0].typ;
}

/** Objekten av en typ, i den ordning de redan har (grupperaObjekt sorterar avslutade senast avslutat först). */
export function avslutadeAvTyp<T extends ListObjekt>(objekt: readonly T[], typ: AvslutadTyp | null): T[] {
  return typ ? objekt.filter((o) => avslutadTyp(o) === typ) : [];
}

/** Avslutsdatum som dagens "Avslutat 2026-10-05": de tio första tecknen i avslutad_timestamp. Saknas det → null (aldrig ett påhittat datum). */
export function avslutsDatum(o: Pick<ListObjekt, 'avslutad_timestamp'>): string | null {
  const t = (o.avslutad_timestamp ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Raden i Avslutade: "Avslutat 2026-10-05 · källa · m³" — med `medTyp` (vid sökning över alla typer) står typen före källan. */
export function avslutadMeta(o: ListObjekt, medTyp: boolean): string {
  const datum = avslutsDatum(o);
  const rest = medTyp ? radMeta(o) : [(o.bolag ?? '').trim(), volymText(o.volym)].filter(Boolean).join(' · ');
  return [`Avslutat ${datum ?? '—'}`, rest].filter(Boolean).join(' · ');
}

/**
 * Maskinläge: samma ordning som maskinens gamla förarlista (lib/objektlista inomGruppSort) inom varje grupp —
 * tilldelat DEN HÄR maskinen först (0), sedan objekt maskinen klarar (1), sist övriga (2). Avståndet avgör inom samma rang.
 * Inget döljs: en maskin kan alltid välja vilket objekt som helst (rollen spärras först när objektet öppnas).
 */
export function maskinRang(
  o: ListObjekt & { skordare_maskin_id?: string | null; skotare_maskin_id?: string | null },
  maskinId: string | null | undefined,
  klararTyp: KlararTyp,
): number {
  if (arTilldelad(o, maskinId)) return 0;
  return maskinKlararObjekt(klararTyp, o) ? 1 : 2;
}

/** Fågelavstånd i km (haversine). */
export function fagelKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Använder vyn den NYA objektlistan (ark/panel över kartan) — eller den gamla vägen (ObjektValjare-sidan)?
 * Planeringsvyn på telefon och dator, med ett valt objekt bakom (listan öppnas ovanpå kartan). Maskinläget och körvyn rör inte den vägen:
 * där byter man objekt via objektlistan UTAN valt objekt (anvandObjektListaUtanObjekt).
 */
export function anvandObjektLista(a: { maskinlage: boolean; maskinSom: boolean; korvyActive: boolean }): boolean {
  return !a.maskinlage && !a.maskinSom && !a.korvyActive;
}

/**
 * Inget objekt valt: visas kartan med objektlistan (ObjektKartaTom) — i planeringsvyn OCH i maskinläge (maskindator, "öppna som maskin";
 * Martin 2026-10-17: "samma i maskinen"). I maskinläge öppnar ett val körvyn som förut (sidan avgör), listan sorterar maskinens egna först.
 * Annars (körvy utanför maskinläge, /maskin innan maskinläget hunnit starta) den gamla ObjektValjare-sidan.
 */
export function anvandObjektListaUtanObjekt(a: { maskinlage: boolean; maskinSom: boolean; korvyActive: boolean }): boolean {
  return a.maskinlage || anvandObjektLista(a);
}
