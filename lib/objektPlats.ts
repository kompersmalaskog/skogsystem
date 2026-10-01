// Positions­baserat objektval för förarflödet (maskindator-start + förarlistans "HÄR"-grupp).
//
// EN källa för "ligger jag inne i det här objektet?" och "vilket objekt står maskinen i?".
// Bygger på de redan etablerade primitiverna — ingen ny geometrimatematik:
//   • klassaTraktFeature (lib/traktGeometri) plockar ut den FAKTISKA traktgränsen (Vida L_TRAKTDEL)
//     ur objekt_geometri. objekt_geometri är hela envz-FeatureCollection (traktgräns + beståndsplan
//     + fastighet + hänsyn); bara L_TRAKTDEL är trakten. Att råräkna alla ringar ger falska träffar.
//   • punktIPolygon (lib/skotat) är appens enda ray-casting, delad med skotnings-avdraget.
//
// Rena funktioner, inga DB-anrop, inga React-beroenden → testbara (se objektPlats.test.ts).

import { klassaTraktFeature } from './traktGeometri';
import { punktIPolygon } from './skotat';

/** Så mycket av objekt_geometri.geometri som vi läser: en GeoJSON-FeatureCollection. */
export interface TraktGeometriFC {
  type?: string;
  features?: { properties?: Record<string, any> | null; geometry?: any }[] | null;
}

/** Objektets traktgräns­ringar ([lng,lat][]), dvs bara Vida L_TRAKTDEL-featurenas yttre ringar.
 *  Beståndsplan (SV_BESKRIVNINGSENHET_FL), fastighet (SV_FASTIGHET) och hänsyn räknas INTE —
 *  de ligger "ovanpå" i samma FeatureCollection men är inte trakten. */
export function traktgransRingar(geometri: TraktGeometriFC | null | undefined): [number, number][][] {
  const rings: [number, number][][] = [];
  for (const f of geometri?.features || []) {
    if (klassaTraktFeature(f?.properties).kategori !== 'traktdel') continue;
    const g = f?.geometry;
    const polys: any[] = g?.type === 'MultiPolygon' ? g.coordinates
      : g?.type === 'Polygon' ? [g.coordinates] : [];
    for (const poly of polys) {
      const r = poly?.[0];
      if (Array.isArray(r) && r.length >= 3) rings.push(r as [number, number][]);
    }
  }
  return rings;
}

/** Ligger positionen inne i objektets traktgräns? false om geometri saknas eller inte har traktdel. */
export function objektInnehallerPunkt(
  geometri: TraktGeometriFC | null | undefined,
  lat: number,
  lng: number,
): boolean {
  for (const ring of traktgransRingar(geometri)) {
    if (punktIPolygon([lng, lat], ring)) return true;
  }
  return false;
}

export type KlararTyp = 'bada' | 'slutavverkning' | 'gallring' | 'grot' | string | null | undefined;
export type Huvudtyp = 'slutavverkning' | 'gallring' | 'grot' | null;

/** Objektets huvudtyp för typmatchning/kolumn: grot-flaggan slår, annars objekt.typ-texten.
 *  (objekt.typ i DB är 'slutavverkning'/'gallring'; grot bärs av den separata grot-flaggan.) */
export function objektHuvudtyp(o: { typ?: string | null; grot?: boolean | null } | null | undefined): Huvudtyp {
  if (o?.grot === true) return 'grot';
  const t = (o?.typ || '').toLowerCase();
  if (t.includes('gallr')) return 'gallring';
  if (t.includes('slut')) return 'slutavverkning';
  return null;
}

/** Klarar maskinen (dim_maskin.klarar_typ / skotar_roll) objektets typ?
 *  'bada'/'allt'/'alla'/tomt = tar allt. Annars exakt match mot objektets huvudtyp. */
export function maskinKlararObjekt(
  klararTyp: KlararTyp,
  o: { typ?: string | null; grot?: boolean | null } | null | undefined,
): boolean {
  const k = String(klararTyp ?? '').toLowerCase();
  if (!k || k === 'bada' || k === 'allt' || k === 'alla') return true;
  const ht = objektHuvudtyp(o);
  return ht != null && k === ht;
}

/** Fält som behövs för positionsvalet. Spegel av objekt-raden (delmängd). */
export interface ObjektForVal {
  id: string;
  typ?: string | null;
  grot?: boolean | null;
  status?: string | null;
  geometri?: TraktGeometriFC | null;
  skotare_maskin_id?: string | null;
  skordare_maskin_id?: string | null;
  areal?: number | null;
}

/** Är objektet tilldelat just denna maskin (skördar- ELLER skotarplatsen)? */
export function arTilldelad(o: Pick<ObjektForVal, 'skotare_maskin_id' | 'skordare_maskin_id'>, maskinId: string | null | undefined): boolean {
  return !!maskinId && (o.skotare_maskin_id === maskinId || o.skordare_maskin_id === maskinId);
}

// Status-prioritet vid överlapp: pågående före planerad före okänt före avslutat.
function statusRank(s?: string | null): number {
  const t = (s || '').toLowerCase();
  if (t === 'pagaende' || t === 'skotning' || t === 'skordning') return 0;
  if (t === 'planerad') return 1;
  if (t === 'avslutat' || t === 'klar') return 3;
  return 2;
}

export interface PlatsVal {
  /** Bästa kandidaten (eller null om positionen inte ligger i något objekts traktgräns). */
  traff: ObjektForVal | null;
  /** Alla objekt vars traktgräns innehåller punkten, rankade (bästa först). */
  kandidater: ObjektForVal[];
  /** Fler än ett objekt innehåller punkten (överlappande trakter) → anroparen kan visa val. */
  flera: boolean;
}

/** Vilket objekt står maskinen i? Returnerar alla träffar rankade + den bästa.
 *  Tiebreak vid överlappande trakter: (1) tilldelat denna maskin, (2) status pågående→planerad,
 *  (3) maskinens typ matchar objektets typ, (4) minsta arealen (den minsta ytan ligger "inuti"),
 *  (5) stabilt på id. När bara 20/≈60 objekt har geometri faller anroparen tillbaka på tilldelat
 *  objekt när traff=null (sektion A4). */
export function valjObjektForPosition(args: {
  lat: number;
  lng: number;
  maskinId?: string | null;
  klararTyp?: KlararTyp;
  objekt: ObjektForVal[];
}): PlatsVal {
  const { lat, lng, maskinId, klararTyp, objekt } = args;
  const kand = (objekt || []).filter((o) => objektInnehallerPunkt(o.geometri, lat, lng));
  kand.sort((a, b) => {
    const ta = arTilldelad(a, maskinId) ? 0 : 1;
    const tb = arTilldelad(b, maskinId) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    const sa = statusRank(a.status), sb = statusRank(b.status);
    if (sa !== sb) return sa - sb;
    const ka = maskinKlararObjekt(klararTyp, a) ? 0 : 1;
    const kb = maskinKlararObjekt(klararTyp, b) ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const aa = a.areal ?? Infinity, ab = b.areal ?? Infinity;
    if (aa !== ab) return aa - ab;
    return String(a.id).localeCompare(String(b.id));
  });
  return { traff: kand[0] ?? null, kandidater: kand, flera: kand.length > 1 };
}
