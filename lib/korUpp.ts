// KÖR UPP OCH BACKA (Planeringsvyn, 2026-10-25; skiss 60–61 i "Skotarvyn – skiss"). Ibland går det inte att köra genom ett område — det är blött, brant eller stenigt — och maskinen ska i
// stället köra upp från vägen mot gränsen och backa tillbaka samma väg. Planeraren drar ett finger från vägen mot gränsen → en VIT DUBBELPIL (spets i båda ändar).
// Var den börjar = från vilken väg, längden = hur långt in. Flera vägar = en pil från varje.
//
// Teckenspråket: vit dubbelpil = kör upp och backa (pilar som glider på nu-vägen = körriktning, liggande träd = fällriktning, röd triangel = fara).
// Skälet väljs med ett tryck (Inget · Blött · Brant · Stenigt · Annat). Ordet står vid pilen och i instruktionskortet vid inkörning ("Brant – kör upp mot gränsen och backa tillbaka").
// Maskinen: bara SKÖRDAREN ser pilarna, och bara nära maskinen (KORUPP_SYNLIG_M).
//
// LAGRING (ingen migration): en pil-markering (`typ = 'pil'` — tabellens CHECK tillåter bara symbol/linje/zon/pil) med `arrowType: 'koruppbacka'`, startpunkt `lng`/`lat`,
// slutpunkt `lng2`/`lat2`, `skal` och (när starten låg på en väg) `vagId`. Rena funktioner; bilden ritas av `ritaSpetsBild`, lagren av `korUppLager`.

import { avstandTillLinjeM, type LatLon } from './larm/geo';
import { FARG } from './design/tokens';
import { fram, vinkelFranPunkt } from './fallTrad';

export const KORUPP_TYP = 'koruppbacka';
export const KORUPP_KALLA = 'korupp-source';
export const KORUPP_SPETS_BILD = 'korupp-spets';
/** Prefixet `line-` ligger i körvyns lager-whitelist (KEEP_PREFIX). */
export const KORUPP_KANT_LAGER = 'line-korupp-kant';
export const KORUPP_TRAFF_LAGER = 'line-korupp-traff';
export const KORUPP_LINJE_LAGER = 'line-korupp-linje';
export const KORUPP_SPETS_LAGER = 'line-korupp-spets';
export const KORUPP_ORD_LAGER = 'line-korupp-ord';
/** Skördaren ser pilen när någon del av den ligger så här nära maskinen. */
export const KORUPP_SYNLIG_M = 80;
/** Ett drag kortare än så här är ett tryck, inte en pil. */
export const KORUPP_MIN_M = 8;
/** En pil börjar på en väg om fingret sattes så här nära vägen (px på skärmen). */
export const KORUPP_SNAPP_PX = 32;

export type Skal = 'inget' | 'blott' | 'brant' | 'stenigt' | 'annat';
export const KORUPP_SKAL: ReadonlyArray<{ id: Skal; namn: string }> = [
  { id: 'inget', namn: 'Inget' }, { id: 'blott', namn: 'Blött' }, { id: 'brant', namn: 'Brant' }, { id: 'stenigt', namn: 'Stenigt' }, { id: 'annat', namn: 'Annat' },
];
export const skalNamn = (s: string | null | undefined): string => KORUPP_SKAL.find((x) => x.id === s)?.namn ?? 'Inget';
export const arSkal = (s: unknown): s is Skal => KORUPP_SKAL.some((x) => x.id === s);

/** Ordet vid pilen: skälet, eller inget alls när skälet är "Inget". */
export const korUppOrd = (skal: string | null | undefined): string | null => (skal && skal !== 'inget' && arSkal(skal) ? skalNamn(skal) : null);

/** Texten i instruktionskortet vid inkörning. */
export function korUppText(skal: string | null | undefined): string {
  const ord = korUppOrd(skal);
  return ord ? `${ord} – kör upp mot gränsen och backa tillbaka` : 'Kör upp mot gränsen och backa tillbaka';
}

export interface KorUppMarkering { id: unknown; isArrow?: boolean; arrowType?: string; lng?: number; lat?: number; lng2?: number; lat2?: number; skal?: string; vagId?: unknown }
export const arKorUpp = (m: { isArrow?: boolean; arrowType?: string } | null | undefined): boolean => !!m && m.isArrow === true && m.arrowType === KORUPP_TYP;

export interface KorUppPos { id: string; start: LatLon; slut: LatLon; skal: Skal; vagId: string | null }

const arTal = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function korUppUr(m: KorUppMarkering): KorUppPos | null {
  if (!arKorUpp(m) || !arTal(m.lng) || !arTal(m.lat) || !arTal(m.lng2) || !arTal(m.lat2)) return null;
  return { id: String(m.id), start: { lat: m.lat, lon: m.lng }, slut: { lat: m.lat2, lon: m.lng2 }, skal: arSkal(m.skal) ? m.skal : 'inget', vagId: m.vagId != null ? String(m.vagId) : null };
}

export const korUppLangdM = (k: Pick<KorUppPos, 'start' | 'slut'>): number => avstandTillLinjeM(k.start, [k.slut]);

/** Pilens markering ur ett drag. Null när draget är för kort för att vara en pil. */
export function nyKorUpp(start: LatLon, slut: LatLon, vagId: string | null, id: number = Date.now()): Required<Pick<KorUppMarkering, 'lng' | 'lat' | 'lng2' | 'lat2' | 'skal'>> & { id: number; isArrow: true; arrowType: string; vagId?: string } | null {
  if (korUppLangdM({ start, slut }) < KORUPP_MIN_M) return null;
  return { id, isArrow: true, arrowType: KORUPP_TYP, lng: start.lon, lat: start.lat, lng2: slut.lon, lat2: slut.lat, skal: 'inget', ...(vagId != null ? { vagId } : {}) };
}

// ── Starten på en väg ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SnappVag { id: string; coords: ReadonlyArray<readonly [number, number]> }

/** Närmaste punkt på en väg (i skärmen: px) om fingret sattes inom `maxPx` från den. Avgör "från vilken väg". */
export function snappaTillVag(
  vagar: readonly SnappVag[], punkt: { x: number; y: number }, project: (c: readonly [number, number]) => { x: number; y: number }, maxPx = KORUPP_SNAPP_PX,
): { id: string; punkt: LatLon; avstandPx: number } | null {
  let basta: { id: string; punkt: LatLon; avstandPx: number } | null = null;
  for (const v of vagar) {
    for (let i = 0; i < v.coords.length - 1; i++) {
      const a = project(v.coords[i]), b = project(v.coords[i + 1]);
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((punkt.x - a.x) * dx + (punkt.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + t * dx - punkt.x, a.y + t * dy - punkt.y);
      if (d <= maxPx && (!basta || d < basta.avstandPx)) {
        const [lng0, lat0] = v.coords[i], [lng1, lat1] = v.coords[i + 1];
        basta = { id: v.id, punkt: { lon: lng0 + t * (lng1 - lng0), lat: lat0 + t * (lat1 - lat0) }, avstandPx: d };
      }
    }
  }
  return basta;
}

// ── Vad som syns ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 'planering': alla. 'skordare' och 'skotare': bara de nära maskinen (80 m). */
export type KorUppLage = 'planering' | 'skordare' | 'skotare';

export function synligaKorUpp(pilar: readonly KorUppPos[], lage: KorUppLage, pos: LatLon | null, radieM = KORUPP_SYNLIG_M): KorUppPos[] {
  if (lage === 'planering') return [...pilar];
  if (!pos) return [];
  return pilar.filter((p) => avstandTillLinjeM(pos, [p.start, p.slut]) <= radieM);
}

type Punkt = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Point'; coordinates: [number, number] } };

export function korUppData(pilar: readonly KorUppPos[]) {
  const features: Array<Punkt | { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'LineString'; coordinates: Array<[number, number]> } }> = [];
  for (const p of pilar) {
    const riktning = vinkelFranPunkt(p.start, p.slut);
    const mitt = fram(p.start, riktning, korUppLangdM(p) / 2);
    features.push({ type: 'Feature', properties: { slag: 'linje', id: p.id }, geometry: { type: 'LineString', coordinates: [[p.start.lon, p.start.lat], [p.slut.lon, p.slut.lat]] } });
    features.push({ type: 'Feature', properties: { slag: 'spets', id: p.id, riktning }, geometry: { type: 'Point', coordinates: [p.slut.lon, p.slut.lat] } });
    features.push({ type: 'Feature', properties: { slag: 'spets', id: p.id, riktning: (riktning + 180) % 360 }, geometry: { type: 'Point', coordinates: [p.start.lon, p.start.lat] } });
    const ord = korUppOrd(p.skal);
    if (ord) features.push({ type: 'Feature', properties: { slag: 'ord', id: p.id, text: ord }, geometry: { type: 'Point', coordinates: [mitt.lon, mitt.lat] } });
  }
  return { type: 'FeatureCollection' as const, features };
}

// ── Bilden och lagren ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const KORUPP_SPETS_MATT = { w: 36, h: 44, pixelRatio: 2 } as const;
/** FAST STORLEK PÅ SKÄRMEN (Martin 2026-10-25), samma regel som fällträdet: pilens tjocklek och spets är desamma vid varje zoom. Längden är sträckan planeraren ritade (den följer marken). */
export const KORUPP_SPETS_STORLEK = 0.75;
export const KORUPP_LINJE_PX = 4;
export const KORUPP_KANT_PX = 8;

/** Pilspetsen, vit med mörk kant. Spetsen sitter i bildens mitt och kroppen går nedåt — rotationen sker runt spetsen, så den hamnar exakt på pilens ände. */
export function ritaSpetsBild(): HTMLCanvasElement {
  const { w, h, pixelRatio } = KORUPP_SPETS_MATT;
  const c = document.createElement('canvas');
  c.width = w * pixelRatio; c.height = h * pixelRatio;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(pixelRatio, pixelRatio);
  const mx = w / 2, my = h / 2;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 12, my + 22); ctx.lineTo(mx, my + 16); ctx.lineTo(mx - 12, my + 22); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  return c;
}

export function korUppLager(kalla = KORUPP_KALLA): any[] {
  return [
    // Osynlig träffyta (36 px): en tunn linje går inte att träffa med ett finger.
    { id: KORUPP_TRAFF_LAGER, type: 'line', source: kalla, filter: ['==', ['get', 'slag'], 'linje'], paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 36 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: KORUPP_KANT_LAGER, type: 'line', source: kalla, filter: ['==', ['get', 'slag'], 'linje'],
      paint: { 'line-color': 'rgba(0,0,0,0.85)', 'line-width': KORUPP_KANT_PX }, layout: { 'line-cap': 'butt', 'line-join': 'round' } },
    { id: KORUPP_LINJE_LAGER, type: 'line', source: kalla, filter: ['==', ['get', 'slag'], 'linje'],
      paint: { 'line-color': FARG.text, 'line-width': KORUPP_LINJE_PX }, layout: { 'line-cap': 'butt', 'line-join': 'round' } },
    { id: KORUPP_SPETS_LAGER, type: 'symbol', source: kalla, filter: ['==', ['get', 'slag'], 'spets'],
      layout: { 'icon-image': KORUPP_SPETS_BILD, 'icon-size': KORUPP_SPETS_STORLEK, 'icon-rotate': ['get', 'riktning'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport', 'icon-anchor': 'center', 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    { id: KORUPP_ORD_LAGER, type: 'symbol', source: kalla, filter: ['==', ['get', 'slag'], 'ord'],
      layout: { 'text-field': ['get', 'text'], 'text-transform': 'uppercase', 'text-size': 15, 'text-font': ['Open Sans Bold', 'Open Sans Semibold', 'Open Sans Regular'], 'text-anchor': 'center', 'text-offset': [0, 0], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-rotation-alignment': 'viewport', 'text-pitch-alignment': 'viewport' },
      // Mitt på pilen (pilens egen mittpunkt), rak text oavsett pilens riktning, tjock mörk kant så den syns mot både fotot och den vita linjen.
      paint: { 'text-color': FARG.text, 'text-halo-color': 'rgba(0,0,0,0.95)', 'text-halo-width': 3 } },
  ];
}
