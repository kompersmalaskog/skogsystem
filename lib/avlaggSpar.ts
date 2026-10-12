// Avlägg (landing-markörer) → tabellen avlagg_assessments, utan att skriva om allt vid varje ändring.
//
// Före: en effekt på `markers` upsertade EN RAD PER AVLÄGG (18 kolumner, inklusive foto-bas64) efter 1,5 s vid varje markör-
// ändring — och direkt efter laddningen när något avlägg hade en sparad rad. Ett läsfel räknades som laddat, och ingen vakt
// kollade att `markers` hörde till det öppna objektet. Prod: ett enda foto på ca 9,8 MB laddades om vid varje markörändring.
//
// Nu: baslinje per avlägg = dess användarkolumner direkt efter laddning. Bara avlägg vars kolumner ändrats skrivs, och bara de
// ändrade kolumnerna (foto laddas inte upp igen när bara kommentaren ändrats). Ett nytt avlägg utan användarinnehåll skrivs inte
// alls förrän något fyllts i. Vägkontrollens härledda kolumner (road_*) utlöser aldrig en skrivning; de följer bara med när en
// helt ny rad skapas.
//
// Rena funktioner (markören som parameter) → enhetstestbara.
import { andradeKolumner, type Kolumner } from './autosparBaslinje';

/** Minsta av en markör som avlägg-logiken läser (ett landing-Marker i planeringsvyn uppfyller den). */
export interface AvlaggMarkor {
  id: string | number;
  x: number;
  y: number;
  comment?: string;
  photoData?: string;
  roadCheck?: {
    nearestRoad?: { name: string; type: string; maxspeed?: number; ref?: string };
    roadCategory?: string;
    requiresSpecialPermit?: boolean;
    generelltTillstandApplied?: boolean;
    tillstand?: string;
    checklist?: boolean[];
    nearbyIntersection?: { distance: number };
  } | null;
}

/** En avlägg-rad i DB (det som laddas med select *). */
export interface AvlaggDbRad {
  marker_id: string;
  comment?: string | null;
  photo_data?: string | null;
  tillstand?: string | null;
  checklist?: boolean[] | null;
}

export const AVLAGG_STD_CHECKLISTA: boolean[] = [false, false, false, false, false, false, false, false, false, false, false];

/** Användarkolumnerna (det som kan "ändras"): dessa jämförs mot baslinjen. */
export function avlaggKolumner(m: AvlaggMarkor): Kolumner {
  const rc = m.roadCheck;
  return {
    comment: m.comment || null,
    photo_data: m.photoData || null,
    tillstand: rc?.tillstand || 'ej_sokt',
    checklist: rc?.checklist || AVLAGG_STD_CHECKLISTA,
    requires_special_permit: rc?.requiresSpecialPermit || false,
    generellt_tillstand_applied: rc?.generelltTillstandApplied || false,
  };
}

/** Hela raden för ett NYTT avlägg (användarkolumnerna + läge + vägkontrollens härledda kolumner). Samma kolumner som förr. */
export function avlaggFullRad(objektId: string, m: AvlaggMarkor, lat: number, lon: number, nowIso: string): Kolumner {
  const rc = m.roadCheck;
  const nr = rc?.nearestRoad;
  return {
    objekt_id: objektId,
    marker_id: String(m.id),
    lat,
    lon,
    ...avlaggKolumner(m),
    road_name: nr ? (nr.ref ? `${nr.ref} — ${nr.name}` : nr.name) : null,
    road_ref: nr?.ref || null,
    road_type: nr?.type || null,
    road_speed: nr?.maxspeed || null,
    road_category: rc?.roadCategory || null,
    distance_to_road: null,   // inte tillgängligt i RoadCheckResult
    nearby_intersection_distance: rc?.nearbyIntersection?.distance || null,
    updated_at: nowIso,
  };
}

export interface AvlaggBas { cols: Kolumner; x: number; y: number }
export type AvlaggBaslinje = Map<string, AvlaggBas>;

export const avlaggBasFranMarkor = (m: AvlaggMarkor): AvlaggBas => ({ cols: avlaggKolumner(m), x: m.x, y: m.y });

/** Har avlägget något användaren fyllt i? (kommentar, foto, sökt/beviljat, någon avprickad punkt) */
export function harAnvandarinnehall(cols: Kolumner): boolean {
  return !!cols.comment || !!cols.photo_data || cols.tillstand !== 'ej_sokt' || (Array.isArray(cols.checklist) && cols.checklist.some(Boolean));
}

/** Flätar in sparad data ur DB i avlägg-markörerna (samma sammanslagning som förr: DB fyller i det markören saknar). */
export function mergaAvlagg<M extends AvlaggMarkor & { type?: string }>(markers: M[], dbRader: AvlaggDbRad[]): M[] {
  if (!dbRader || dbRader.length === 0) return markers;
  const perId: Record<string, AvlaggDbRad> = {};
  for (const r of dbRader) perId[r.marker_id] = r;
  return markers.map((m) => {
    if (m.type !== 'landing') return m;
    const saved = perId[String(m.id)];
    if (!saved) return m;
    const rc = m.roadCheck || { status: 'ok', tillstand: 'ej_sokt' };
    return {
      ...m,
      comment: saved.comment ?? m.comment,
      photoData: saved.photo_data ?? m.photoData,
      roadCheck: { ...rc, tillstand: saved.tillstand || (rc as any).tillstand, checklist: saved.checklist || (rc as any).checklist },
    } as M;
  });
}

/** Baslinje för en lista markörer (ersätter eventuella gamla poster för samma id). */
export function avlaggBaslinjeFran(markers: AvlaggMarkor[], bas: AvlaggBaslinje = new Map()): AvlaggBaslinje {
  for (const m of markers) bas.set(String(m.id), avlaggBasFranMarkor(m));
  return bas;
}

export interface AvlaggSkrivning {
  markerId: string;
  /** true = raden finns inte i baslinjen och har användarinnehåll → hela raden skapas */
  ny: boolean;
  /** de ändrade användarkolumnerna (för en ny rad: alla) */
  kolumner: Kolumner;
  flyttad: boolean;
  bas: AvlaggBas;
}

/** Vilka avlägg ska skrivas nu, och vilka nya (utan innehåll) ska bara in i baslinjen? Muterar inte baslinjen. */
export function avlaggAttSkriva(bas: AvlaggBaslinje, avlagg: AvlaggMarkor[]): { skriv: AvlaggSkrivning[]; tystaNya: [string, AvlaggBas][] } {
  const skriv: AvlaggSkrivning[] = [];
  const tystaNya: [string, AvlaggBas][] = [];
  for (const m of avlagg) {
    const id = String(m.id);
    const nu = avlaggBasFranMarkor(m);
    const b = bas.get(id);
    if (!b) {
      if (harAnvandarinnehall(nu.cols)) skriv.push({ markerId: id, ny: true, kolumner: nu.cols, flyttad: true, bas: nu });
      else tystaNya.push([id, nu]);
      continue;
    }
    const andrat = andradeKolumner(b.cols, nu.cols);
    const flyttad = b.x !== nu.x || b.y !== nu.y;
    if (Object.keys(andrat).length > 0 || flyttad) skriv.push({ markerId: id, ny: false, kolumner: andrat, flyttad, bas: nu });
  }
  return { skriv, tystaNya };
}
