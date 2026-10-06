import { describe, it, expect } from 'vitest';
import { SPARA_SOM, valForFigur, minPunkter, byggFigurMarkering, type LngLat } from './sparSom';
import { ZONE_COLORS } from './zone-colors';

// Samma omvandling som sidans latLonToSvg i testen: (lat, lng) → {x, y}, entydig och enkel att kontrollera.
const tillSvg = (lat: number, lng: number) => ({ x: Math.round(lng * 1000) / 10, y: Math.round(-lat * 1000) / 10 });
const tre: LngLat[] = [[15.05, 56.35], [15.051, 56.35], [15.051, 56.351]];

describe('Spara som — sex val i spec + stickväg per färg', () => {
  it('KODBEVIS: blött, hänsyn, brant, yta (ytor) och stickväg, linje (linjer)', () => {
    expect(valForFigur('yta').map((v) => v.etikett)).toEqual(['Blött', 'Hänsyn', 'Brant', 'Yta']);
    expect(valForFigur('linje').map((v) => v.etikett)).toEqual(['Stickväg röd', 'Stickväg gul', 'Stickväg blå', 'Linje']);
    expect(SPARA_SOM).toHaveLength(8);
  });
  it('varje zon-typ finns i zonfärgerna (annars ritar kartan en markering utan färg)', () => {
    for (const v of SPARA_SOM) if (v.mal.slag === 'zon') expect(Object.keys(ZONE_COLORS)).toContain(v.mal.zoneType);
  });
  it('minsta antal punkter: linje 2, yta 3', () => {
    expect(minPunkter('linje')).toBe(2);
    expect(minPunkter('yta')).toBe(3);
  });
});

describe('byggFigurMarkering — samma form som planeringens finishZoneFromCoords / finishLineFromCoords', () => {
  const val = (id: string) => SPARA_SOM.find((v) => v.id === id)!;
  it('zon (Blött): { id, zoneType, path, isZone } med sluten ring', () => {
    const m = byggFigurMarkering(val('blott'), tre, 123, tillSvg)!;
    expect(m).toEqual({
      id: 123, zoneType: 'wet', isZone: true,
      path: [{ x: 1505, y: -5635 }, { x: 1505.1, y: -5635 }, { x: 1505.1, y: -5635.1 }, { x: 1505, y: -5635 }],
    });
    const path = m.path as { x: number; y: number }[];
    expect(path[0]).toEqual(path[path.length - 1]);   // sluten
  });
  it('Hänsyn → zonen protected, Brant → steep', () => {
    expect(byggFigurMarkering(val('hansyn'), tre, 1, tillSvg)!.zoneType).toBe('protected');
    expect(byggFigurMarkering(val('brant'), tre, 1, tillSvg)!.zoneType).toBe('steep');
  });
  it('linje (Stickväg gul): { id, lineType, path, isLine } — ingen sluten ring', () => {
    const m = byggFigurMarkering(val('stickvag-gul'), tre.slice(0, 2), 7, tillSvg)!;
    expect(m).toEqual({ id: 7, lineType: 'sideRoadYellow', isLine: true, path: [{ x: 1505, y: -5635 }, { x: 1505.1, y: -5635 }] });
  });
  it('Stickväg röd/blå och Linje → rätt lineType', () => {
    const l2 = tre.slice(0, 2);
    expect(byggFigurMarkering(val('stickvag-rod'), l2, 1, tillSvg)!.lineType).toBe('sideRoadRed');
    expect(byggFigurMarkering(val('stickvag-bla'), l2, 1, tillSvg)!.lineType).toBe('sideRoadBlue');
    expect(byggFigurMarkering(val('linje'), l2, 1, tillSvg)!.lineType).toBe('trail');
  });
  it('Yta → eget område: traktgräns-markering med nummer och sluten ring (som planeringens Nytt område)', () => {
    const m = byggFigurMarkering(val('yta'), tre, 55, tillSvg, 4)!;
    expect(m).toMatchObject({ id: 55, isLine: true, lineType: 'boundary', nummer: 4 });
    const path = m.path as { x: number; y: number }[];
    expect(path).toHaveLength(4);
    expect(path[0]).toEqual(path[3]);
  });
  it('för få punkter → null (en halv figur sparas aldrig): yta med 2, linje med 1', () => {
    expect(byggFigurMarkering(val('blott'), tre.slice(0, 2), 1, tillSvg)).toBeNull();
    expect(byggFigurMarkering(val('linje'), tre.slice(0, 1), 1, tillSvg)).toBeNull();
    expect(byggFigurMarkering(val('yta'), [], 1, tillSvg, 1)).toBeNull();
  });
  it('en redan sluten ring dubbleras inte; ogiltiga punkter räknas inte', () => {
    const sluten: LngLat[] = [...tre, tre[0]];
    expect((byggFigurMarkering(val('blott'), sluten, 1, tillSvg)!.path as unknown[]).length).toBe(4);
    expect(byggFigurMarkering(val('blott'), [tre[0], tre[1], [NaN, 1] as any], 1, tillSvg)).toBeNull();
  });
});
