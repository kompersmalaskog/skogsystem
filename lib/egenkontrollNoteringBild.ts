// Noteringarnas bilder för kartan: etikettens pill och pilspetsen.
//
// FÄRGEN BÄR ALDRIG ENSAM (design-skillen): "så här blev det" är en fylld pill med heldragen linje och fylld punkt,
// "så här skulle det gjorts" en pill med STRECKAD kant, streckad linje och en ring. Gult förstärker bara.
// Pillen är en bild av samma skäl som figurens etikett (lib/figurEtikettBild.ts): kartstilen saknar glyphs och en HTML-markör
// räknar sin plats separat från kartlagren.

import { AVSTAND, FARG, FONT, RADIE, TYP } from './design/tokens';
import { ETIKETT_PIXELRATIO, type EtikettBild, type EtikettCanvas, type EtikettCtx } from './figurEtikettBild';
import { bryt } from './omTraktenEtikettBild';
import type { NoteringAvsikt } from './egenkontrollNotering';

export const NOTERING_ETIKETT_MAX_BREDD = 220;
export const NOTERING_ETIKETT_MAX_RADER = 3;

/** Linjens, punktens och pilspetsens färg per avsikt. */
export const NOTERING_FARG: Record<NoteringAvsikt, string> = { blev: FARG.text, skulle: FARG.gul };
/** Mörk kant runt allt: vitt och gult syns annars inte mot ljust flygfoto. */
export const NOTERING_KANT = '#000000';

/** Bildens id i kartan: samma text och avsikt → samma bild (läggs bara till en gång). */
export const noteringBildId = (etikett: string, avsikt: NoteringAvsikt): string => `ek-notering-etikett:${avsikt}:${etikett}`;
export const noteringPilBildId = (avsikt: NoteringAvsikt): string => `ek-notering-pil:${avsikt}`;

/** Det pillen behöver av en 2D-canvas utöver figurens: kantlinje, streckning. */
export interface NoteringCtx extends EtikettCtx {
  strokeStyle: string;
  lineWidth: number;
  setLineDash(segment: number[]): void;
  stroke(): void;
}

export const SKULLE_STRECK = [5, 3];

export function ritaNoteringsEtikett(etikett: string, avsikt: NoteringAvsikt, skapaCanvas?: () => EtikettCanvas): EtikettBild | null {
  if (!etikett.trim()) return null;
  const c = skapaCanvas ? skapaCanvas() : (typeof document !== 'undefined' ? (document.createElement('canvas') as unknown as EtikettCanvas) : null);
  if (!c) return null;
  const ctx = c.getContext('2d') as NoteringCtx | null;
  if (!ctx) return null;
  const font = `${TYP.text.fontWeight} ${TYP.text.fontSize}px ${FONT}`;
  ctx.font = font;
  const pad = AVSTAND.m;
  const rader = bryt(etikett, (s) => ctx.measureText(s).width, NOTERING_ETIKETT_MAX_BREDD - pad * 2, NOTERING_ETIKETT_MAX_RADER);
  if (rader.length === 0) return null;
  const radH = Math.ceil(TYP.text.fontSize * TYP.text.lineHeight);
  const bredd = Math.ceil(Math.max(...rader.map((r) => ctx.measureText(r).width))) + pad * 2;
  const hojd = radH * rader.length + AVSTAND.s * 2;
  c.width = bredd * ETIKETT_PIXELRATIO;
  c.height = hojd * ETIKETT_PIXELRATIO;
  ctx.scale(ETIKETT_PIXELRATIO, ETIKETT_PIXELRATIO);
  ctx.font = font;                                   // storleken på canvasen nollställer typsnitt/fyllning
  const kant = 2;                                    // kantlinjens halva bredd ryms innanför bilden
  const r = Math.min(RADIE.kort, hojd / 2);
  ctx.beginPath();
  ctx.moveTo(r, kant);
  ctx.arcTo(bredd - kant, kant, bredd - kant, hojd - kant, r);
  ctx.arcTo(bredd - kant, hojd - kant, kant, hojd - kant, r);
  ctx.arcTo(kant, hojd - kant, kant, kant, r);
  ctx.arcTo(kant, kant, bredd - kant, kant, r);
  ctx.closePath();
  ctx.fillStyle = FARG.kort;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = NOTERING_FARG[avsikt];
  if (avsikt === 'skulle') ctx.setLineDash(SKULLE_STRECK);   // STRECKAD kant = "så här skulle det gjorts"
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = FARG.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  rader.forEach((rad, i) => ctx.fillText(rad, pad, AVSTAND.s + radH * i + radH / 2 + 1));
  return { bredd, hojd, bild: ctx.getImageData(0, 0, c.width, c.height) };
}

/** Pilspetsen (pekar uppåt/norr; kartan roterar den): en triangel med mörk kant. */
export function ritaNoteringPilspets(avsikt: NoteringAvsikt): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const px = 2, b = 22, h = 22;
  const c = document.createElement('canvas');
  c.width = b * px;
  c.height = h * px;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.scale(px, px);
  ctx.beginPath();
  ctx.moveTo(b / 2, 2);
  ctx.lineTo(b - 3, h - 3);
  ctx.lineTo(b / 2, h - 8);
  ctx.lineTo(3, h - 3);
  ctx.closePath();
  ctx.fillStyle = NOTERING_FARG[avsikt];
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = NOTERING_KANT;
  ctx.lineJoin = 'round';
  ctx.stroke();
  return c;
}
export const NOTERING_PIL_PIXELRATIO = 2;
