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
import { haversineMeters } from './gps-guard';

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

/** Ett objekt som BARA har en punkt (ingen traktgräns — t.ex. ett jobb från Starta jobb som Vida inte levererat)
 *  räknas som träff när positionen ligger så här nära punkten. */
export const PUNKT_TRAFF_M = 300;

/** Har objektet en traktgräns att räkna "inne i" mot? (Geometri utan traktdel räknas inte — då gäller punkten.) */
export function harTraktgrans(geometri: TraktGeometriFC | null | undefined): boolean {
  return traktgransRingar(geometri).length > 0;
}

const talEllerNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Avstånd (m) från positionen till objektets punkt (lat/lng), null om objektet saknar punkt. */
export function avstandTillObjektPunkt(o: { lat?: unknown; lng?: unknown }, lat: number, lng: number): number | null {
  const oLat = talEllerNull(o?.lat), oLng = talEllerNull(o?.lng);
  if (oLat == null || oLng == null) return null;
  return haversineMeters(oLat, oLng, lat, lng);
}

/** EN träffregel för "står maskinen i det här objektet?":
 *   • objektet har en traktgräns → positionen ska ligga INNE i den (som förut), annars
 *   • objektet har bara en punkt → positionen ska ligga inom PUNKT_TRAFF_M (300 m) från den.
 *  Objekt med både gräns och punkt räknas bara mot gränsen (punkten är då bara en markör för trakten). */
export function objektTraffPunkt(
  o: { geometri?: TraktGeometriFC | null; lat?: unknown; lng?: unknown } | null | undefined,
  lat: number,
  lng: number,
  punktM: number = PUNKT_TRAFF_M,
): boolean {
  if (!o) return false;
  if (harTraktgrans(o.geometri)) return objektInnehallerPunkt(o.geometri, lat, lng);
  const d = avstandTillObjektPunkt(o, lat, lng);
  return d != null && d <= punktM;
}

export type KlararTyp = 'bada' | 'slutavverkning' | 'gallring' | 'grot' | string | null | undefined;
export type Huvudtyp = 'slutavverkning' | 'gallring' | 'grot' | 'energiklippning' | null;

/** Objektets huvudtyp för typmatchning/kolumn/etikett.
 *  VIKTIGT: `objekt.grot` = "producerar GROT" (bioenergi tas ut) och betyder INTE att TYPEN är grot —
 *  en slutavverkning kan ha grot=true (15 st i prod). Ett RENT GROT-/biobränslejobb känns igen på
 *  `avverkningsform='Biobränsle'` ELLER (jobb från Starta jobb) `typ='grot'`. `typ='energiklippning'` är ett eget jobb.
 *  Annars styr `objekt.typ` ('slutavverkning'/'gallring'). */
export function objektHuvudtyp(o: { typ?: string | null; grot?: boolean | null; avverkningsform?: string | null } | null | undefined): Huvudtyp {
  const avv = (o?.avverkningsform || '').toLowerCase();
  if (avv.includes('biobr')) return 'grot';   // Biobränsle = eget GROT-jobb
  const t = (o?.typ || '').toLowerCase();
  if (t.includes('energi')) return 'energiklippning';
  if (t.includes('grot')) return 'grot';      // Starta jobb: GROT är en TYP (aldrig via objekt.grot-flaggan)
  if (t.includes('gallr')) return 'gallring';
  if (t.includes('slut')) return 'slutavverkning';
  return null;
}

/** Klarar maskinen (dim_maskin.klarar_typ / skotar_roll) objektets typ?
 *  'bada'/'allt'/'alla'/tomt = tar allt. Annars exakt match mot objektets huvudtyp. */
export function maskinKlararObjekt(
  klararTyp: KlararTyp,
  o: { typ?: string | null; grot?: boolean | null; avverkningsform?: string | null } | null | undefined,
): boolean {
  const k = String(klararTyp ?? '').toLowerCase();
  if (!k || k === 'bada' || k === 'allt' || k === 'alla') return true;
  const ht = objektHuvudtyp(o);
  if (ht === 'energiklippning' && k === 'grot') return true;   // en GROT-maskin klarar även energiklippning
  return ht != null && k === ht;
}

/** Fält som behövs för positionsvalet. Spegel av objekt-raden (delmängd). */
export interface ObjektForVal {
  id: string;
  typ?: string | null;
  grot?: boolean | null;
  avverkningsform?: string | null;   // 'Biobränsle' = GROT-jobb (se objektHuvudtyp)
  status?: string | null;
  geometri?: TraktGeometriFC | null;
  skotare_maskin_id?: string | null;
  skordare_maskin_id?: string | null;
  areal?: number | null;
  /** Objektets punkt. Räknas bara när objektet saknar traktgräns (se objektTraffPunkt). */
  lat?: number | null;
  lng?: number | null;
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
  // Traktgräns → INNE i den; bara en punkt → inom 300 m (objektTraffPunkt). Ett jobb utan gräns (Starta jobb) kan alltså också bli träff.
  const kand = (objekt || []).filter((o) => objektTraffPunkt(o, lat, lng));
  kand.sort((a, b) => {
    const ta = arTilldelad(a, maskinId) ? 0 : 1;
    const tb = arTilldelad(b, maskinId) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    // Står maskinen inne i en RIKTIG traktgräns slår den ett objekt som bara har en punkt i närheten.
    const ga = harTraktgrans(a.geometri) ? 0 : 1, gb = harTraktgrans(b.geometri) ? 0 : 1;
    if (ga !== gb) return ga - gb;
    const sa = statusRank(a.status), sb = statusRank(b.status);
    if (sa !== sb) return sa - sb;
    const ka = maskinKlararObjekt(klararTyp, a) ? 0 : 1;
    const kb = maskinKlararObjekt(klararTyp, b) ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const aa = a.areal ?? Infinity, ab = b.areal ?? Infinity;
    if (aa !== ab) return aa - ab;
    // Bara-punkt-objekt: det närmaste först.
    const da = harTraktgrans(a.geometri) ? Infinity : (avstandTillObjektPunkt(a, lat, lng) ?? Infinity);
    const db = harTraktgrans(b.geometri) ? Infinity : (avstandTillObjektPunkt(b, lat, lng) ?? Infinity);
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });
  return { traff: kand[0] ?? null, kandidater: kand, flera: kand.length > 1 };
}
