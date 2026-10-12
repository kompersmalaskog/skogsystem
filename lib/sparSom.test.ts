import { describe, it, expect } from 'vitest';
import { SPARA_SOM, valForFigur, minPunkter, byggFigurMarkering, type LngLat } from './sparSom';
import { ZONE_COLORS } from './zone-colors';

// Samma omvandling som sidans latLonToSvg i testen: (lat, lng) → {x, y}, entydig och enkel att kontrollera.
const tillSvg = (lat: number, lng: number) => ({ x: Math.round(lng * 1000) / 10, y: Math.round(-lat * 1000) / 10 });
const tre: LngLat[] = [[15.05, 56.35], [15.051, 56.35], [15.051, 56.351]];

describe('Spara som — sex val (Martins mappning 2026-10-06)', () => {
  it('KODBEVIS: blött, hänsyn, brant, yta (ytor) och stickväg, linje (linjer)', () => {
    expect(valForFigur('yta').map((v) => v.etikett)).toEqual(['Blött', 'Hänsyn', 'Brant', 'Yta']);
    expect(valForFigur('linje').map((v) => v.etikett)).toEqual(['Stickväg', 'Linje']);
    expect(SPARA_SOM).toHaveLength(6);
  });
  it('KODBEVIS (Martins mappning): Blött → zon wet, Brant → zon steep, Hänsyn → zon protected, Stickväg → sideRoadRed (standardfärg), Linje → trail, Yta → eget område', () => {
    const mal = Object.fromEntries(SPARA_SOM.map((v) => [v.id, v.mal]));
    expect(mal).toEqual({
      blott: { slag: 'zon', zoneType: 'wet' },
      brant: { slag: 'zon', zoneType: 'steep' },
      hansyn: { slag: 'zon', zoneType: 'protected' },
      stickvag: { slag: 'linje', lineType: 'sideRoadRed' },
      linje: { slag: 'linje', lineType: 'trail' },
      yta: { slag: 'eget-omrade' },
    });
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
  it('linje (Stickväg): { id, lineType: sideRoadRed, path, isLine } — ingen sluten ring', () => {
    const m = byggFigurMarkering(val('stickvag'), tre.slice(0, 2), 7, tillSvg)!;
    expect(m).toEqual({ id: 7, lineType: 'sideRoadRed', isLine: true, path: [{ x: 1505, y: -5635 }, { x: 1505.1, y: -5635 }] });
  });
  it('Linje → trail (vanlig linje)', () => {
    expect(byggFigurMarkering(val('linje'), tre.slice(0, 2), 1, tillSvg)!.lineType).toBe('trail');
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
