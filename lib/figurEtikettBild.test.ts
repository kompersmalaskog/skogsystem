import { describe, it, expect } from 'vitest';
import { ritaEtikett, etikettBildId, ETIKETT_PIXELRATIO, type EtikettCanvas, type EtikettCtx } from './figurEtikettBild';
import { TYP, AVSTAND } from './design/tokens';

// Låtsas-canvas: mäter 8 px per tecken och minns vad som ritades.
function falsk() {
  const anrop: { text?: string; x?: number; y?: number; fill: string[]; skala?: number } = { fill: [] };
  const ctx: EtikettCtx = {
    font: '', fillStyle: '', textBaseline: '', textAlign: '',
    measureText: (t) => ({ width: t.length * 8 }),
    scale: (x) => { anrop.skala = x; },
    beginPath() {}, moveTo() {}, arcTo() {}, closePath() {},
    fill() { anrop.fill.push(ctx.fillStyle); },
    fillText(t, x, y) { anrop.text = t; anrop.x = x; anrop.y = y; anrop.fill.push(ctx.fillStyle); },
    getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  };
  const canvas: EtikettCanvas = { width: 0, height: 0, getContext: () => ctx };
  return { canvas, anrop, ctx };
}

describe('etikettbild', () => {
  it('bredden följer texten (+ sidomarginal), höjden följer typsnittet; pixlarna är PIXELRATIO gånger större', () => {
    const { canvas } = falsk();
    const kort = ritaEtikett('9 m', () => canvas)!;
    const lang = ritaEtikett('0,89 ha', () => falsk().canvas)!;
    expect(kort.bredd).toBe(3 * 8 + AVSTAND.s * 2);
    expect(lang.bredd).toBe(7 * 8 + AVSTAND.s * 2);
    expect(lang.bredd).toBeGreaterThan(kort.bredd);
    expect(kort.hojd).toBe(Math.ceil(TYP.listtitel.fontSize * TYP.listtitel.lineHeight) + AVSTAND.xs * 2);
    expect(kort.bild.width).toBe(kort.bredd * ETIKETT_PIXELRATIO);
    expect(kort.bild.height).toBe(kort.hojd * ETIKETT_PIXELRATIO);
    expect(kort.bild.data.length).toBe(kort.bild.width * kort.bild.height * 4);
  });
  it('ritar texten mitt i bubblan, först bakgrunden sedan texten (olika färger)', () => {
    const { canvas, anrop } = falsk();
    const e = ritaEtikett('384 m', () => canvas)!;
    expect(anrop.text).toBe('384 m');
    expect(anrop.x).toBe(e.bredd / 2);
    expect(anrop.skala).toBe(ETIKETT_PIXELRATIO);
    expect(anrop.fill.length).toBe(2);
    expect(anrop.fill[0]).not.toBe(anrop.fill[1]);
  });
  it('tom text eller ingen canvas → ingen bild (aldrig en tom bubbla)', () => {
    expect(ritaEtikett('', () => falsk().canvas)).toBeNull();
    expect(ritaEtikett('1 ha', () => ({ width: 0, height: 0, getContext: () => null }))).toBeNull();
  });
  it('samma text ger samma bild-id, olika text olika', () => {
    expect(etikettBildId('0,89 ha')).toBe(etikettBildId('0,89 ha'));
    expect(etikettBildId('0,89 ha')).not.toBe(etikettBildId('0,90 ha'));
  });
});
