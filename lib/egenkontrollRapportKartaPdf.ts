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
import type { RapportModell, LatLng, KartNotering } from './egenkontrollRapport';
import { arMedIRapport } from './egenkontrollNotering';
import { placeraEtiketter, type EtikettPost, type Rektangel } from './egenkontrollEtikettPlats';
import { bryt } from './omTraktenEtikettBild';
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
  /** Noteringarna (PR 9a): ord pa kartan. Linjer/punkter over planens vagar och hyttsparet, etiketterna overst. */
  noteringar?: KartNotering[];
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
    ...(l.noteringar ?? []).filter(arMedIRapport).flatMap((n) => n.punkter),
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

  // 4b. NOTERINGARNA: linjer, punkter och pilspetsar over planens vagar och hyttsparet, under kontrollpunkterna (som i appen).
  // Skyddsnät: modellen släpper bara blev hit, men ritaren ritar aldrig en skulle-notering även om någon skickar in en (arMedIRapport).
  const noteringar = (l.noteringar ?? []).filter(arMedIRapport);
  for (const n of noteringar) ritaNoteringForm(lib, sida, SVG, n, ap);

  // 5. Kontrollpunkterna, numrerade, overst.
  for (const p of l.pinnar) {
    const a = ap(p.plats);
    sida.drawCircle({ x: a.x, y: SIDHOJD - a.y, size: 8.5, color: grå(17), borderColor: grå(255), borderWidth: 1 });
    const t = String(p.nr);
    sida.drawText(t, { x: a.x - fonter.fet.widthOfTextAtSize(t, 9) / 2, y: SIDHOJD - a.y - 3.2, size: 9, font: fonter.fet, color: grå(255) });
  }

  // 6. ETIKETTERNA overst: de ska kunna lasas. Placeras utan att doldja varandra, en kontrollpunkt eller en notering (planeraNoteringsEtiketter).
  const maler = (t: string) => fonter.normal.widthOfTextAtSize(san(t), ETIKETT_STORLEK);
  const etiketter = planeraNoteringsEtiketter(noteringar, l.pinnar.map((p) => ap(p.plats)), ap, maler, { x0: ruta.x + 2, y0: ruta.top + 2, x1: ruta.x + ruta.b - 2, y1: ruta.top + ruta.h - 2 });
  for (const n of noteringar) {
    const e = etiketter.get(n.id);
    if (e) ritaNoteringsEtikett(lib, sida, SVG, fonter, e.rader, e.ruta, san);
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

// ---------------------------------------------------------------------------
// Noteringar i rapportens karta (PR 9a)
// ---------------------------------------------------------------------------
//
// Rapporten tar BARA "sa har blev det" (Martin 2026-10-21, arMedIRapport): en HELDRAGEN morklinje med en FYLLD punkt och en morkfylld etikett
// med vit text. "Skulle" ritas aldrig har — en rattelse ovanpa hyttsparet ar ett daterat och positionsbestamt medgivande till kunden.

const BLEV_FARG = '#111111';
const NOTERING_PUNKT_R = 3.4;
const ETIKETT_STORLEK = 8.5;
const ETIKETT_PAD = 3.2;
const ETIKETT_MAX_BREDD = 140;
const ETIKETT_MAX_RADER = 3;

/** Ankaret: punkten, eller mitt pa linjen (langs den, inte mellan hornen). null = inget att rita. */
function noteringsAnkare(n: KartNotering, ap: (p: LatLng) => { x: number; y: number }): { x: number; y: number } | null {
  if (n.punkter.length === 0) return null;
  if (n.typ === 'punkt' || n.punkter.length === 1) return ap(n.punkter[0]);
  const pts = n.punkter.map(ap);
  let tot = 0;
  for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let kvar = tot / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (kvar <= d && d > 0) { const t = kvar / d; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; }
    kvar -= d;
  }
  return pts[pts.length - 1];
}

/**
 * Var varje notering far sin etikett: aldrig ovanpa en annan etikett, en kontrollpunkts pinne, en notering (dess ankare eller linje) -
 * utom nar det inte finns nagot fritt lage. Rent (taget ur ritaKarta sa att det gar att prova utan en PDF).
 */
export function planeraNoteringsEtiketter(
  noteringar: KartNotering[],
  pinnar: { x: number; y: number }[],
  ap: (p: LatLng) => { x: number; y: number },
  mat: (t: string) => number,
  yta: Rektangel,
): Map<string, { ruta: Rektangel; rader: string[] }> {
  const ut = new Map<string, { ruta: Rektangel; rader: string[] }>();
  if (noteringar.length === 0) return ut;
  const hinder: Rektangel[] = pinnar.map((a) => ({ x0: a.x - 9, y0: a.y - 9, x1: a.x + 9, y1: a.y + 9 }));
  for (const n of noteringar) {
    const a = noteringsAnkare(n, ap);
    if (a) hinder.push({ x0: a.x - NOTERING_PUNKT_R - 1, y0: a.y - NOTERING_PUNKT_R - 1, x1: a.x + NOTERING_PUNKT_R + 1, y1: a.y + NOTERING_PUNKT_R + 1 });
    // Linjerna ar hinder for ALLA etiketter: en etikett som ligger over en pil doljer var den slutar (provat: "Overfart stenmur" doljde "Drivnings" pilspets).
    if (n.typ === 'linje') hinder.push(...linjeHinder(n.punkter.map(ap)));
  }
  const matt = noteringar.map((n) => etikettMatt(n, mat));
  const poster: EtikettPost[] = [];
  noteringar.forEach((n, i) => {
    const a = noteringsAnkare(n, ap);
    const m = matt[i];
    if (a && m) poster.push({ id: n.id, ankare: a, bredd: m.bredd, hojd: m.hojd });
  });
  const plats = placeraEtiketter(poster, hinder, yta);
  noteringar.forEach((n, i) => {
    const r = plats.get(n.id), m = matt[i];
    if (r && m) ut.set(n.id, { ruta: r, rader: m.rader });
  });
  return ut;
}

/** Rektanglar (5 x 5 pt) tata langs en linje: en etikett far inte ligga ovanpa den. Ett glest satt av punkter skulle lata en etikett glida mellan dem. */
export function linjeHinder(pts: { x: number; y: number }[]): Rektangel[] {
  const ut: Rektangel[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const steg = Math.max(1, Math.ceil(d / 5));
    for (let k = 0; k <= steg; k++) {
      const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / steg, y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / steg;
      ut.push({ x0: x - 2.5, y0: y - 2.5, x1: x + 2.5, y1: y + 2.5 });
    }
  }
  return ut;
}

function etikettMatt(n: KartNotering, mat: (t: string) => number): { rader: string[]; bredd: number; hojd: number } | null {
  const rader = bryt(n.etikett, mat, ETIKETT_MAX_BREDD - ETIKETT_PAD * 2, ETIKETT_MAX_RADER);
  if (rader.length === 0) return null;
  return { rader, bredd: Math.ceil(Math.max(...rader.map(mat))) + ETIKETT_PAD * 2, hojd: rader.length * ETIKETT_STORLEK * 1.25 + ETIKETT_PAD * 2 };
}

/** Linjen/punkten/pilspetsen. Vit kant under allt: syns pa den ljusgra kartytan och over stammolnets prickar. */
function ritaNoteringForm(
  lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, n: KartNotering, ap: (p: LatLng) => { x: number; y: number },
): void {
  const farg = hex(lib, BLEV_FARG);
  const vit = lib.rgb(1, 1, 1);
  const pts = n.punkter.map(ap);
  if (n.typ === 'punkt' || pts.length < 2) {
    const a = pts[0];
    if (!a) return;
    const ring = `M ${(a.x + NOTERING_PUNKT_R).toFixed(2)} ${a.y.toFixed(2)} A ${NOTERING_PUNKT_R} ${NOTERING_PUNKT_R} 0 1 0 ${(a.x - NOTERING_PUNKT_R).toFixed(2)} ${a.y.toFixed(2)} A ${NOTERING_PUNKT_R} ${NOTERING_PUNKT_R} 0 1 0 ${(a.x + NOTERING_PUNKT_R).toFixed(2)} ${a.y.toFixed(2)} Z`;
    sida.drawSvgPath(ring, { ...SVG, color: farg, borderColor: vit, borderWidth: 1.2 });
    return;
  }
  const bana = pts.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' ');
  sida.drawSvgPath(bana, { ...SVG, borderColor: vit, borderWidth: 3.6, borderOpacity: 0.9 });                  // heldragen vit kant
  sida.drawSvgPath(bana, { ...SVG, borderColor: farg, borderWidth: 1.6 });
  if (n.pil) {
    // Pilspets i slutet: tva korta streck bakat fran sista punkten, mot riktningen pa sista delstrackan.
    let a = pts[pts.length - 1], g = pts[pts.length - 2];
    for (let i = pts.length - 2; i >= 0; i--) { g = pts[i]; if (Math.hypot(a.x - g.x, a.y - g.y) > 0.5) break; }
    const L = Math.hypot(a.x - g.x, a.y - g.y);
    if (L > 0) {
      const dx = (a.x - g.x) / L, dy = (a.y - g.y) / L, lang = 9, bred = 4.6;
      const bx = a.x - dx * lang, by = a.y - dy * lang;
      const spets = `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${(bx - dy * bred).toFixed(2)} ${(by + dx * bred).toFixed(2)} L ${(bx + dy * bred).toFixed(2)} ${(by - dx * bred).toFixed(2)} Z`;
      sida.drawSvgPath(spets, { ...SVG, color: farg, borderColor: vit, borderWidth: 1 });
    }
  }
}

function ritaNoteringsEtikett(
  lib: PdfLib, sida: PDFPage, SVG: { x: number; y: number }, fonter: { normal: PDFFont },
  rader: string[], r: Rektangel, san: (s: string) => string,
): void {
  const farg = hex(lib, BLEV_FARG);
  const b = r.x1 - r.x0, h = r.y1 - r.y0, k = 2.2;
  const bana = `M ${r.x0 + k} ${r.y0} L ${r.x1 - k} ${r.y0} Q ${r.x1} ${r.y0} ${r.x1} ${r.y0 + k} L ${r.x1} ${r.y1 - k} Q ${r.x1} ${r.y1} ${r.x1 - k} ${r.y1} L ${r.x0 + k} ${r.y1} Q ${r.x0} ${r.y1} ${r.x0} ${r.y1 - k} L ${r.x0} ${r.y0 + k} Q ${r.x0} ${r.y0} ${r.x0 + k} ${r.y0} Z`;
  sida.drawSvgPath(bana, { ...SVG, color: farg, borderColor: lib.rgb(1, 1, 1), borderWidth: 0.8 });
  void b; void h;
  rader.forEach((rad, i) => {
    sida.drawText(san(rad), {
      x: r.x0 + ETIKETT_PAD, y: SIDHOJD - (r.y0 + ETIKETT_PAD + ETIKETT_STORLEK * 0.92 + i * ETIKETT_STORLEK * 1.25),
      size: ETIKETT_STORLEK, font: fonter.normal, color: lib.rgb(1, 1, 1),
    });
  });
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
    else if (p.nyckel === 'notering:blev') {          // heldragen morklinje + fylld punkt
      sida.drawSvgPath(`M ${cx} ${mid} L ${cx + PROV} ${mid}`, { ...SVG, borderColor: hex(lib, BLEV_FARG), borderWidth: 1.6 });
      sida.drawCircle({ x: cx + PROV / 2, y: SIDHOJD - mid, size: 2.4, color: hex(lib, BLEV_FARG), borderColor: grå(255), borderWidth: 0.8 });
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
