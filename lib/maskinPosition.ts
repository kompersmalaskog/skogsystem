// Maskinens SENAST KÄNDA position — startpunkten för maskindatorns startsekvens, i stället för att vänta på en
// GPS-fix (en testdator hemma, eller en maskindator som just startat, får ingen fix inne i ett objekt på länge).
//
// Två källor, i ordning:
//   1. `maskinPos_v1_<maskin_id>` i localStorage — bara på en RIKTIG maskindator (appen sparar den vid stängning).
//   2. Maskinens senaste hyttspår-punkt ur DB (tabellen `hyttspar`).
//
// Hyttspår-raderna är i prod märkta med maskin_id = NULL (0 av alla), så "vems spår är det?" kan inte läsas ur raden.
// Den är istället = ROLL + OBJEKT: ett skotar-spår på ett objekt där maskinen är objektets skotare
// (`objekt.skotare_maskin_id`) är maskinens. Raden med `maskin_id` satt (om/när importen fyller den) räknas direkt.
//
// Rena funktioner, inga DB-anrop, inga React-beroenden → testbara (maskinPosition.test.ts, riktig prod-fixtur).

import { valjObjektForPosition, arTilldelad, type KlararTyp, type ObjektForVal } from './objektPlats';

export type Roll = 'skordare' | 'skotare';

/** En rad ur `hyttspar` UTAN `points` (indexet — punkterna hämtas bara för den valda raden). */
export interface HyttsparIndexRad {
  id: string;
  objekt_id: string | null;
  roll: string | null;
  datum: string;                       // 'YYYY-MM-DD' (lokalt datum)
  maskin_id?: string | null;
  antal_punkter?: number | null;
  uppdaterad_at?: string | null;
}

/** Det som behövs ur objekt-raden för att avgöra vems ett spår är. */
export interface ObjektTilldelning {
  id: string;
  skotare_maskin_id?: string | null;
  skordare_maskin_id?: string | null;
}

export interface HyttsparPunkt { lat: number; lng: number; tid?: string | null }

/** Spår-raden räknas som maskinens? Rad med maskin_id satt → exakt match (aldrig någon annans).
 *  maskin_id saknas → roll + objekt: raden är maskinens om maskinen är objektets skördare/skotare I RADENS ROLL. */
export function ligganMaskinens(
  rad: Pick<HyttsparIndexRad, 'objekt_id' | 'roll' | 'maskin_id'>,
  maskinId: string,
  objektById: Map<string, ObjektTilldelning>,
): boolean {
  if (rad.maskin_id) return rad.maskin_id === maskinId;
  if (!rad.objekt_id) return false;
  const o = objektById.get(rad.objekt_id);
  if (!o) return false;
  if (rad.roll === 'skotare') return o.skotare_maskin_id === maskinId;
  if (rad.roll === 'skordare') return o.skordare_maskin_id === maskinId;
  return false;
}

/** Maskinens senaste spår-rad: nyast datum, sedan senast uppdaterad. Rader utan punkter (tomma/0) räknas inte —
 *  de har ingen position att starta från. null = maskinen har inget spår alls. */
export function valjSenasteSpar(args: {
  maskinId: string;
  index: HyttsparIndexRad[];
  objekt: ObjektTilldelning[];
}): HyttsparIndexRad | null {
  const { maskinId, index, objekt } = args;
  const byId = new Map(objekt.map((o) => [o.id, o]));
  const mina = (index || []).filter((r) => (r.antal_punkter ?? 0) > 0 && ligganMaskinens(r, maskinId, byId));
  mina.sort((a, b) => {
    if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;               // nyast datum först
    return String(b.uppdaterad_at ?? '').localeCompare(String(a.uppdaterad_at ?? ''));   // sedan senast skriven
  });
  return mina[0] ?? null;
}

/** Sista giltiga punkten i spåret (punkterna ligger i tidsordning). null om inga giltiga koordinater. */
export function senastePunkt(points: unknown): HyttsparPunkt | null {
  if (!Array.isArray(points)) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i] as any;
    if (p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      return { lat: p.lat, lng: p.lng, tid: typeof p.tid === 'string' ? p.tid : null };
    }
  }
  return null;
}

/** Den position appen sparar vid stängning (`maskinPos_v1_<maskin_id>`): {lat, lon}. Okänt/trasigt innehåll → null. */
export function tolkaSparadPosition(raw: string | null | undefined): { lat: number; lon: number } | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.lat === 'number' && typeof p.lon === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      return { lat: p.lat, lon: p.lon };
    }
  } catch { /* trasig JSON → ingen position */ }
  return null;
}

export type StartPosKalla = 'lokal' | 'hyttspar';

/** Vald startposition + varifrån den kom. `objektId` (bara hyttspår) = objektet spåret loggades på — maskinen stod
 *  där sist. Ofta ligger sista punkten strax UTANFÖR traktgränsen (maskinen körde ut mot väg/avlägg), så objektet
 *  kan inte hittas med en träff-i-polygon-kontroll; spårets egen objekt-koppling är det som bär. */
export interface StartPosition {
  lat: number;
  lon: number;
  kalla: StartPosKalla;
  objektId: string | null;
  datum: string | null;
  roll: Roll | null;
}

export const MASKINPOS_NYCKEL = (maskinId: string) => 'maskinPos_v1_' + maskinId;

/** Hela valet (ren): lokal position först (om tillåten), annars hyttspår. `lokalPos` ska vara null i testfliken. */
export function valjStartPosition(args: {
  lokalPos: { lat: number; lon: number } | null;
  spar: { rad: HyttsparIndexRad; punkt: HyttsparPunkt } | null;
}): StartPosition | null {
  const { lokalPos, spar } = args;
  if (lokalPos) return { lat: lokalPos.lat, lon: lokalPos.lon, kalla: 'lokal', objektId: null, datum: null, roll: null };
  if (spar) {
    const roll = spar.rad.roll === 'skordare' || spar.rad.roll === 'skotare' ? spar.rad.roll : null;
    return { lat: spar.punkt.lat, lon: spar.punkt.lng, kalla: 'hyttspar', objektId: spar.rad.objekt_id, datum: spar.rad.datum, roll };
  }
  return null;
}

// ───────────── Startbeslutets delar (rena — page.tsx komponerar dem; testade i maskinPosition.test.ts) ─────────────

/** Varifrån startpositionen kom: 'fix' = riktig GPS-fix (färsk), 'lokal' = sparad maskinPos, 'hyttspar' = DB-spåret. */
export type PosKalla = 'fix' | StartPosKalla;

/** Får spårets objekt styra valet? Ja för ett spår-objekt som finns. Avslutat objekt: bara i testfliken (där man vill se vad
 *  maskinen senast gjorde) — en RIKTIG maskin öppnar aldrig av sig själv körvy på ett avslutat objekt. */
export function sparObjektGiltigt(a: {
  kalla: PosKalla | null;
  sparObjektId: string | null;
  sparObjekt: { status?: string | null } | null;
  arTestflik: boolean;
}): boolean {
  return a.kalla === 'hyttspar' && !!a.sparObjektId && !!a.sparObjekt && (a.arTestflik || a.sparObjekt.status !== 'avslutat');
}

/** Vilket objekt står positionen i (planerade/pågående med traktgräns)? "Börja skota här?" frågas bara på en RIKTIG fix:
 *  på en gammal position (lokal/spår) kan maskinen ha flyttats sedan dess → ett ej tilldelat objekt räknas inte
 *  (anroparen går till tilldelat objekt i stället för att fråga om fel ställe). */
export function valjPosObjekt(a: {
  pos: { lat: number; lon: number };
  kalla: PosKalla;
  maskinId: string;
  klararTyp?: KlararTyp;
  kandidater: ObjektForVal[];
}): { posObjektId: string | null; posTilldelad: boolean } {
  const traff = valjObjektForPosition({ lat: a.pos.lat, lng: a.pos.lon, maskinId: a.maskinId, klararTyp: a.klararTyp, objekt: a.kandidater }).traff;
  const tilld = !!traff && arTilldelad(traff, a.maskinId);
  if (traff && (a.kalla === 'fix' || tilld)) return { posObjektId: traff.id, posTilldelad: tilld };
  return { posObjektId: null, posTilldelad: false };
}

/** Maskinens tilldelade objekt (A4-fallback): skördar- eller skotarplatsen, pågående före planerad före övrigt. */
export function valjTilldelatObjekt(kandidater: (ObjektForVal & { status?: string | null })[], maskinId: string): string | null {
  const t = kandidater.filter((o) => arTilldelad(o, maskinId));
  return (t.find((o) => o.status === 'pagaende') ?? t.find((o) => o.status === 'planerad') ?? t[0] ?? null)?.id ?? null;
}

/** Dit kameran flyger. Tilldelat objekt utan RIKTIG fix: en gammal position ligger inte nödvändigtvis i objektet →
 *  flyg till objektet självt (en riktig fix som kommer under tiden tar över). Annars maskinens position. */
export function valjFlygPos(a: {
  atgardTyp: 'korvy' | 'fraga' | 'tilldelat' | 'lista';
  kalla: PosKalla | null;
  pos: { lat: number; lon: number } | null;
  objekt: { lat?: unknown; lng?: unknown } | null;
}): { lat: number; lon: number } | null {
  if (a.atgardTyp === 'tilldelat' && a.kalla !== 'fix' && a.objekt && a.objekt.lat != null && a.objekt.lng != null) {
    const la = Number(a.objekt.lat), lo = Number(a.objekt.lng);
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lon: lo };
  }
  return a.pos;
}
