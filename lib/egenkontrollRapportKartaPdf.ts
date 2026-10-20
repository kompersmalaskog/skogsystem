// Kartan i A4-rapporten, ritad som VEKTOR (pdf-lib): traktgrans, stammoln, hyttspar, planeringens markeringar, kontrollpunkterna.
// Delas av sida 1 (alla lager) och bilagan (traktgrans + blekt stammoln + numrerade pinnar) - EN ritare, sa att de aldrig kan se olika ut.
//
// STAMMOLNET GLESAS ALDRIG UT. Monstret - stickvagarna, halen dar hansynen star - ar hela poangen med kartan. Varje stam ar en egen punkt.
// Kostnaden matt 2026-10-19 (pdf-lib, en filledcirkel per stam som SVG-bana): 2 247 stammar = 55 kB, 12 000 = 292 kB, under en sekund.
// Det gar rent - ingen rasterbild behovs. (drawCircle ger 259 kB/1,4 MB; en strom med fyrkanter 77 kB/408 kB; bana-cirkeln ar minst.)
//
// Allt som ritas klipps mot kartans ruta (en spar- eller markeringspunkt langt utanfor trakten ska inte dra kartan at sig) men RUTANS UTSTRACKNING
// bestams av traktgransen och stammolnet (kartExtent): det ar dem kartan handlar om.

import type { PDFFont, PDFPage } from 'pdf-lib';
import type { RapportModell, LatLng } from './egenkontrollRapport';
import {
  HYTTSPAR_FARG, STAMMOLN_FARG, TRAKTGRANS_FARG, markeringsStil,
  type KartMarkering,
} from './egenkontrollRapportKarta';

type PdfLib = typeof import('pdf-lib');

export type KartLager = {
  granser: LatLng[][];
  stammar: LatLng[];
  hyttspar?: RapportModell['karta']['hyttspar'];
  markeringar?: KartMarkering[];
  pinnar: { nr: number; rubrik: string; plats: LatLng }[];
};

export type Ruta = { x: number; top: number; b: number; h: number };

const SIDHOJD = 841.89;

/** Det kartan handlar om: traktgrans + stammoln; saknas de, allt som finns. */
export function kartExtent(l: KartLager): LatLng[] {
  const karna = [...l.granser.flat(), ...l.stammar];
  if (karna.length > 0) return karna;
  return [
    ...l.pinnar.map((p) => p.plats),
    ...(l.hyttspar ?? []).flatMap((h) => h.linjer.flat()),
    ...(l.markeringar ?? []).flatMap((m) => (m.slag === 'symbol' ? [m.plats] : m.punkter)),
  ];
}

/** Meter -> en "snygg" langd for skalstocken: 10, 20, 50, 100 ... */
export function skalstock(meterPerPt: number, maxPt: number): { meter: number; pt: number } {
  const kandidater = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let valt = kandidater[0];
  for (const k of kandidater) if (k / meterPerPt <= maxPt) valt = k;
  return { meter: valt, pt: valt / meterPerPt };
}

/**
 * Projicerar punkter till en ruta (b x h pt) utan att forvrida: langdgraden skalas med cos(lat), annars blir kartan bredare an den ar i
 * verkligheten. Norr ar uppat. Returnerar en funktion och meter per pt.
 */
export function projicera(punkter: LatLng[], b: number, h: number, pad = 18) {
  const lat0 = punkter.reduce((s, p) => s + p.lat, 0) / punkter.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of punkter) {
    const x = p.lng * k;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (p.lat < minY) minY = p.lat; if (p.lat > maxY) maxY = p.lat;
  }
  const spannX = Math.max(maxX - minX, 1e-6), spannY = Math.max(maxY - minY, 1e-6);
  const skala = Math.min((b - 2 * pad) / spannX, (h - 2 * pad) / spannY);
  const offX = (b - spannX * skala) / 2, offY = (h - spannY * skala) / 2;
  return {
    /** x, y i rutans egna koordinater, y nedat fran overkanten. */
    till: (p: LatLng) => ({ x: offX + (p.lng * k - minX) * skala, y: h - (offY + (p.lat - minY) * skala) }),
    meterPerPt: 111320 / skala,
  };
}

/** Kartans hojd for bredden b: foljer trakten (hog trakt = hog karta) inom [min, max]. */
export function kartaHojd(l: KartLager, b: number, min = 230, max = 400, pad = 18): number {
  const e = kartExtent(l);
  if (e.length === 0) return min;
  const lat0 = e.reduce((s, p) => s + p.lat, 0) / e.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = e.map((p) => p.lng * k), ys = e.map((p) => p.lat);
  const spannX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6), spannY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
  const h = (b - 2 * pad) * (spannY / spannX) + 2 * pad;
  return Math.round(Math.min(max, Math.max(min, h)));
}

const hex = (lib: PdfLib, f: string) => lib.rgb(parseInt(f.slice(1, 3), 16) / 255, parseInt(f.slice(3, 5), 16) / 255, parseInt(f.slice(5, 7), 16) / 255);

/** Ritar kartan. Returnerar meter per pt (for skalstocken) eller null nar det inte finns nagot att rita. */
export function ritaKarta(
  lib: PdfLib,
  sida: PDFPage,
  fonter: { normal: PDFFont; fet: PDFFont },
  ruta: Ruta,
  l: KartLager,
  san: (s: string) => string,
  opts: { stammarBlek?: boolean; etiketter?: boolean } = {},
): { meterPerPt: number } | null {
  const grå = (g: number) => lib.rgb(g / 255, g / 255, g / 255);
  sida.drawRectangle({ x: ruta.x, y: SIDHOJD - ruta.top - ruta.h, width: ruta.b, height: ruta.h, color: grå(247), borderColor: grå(215), borderWidth: 0.5 });
  const extent = kartExtent(l);
  if (extent.length === 0) return null;
  const pr = projicera(extent, ruta.b, ruta.h);
  /** Toppbaserade koordinater i SVG-banor (origo = sidans ovre vanstra hornet, se `SVG`). */
  const ap = (p: LatLng) => { const q = pr.till(p); return { x: ruta.x + q.x, y: ruta.top + q.y }; };
  const SVG = { x: 0, y: SIDHOJD } as const;

  // Klipp mot rutan.
  sida.pushOperators(lib.pushGraphicsState(), lib.rectangle(ruta.x, SIDHOJD - ruta.top - ruta.h, ruta.b, ruta.h), lib.clip(), lib.endPath());

  const bana = (pts: LatLng[], slut: boolean) => pts.map((p, i) => { const a = ap(p); return `${i === 0 ? 'M' : 'L'} ${a.x.toFixed(2)} ${a.y.toFixed(2)}`; }).join(' ') + (slut ? ' Z' : '');

  // 2. Hansynsytor/zoner forst (under linjerna), sedan linjer.
  for (const m of l.markeringar ?? []) {
    if (m.slag !== 'zon' || m.punkter.length < 3) continue;
    const st = markeringsStil('zon', m.typ); if (!st) continue;
    sida.drawSvgPath(bana(m.punkter, true), { ...SVG, color: hex(lib, st.farg), opacity: 0.16, borderColor: hex(lib, st.farg), borderWidth: st.bredd, borderOpacity: 0.9, ...(st.streck ? { borderDashArray: st.streck } : {}) });
  }

  // 1. Traktgrans (streckad) - ritas ovanpa ytorna men under stammarna, sa den syns men aldrig doljer monstret.
  for (const ring of l.granser) {
    if (ring.length < 2) continue;
    sida.drawSvgPath(bana(ring, true), { ...SVG, borderColor: hex(lib, TRAKTGRANS_FARG), borderWidth: 1.2, borderDashArray: [5, 3] });
  }

  // 2. STAMMOLNET: en fylld cirkel per stam. Aldrig utglesat.
  const r = opts.stammarBlek ? 0.7 : 0.85;
  const stamFarg = opts.stammarBlek ? grå(205) : hex(lib, STAMMOLN_FARG);
  for (const s of l.stammar) {
    const a = ap(s);
    sida.drawSvgPath(`M ${(a.x + r).toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 0 ${(a.x - r).toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 0 ${(a.x + r).toFixed(2)} ${a.y.toFixed(2)} Z`, { ...SVG, color: stamFarg });
  }

  // 3. Hyttsparet (tunt, i rollens farg - skordare heldragen, skotare streckad: farg ar aldrig ensam).
  for (const h of l.hyttspar ?? []) {
    for (const linje of h.linjer) {
      if (linje.length < 2) continue;
      sida.drawSvgPath(bana(linje, false), { ...SVG, borderColor: hex(lib, HYTTSPAR_FARG[h.roll]), borderWidth: 0.7, borderOpacity: 0.9, ...(h.roll === 'skotare' ? { borderDashArray: [3, 1.5] } : {}) });
    }
  }

  // 4. Planeringens linjer och symboler.
  for (const m of l.markeringar ?? []) {
    if (m.slag !== 'linje' || m.punkter.length < 2) continue;
    const st = markeringsStil('linje', m.typ); if (!st) continue;
    sida.drawSvgPath(bana(m.punkter, false), { ...SVG, borderColor: hex(lib, st.farg), borderWidth: st.bredd, ...(st.streck ? { borderDashArray: st.streck } : {}) });
    if (m.backvag) {
      const strack = backvagStreckPt(m.punkter.map(ap), m.backvag);
      if (strack) for (const s of strack) ritaTvarstreck(lib, sida, SVG, s, hex(lib, st.farg), st.bredd);
    }
  }
  const placerade: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const m of l.markeringar ?? []) {
    if (m.slag !== 'symbol') continue;
    const st = markeringsStil('symbol', m.typ); if (!st) continue;
    const a = ap(m.plats), d = 3.4;
    sida.drawSvgPath(`M ${a.x} ${a.y - d} L ${a.x + d} ${a.y} L ${a.x} ${a.y + d} L ${a.x - d} ${a.y} Z`, { ...SVG, color: grå(255), borderColor: hex(lib, st.farg), borderWidth: 1.3 });
    if (opts.etiketter !== false) {
      const text = san(st.etikett), bredd = fonter.normal.widthOfTextAtSize(text, 6.5);
      const rect = { x0: a.x + d + 2, x1: a.x + d + 2 + bredd, y0: a.y - 4, y1: a.y + 4 };
      const krock = placerade.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0);
      if (!krock && rect.x1 < ruta.x + ruta.b) {
        sida.drawText(text, { x: rect.x0, y: SIDHOJD - a.y - 2.2, size: 6.5, font: fonter.normal, color: grå(60) });
        placerade.push(rect);
      }
    }
  }

  // 5. Kontrollpunkterna, numrerade, overst.
  for (const p of l.pinnar) {
    const a = ap(p.plats);
    sida.drawCircle({ x: a.x, y: SIDHOJD - a.y, size: 8.5, color: grå(17), borderColor: grå(255), borderWidth: 1 });
    const t = String(p.nr);
    sida.drawText(t, { x: a.x - fonter.fet.widthOfTextAtSize(t, 9) / 2, y: SIDHOJD - a.y - 3.2, size: 9, font: fonter.fet, color: grå(255) });
  }
  sida.pushOperators(lib.popGraphicsState());

  // Norrpil och skalstock (utanfor klippet).
  sida.drawText('N', { x: ruta.x + ruta.b - 17, y: SIDHOJD - ruta.top - 20, size: 9, font: fonter.fet, color: grå(17) });
  sida.drawLine({ start: { x: ruta.x + ruta.b - 13, y: SIDHOJD - ruta.top - 24 }, end: { x: ruta.x + ruta.b - 13, y: SIDHOJD - ruta.top - 38 }, thickness: 1.2, color: grå(17) });
  const sk = skalstock(pr.meterPerPt, 120);
  const sx = ruta.x + 12, sy = SIDHOJD - ruta.top - ruta.h + 16;
  sida.drawLine({ start: { x: sx, y: sy }, end: { x: sx + sk.pt, y: sy }, thickness: 1.5, color: grå(17) });
  sida.drawText(sk.meter >= 1000 ? `${sk.meter / 1000} km` : `${sk.meter} m`, { x: sx, y: sy - 10, size: 8, font: fonter.normal, color: grå(110) });
  return { meterPerPt: pr.meterPerPt };
}

/**
 * Backvag i rapporten: DUBBLA tvarstreck (‖) i hinderanden, tvars over vagen - som i appen. Returnerar tva strack [x1,y1,x2,y2] (sidans pt, toppbaserade),
 * eller null om vagen saknar riktning. Anden tas i ritriktningen ('start' = forsta punkten); grannen ar den narmaste punkten minst 3 pt bort.
 */
export function backvagStreckPt(pts: { x: number; y: number }[], ande: 'start' | 'slut', halvLangd = 6, halvAvstand = 3): [number, number, number, number][] | null {
  if (pts.length < 2) return null;
  const rad = ande === 'start' ? pts : [...pts].reverse();   // rad[0] = hinderanden
  const e = rad[0];
  let g = rad[1];
  for (let i = 1; i < rad.length; i++) { g = rad[i]; if (Math.hypot(e.x - g.x, e.y - g.y) >= 3) break; }
  const L = Math.hypot(e.x - g.x, e.y - g.y);
  if (L === 0) return null;
  const dx = (e.x - g.x) / L, dy = (e.y - g.y) / L;   // riktningen UT ur vagen
  const px = -dy, py = dx;                              // vinkelrat
  return [-halvAvstand, halvAvstand].map((o) => {
    const cx = e.x + dx * o, cy = e.y + dy * o;
    return [cx - px * halvLangd, cy - py * halvLangd, cx + px * halvLangd, cy + py * halvLangd] as [number, number, number, number];
  });
}

/** Ett tvarstreck: morkt kant (bredare) och vagens farg ovanpa, som i appen. */
function ritaTvarstreck(lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, s: [number, number, number, number], farg: ReturnType<PdfLib['rgb']>, vagBredd: number): void {
  const bana = `M ${s[0].toFixed(2)} ${s[1].toFixed(2)} L ${s[2].toFixed(2)} ${s[3].toFixed(2)}`;
  const inre = Math.max(0.9, vagBredd * 0.7);
  sida.drawSvgPath(bana, { ...SVG, borderColor: lib.rgb(0.07, 0.07, 0.07), borderWidth: inre + 1.1, borderLineCap: lib.LineCapStyle.Butt });
  sida.drawSvgPath(bana, { ...SVG, borderColor: farg, borderWidth: inre, borderLineCap: lib.LineCapStyle.Butt });
}

/** En rad (eller flera) med teckenforklaring: ett litet prov per lager + dess namn. Returnerar hojden som anvandes. */
export function ritaTeckenforklaring(
  lib: PdfLib,
  sida: PDFPage,
  fonter: { normal: PDFFont },
  x: number, top: number, b: number,
  poster: { nyckel: string; etikett: string }[],
  san: (s: string) => string,
): number {
  const grå = (g: number) => lib.rgb(g / 255, g / 255, g / 255);
  const SVG = { x: 0, y: SIDHOJD } as const;
  const STORLEK = 7.5, RAD = 11, PROV = 16;
  let cx = x, cy = top;
  for (const p of poster) {
    const text = san(p.etikett), bredd = fonter.normal.widthOfTextAtSize(text, STORLEK);
    if (cx > x && cx + PROV + 4 + bredd > x + b) { cx = x; cy += RAD; }
    const mid = cy + 4;
    const [slag, typ] = p.nyckel.split(':');
    if (p.nyckel === 'traktgrans') sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, TRAKTGRANS_FARG), borderWidth: 1.2, borderDashArray: [4, 2] });
    else if (p.nyckel === 'stammar') sida.drawCircle({ x: cx + PROV / 2, y: SIDHOJD - mid, size: 1.6, color: hex(lib, STAMMOLN_FARG) });
    else if (slag === 'hyttspar') sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, HYTTSPAR_FARG[typ as 'skordare' | 'skotare']), borderWidth: 0.9, ...(typ === 'skotare' ? { borderDashArray: [3, 1.5] } : {}) });
    else if (p.nyckel === 'backvag') {   // en kort vag med dubbla tvarstreck i andan, i neutral morkgra (farg ar aldrig ensam)
      sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV - 5} ${mid}`, { ...SVG, borderColor: grå(90), borderWidth: 1.2 });
      for (const s of backvagStreckPt([{ x: cx, y: mid }, { x: cx + PROV - 5, y: mid }], 'slut', 3.4, 2)!) ritaTvarstreck(lib, sida, SVG, s, grå(90), 1.2);
    }
    else if (p.nyckel === 'kontrollpunkt') sida.drawCircle({ x: cx + PROV / 2, y: SIDHOJD - mid, size: 3.6, color: grå(17) });
    else if (slag === 'linje' || slag === 'zon' || slag === 'symbol') {
      const st = markeringsStil(slag, typ);
      if (st && slag === 'symbol') sida.drawSvgPath(`M ${cx + PROV / 2} ${mid - 3} L ${cx + PROV / 2 + 3} ${mid} L ${cx + PROV / 2} ${mid + 3} L ${cx + PROV / 2 - 3} ${mid} Z`, { ...SVG, color: grå(255), borderColor: hex(lib, st.farg), borderWidth: 1.1 });
      else if (st && slag === 'zon') sida.drawSvgPath(`M ${cx} ${mid - 3} L ${cx + PROV} ${mid - 3} L ${cx + PROV} ${mid + 3} L ${cx} ${mid + 3} Z`, { ...SVG, color: hex(lib, st.farg), opacity: 0.16, borderColor: hex(lib, st.farg), borderWidth: 0.9, ...(st.streck ? { borderDashArray: st.streck } : {}) });
      else if (st) sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, st.farg), borderWidth: Math.min(st.bredd, 2.2), ...(st.streck ? { borderDashArray: st.streck } : {}) });
    }
    sida.drawText(text, { x: cx + PROV + 4, y: SIDHOJD - cy - STORLEK * 0.78 - 0.5, size: STORLEK, font: fonter.normal, color: grå(70) });
    cx += PROV + 4 + bredd + 12;
  }
  return poster.length === 0 ? 0 : cy - top + RAD;
}
