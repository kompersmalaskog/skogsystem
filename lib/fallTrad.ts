// FÄLLRIKTNING = ETT LIGGANDE TRÄD PER OMRÅDE (Planeringsvyn, 2026-10-25; skiss 56–57 i "Skotarvyn – skiss").
//
// Teckenspråket (varje tecken betyder EN sak): pilar som glider på nu-vägen = körriktning · liggande träd = fällriktning · vit dubbelpil = kör upp och backa · röd triangel = fara.
// Trädet har en stubbe (där det stod), en stam och en gran-krona i toppen — kronan pekar dit trädet ska falla. Planeraren vrider det med ett handtag i toppen. Det ersätter de gröna
// fällpilarna: de gamla föreslås bli träd (`foreslaTrad`), planeraren godkänner, och först då tas pilarna bort.
//
// LAGRING (ingen migration): trädet är en pil-markering (`typ = 'pil'` i planering_markeringar — tabellens CHECK tillåter bara symbol/linje/zon/pil), med `arrowType: 'fellingtree'`, stubbens
// `lng`/`lat` och `angle` (grader medurs från norr, dit kronan pekar). Allt här är rena funktioner; bilden ritas av `ritaTradBild` (canvas) och lagren av `tradLager`.
//
// MASKINEN: bara SKÖRDAREN ser träden, och bara i området där den är — fällningscirkeln (30 m, FALLNING_M). Ett träd syns när någon del av det (stubbe → topp) ligger inom cirkeln. Skotaren ser inga.

import { FALLNING_M } from './larm/fallning';
import { avstandTillLinjeM, type LatLon } from './larm/geo';

export const TRAD_TYP = 'fellingtree';
export const TRAD_KALLA = 'trad-source';
export const TRAD_BILD = 'fall-trad';
export const TRAD_BILD_REDIGERA = 'fall-trad-redigera';
/** Prefixet `line-` ligger i körvyns lager-whitelist (KEEP_PREFIX). */
export const TRAD_LAGER = 'line-fall-trad';
/** Trädets längd på marken (m): avgör när det räknas som "i cirkeln". */
export const TRAD_LANGD_M = 28;
/** Ett träd syns för skördaren när någon del av det ligger så här nära maskinen. */
export const TRAD_SYNLIG_M = FALLNING_M;

// ── Bilden ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Bildens mått i logiska px (ritas i skala 2 för skärpa). Stubben sitter PAD px över undre kanten; trädet växer uppåt (norr vid rotation 0). */
export const TRAD_BILD_MATT = { w: 120, h: 168, pad: 14, pixelRatio: 2 } as const;
/** Avstånd stubbe → kronans topp respektive handtagets mitt, i bildens logiska px (vid icon-size 1). */
export const TRAD_TOPP_PX = 100;
export const TRAD_HANDTAG_PX = 126;
export const TRAD_HANDTAG_RADIE_PX = 11;
/** Hur nära (px på skärmen) fingret måste vara handtagets mitt för att ett drag ska vrida trädet. */
export const TRAD_HANDTAG_TRAFF_PX = 30;
export const TRAD_FORSLAG_OPACITET = 0.5;

/**
 * Trädet ritas i MARKENS skala: det är alltid TRAD_LANGD_M långt på marken, oavsett zoom och lutning (icon-size växer med 2^zoom, exakt som meter per pixel krymper). Då visar bilden var trädet landar
 * — mot vägen, gränsen, ytan — och handtaget (en punkt på marken) hamnar där ringen ritas även när kartan lutas och vrids.
 */
export const TRAD_BREDDGRAD = 57;
const METER_PER_PX_ZOOM0 = (40075016.686 / 512) * Math.cos((TRAD_BREDDGRAD * Math.PI) / 180);
export const tradStorlek = (zoom: number): number => TRAD_LANGD_M / (TRAD_TOPP_PX * (METER_PER_PX_ZOOM0 / 2 ** zoom));
export const TRAD_STORLEK_UTTRYCK: any[] = ['interpolate', ['exponential', 2], ['zoom'], 10, tradStorlek(10), 20, tradStorlek(20)];
/** Handtagets mitt på marken (m från stubben): ringen sitter TRAD_HANDTAG_PX från stubben i bilden. */
export const TRAD_HANDTAG_M = (TRAD_HANDTAG_PX / TRAD_TOPP_PX) * TRAD_LANGD_M;

/** Trädet, ritat uppåt med stubben i (w/2, h − pad). `handtag` lägger en vit ring i toppen — planeringens grepp för att vrida. */
export function ritaTradBild(handtag: boolean): HTMLCanvasElement {
  const { w, h, pad, pixelRatio } = TRAD_BILD_MATT;
  const c = document.createElement('canvas');
  c.width = w * pixelRatio; c.height = h * pixelRatio;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(pixelRatio, pixelRatio);
  const sx = w / 2, sy = h - pad;           // stubben
  const stamTopp = sy - 46;                 // stammen går hit; kronan tar vid
  const topp = sy - TRAD_TOPP_PX;

  // Kronans kontur (gran: bred vid stammen, smal i toppen, med taggar). Delas av skuggan och kronan.
  const kronKontur = (k = 1): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    const n = 9;
    const bredd = (t: number) => 21 * (1 - t) * k + 2.5;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([sx - bredd(t) - (i % 2 ? 0 : 4 * (1 - t)), stamTopp + 8 - t * (stamTopp + 8 - topp)]); }
    for (let i = n; i >= 0; i--) { const t = i / n; pts.push([sx + bredd(t) + (i % 2 ? 0 : 4 * (1 - t)), stamTopp + 8 - t * (stamTopp + 8 - topp)]); }
    return pts;
  };
  const stamKontur = (): Array<[number, number]> => [[sx - 4.5, sy], [sx - 3, stamTopp + 4], [sx + 3, stamTopp + 4], [sx + 4.5, sy]];
  const bana = (pts: Array<[number, number]>) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  // Mjuk skugga: siluetten ritas utanför bilden och skuggan faller in — shadowBlur finns överallt (ctx.filter gör det inte i Safari).
  const UT = 1000;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetX = 8 + UT; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#000';
  ctx.translate(-UT, 0);
  bana(kronKontur()); ctx.fill();
  bana(stamKontur()); ctx.fill();
  ctx.restore();

  // Stam
  bana(stamKontur()); ctx.fillStyle = '#d9cfb3'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
  // Krona: ett mörkt fyllt underlag och grenar som växer snett framåt längs stammen (ett fallet träd sett uppifrån), kortare mot toppen
  const grenar = 9;
  const gren = (farg: string, bredd: number, dy: number) => {
    ctx.strokeStyle = farg; ctx.lineWidth = bredd; ctx.lineCap = 'round';
    for (let i = 0; i < grenar; i++) {
      const t = i / (grenar - 1);
      const y = stamTopp + 4 - t * (stamTopp + 4 - topp - 3);
      const l = 21 * (1 - 0.78 * t) + 4;
      for (const sida of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + sida * l * Math.sin(1.22), y - l * Math.cos(1.22) + dy); ctx.stroke();
      }
    }
  };
  gren('#0f3d1f', 8.4, 0);
  gren('#2c8a4c', 5.6, 0);
  gren('#43b068', 2, -0.5);
  ctx.beginPath(); ctx.moveTo(sx, stamTopp + 4); ctx.lineTo(sx, topp); ctx.lineWidth = 2; ctx.strokeStyle = '#d9cfb3'; ctx.lineCap = 'round'; ctx.stroke();
  // Stubbe: avsågad yta med årsringar
  ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fillStyle = '#ecdcb6'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, 4.6, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,90,50,0.8)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,90,50,0.9)'; ctx.fill();

  if (handtag) {
    const hy = sy - TRAD_HANDTAG_PX;
    ctx.beginPath(); ctx.arc(sx, hy, TRAD_HANDTAG_RADIE_PX + 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, hy, TRAD_HANDTAG_RADIE_PX, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, hy, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
  }
  return c;
}

// ── Lagret ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Ett symbollager. Ankaret är bildens undre kant och `icon-offset` flyttar ner den PAD px, så stubben ligger exakt på trädets position och trädet vrids runt stubben.
 * Trycket på trädet tas av lagret självt (bildens ruta). Lagret klipps på zoom som övriga pilar (SYMBOL_LAGER).
 */
export function tradLager(kalla = TRAD_KALLA): any[] {
  return [{
    id: TRAD_LAGER, type: 'symbol', source: kalla,
    layout: {
      'icon-image': ['case', ['==', ['get', 'redigera'], true], TRAD_BILD_REDIGERA, TRAD_BILD],
      'icon-size': TRAD_STORLEK_UTTRYCK,
      'icon-rotate': ['number', ['get', 'rotation'], 0],
      'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
      'icon-anchor': 'bottom', 'icon-offset': [0, TRAD_BILD_MATT.pad],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', ['==', ['get', 'forslag'], true], TRAD_FORSLAG_OPACITET, 1] },
  }];
}

// ── Markeringen ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TradMarkering { id: unknown; isArrow?: boolean; arrowType?: string; lng?: number; lat?: number; x?: number; y?: number; angle?: number; rotation?: number }
export const arFallTrad = (m: { isArrow?: boolean; arrowType?: string } | null | undefined): boolean => !!m && m.isArrow === true && m.arrowType === TRAD_TYP;
/** De gröna fällpilarna (före träden). */
export const arGammalFallpil = (m: { isArrow?: boolean; arrowType?: string } | null | undefined): boolean => !!m && m.isArrow === true && m.arrowType === 'fellingdirection';

export interface TradPos { id: string; stubbe: LatLon; vinkel: number }

const norm = (a: number): number => ((a % 360) + 360) % 360;

export function tradPosUr(m: TradMarkering, svgToLatLon: (x: number, y: number) => LatLon): TradPos | null {
  const ll = m.lng != null && m.lat != null ? { lon: m.lng, lat: m.lat } : (typeof m.x === 'number' && typeof m.y === 'number' ? svgToLatLon(m.x, m.y) : null);
  if (!ll) return null;
  return { id: String(m.id), stubbe: ll, vinkel: norm(m.angle ?? m.rotation ?? 0) };
}

/** Punkten `meter` bort från `p` åt `grader` (medurs från norr). */
export function fram(p: LatLon, grader: number, meter: number): LatLon {
  const r = (grader * Math.PI) / 180;
  return { lat: p.lat + (meter * Math.cos(r)) / 111320, lon: p.lon + (meter * Math.sin(r)) / (111320 * Math.cos((p.lat * Math.PI) / 180)) };
}

/** Vinkeln (heltal, 0–359) från stubben till en punkt: vart planeraren drog handtaget. */
export function vinkelFranPunkt(stubbe: LatLon, p: LatLon): number {
  const dx = (p.lon - stubbe.lon) * Math.cos((stubbe.lat * Math.PI) / 180);
  const dy = p.lat - stubbe.lat;
  return Math.round(norm((Math.atan2(dx, dy) * 180) / Math.PI)) % 360;
}

/** Handtagets plats på marken. */
export const handtagPunkt = (t: Pick<TradPos, 'stubbe' | 'vinkel'>): LatLon => fram(t.stubbe, t.vinkel, TRAD_HANDTAG_M);

/** Ligger fingret på handtaget? `project` = kartans projektion (lutning och vridning ingår), alltså träffar ett drag ringen där den ritas. */
export function arPaHandtag(punktPx: { x: number; y: number }, t: Pick<TradPos, 'stubbe' | 'vinkel'>, project: (ll: LatLon) => { x: number; y: number }): boolean {
  const h = project(handtagPunkt(t));
  return Math.hypot(punktPx.x - h.x, punktPx.y - h.y) <= TRAD_HANDTAG_TRAFF_PX;
}

// ── Vad som syns ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 'planering': allt, med handtag. 'skordare': bara det som ligger i fällningscirkeln. 'skotare': inget. */
export type TradLage = 'planering' | 'skordare' | 'skotare';

/** Trädets stubbe → topp som linje (för avståndet till maskinen). */
export const tradLinje = (t: TradPos): LatLon[] => [t.stubbe, fram(t.stubbe, t.vinkel, TRAD_LANGD_M)];

export function synligaTrad(trad: readonly TradPos[], lage: TradLage, pos: LatLon | null, radieM = TRAD_SYNLIG_M): TradPos[] {
  if (lage === 'planering') return [...trad];
  if (lage === 'skotare' || !pos) return [];
  return trad.filter((t) => avstandTillLinjeM(pos, tradLinje(t)) <= radieM);
}

export function tradData(trad: readonly TradPos[], opt: { redigera: boolean; forslag?: boolean }) {
  return {
    type: 'FeatureCollection' as const,
    features: trad.map((t) => ({
      type: 'Feature' as const,
      properties: { id: t.id, rotation: t.vinkel, redigera: opt.redigera, forslag: !!opt.forslag },
      geometry: { type: 'Point' as const, coordinates: [t.stubbe.lon, t.stubbe.lat] },
    })),
  };
}

// ── Gamla gröna pilar → träd ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TradForslag {
  /** Träden som skulle skapas (stubbe där pilen stod, samma riktning). */
  trad: Array<{ id: number; lng: number; lat: number; angle: number; fran: string }>;
  /** De gamla pilarna som tas bort först när planeraren godkänt. */
  pilIdn: string[];
}

/** Ett träd per grön fällpil, på pilens plats och i pilens riktning. Godkänns förslaget skapas träden och först då tas pilarna bort. */
export function foreslaTrad(markers: readonly TradMarkering[], svgToLatLon: (x: number, y: number) => LatLon, nyttId: (n: number) => number = (n) => Date.now() + n): TradForslag {
  const trad: TradForslag['trad'] = [];
  const pilIdn: string[] = [];
  for (const m of markers) {
    if (!arGammalFallpil(m)) continue;
    const p = tradPosUr(m, svgToLatLon);
    if (!p) continue;
    trad.push({ id: nyttId(trad.length), lng: p.stubbe.lon, lat: p.stubbe.lat, angle: p.vinkel, fran: p.id });
    pilIdn.push(p.id);
  }
  return { trad, pilIdn };
}
