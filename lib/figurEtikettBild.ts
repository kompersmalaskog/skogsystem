// Etiketten i en mät-/ritfigur ("0,89 ha", "384 m") som en BILD för ett MapLibre-symbollager.
//
// Varför bild och inte textlager eller HTML-markör:
//  - Kartstilen har ingen glyphs-källa; MapLibre ritar ändå text, men med enhetens egna typsnitt (kontrollerat 2026-10-06: siffror,
//    bokstäver och åäö ritas, som Arial/sans-serif). En bild ger samma utseende överallt: pillen med bakgrund, appens typsnitt
//    och designtokens, lika på dator och telefon.
//  - En bild ritas av samma motor som figurens punkter och linjer, så etiketten sitter exakt i figuren — också i 3D-terräng, där en
//    HTML-markör räknar sin plats separat och kan hamna fel medan höjddata laddas (sett i testselen: markören 330 px ovanför figuren).
import { FARG, FONT, TYP, RADIE, AVSTAND } from './design/tokens';

export const ETIKETT_PIXELRATIO = 2;

/** Det som behövs av en 2D-canvas — smalt så att testet kan ge en låtsas-canvas. */
export interface EtikettCanvas {
  width: number;
  height: number;
  getContext(id: '2d'): EtikettCtx | null;
}
export interface EtikettCtx {
  font: string;
  fillStyle: string;
  textBaseline: string;
  textAlign: string;
  measureText(t: string): { width: number };
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
  fill(): void;
  fillText(t: string, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray };
}

export interface EtikettBild {
  /** logiska mått (CSS-px) — bilden är ETIKETT_PIXELRATIO gånger större i pixlar */
  bredd: number;
  hojd: number;
  bild: { width: number; height: number; data: Uint8ClampedArray };
}

/** Bildens id i kartan: samma text → samma bild (läggs bara till en gång). */
export const etikettBildId = (text: string): string => `figur-etikett:${text}`;

export function ritaEtikett(text: string, skapaCanvas?: () => EtikettCanvas): EtikettBild | null {
  if (!text) return null;
  const c = skapaCanvas ? skapaCanvas() : (typeof document !== 'undefined' ? (document.createElement('canvas') as unknown as EtikettCanvas) : null);
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const font = `${TYP.listtitel.fontWeight} ${TYP.listtitel.fontSize}px ${FONT}`;
  ctx.font = font;
  const bredd = Math.ceil(ctx.measureText(text).width) + AVSTAND.s * 2;
  const hojd = Math.ceil(TYP.listtitel.fontSize * TYP.listtitel.lineHeight) + AVSTAND.xs * 2;
  c.width = bredd * ETIKETT_PIXELRATIO;
  c.height = hojd * ETIKETT_PIXELRATIO;
  ctx.scale(ETIKETT_PIXELRATIO, ETIKETT_PIXELRATIO);
  // storleken på canvasen nollställer typsnitt/fyllning — sätt om
  ctx.font = font;
  const r = Math.min(RADIE.rad, hojd / 2);
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
  ctx.textAlign = 'center';
  ctx.fillText(text, bredd / 2, hojd / 2 + 1);
  return { bredd, hojd, bild: ctx.getImageData(0, 0, c.width, c.height) };
}
