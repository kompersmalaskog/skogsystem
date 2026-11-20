// Etiketten intill den framhävda markeringen i Om trakten › Visa: kommentaren, 1–2 rader, avkortad med … , på en mörk bakgrund som appens kort.
// En BILD för ett MapLibre-symbollager av samma skäl som figurens etikett (lib/figurEtikettBild): kartstilen saknar glyphs och en HTML-markör
// räknar sin plats separat från kartlagren och hamnar fel i 3D-terräng. Radbrytning och avkortning är rena funktioner (testbara utan canvas).

import { AVSTAND, FARG, FONT, RADIE, TYP } from './design/tokens';
import { ETIKETT_PIXELRATIO, type EtikettBild, type EtikettCanvas } from './figurEtikettBild';

export const ETIKETT_MAX_BREDD = 240;
export const ETIKETT_MAX_RADER = 2;

/** Bryter `text` i högst `maxRader` rader som rymms i `maxBredd` (mätt med `mat`). Sista raden avkortas med … om texten inte får plats. Ett ord
 *  längre än en rad bryts mitt i. Radbrytningar i texten räknas som mellanslag (kommentaren visas som löptext). */
export function bryt(text: string, mat: (s: string) => number, maxBredd: number, maxRader = ETIKETT_MAX_RADER): string[] {
  const ord = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (ord.length === 0) return [];
  const rader: string[] = [];
  let rad = '';
  let i = 0;
  // Delar ett ord som är bredare än en rad i bitar som ryms.
  const delaOrd = (o: string): string[] => {
    const bitar: string[] = [];
    let b = '';
    for (const tecken of Array.from(o)) {
      if (b && mat(b + tecken) > maxBredd) { bitar.push(b); b = tecken; } else b += tecken;
    }
    if (b) bitar.push(b);
    return bitar;
  };
  const kon = ord.flatMap((o) => (mat(o) > maxBredd ? delaOrd(o) : [o]));
  for (; i < kon.length; i++) {
    const kandidat = rad ? `${rad} ${kon[i]}` : kon[i];
    if (mat(kandidat) <= maxBredd) { rad = kandidat; continue; }
    // Raden är full.
    if (rader.length === maxRader - 1) break;          // sista raden: resten avkortas nedan
    rader.push(rad);
    rad = kon[i];
  }
  const harMer = i < kon.length;
  if (rad) {
    if (harMer || rader.length === maxRader) {
      // avkorta sista raden med … tills den rymms
      let s = rad;
      while (s && mat(`${s}…`) > maxBredd) s = Array.from(s).slice(0, -1).join('').trimEnd();
      rad = `${s}…`;
    }
    rader.push(rad);
  }
  return rader.slice(0, maxRader);
}

export function ritaFramhavEtikett(text: string, skapaCanvas?: () => EtikettCanvas): EtikettBild | null {
  if (!text.trim()) return null;
  const c = skapaCanvas ? skapaCanvas() : (typeof document !== 'undefined' ? (document.createElement('canvas') as unknown as EtikettCanvas) : null);
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const font = `${TYP.text.fontWeight} ${TYP.text.fontSize}px ${FONT}`;
  ctx.font = font;
  const pad = AVSTAND.m;
  const rader = bryt(text, (s) => ctx.measureText(s).width, ETIKETT_MAX_BREDD - pad * 2);
  if (rader.length === 0) return null;
  const radH = Math.ceil(TYP.text.fontSize * TYP.text.lineHeight);
  const bredd = Math.ceil(Math.max(...rader.map((r) => ctx.measureText(r).width))) + pad * 2;
  const hojd = radH * rader.length + AVSTAND.s * 2;
  c.width = bredd * ETIKETT_PIXELRATIO;
  c.height = hojd * ETIKETT_PIXELRATIO;
  ctx.scale(ETIKETT_PIXELRATIO, ETIKETT_PIXELRATIO);
  ctx.font = font;                                   // storleken på canvasen nollställer typsnitt/fyllning
  const r = Math.min(RADIE.kort, hojd / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(bredd, 0, bredd, hojd, r);
  ctx.arcTo(bredd, hojd, 0, hojd, r);
  ctx.arcTo(0, hojd, 0, 0, r);
  ctx.arcTo(0, 0, bredd, 0, r);
  ctx.closePath();
  ctx.fillStyle = FARG.kort;
  ctx.fill();
  ctx.fillStyle = FARG.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  rader.forEach((rad, i) => ctx.fillText(rad, pad, AVSTAND.s + radH * i + radH / 2 + 1));
  return { bredd, hojd, bild: ctx.getImageData(0, 0, c.width, c.height) };
}

/** Bildens id i kartan: samma text → samma bild. */
export const framhavEtikettBildId = (text: string): string => `omtrakten-etikett:${text}`;
