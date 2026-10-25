// Fällträdet: markens skala, vad som syns var, vinklar och förslaget ur de gamla gröna pilarna. Pixlar och riktiga fingrar prövas i lib/fallTradKorUpp.hytt.test.ts (Chromium).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expression } from '@maplibre/maplibre-gl-style-spec';
import {
  TRAD_HANDTAG_M, TRAD_LANGD_M, TRAD_SYNLIG_M, TRAD_STORLEK_UTTRYCK, TRAD_TOPP_PX, TRAD_TYP, arFallTrad, arGammalFallpil, arPaHandtag, foreslaTrad, fram, handtagPunkt,
  synligaTrad, tradData, tradLinje, tradPosUr, tradStorlek, vinkelFranPunkt, type TradPos,
} from './fallTrad';
import { FALLNING_M } from './larm/fallning';
import { avstandPunktM, avstandTillLinjeM } from './larm/geo';

const fixtur = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/fallriktning_arvidstorp_2026-10-25.json'), 'utf8'));
const origo = { lat: 57, lon: 15 };
/** Prod-pilarna som riktiga markeringar (isArrow sätts av sidan när en pil skapas). */
const pilar = fixtur.pilar.map((p: any) => ({ isArrow: true, ...p }));
const trad = (id: string, stubbe = origo, vinkel = 0): TradPos => ({ id, stubbe, vinkel });

describe('trädets storlek följer marken', () => {
  it('uttrycket (exponentiell, bas 2) ger exakt samma storlek som tradStorlek vid varje zoom', () => {
    const e = expression.createExpression(TRAD_STORLEK_UTTRYCK as any, { type: 'number', 'property-type': 'data-constant', expression: { interpolated: true, parameters: ['zoom'] } } as any);
    if (e.result !== 'success') throw new Error(JSON.stringify(e.value));
    for (const z of [10, 12.5, 14, 15, 16, 17, 18, 19.7, 20]) expect(e.value.evaluate({ zoom: z } as any)).toBeCloseTo(tradStorlek(z), 5);
  });
  it('bilden är TRAD_LANGD_M (28 m) lång på marken vid varje zoom: px per meter × bildens topp-avstånd', () => {
    const mpp = (z: number) => (40075016.686 / 512 / 2 ** z) * Math.cos((57 * Math.PI) / 180);
    for (const z of [13, 15, 17, 19]) expect(TRAD_TOPP_PX * tradStorlek(z) * mpp(z)).toBeCloseTo(TRAD_LANGD_M, 3);
  });
  it('handtaget ligger bortom kronans topp, i samma skala', () => {
    expect(TRAD_HANDTAG_M).toBeGreaterThan(TRAD_LANGD_M);
    const t = trad('a', origo, 90);
    expect(avstandPunktM(t.stubbe, handtagPunkt(t))).toBeCloseTo(TRAD_HANDTAG_M, 1);
  });
});

describe('vinklar', () => {
  it('fram och vinkelFranPunkt är varandras motsatser för alla riktningar', () => {
    for (let v = 0; v < 360; v += 15) {
      const p = fram(origo, v, 30);
      expect(avstandPunktM(origo, p)).toBeCloseTo(30, 1);
      expect(Math.abs(((vinkelFranPunkt(origo, p) - v + 540) % 360) - 180)).toBeLessThanOrEqual(1);
    }
  });
  it('norr = 0, öst = 90, söder = 180, väst = 270; alltid ett heltal 0–359', () => {
    expect(vinkelFranPunkt(origo, { lat: 57.001, lon: 15 })).toBe(0);
    expect(vinkelFranPunkt(origo, { lat: 57, lon: 15.001 })).toBe(90);
    expect(vinkelFranPunkt(origo, { lat: 56.999, lon: 15 })).toBe(180);
    expect(vinkelFranPunkt(origo, { lat: 57, lon: 14.999 })).toBe(270);
    for (const [dy, dx] of [[1, 1], [-1, 1], [-1, -1], [1, -1], [0.0001, -1]]) { const v = vinkelFranPunkt(origo, { lat: 57 + dy / 1000, lon: 15 + dx / 1000 }); expect(Number.isInteger(v) && v >= 0 && v < 360).toBe(true); }
  });
});

describe('handtaget', () => {
  const proj = (ll: { lat: number; lon: number }) => ({ x: (ll.lon - 15) * 1e5, y: -(ll.lat - 57) * 1e5 });
  it('träffas inom 30 px, inte längre bort', () => {
    const t = trad('a', origo, 40);
    const h = proj(handtagPunkt(t));
    expect(arPaHandtag({ x: h.x + 29, y: h.y }, t, proj)).toBe(true);
    expect(arPaHandtag({ x: h.x + 31, y: h.y }, t, proj)).toBe(false);
    expect(arPaHandtag(proj(origo), t, proj)).toBe(false);   // stubben är inget handtag
  });
});

describe('vad som syns var — maskinen', () => {
  const ras = [trad('nara', fram(origo, 0, 10), 90), trad('langt', fram(origo, 0, 200), 90)];
  it('planeringen ser alla träd', () => { expect(synligaTrad(ras, 'planering', null).map((t) => t.id)).toEqual(['nara', 'langt']); });
  it('SKOTAREN ser inga — inte ens ett som står på maskinen', () => {
    expect(synligaTrad(ras, 'skotare', origo)).toEqual([]);
    expect(synligaTrad([trad('x', origo, 0)], 'skotare', origo)).toEqual([]);
  });
  it('skördaren ser bara träd i fällningscirkeln (30 m); utan position inga', () => {
    expect(TRAD_SYNLIG_M).toBe(FALLNING_M);
    expect(synligaTrad(ras, 'skordare', origo).map((t) => t.id)).toEqual(['nara']);
    expect(synligaTrad(ras, 'skordare', null)).toEqual([]);
  });
  it('ett träd räknas som i cirkeln när NÅGON DEL av det ligger där — stubben 40 m bort men kronan inåt syns, kronan utåt syns inte', () => {
    const stubbe = fram(origo, 90, 40);
    expect(avstandPunktM(origo, stubbe)).toBeGreaterThan(FALLNING_M);
    expect(synligaTrad([trad('inat', stubbe, 270)], 'skordare', origo)).toHaveLength(1);   // faller mot maskinen: toppen 12 m från maskinen
    expect(synligaTrad([trad('utat', stubbe, 90)], 'skordare', origo)).toHaveLength(0);
    const t = trad('inat', stubbe, 270);
    expect(avstandTillLinjeM(origo, tradLinje(t))).toBeLessThanOrEqual(FALLNING_M);
  });
  it('gränsen: 29,5 m syns, 30,5 m syns inte (stubben, kronan pekar utåt)', () => {
    expect(synligaTrad([trad('a', fram(origo, 0, 29.5), 0)], 'skordare', origo)).toHaveLength(1);
    expect(synligaTrad([trad('a', fram(origo, 0, 30.5), 0)], 'skordare', origo)).toHaveLength(0);
  });
});

describe('data till kartan', () => {
  it('en punkt per träd med vinkel, handtag (bara planeringen) och förslag-flagga', () => {
    const fc = tradData([trad('a', origo, 45)], { redigera: true });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ id: 'a', rotation: 45, redigera: true, forslag: false });
    expect(fc.features[0].geometry.coordinates).toEqual([15, 57]);
    expect(tradData([trad('a')], { redigera: false, forslag: true }).features[0].properties).toMatchObject({ redigera: false, forslag: true });
  });
});

describe('markeringen', () => {
  it('ett träd är en pil-markering (typ pil i databasen — tabellens CHECK tillåter inget annat) av sorten fellingtree', () => {
    expect(TRAD_TYP).toBe('fellingtree');
    expect(arFallTrad({ isArrow: true, arrowType: 'fellingtree' })).toBe(true);
    expect(arFallTrad({ isArrow: true, arrowType: 'fellingdirection' })).toBe(false);
    expect(arFallTrad({ isArrow: false, arrowType: 'fellingtree' })).toBe(false);
    expect(arGammalFallpil({ isArrow: true, arrowType: 'fellingdirection' })).toBe(true);
    expect(arGammalFallpil({ isArrow: true, arrowType: 'drivedirection' })).toBe(false);
  });
  it('tradPosUr: lng/lat går före x/y, vinkel ur angle före rotation, normaliserad till 0–359', () => {
    const svg = () => ({ lat: 1, lon: 2 });
    expect(tradPosUr({ id: 1, lng: 15, lat: 57, angle: -90 }, svg)).toEqual({ id: '1', stubbe: { lat: 57, lon: 15 }, vinkel: 270 });
    expect(tradPosUr({ id: 2, x: 3, y: 4, rotation: 450 }, svg)).toEqual({ id: '2', stubbe: { lat: 1, lon: 2 }, vinkel: 90 });
    expect(tradPosUr({ id: 3 }, svg)).toBeNull();
  });
});

describe('förslag: de gamla gröna pilarna blir träd — Arvidstorp (prod 2026-10-25)', () => {
  const svg = () => ({ lat: 0, lon: 0 });
  it('ett träd per grön fällpil, på pilens plats och i pilens riktning; pilarna listas för borttagning', () => {
    const f = foreslaTrad(pilar, svg, (n) => 1000 + n);
    expect(f.trad).toHaveLength(3);
    expect(f.pilIdn).toEqual(fixtur.pilar.map((p: any) => String(p.id)));
    f.trad.forEach((t, i) => { expect(t).toMatchObject({ id: 1000 + i, lng: fixtur.pilar[i].lng, lat: fixtur.pilar[i].lat, angle: fixtur.pilar[i].angle }); });
    expect(new Set(f.trad.map((t) => t.id)).size).toBe(3);
  });
  it('rör bara gröna fällpilar: körriktningspilar, träd och kör upp-pilar föreslås aldrig bort', () => {
    const blandat = [
      ...pilar,
      { id: 9, isArrow: true, arrowType: 'drivedirection', lng: 15, lat: 57, angle: 0 },
      { id: 10, isArrow: true, arrowType: 'fellingtree', lng: 15, lat: 57, angle: 0 },
      { id: 11, isArrow: true, arrowType: 'koruppbacka', lng: 15, lat: 57, angle: 0 },
      { id: 12, isMarker: true, type: 'warning' },
    ].map((m: any) => ({ isArrow: true, ...m }));
    const f = foreslaTrad(blandat.map((m: any) => (m.isMarker ? { ...m, isArrow: false } : m)), svg);
    expect(f.pilIdn).toEqual(fixtur.pilar.map((p: any) => String(p.id)));
  });
  it('en gammal pil med bara x/y (före geo sparades) hittar sin plats via svgToLatLon och sin vinkel ur rotation', () => {
    const f = foreslaTrad([{ id: 5, isArrow: true, arrowType: 'fellingdirection', x: 1, y: 2, rotation: 200 }], () => ({ lat: 57.5, lon: 15.5 }));
    expect(f.trad[0]).toMatchObject({ lat: 57.5, lng: 15.5, angle: 200 });
  });
  it('inga gröna pilar → inget förslag', () => { expect(foreslaTrad([], svg)).toEqual({ trad: [], pilIdn: [] }); });
});
