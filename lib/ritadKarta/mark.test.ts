import { describe, expect, it } from 'vitest';
import { BRANT_GRAD, BRANT_MIN_RUTOR, FUKT, FUKT_FARG, SLU_STANDARD, LUTNING_SAKNAS, brantYtor, franBase64, fuktKodFranNamn, markUtsnitt, tillBase64 } from './mark';
import { tillSweref } from './skog';

describe('fuktKodFranNamn: frisk-fuktig, fuktig och blöt får tre blå steg', () => {
  it.each([
    ['Torr', FUKT.ingen], ['Frisk', FUKT.ingen], ['Frisk-fuktig', FUKT.lite], ['Frisk–Fuktig', FUKT.lite], ['Frisk fuktig', FUKT.lite],
    ['Fuktig', FUKT.fuktig], ['Blöt', FUKT.blot], ['Blot', FUKT.blot], ['Öppet vatten', FUKT.ingen], [null, FUKT.ingen],
  ])('%s', (namn, kod) => expect(fuktKodFranNamn(namn as any)).toBe(kod));
});

describe('brantYtor', () => {
  const [x0, y0] = tillSweref(15, 56.5);
  const rn = (lut: number[], bredd: number) => ({ minX: Math.round(x0), maxY: Math.round(y0), bredd, hojd: lut.length / bredd, rutaM: 5, lutning: Uint8Array.from(lut) });
  it('en sammanhängande brant yta blir rektanglar, en per rad', () => {
    const b = 4, lut = new Array(16).fill(BRANT_GRAD);
    const fc = brantYtor(rn(lut, b));
    expect(fc.features).toHaveLength(4);
  });
  it('under BRANT_GRAD visas inget, och saknad lutning är aldrig brant', () => {
    expect(brantYtor(rn(new Array(16).fill(BRANT_GRAD - 1), 4)).features).toHaveLength(0);
    expect(brantYtor(rn(new Array(16).fill(LUTNING_SAKNAS), 4)).features).toHaveLength(0);
  });
  it('små brantfläckar (en sten, en dikeskant) tas bort', () => {
    const lut = new Array(100).fill(0);
    for (let i = 0; i < BRANT_MIN_RUTOR - 1; i++) lut[i] = 40;
    expect(brantYtor(rn(lut, 100)).features).toHaveLength(0);
    for (let i = 0; i < BRANT_MIN_RUTOR; i++) lut[i] = 40;
    expect(brantYtor(rn(lut, 100)).features.length).toBeGreaterThan(0);
  });
});

it('markens rutnät täcker samma utsnitt som skogen, med 5 m rutor', () => {
  expect(markUtsnitt({ minX: 0, minY: 0, maxX: 600, maxY: 400 })).toEqual({ minX: 0, maxY: 400, bredd: 120, hojd: 80 });
});

it('base64 tur och retur', () => {
  const b = Uint8Array.from([0, 1, 2, 255, 30]);
  expect([...franBase64(tillBase64(b))]).toEqual([...b]);
});

it('SLU:s numrering: 3 frisk-fuktig, 4 fuktig, 5 blöt — torr och frisk utan färg', () => {
  expect([1, 2, 3, 4, 5].map((v) => SLU_STANDARD.get(v))).toEqual([FUKT.ingen, FUKT.ingen, FUKT.lite, FUKT.fuktig, FUKT.blot]);
});
it('ju blötare, desto starkare blått (aldrig grönt)', () => {
  const [, lite, fuktig, blot] = FUKT_FARG;
  expect(lite[3]).toBeLessThan(fuktig[3]); expect(fuktig[3]).toBeLessThan(blot[3]);
  for (const c of [lite, fuktig, blot]) { expect(c[2]).toBeGreaterThan(c[1]); expect(c[2]).toBeGreaterThan(c[0]); }
});
