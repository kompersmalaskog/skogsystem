import { describe, expect, it } from 'vitest';
import { BLOTT_MIN_RUTOR, BRANT_GRANS, BRANT_MIN_RUTOR, FUKT, FUKT_GRANS, KLASS_VATTEN, LUTNING_SAKNAS, tolkaFuktBand, blottYtor, brantYtor, franBase64, fuktKod, markUtsnitt, tillBase64 } from './mark';
import { tillSweref } from './skog';

describe('fuktKod: SLU:s sannolikhet för blöt mark → två steg', () => {
  it.each([
    [0, FUKT.ingen], [FUKT_GRANS.fuktig - 1, FUKT.ingen], [FUKT_GRANS.fuktig, FUKT.fuktig], [FUKT_GRANS.blot - 1, FUKT.fuktig],
    [FUKT_GRANS.blot, FUKT.blot], [100, FUKT.blot], [255, FUKT.ingen], [-1, FUKT.ingen], [NaN, FUKT.ingen],
  ])('%s', (p, kod) => expect(fuktKod(p)).toBe(kod));
  it('öppet vatten ritas av vattenlagret, aldrig som blöt mark', () => expect(fuktKod(100, KLASS_VATTEN)).toBe(FUKT.ingen));
});

describe('blottYtor', () => {
  const rn = (fukt: number[], b: number) => ({ minX: 400000, maxY: 6300000, bredd: b, hojd: fukt.length / b, rutaM: 5, fukt: Uint8Array.from(fukt) });
  it('fuktig yta med blöt kärna: hela ytan glest, kärnan tätt', () => {
    const f = new Array(36).fill(FUKT.fuktig); for (const i of [14, 15, 20, 21]) f[i] = FUKT.blot;
    const fc = blottYtor(rn(f, 6));
    const rutor = (k: string) => fc.features.filter((x) => x.properties!.k === k).reduce((a, x) => a + ((x.geometry as any).coordinates[0][1][0] - (x.geometry as any).coordinates[0][0][0]), 0);
    expect(fc.features.some((x) => x.properties!.k === 'fuktig')).toBe(true);
    expect(fc.features.filter((x) => x.properties!.k === 'blot')).toHaveLength(2);
    expect(rutor('fuktig')).toBeGreaterThan(rutor('blot'));
  });
  it('små fläckar tas bort', () => {
    const f = new Array(36).fill(FUKT.ingen); for (let i = 0; i < BLOTT_MIN_RUTOR - 1; i++) f[i] = FUKT.blot;
    expect(blottYtor(rn(f, 6)).features).toHaveLength(0);
  });
});

describe('brantYtor', () => {
  const [x0, y0] = tillSweref(15, 56.5);
  const rn = (lut: number[], bredd: number) => ({ minX: Math.round(x0), maxY: Math.round(y0), bredd, hojd: lut.length / bredd, rutaM: 5, lutning: Uint8Array.from(lut) });
  const k = (fc: GeoJSON.FeatureCollection, v: string) => fc.features.filter((f) => f.properties?.k === v).length;
  it('lite brant: bara glesa streck; mycket brant: båda (det täta ritas ovanpå)', () => {
    const lite = brantYtor(rn(new Array(16).fill(BRANT_GRANS.lite), 4));
    expect(k(lite, 'lite')).toBe(4); expect(k(lite, 'mycket')).toBe(0);
    const mycket = brantYtor(rn(new Array(16).fill(BRANT_GRANS.mycket), 4));
    expect(k(mycket, 'lite')).toBe(4); expect(k(mycket, 'mycket')).toBe(4);
    expect(k(brantYtor(rn(new Array(16).fill(BRANT_GRANS.mycket - 1), 4)), 'mycket')).toBe(0);
  });
  it('gränserna är Skogforsks lutningsklasser 4 och 5 (33 % och 50 %)', () => {
    expect(Math.round(Math.atan(0.33) * 180 / Math.PI)).toBe(BRANT_GRANS.lite);
    expect(Math.round(Math.atan(0.5) * 180 / Math.PI)).toBe(BRANT_GRANS.mycket);
  });
  it('flackare än lite brant visas inte, och saknad lutning är aldrig brant', () => {
    expect(brantYtor(rn(new Array(16).fill(BRANT_GRANS.lite - 1), 4)).features).toHaveLength(0);
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


describe('tolkaFuktBand: sannolikhet först, annars SLU:s klasser, annars fel', () => {
  it('sannolikhet + klass', () => {
    const t = tolkaFuktBand([[10, 60, 90, 90], [1, 2, 3, 4]]);
    expect(t.kalla).toBe('sannolikhet'); expect([...t.koder]).toEqual([FUKT.ingen, FUKT.fuktig, FUKT.blot, FUKT.ingen]);
  });
  it('bara klassbandet: 2 = fuktig, 3 = blöt, 4 = vatten', () => {
    const t = tolkaFuktBand([[1, 2, 3, 4, 255]]);
    expect(t.kalla).toBe('klass'); expect([...t.koder]).toEqual([FUKT.ingen, FUKT.fuktig, FUKT.blot, FUKT.ingen, FUKT.ingen]);
  });
  it('klassbandet först, sannolikheten som band 2', () => {
    expect(tolkaFuktBand([[1, 3], [20, 80]]).kalla).toBe('sannolikhet');
  });
  it('okänt innehåll är ett fel som säger vad banden var', () => {
    expect(() => tolkaFuktBand([[300, 400, 500]])).toThrow(/okänt innehåll/);
    expect(() => tolkaFuktBand([])).toThrow(/inga band/);
  });
});
