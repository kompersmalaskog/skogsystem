// KARTANS ORIGO I EGENKONTROLLEN — EN regel, samma som planeringsvyn, och ett kvitto när den faller tillbaka på objektets koordinat.
//
// PLANERINGENS MARKERINGAR (planering_markeringar.data) ligger som x/y i pixlar RELATIVT ett origo, inte som koordinater. Origot räknas av
// objektStartKamera (lib/objektFlyg.ts): kartbildens mitt på zoom 15 om objektet har kartbild_bounds, annars objektets lat/lng på zoom 16.
// Planeringsvyn ritade markeringarna mot just det, och läser dem med det. Läser egenkontrollen dem med ett ANNAT origo hamnar allt flera mil
// fel (#278, #322) — eller, vid fel zoom, dubbelt så långt från mitten. Att egenkontrollen hade en egen regel ("bara bounds") var felet:
// 23 av 23 objekt som kom in via Vidas envz-leverans (6 aug 2026 och framåt) saknar kartbild_bounds, så alla blev blinda i rundan trots att
// planeringsvyn ritar dem rätt. Därför: egenkontrollen tar objektStartKamera, ingen egen variant.
//
// SKRIV ALDRIG kartbild_bounds FÖR ATT "LÖSA" DET HÄR — INTE HELLER HÄRLETT UR TRAKTGRÄNSEN (uppmätt 2026-10-19):
//   Planeringen föredrar bounds. Sätts bounds på ett objekt som saknar dem byter planeringen origo från (lat/lng, zoom 16) till (bounds-mitt,
//   zoom 15): mitten blir densamma (lat/lng är bbox-mitten av traktgränsen) men skalan dubbelt så stor, så VARJE befintlig markering flyttas dubbelt
//   så långt från mitten — i planeringen också. Betet gallring: gränsmarkeringarna blir 9,6 ha på zoom 16 (rätt, Vida 9,48 ha) men 38,4 ha på zoom 15.
//   Bounds betyder dessutom "kartbildens hörn" och används för kartbildsöverlägget; en trakt har ingen bild. Origot ska KÖRAS UT ur objektet
//   med objektStartKamera, aldrig skrivas till det. Enda skrivaren av kartbild_bounds är zip-grenen i app/api/import-trakt (en georefererad JPG).
//   Vakt: lib/egenkontrollOrigo.vakter.test.ts.
//
// KVITTOT. Faller origot tillbaka på lat/lng (inget kartbild_bounds) kan det inte bevisas av objektet självt, och en lycklig slump är det värsta
// som kan hända här (punkter flera mil fel, ingen varning). Därför kontrolleras markeringarna mot Vidas traktgräns (objekt_geometri, lagret
// L_TRAKTDEL) innan något ritas:
//   STARKT   Finns gränsmarkeringar (lineType 'boundary') måste deras gemensamma ruta ha samma storlek och mitt som Vidas ruta. Det fångar fel zoom,
//            förskjutet origo och en lat/lng som flyttats. Prod 2026-10-19: Betet gallring 308×528 m mot 305×523, Hallaslätt 161×300 mot 162×299,
//            Räveboda 59×413 mot 55×414, Hålabäck gallring 923×807 mot 960×805 — mitt inom 0–19 m. Bjällerhult (au + ga): 157×238 mot 61×92 → faller.
//   SVAGT    Finns inga gränsmarkeringar kan skalan inte kontrolleras (en dubbelt så stor skala ligger fortfarande inom ruta + marginal). Då krävs
//            bara att de flesta punkter ligger i Vidas ruta plus marginal — det fångar ett förskjutet origo men inte ett skalfel. Styrkan står i
//            beslutet (kvitto.styrka) så att den som läser vet vad som kontrollerats.
//   INGET    Saknas Vidas traktgräns (zip-objekt som Brokamåla) finns inget att kontrollera mot: ingenting ritas. Hellre inga punkter än fel.
// Objekt MED kartbild_bounds har inget kvitto: deras origo kommer ur bilden, och planeringens gränser stämmer mot objektets areal (Tåget 9,45 ha mot 9,5).
//
// Reglerna är medvetet stränga och faller stängt: varje skäl har sin egen text (origoForklaring) som säger vad som saknas, aldrig en tyst tom karta.

import type { SupabaseClient } from '@supabase/supabase-js';
import { objektStartKamera, traktGrans, type Gran } from './objektFlyg';
import { svgToLatLon, type Origo } from './kartkoordinater';

export type Punkt = { x: number; y: number };

/** Vidas traktgräns (L_TRAKTDEL) som ruta, eller varför den inte finns. 'laddar' = ännu inte läst. */
export type VidaGrans =
  | { typ: 'laddar' }
  | { typ: 'saknas' }
  | { typ: 'fel'; meddelande?: string }
  | { typ: 'ok'; gran: Gran };

export type OrigoSkal =
  | 'saknar_position'   // varken kartbild_bounds eller lat/lng
  | 'laddar'            // Vidas traktgräns är inte läst än
  | 'las_fel'           // Vidas traktgräns gick inte att läsa
  | 'ingen_vida_grans'  // ingen traktgräns att kontrollera mot
  | 'stammer_inte';     // kvittot föll: markeringarna ligger inte där Vidas traktgräns ligger

export type OrigoKvitto = {
  styrka: 'stark' | 'svag' | 'inga_punkter';
  /** Antal punkter som kontrollerades. */
  punkter: number;
  /** Svag kontroll: andelen punkter inom Vidas ruta plus marginal. */
  andelInom: number | null;
  /** Stark kontroll: gränsmarkeringarnas ruta mot Vidas, i meter. */
  granser: { bredd: number; hojd: number; vidaBredd: number; vidaHojd: number; dx: number; dy: number } | null;
};

export type OrigoBeslut =
  | { ok: true; origo: Origo; kalla: 'bounds' }
  | { ok: true; origo: Origo; kalla: 'latlng'; kvitto: OrigoKvitto }
  | { ok: false; skal: OrigoSkal; detalj?: string };

/** Tröskelvärden. Sätts mot prod 2026-10-19 (se huvudet) — ändra inte utan att köra om mutationskontrollen. */
export const KVITTO = {
  /** Svag kontroll: minst så här stor andel av punkterna ska ligga inom Vidas ruta + marginal. */
  ANDEL_INOM: 0.8,
  /** Marginalen runt Vidas ruta: det största av ett fast avstånd och en andel av rutans längsta sida (basvägar och avlägg ligger utanför gränsen). */
  MARGINAL_MIN_M: 75,
  MARGINAL_ANDEL: 0.15,
  /** Stark kontroll: storleken per axel får avvika med det största av detta och en andel av Vidas mått. */
  GRANS_MIN_M: 25,
  GRANS_ANDEL: 0.2,
} as const;

const METER_PER_GRAD_LAT = 111320;

const arTal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function punktUr(v: unknown): Punkt | null {
  const p = v as { x?: unknown; y?: unknown } | null;
  return p && arTal(p.x) && arTal(p.y) ? { x: p.x, y: p.y } : null;
}

function punkterUr(v: unknown): Punkt[] {
  return Array.isArray(v) ? v.map(punktUr).filter((p): p is Punkt => p !== null) : [];
}

/**
 * Alla x/y en markering bär: symbolens x/y, path och risaPath. En markering som sparar lng/lat direkt (pilar, "geo-låsta" i planeringsvyn)
 * hänger inte på origot och räknas inte.
 */
export function markeringsPunkter(rader: { data?: unknown }[]): Punkt[] {
  const ut: Punkt[] = [];
  for (const r of rader) {
    const d = r?.data as Record<string, unknown> | null | undefined;
    if (!d || typeof d !== 'object') continue;
    if (arTal(d.lng) && arTal(d.lat)) continue;
    const p = punktUr(d);
    if (p) ut.push(p);
    ut.push(...punkterUr(d.path), ...punkterUr(d.risaPath));
  }
  return ut;
}

/** Gränsmarkeringarna (traktgräns som planeraren ritat): en lista punkter per gräns, minst tre punkter. */
export function markeringsGranser(rader: { data?: unknown }[]): Punkt[][] {
  const ut: Punkt[][] = [];
  for (const r of rader) {
    const d = r?.data as Record<string, unknown> | null | undefined;
    if (!d || typeof d !== 'object' || d.lineType !== 'boundary') continue;
    const p = punkterUr(d.path);
    if (p.length >= 3) ut.push(p);
  }
  return ut;
}

/** Kontrollpunkternas geometri_snapshot (x/y eller path) — samma punkter som kartan ritar. */
export function snapshotPunkter(punkter: { geometri_snapshot?: unknown }[]): Punkt[] {
  const ut: Punkt[] = [];
  for (const p of punkter) {
    const g = p?.geometri_snapshot;
    if (!g || typeof g !== 'object') continue;
    const q = punktUr(g);
    if (q) ut.push(q);
    ut.push(...punkterUr((g as { path?: unknown }).path));
  }
  return ut;
}

type ObjektOrigoIndata = { lat?: number | null; lng?: number | null; kartbild_bounds?: unknown } | null | undefined;

/**
 * Var origot kommer ifrån: 'bounds' om objektet har kartbild_bounds, 'latlng' annars. Härleds ur objektStartKamera självt (resultatet utan
 * bounds jämfört med resultatet med) — ingen andra kopia av vad som räknas som giltiga bounds.
 */
function origoKalla(objekt: NonNullable<ObjektOrigoIndata>, origo: Origo): 'bounds' | 'latlng' {
  const utanBounds = objektStartKamera({ lat: objekt.lat, lng: objekt.lng });
  const sammaSomUtanBounds = !!utanBounds && utanBounds.zoom === origo.zoom && utanBounds.lat === origo.lat && utanBounds.lng === origo.lng;
  return sammaSomUtanBounds ? 'latlng' : 'bounds';
}

type Ruta = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function rutaUr(punkter: Punkt[], origo: Origo): Ruta {
  const r: Ruta = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };
  for (const p of punkter) {
    const ll = svgToLatLon(p.x, p.y, origo);
    if (ll.lng < r.minLng) r.minLng = ll.lng;
    if (ll.lng > r.maxLng) r.maxLng = ll.lng;
    if (ll.lat < r.minLat) r.minLat = ll.lat;
    if (ll.lat > r.maxLat) r.maxLat = ll.lat;
  }
  return r;
}

const rundaM = (v: number) => Math.round(v);

/**
 * Beslutar vilket origo markeringarna ska läsas med — eller att de inte ska ritas alls.
 *
 * `punkter` = alla x/y som kommer att ritas (markeringar + kontrollpunkternas snapshots), `granser` = gränsmarkeringarnas vägar.
 * Ren funktion: samma indata, samma beslut.
 */
export function beslutaOrigo(a: { objekt: ObjektOrigoIndata; punkter: Punkt[]; granser: Punkt[][]; vida: VidaGrans }): OrigoBeslut {
  const { objekt } = a;
  const origo = objekt ? objektStartKamera(objekt) : null;
  if (!objekt || !origo) return { ok: false, skal: 'saknar_position' };

  if (origoKalla(objekt, origo) === 'bounds') return { ok: true, origo, kalla: 'bounds' };

  // --- lat/lng-fallbacken: kvittot -------------------------------------------------------------------------------------------------
  const { vida } = a;
  if (vida.typ === 'laddar') return { ok: false, skal: 'laddar' };
  if (vida.typ === 'fel') return { ok: false, skal: 'las_fel', detalj: vida.meddelande };
  if (vida.typ === 'saknas') return { ok: false, skal: 'ingen_vida_grans' };

  const alla = a.punkter;
  if (alla.length === 0 && a.granser.length === 0) {
    // Inget att placera: origot kan inte flytta något. Beslutet är giltigt, men kontrollerar inget.
    return { ok: true, origo, kalla: 'latlng', kvitto: { styrka: 'inga_punkter', punkter: 0, andelInom: null, granser: null } };
  }

  const [[vMinLng, vMinLat], [vMaxLng, vMaxLat]] = vida.gran;
  const mLng = METER_PER_GRAD_LAT * Math.cos((origo.lat * Math.PI) / 180);
  const vidaBredd = (vMaxLng - vMinLng) * mLng;
  const vidaHojd = (vMaxLat - vMinLat) * METER_PER_GRAD_LAT;

  if (a.granser.length > 0) {
    // STARKT: gränsmarkeringarnas gemensamma ruta mot Vidas.
    const r = rutaUr(a.granser.flat(), origo);
    const bredd = (r.maxLng - r.minLng) * mLng;
    const hojd = (r.maxLat - r.minLat) * METER_PER_GRAD_LAT;
    const dx = ((r.minLng + r.maxLng) / 2 - (vMinLng + vMaxLng) / 2) * mLng;
    const dy = ((r.minLat + r.maxLat) / 2 - (vMinLat + vMaxLat) / 2) * METER_PER_GRAD_LAT;
    const granser = { bredd, hojd, vidaBredd, vidaHojd, dx, dy };

    const storlekOk =
      Math.abs(bredd - vidaBredd) <= Math.max(KVITTO.GRANS_MIN_M, KVITTO.GRANS_ANDEL * vidaBredd) &&
      Math.abs(hojd - vidaHojd) <= Math.max(KVITTO.GRANS_MIN_M, KVITTO.GRANS_ANDEL * vidaHojd);
    const mittTol = Math.max(KVITTO.GRANS_MIN_M, KVITTO.GRANS_ANDEL * Math.max(vidaBredd, vidaHojd));
    const mittOk = Math.abs(dx) <= mittTol && Math.abs(dy) <= mittTol;

    if (!storlekOk || !mittOk) {
      return {
        ok: false,
        skal: 'stammer_inte',
        detalj: `gränsmarkeringarna ${rundaM(bredd)}×${rundaM(hojd)} m mot Vidas ${rundaM(vidaBredd)}×${rundaM(vidaHojd)} m, mitt ${rundaM(dx)}/${rundaM(dy)} m`,
      };
    }
    return { ok: true, origo, kalla: 'latlng', kvitto: { styrka: 'stark', punkter: alla.length, andelInom: null, granser } };
  }

  // SVAGT: inga gränsmarkeringar — bara att de flesta punkter ligger i Vidas ruta plus marginal.
  const marginalM = Math.max(KVITTO.MARGINAL_MIN_M, KVITTO.MARGINAL_ANDEL * Math.max(vidaBredd, vidaHojd));
  const marginalLng = marginalM / mLng;
  const marginalLat = marginalM / METER_PER_GRAD_LAT;
  let inom = 0;
  for (const p of alla) {
    const ll = svgToLatLon(p.x, p.y, origo);
    if (ll.lng >= vMinLng - marginalLng && ll.lng <= vMaxLng + marginalLng && ll.lat >= vMinLat - marginalLat && ll.lat <= vMaxLat + marginalLat) inom++;
  }
  const andelInom = inom / alla.length;
  if (andelInom < KVITTO.ANDEL_INOM) {
    return {
      ok: false,
      skal: 'stammer_inte',
      detalj: `${inom} av ${alla.length} punkter ligger inom Vidas traktgräns (${rundaM(vidaBredd)}×${rundaM(vidaHojd)} m) plus ${rundaM(marginalM)} m`,
    };
  }
  return { ok: true, origo, kalla: 'latlng', kvitto: { styrka: 'svag', punkter: alla.length, andelInom, granser: null } };
}

/**
 * Texten när origot inte kunde bestämmas — vad som saknas och vad som gäller i stället. Aldrig en tyst tom karta.
 * null = origot dög, inget att säga.
 */
export function origoForklaring(b: OrigoBeslut): string | null {
  if (b.ok) return null;
  switch (b.skal) {
    case 'saknar_position':
      return 'Objektet saknar position — varken kartbild eller koordinat — så punkterna kan inte placeras på kartan. De listas i grupp och ordning.';
    case 'laddar':
      return 'Kontrollerar var punkterna ligger …';
    case 'las_fel':
      return 'Kunde inte kontrollera var punkterna ligger. Ladda om sidan. Så länge listas de i grupp och ordning.';
    case 'ingen_vida_grans':
      return 'Vidas traktgräns saknas för objektet, så det går inte att kontrollera var planeringens punkter ligger — de ritas inte på kartan. De listas i grupp och ordning.';
    case 'stammer_inte':
      return 'Planeringens markeringar stämmer inte med Vidas traktgräns, så de ritas inte på kartan — hellre inga än fel. De listas i grupp och ordning. Be planeraren se över markeringarna.';
  }
}

/**
 * Läser Vidas traktgräns (L_TRAKTDEL) som ruta. Ett läsfel är ett fel ('fel'), aldrig "saknas": en tyst falsk saknad ger en tom karta utan skäl.
 * (objekt_geometri har RLS — en utgången session ger tomma rader UTAN fel, och faller då stängt som 'saknas'.)
 */
export async function lasVidaGrans(klient: SupabaseClient, objektId: string): Promise<VidaGrans> {
  const { data, error } = await klient.from('objekt_geometri').select('geometri').eq('objekt_id', objektId);
  if (error) return { typ: 'fel', meddelande: error.message };
  const rader = (data ?? []) as { geometri?: { features?: unknown[] } | null }[];
  const features = rader.flatMap((r) => (Array.isArray(r?.geometri?.features) ? (r.geometri!.features as unknown[]) : []));
  const gran = traktGrans({ features });
  return gran ? { typ: 'ok', gran } : { typ: 'saknas' };
}
