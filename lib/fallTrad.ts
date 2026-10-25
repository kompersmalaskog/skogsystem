// FÄLLRIKTNING = ETT LIGGANDE TRÄD PER OMRÅDE (Planeringsvyn, 2026-10-25; skiss 56–57 i "Skotarvyn – skiss").
//
// Teckenspråket (varje tecken betyder EN sak): pilar som glider på nu-vägen = körriktning · liggande träd = fällriktning · vit dubbelpil = kör upp och backa · röd triangel = fara.
// Trädet har en stubbe (där det stod), en stam och en hel, grön gran-krona i toppen — kronan pekar dit trädet ska falla. Det är ett TECKEN på kartan, som en symbol: FAST storlek på skärmen
// (ca två symboler hög) oavsett zoom. Planeraren vrider det PRECIS som de gamla gröna pilarna: tryck på trädet, vrid med rattet i kortet. Ingen ring och inget handtag på kartan; en vit ring
// runt trädet syns bara medan dess kort är öppet (markerat). Det ersätter de gröna fällpilarna: de gamla föreslås bli träd (`foreslaTrad`), planeraren godkänner, och först då tas pilarna bort.
//
// LAGRING (ingen migration): trädet är en pil-markering (`typ = 'pil'` i planering_markeringar — tabellens CHECK tillåter bara symbol/linje/zon/pil), med `arrowType: 'fellingtree'`, stubbens
// `lng`/`lat` och `angle` (grader medurs från norr, dit kronan pekar). Allt här är rena funktioner; bilden ritas av `ritaTradBild` (canvas) och lagren av `tradLager`.
//
// MASKINEN: bara SKÖRDAREN ser träden, och bara i området där den är — fällningscirkeln (30 m, FALLNING_M). Ett träd syns när någon del av det (stubbe → TRAD_LANGD_M framåt) ligger inom
// cirkeln. Skotaren ser inga. (TRAD_LANGD_M är den sträcka vi räknar att trädet täcker på marken — bilden är fast på skärmen och visar inte den längden.)

import { FALLNING_M } from './larm/fallning';
import { avstandTillLinjeM, type LatLon } from './larm/geo';

export const TRAD_TYP = 'fellingtree';
export const TRAD_KALLA = 'trad-source';
export const TRAD_BILD = 'fall-trad';
/** Bilden med en vit ring runt trädet: bara medan trädets kort är öppet (markerat för redigering). */
export const TRAD_BILD_VALD = 'fall-trad-vald';
/** Prefixet `line-` ligger i körvyns lager-whitelist (KEEP_PREFIX). */
export const TRAD_LAGER = 'line-fall-trad';
/** Sträckan på marken som trädet räknas täcka (m): avgör när det räknas som "i cirkeln". Bilden är fast på skärmen och visar inte den. */
export const TRAD_LANGD_M = 28;
/** Ett träd syns för skördaren när någon del av det ligger så här nära maskinen. */
export const TRAD_SYNLIG_M = FALLNING_M;
export const TRAD_FORSLAG_OPACITET = 0.5;

// ── Bilden ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Bildens mått i logiska px (ritas i skala 2 för skärpa). Stubben sitter PAD px över undre kanten; trädet växer uppåt (norr vid rotation 0). */
export const TRAD_BILD_MATT = { w: 120, h: 132, pad: 14, pixelRatio: 2 } as const;
/** Avstånd stubbe → kronans topp i bildens logiska px (vid icon-size 1). */
export const TRAD_TOPP_PX = 100;
/**
 * FAST STORLEK PÅ SKÄRMEN (Martin 2026-10-25): trädet är ca två symboler hög (en symbol är 64 px × 0,5–0,6 = ca 32–38 px) oavsett zoom, lutning och vridning — ett tecken, inte en karta i skala.
 * Stubbe → topp = TRAD_SKARM_LANGD_PX på skärmen.
 */
export const TRAD_SKARM_LANGD_PX = 76;
export const TRAD_STORLEK = TRAD_SKARM_LANGD_PX / TRAD_TOPP_PX;

/** Trädet, ritat uppåt med stubben i (w/2, h − pad). `vald` lägger en vit ring runt trädet — bara medan dess kort är öppet. */
export function ritaTradBild(vald: boolean): HTMLCanvasElement {
  const { w, h, pad, pixelRatio } = TRAD_BILD_MATT;
  const c = document.createElement('canvas');
  c.width = w * pixelRatio; c.height = h * pixelRatio;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(pixelRatio, pixelRatio);
  const sx = w / 2, sy = h - pad;           // stubben
  const stamTopp = sy - 40;                 // stammen går hit; kronan tar vid
  const topp = sy - TRAD_TOPP_PX;

  // Kronan: EN hel, grön gran-siluett (bred vid stammen, smal i toppen, med fyra taggar per sida) — ingen strimmig grenstruktur.
  const kron = (): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    const botten = stamTopp + 10, hojd = botten - topp, tagg = 4;
    const bredd = (t: number) => 27 * (1 - t) + 2;
    for (let i = 0; i <= tagg; i++) {            // vänster sida, nerifrån och upp: ut i grenspetsen, in till nästa nivå
      const t0 = i / (tagg + 1), t1 = (i + 0.5) / (tagg + 1);
      pts.push([sx - bredd(t0), botten - t0 * hojd]);
      pts.push([sx - bredd(t1) * 0.68, botten - t1 * hojd]);
    }
    pts.push([sx, topp]);
    for (let i = tagg; i >= 0; i--) {            // höger sida, uppifrån och ner
      const t0 = i / (tagg + 1), t1 = (i + 0.5) / (tagg + 1);
      pts.push([sx + bredd(t1) * 0.68, botten - t1 * hojd]);
      pts.push([sx + bredd(t0), botten - t0 * hojd]);
    }
    return pts;
  };
  const stam = (): Array<[number, number]> => [[sx - 4.5, sy], [sx - 3, stamTopp + 4], [sx + 3, stamTopp + 4], [sx + 4.5, sy]];
  const bana = (pts: Array<[number, number]>) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  // Markerad: en vit ring runt hela trädet (kronan, stammen och stubben) under själva trädet.
  if (vald) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    bana(kron()); ctx.stroke(); bana(stam()); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff';
    bana(kron()); ctx.stroke(); bana(stam()); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Mjuk skugga: siluetten ritas utanför bilden och skuggan faller in — shadowBlur finns överallt (ctx.filter gör det inte i Safari).
  const UT = 1000;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 7 + UT; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#000';
  ctx.translate(-UT, 0);
  bana(kron()); ctx.fill();
  bana(stam()); ctx.fill();
  ctx.restore();

  // Stam, sedan kronan i en enda grön färg med en mörkare kant
  bana(stam()); ctx.fillStyle = '#d9cfb3'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
  bana(kron()); ctx.fillStyle = '#2c8a4c'; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f3d1f'; ctx.stroke();
  // Stubbe: avsågad yta med årsringar
  ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fillStyle = '#ecdcb6'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, 4.6, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,90,50,0.8)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,90,50,0.9)'; ctx.fill();
  return c;
}

// ── Lagret ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Ett symbollager. Fast storlek på skärmen (`TRAD_STORLEK`, ingen zoomberoende). Ankaret är bildens undre kant och `icon-offset` flyttar ner den PAD px, så stubben ligger exakt på trädets position och trädet vrids runt stubben.
 * Trycket på trädet tas av lagret självt (bildens ruta). Lagret klipps på zoom som övriga pilar (SYMBOL_LAGER).
 */
export function tradLager(kalla = TRAD_KALLA): any[] {
  return [{
    id: TRAD_LAGER, type: 'symbol', source: kalla,
    layout: {
      'icon-image': ['case', ['==', ['get', 'vald'], true], TRAD_BILD_VALD, TRAD_BILD],
      'icon-size': TRAD_STORLEK,
      'icon-rotate': ['number', ['get', 'rotation'], 0],
      'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport',
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

/** Vinkeln (heltal, 0–359) från en punkt till en annan (medurs från norr). */
export function vinkelFranPunkt(stubbe: LatLon, p: LatLon): number {
  const dx = (p.lon - stubbe.lon) * Math.cos((stubbe.lat * Math.PI) / 180);
  const dy = p.lat - stubbe.lat;
  return Math.round(norm((Math.atan2(dx, dy) * 180) / Math.PI)) % 360;
}

// ── Vad som syns ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 'planering': allt. 'skordare': bara det som ligger i fällningscirkeln. 'skotare': inget. */
export type TradLage = 'planering' | 'skordare' | 'skotare';

/** Trädets stubbe → topp som linje (för avståndet till maskinen). */
export const tradLinje = (t: TradPos): LatLon[] => [t.stubbe, fram(t.stubbe, t.vinkel, TRAD_LANGD_M)];

export function synligaTrad(trad: readonly TradPos[], lage: TradLage, pos: LatLon | null, radieM = TRAD_SYNLIG_M): TradPos[] {
  if (lage === 'planering') return [...trad];
  if (lage === 'skotare' || !pos) return [];
  return trad.filter((t) => avstandTillLinjeM(pos, tradLinje(t)) <= radieM);
}

/** `valdId`: trädet vars kort är öppet (får den vita ringen). */
export function tradData(trad: readonly TradPos[], opt: { valdId?: string | null; forslag?: boolean } = {}) {
  return {
    type: 'FeatureCollection' as const,
    features: trad.map((t) => ({
      type: 'Feature' as const,
      properties: { id: t.id, rotation: t.vinkel, vald: opt.valdId != null && opt.valdId === t.id, forslag: !!opt.forslag },
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
