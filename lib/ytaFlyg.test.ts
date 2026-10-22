import { describe, expect, it } from 'vitest';
import { geometriBounds, ytaGeo, ytaKameraPadding } from './ytaFlyg';
import { ARK_HOJD_ANDEL } from './objektKarta';

const kv = (lon: number, lat: number, d = 0.001) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const vida = (LOPNR: number, lon: number) => ({ type: 'Feature', geometry: kv(lon, 56.35), properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', TYP: '24', LOPNR } });
const svg = (x: number, y: number) => ({ lat: y, lon: x });

describe('geometriBounds', () => {
  it('ram runt en polygon och en multipolygon; tom geometri ger null', () => {
    expect(geometriBounds(kv(15, 56))).toEqual([[14.999, 55.999], [15.001, 56.001]]);
    expect(geometriBounds({ coordinates: [kv(15, 56).coordinates, kv(16, 57).coordinates] })).toEqual([[14.999, 55.999], [16.001, 57.001]]);
    expect(geometriBounds({ coordinates: [] })).toBeNull();
    expect(geometriBounds(null)).toBeNull();
  });
});

describe('ytaGeo — rätt yta för områdets nyckel', () => {
  const features = [vida(1, 15.03), vida(4, 15.06)];
  it('Vidas tilläggsyta på nyckeln hansyn:<LOPNR>', () => {
    const g = ytaGeo({ nyckel: 'hansyn:4', features, markers: [], svgToLatLon: svg })!;
    expect(g.bounds[0][0]).toBeCloseTo(15.059, 6);
    expect(g.geometri.type).toBe('Polygon');
  });
  it('egen ritad zon (marker:<id>) och eget område (omrade:<id>) ur svg-punkterna', () => {
    const path = [{ x: 15, y: 56 }, { x: 15.002, y: 56 }, { x: 15.002, y: 56.002 }];
    const markers = [{ id: 7, isZone: true, path }, { id: 8, isLine: true, lineType: 'boundary', path }];
    expect(ytaGeo({ nyckel: 'marker:7', features: [], markers, svgToLatLon: svg })!.bounds).toEqual([[15, 56], [15.002, 56.002]]);
    expect(ytaGeo({ nyckel: 'omrade:8', features: [], markers, svgToLatLon: svg })!.geometri.type).toBe('Polygon');
  });
  it('okänd nyckel, en linje eller en punkt ger null — raden gör då ingenting', () => {
    expect(ytaGeo({ nyckel: 'hansyn:99', features, markers: [], svgToLatLon: svg })).toBeNull();
    expect(ytaGeo({ nyckel: 'hansyn:1', features: [{ geometry: { type: 'Point', coordinates: [15, 56] }, properties: vida(1, 15).properties }], markers: [], svgToLatLon: svg })).toBeNull();
    expect(ytaGeo({ nyckel: 'hansyn:1', features: null, markers: [], svgToLatLon: svg })).toBeNull();
  });
});

describe('ytaKameraPadding — ytan hamnar i den del av kartan som syns', () => {
  const o = { fonsterH: 844, panelBreddPx: 436, luft: 64, toppLuft: 96 };
  it('bred skärm: panelen från höger täcker höger sida', () => {
    expect(ytaKameraPadding('panel', o)).toEqual({ top: 96, bottom: 64, left: 64, right: 64 + 436 });
  });
  it('telefon: arket nerifrån täcker nedre halvan (samma andel som övriga ark)', () => {
    expect(ytaKameraPadding('ark', o)).toEqual({ top: 96, bottom: Math.round(844 * ARK_HOJD_ANDEL) + 64, left: 64, right: 64 });
  });
});
