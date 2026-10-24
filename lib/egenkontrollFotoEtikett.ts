// Etiketter på ett foto i en egenkontrollrunda (PR 9b): hur stora de är, hur de bryts, var de hamnar. RENT — ingen DOM, ingen pdf-lib.
//
// EN modell för skärmen och PDF:en. Allt mäts i BILDBREDDER (bildens egen bredd = 1, höjden = `bildHojd` = h / w), så samma sparade
// notering ([u, v] 0..1 + förskjutning) ritas lika stor i förhållande till bilden överallt. Det enda som skiljer ytorna är TEXTSTORLEKEN:
//
//   PDF   FOTO_ETIKETT_PDF_ANDEL = 3,2 % av fotots uppritade bredd (15,9 pt på de 496 pt som bilagans layout E ger). Martin 2026-10-21: för stor är
//         ful men går att rätta med kortare text, för liten är oanvändbar och upptäcks först när Vida kisar.
//   SKÄRM max(13 px, 3,2 % av visad bredd). Golvet behåller läsbarheten på en telefon (390 px bred bild × 3,2 % = 12,5 px < 13).
//
// REGELN SOM BÄR KLÄMNINGEN: PDF-etiketten är aldrig större än skärmetiketten. Förskjutningen klämdes (klamEtikett) mot SKÄRMENS ruta när den
// sparades; PDF:en klämmer om med sin egen, och är PDF-rutan mindre eller lika stor ändrar det inget — det som sparades är giltigt i PDF:en.
// Rutan är mindre eller lika eftersom radbrytningen sker i em (oberoende av storleken) och rutan är em × textandel: samma rader, mindre
// textandel → mindre ruta. `pdfEtikettAldrigStorreAnSkarm` räknar det; testet kör det över hela spannet av visade bredder.

import { bryt } from './omTraktenEtikettBild';
import { helveticaBreddEm } from './helveticaBredd';
import { NOTERING_MAX_PUNKTER, klamEtikett, minPunkter, type EtikettRuta, type NoteringVerktyg } from './egenkontrollNotering';
import { slutaRitning } from './ritaPunkter';
import { placeraEtiketter, type EtikettPost, type Rektangel } from './egenkontrollEtikettPlats';

export const FOTO_ETIKETT_PDF_ANDEL = 0.032;
export const FOTO_ETIKETT_SKARM_ANDEL = 0.032;
export const FOTO_ETIKETT_SKARM_GOLV_PX = 13;

/** Radbredd i em (oberoende av textstorleken: skärm och PDF bryter alltid lika). */
export const FOTO_ETIKETT_MAX_EM = 12;
export const FOTO_ETIKETT_MAX_RADER = 3;
export const FOTO_ETIKETT_PAD_EM = 0.4;
export const FOTO_ETIKETT_RADHOJD_EM = 1.25;

/** Skärmens textstorlek i px för ett foto som visas `visadBreddPx` brett. */
export function skarmEtikettPx(visadBreddPx: number): number {
  return Math.max(FOTO_ETIKETT_SKARM_GOLV_PX, FOTO_ETIKETT_SKARM_ANDEL * visadBreddPx);
}

/** Skärmens textstorlek som andel av bildbredden. */
export function skarmEtikettAndel(visadBreddPx: number): number {
  return skarmEtikettPx(visadBreddPx) / visadBreddPx;
}

export type FotoEtikettMatt = {
  rader: string[];
  /** true = texten var längre än rutan rymmer och kortades med … (hela texten ligger kvar på noteringen). */
  avkortad: boolean;
  /** Rutan i bildbredder. */
  ruta: EtikettRuta;
};

/** Etikettens rader och ruta för en given textandel (textstorlek / bildbredd). */
export function fotoEtikettMatt(text: string, textAndel: number): FotoEtikettMatt | null {
  const rader = bryt(text, helveticaBreddEm, FOTO_ETIKETT_MAX_EM, FOTO_ETIKETT_MAX_RADER);
  if (rader.length === 0) return null;
  const emBredd = Math.max(...rader.map(helveticaBreddEm));
  const avkortad = rader.length > 0 && rader[rader.length - 1].endsWith('…') && !text.replace(/\s+/g, ' ').trim().endsWith('…');
  return {
    rader,
    avkortad,
    ruta: {
      bredd: (emBredd + 2 * FOTO_ETIKETT_PAD_EM) * textAndel,
      hojd: (rader.length * FOTO_ETIKETT_RADHOJD_EM + 2 * FOTO_ETIKETT_PAD_EM) * textAndel,
    },
  };
}

/**
 * Det obligatoriska provet: för en text, vid en visad bredd, är PDF-etiketten inte större än skärmetiketten (rader, bredd och höjd)?
 * Samma rader är förutsättningen — rader som skiljer sig vore ett fel i modellen.
 */
export function pdfEtikettAldrigStorreAnSkarm(text: string, visadBreddPx: number): boolean {
  const pdf = fotoEtikettMatt(text, FOTO_ETIKETT_PDF_ANDEL);
  const skarm = fotoEtikettMatt(text, skarmEtikettAndel(visadBreddPx));
  if (!pdf || !skarm) return pdf === skarm;
  return pdf.rader.join('\n') === skarm.rader.join('\n') && pdf.ruta.bredd <= skarm.ruta.bredd + 1e-12 && pdf.ruta.hojd <= skarm.ruta.hojd + 1e-12;
}

// ---------------------------------------------------------------------------
// Koordinater
// ---------------------------------------------------------------------------

/** Samma regel som databasens egenkontroll_notering_koordinater_ok för ett foto: par av tal 0..1, punkt = 1 par, linje 2..500. */
export function fotoKoordinaterGiltiga(typ: 'punkt' | 'linje', k: unknown): k is [number, number][] {
  if (!Array.isArray(k)) return false;
  if (typ === 'punkt' ? k.length !== 1 : k.length < 2 || k.length > 500) return false;
  return k.every((c) => Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1));
}

/** Ett tryck på bilden → [u, v]. `rutaX/rutaY/rutaB/rutaH` är bildens uppritade ruta på skärmen (px); trycket utanför bilden → null. */
export function tryckTillUV(
  klientX: number, klientY: number, ruta: { x: number; y: number; b: number; h: number },
): [number, number] | null {
  if (ruta.b <= 0 || ruta.h <= 0) return null;
  const u = (klientX - ruta.x) / ruta.b;
  const v = (klientY - ruta.y) / ruta.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return [Math.round(u * 1e5) / 1e5, Math.round(v * 1e5) / 1e5];
}

/**
 * Det som sparas när ritningen på ett foto är klar: EXAKT de tryckta punkterna (ett tryck = en punkt, inga mellanpunkter, ingen utjämning,
 * inga dubbletter på samma plats). null = för få punkter för verktyget eller en punkt utanför bilden.
 */
export function fotoRitningTillKoordinater(v: NoteringVerktyg, tryck: [number, number][]): [number, number][] | null {
  const k = slutaRitning(tryck, false);
  if (k.length < minPunkter(v)) return null;
  const ut = k.slice(0, v === 'punkt' ? 1 : Math.min(k.length, NOTERING_MAX_PUNKTER));
  return fotoKoordinaterGiltiga(v === 'punkt' ? 'punkt' : 'linje', ut) ? ut : null;
}

// ---------------------------------------------------------------------------
// Etikettens plats
// ---------------------------------------------------------------------------

export type FotoNoteringForm = {
  id: string;
  typ: 'punkt' | 'linje';
  pil: boolean;
  etikett: string;
  /** [u, v] 0..1. */
  punkter: [number, number][];
  /** Förskjutning från ankaret i bildbredder. null = ingen sparad plats (föreslås). */
  dx: number | null;
  dy: number | null;
};

export type PlaceradFotoEtikett = {
  id: string;
  rader: string[];
  avkortad: boolean;
  ruta: EtikettRuta;
  /** Etikettens rektangel i bildbredder (y nedåt, 0..bildHojd). */
  rekt: Rektangel;
  /** Förskjutningen som ligger bakom rektangeln (klämd) — det som sparas. */
  dx: number;
  dy: number;
  /** Ankaret i bildbredder (x = u, y = v · bildHojd). */
  ankare: { x: number; y: number };
};

/** Ankaret: punkten, eller mitt på linjen (längs den). Bildbredder, y nedåt. */
export function fotoAnkare(n: Pick<FotoNoteringForm, 'typ' | 'punkter'>, bildHojd: number): { x: number; y: number } | null {
  if (n.punkter.length === 0) return null;
  const pts = n.punkter.map(([u, v]) => ({ x: u, y: v * bildHojd }));
  if (n.typ === 'punkt' || pts.length === 1) return pts[0];
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

const ANKARE_HALV = 0.012;
const LINJE_STEG = 0.008;
/** Mellanrum mellan ankaret och etiketten vid förslag, i bildbredder (5 pt av 496). */
const FORSLAG_LUCKA = 0.012;
/** Hur långt från ankaret ett förslag får provas, som faktor på luckan. Längre bort än första ringen får etiketten en ledarlinje. */
const FORSLAG_RINGAR = [1, 2.5, 5, 8] as const;

function linjeHinder(pts: { x: number; y: number }[]): Rektangel[] {
  const ut: Rektangel[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const steg = Math.max(1, Math.ceil(d / LINJE_STEG));
    for (let k = 0; k <= steg; k++) {
      const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / steg;
      const y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / steg;
      ut.push({ x0: x - LINJE_STEG / 2, y0: y - LINJE_STEG / 2, x1: x + LINJE_STEG / 2, y1: y + LINJE_STEG / 2 });
    }
  }
  return ut;
}

/**
 * Var varje etikett ligger på ett foto. EN funktion för skärmen och PDF:en (de skiljer sig bara i `textAndel`).
 *   - En notering med sparad förskjutning behåller den — klämd mot den här ytans ruta (idempotent: är den redan klämd rör det inget).
 *   - En notering utan förskjutning FÖRESLÅS en plats: aldrig ovanpå ett ankare, en linje eller en annan etikett, annars där den döljer minst
 *     (samma regler som kartan, `placeraEtiketter`). Fasta etiketter placeras först så att en ny aldrig knuffar en gammal.
 * Rent och deterministiskt: samma indata ger samma plats.
 */
export function planeraFotoEtiketter(noteringar: FotoNoteringForm[], bildHojd: number, textAndel: number): Map<string, PlaceradFotoEtikett> {
  const ut = new Map<string, PlaceradFotoEtikett>();
  const yta: Rektangel = { x0: 0, y0: 0, x1: 1, y1: bildHojd };
  type Post = { n: FotoNoteringForm; matt: FotoEtikettMatt; ankare: { x: number; y: number } };
  const poster: Post[] = [];
  for (const n of noteringar) {
    const matt = fotoEtikettMatt(n.etikett, textAndel);
    const ankare = fotoAnkare(n, bildHojd);
    if (matt && ankare) poster.push({ n, matt, ankare });
  }

  const hinder: Rektangel[] = [];
  for (const p of poster) {
    hinder.push({ x0: p.ankare.x - ANKARE_HALV, y0: p.ankare.y - ANKARE_HALV, x1: p.ankare.x + ANKARE_HALV, y1: p.ankare.y + ANKARE_HALV });
    if (p.n.typ === 'linje') hinder.push(...linjeHinder(p.n.punkter.map(([u, v]) => ({ x: u, y: v * bildHojd }))));
  }

  const lagg = (p: Post, dx: number, dy: number) => {
    const k = klamEtikett({ u: p.ankare.x, v: bildHojd > 0 ? p.ankare.y / bildHojd : 0, bildHojd, dx, dy, ruta: p.matt.ruta });
    const cx = p.ankare.x + k.dx, cy = p.ankare.y + k.dy;
    const rekt: Rektangel = { x0: cx - p.matt.ruta.bredd / 2, y0: cy - p.matt.ruta.hojd / 2, x1: cx + p.matt.ruta.bredd / 2, y1: cy + p.matt.ruta.hojd / 2 };
    ut.set(p.n.id, { id: p.n.id, rader: p.matt.rader, avkortad: p.matt.avkortad, ruta: p.matt.ruta, rekt, dx: k.dx, dy: k.dy, ankare: p.ankare });
    return rekt;
  };

  // Fasta först.
  const upptaget: Rektangel[] = [...hinder];
  for (const p of poster) {
    if (p.n.dx !== null && p.n.dy !== null) upptaget.push(lagg(p, p.n.dx, p.n.dy));
  }
  // Förslag för resten, äldst först.
  const forslag: EtikettPost[] = poster
    .filter((p) => p.n.dx === null || p.n.dy === null)
    .map((p) => ({ id: p.n.id, ankare: p.ankare, bredd: p.matt.ruta.bredd, hojd: p.matt.ruta.hojd }));
  const plats = placeraEtiketter(forslag, upptaget, yta, FORSLAG_LUCKA, FORSLAG_RINGAR);
  for (const p of poster) {
    const r = plats.get(p.n.id);
    if (!r) continue;
    lagg(p, (r.x0 + r.x1) / 2 - p.ankare.x, (r.y0 + r.y1) / 2 - p.ankare.y);
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Formerna (linje, punkt, pilspets) — i bildbredder, så de skalar med bilden på båda ytorna
// ---------------------------------------------------------------------------

export const FOTO_FORM = {
  punktR: 0.008,
  punktKant: 0.0025,
  linjeBredd: 0.0033,
  linjeKant: 0.0075,
  pilLang: 0.019,
  pilBred: 0.0095,
  /** Etikettens rundning och kant, i textstorlekar. */
  etikettRundning: 0.26,
  etikettKant: 0.1,
} as const;

/** Närmaste punkt på en rektangel till en given punkt — där ledarlinjen från ankaret möter etiketten. */
export function narmastePaRekt(r: Rektangel, p: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.max(r.x0, Math.min(p.x, r.x1)), y: Math.max(r.y0, Math.min(p.y, r.y1)) };
}

/**
 * Ledarlinjen från ankaret till etiketten, bara när etiketten ligger så långt bort att man annars inte ser vad den hör till (en dragen etikett).
 * null = etiketten ligger intill sitt ankare. Bildbredder, y nedåt.
 */
export function ledarlinje(rekt: Rektangel, ankare: { x: number; y: number }): [{ x: number; y: number }, { x: number; y: number }] | null {
  const m = narmastePaRekt(rekt, ankare);
  const d = Math.hypot(m.x - ankare.x, m.y - ankare.y);
  return d > FORSLAG_LUCKA * 2.2 ? [ankare, m] : null;
}

/**
 * Pilspetsens tre hörn: spetsen i linjens sista punkt, riktad längs sista delsträckan som har någon längd (> `minAvstand`). `lang` bakåt längs
 * linjen, `bred` åt varje sida. null = linjen saknar riktning. Samma form på skärmen och i PDF:en (som anropar den i pt, skärmen i bildbredder).
 */
export function pilspets(
  pts: { x: number; y: number }[], lang: number, bred: number, minAvstand: number,
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] | null {
  if (pts.length < 2) return null;
  const a = pts[pts.length - 1];
  let g = pts[pts.length - 2];
  for (let i = pts.length - 2; i >= 0; i--) { g = pts[i]; if (Math.hypot(a.x - g.x, a.y - g.y) > minAvstand) break; }
  const L = Math.hypot(a.x - g.x, a.y - g.y);
  if (L <= 0) return null;
  const dx = (a.x - g.x) / L, dy = (a.y - g.y) / L;
  const bx = a.x - dx * lang, by = a.y - dy * lang;
  return [a, { x: bx - dy * bred, y: by + dx * bred }, { x: bx + dy * bred, y: by - dx * bred }];
}
