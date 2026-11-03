import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { OSM_TILL_ZOOM, arVagFC, nvdbTillVagar, tolkaWkt, vagBox, vagKlass, vagSlag, VAG_MARGINAL_M } from './vagar';
import { RITAD_LAGER, RITAD_NVDB_ID, grundKallor, grundLager } from './lager';
import { VAG_FARG, VAG_KANT, VEKTOR_LAGER } from './stil';
import { lagerRang } from '../lagerOrdning';

const TRAKT: [number, number][][] = [[[15.70, 56.80], [15.71, 56.80], [15.71, 56.81], [15.70, 56.80]]];

describe('Trafikverkets vägar (NVDB)', () => {
  it('rutan är trakten + marginal åt alla håll', () => {
    const b = vagBox(TRAKT)!;
    const dLat = VAG_MARGINAL_M / 111_320;
    expect(b.minLat).toBeCloseTo(56.80 - dLat, 6);
    expect(b.maxLat).toBeCloseTo(56.81 + dLat, 6);
    expect(b.minLon).toBeLessThan(15.70 - dLat);   // längdgraden är kortare så långt norrut: större marginal i grader
    expect(b.maxLon).toBeGreaterThan(15.71 + dLat);
    expect(vagBox([])).toBeNull();
  });

  it('WKT med och utan Z, och multilinjer', () => {
    expect(tolkaWkt('LINESTRING Z (15.7 56.8 120.5, 15.71 56.81 121)')).toEqual([[[15.7, 56.8], [15.71, 56.81]]]);
    expect(tolkaWkt('LINESTRING (15.7 56.8, 15.71 56.81)')).toEqual([[[15.7, 56.8], [15.71, 56.81]]]);
    expect(tolkaWkt('MULTILINESTRING Z ((1 2 0, 3 4 0), (5 6 0, 7 8 0))')).toEqual([[[1, 2], [3, 4]], [[5, 6], [7, 8]]]);
    expect(tolkaWkt('LINESTRING Z (15.7 56.8 1)')).toEqual([]);   // en punkt är ingen väg
    expect(tolkaWkt(undefined)).toEqual([]);
  });

  it('klassen: första heltalet 0–9 i ett fält som heter något med klass; annars okänd', () => {
    expect(vagKlass({ Klass: 3 })).toBe(3);
    expect(vagKlass({ Funktionell_vägklass: '8' })).toBe(8);
    expect(vagKlass({ Klass: 12, Annan: 2 })).toBeNull();
    expect(vagKlass({ Hastighet: 70 })).toBeNull();
  });

  it('0–5 är allmän väg, 6–9 och okänd är skogsväg', () => {
    expect(vagSlag(0)).toBe('stor');
    expect(vagSlag(5)).toBe('stor');
    expect(vagSlag(6)).toBe('skog');
    expect(vagSlag(9)).toBe('skog');
    expect(vagSlag(null)).toBe('skog');
  });

  it('rader → vägar; rader utan geometri hoppas över', () => {
    const fc = nvdbTillVagar([
      { Klass: 4, Geometry: { 'WKT-WGS84-3D': 'LINESTRING Z (15.7 56.8 0, 15.71 56.81 0)' } },
      { Klass: 9, Geometry: { 'WKT-WGS84-3D': 'LINESTRING Z (15.72 56.8 0, 15.73 56.81 0)' } },
      { Klass: 9 },
      null,
    ]);
    expect(fc.features.map((f) => f.properties.k)).toEqual(['stor', 'skog']);
    expect(arVagFC(fc)).toBe(true);
    expect(arVagFC({ features: 3 })).toBe(false);
  });
});

describe('vägarnas utseende (Martin 2026-11-03: grusfärg, aldrig vitt)', () => {
  it('grusfärg — inte vit (traktgräns, fastighetsgräns), inte orange (tall)', () => {
    for (const f of Object.values(VAG_FARG)) {
      expect(f.toLowerCase()).not.toBe('#ffffff');
      expect(f.toLowerCase()).not.toBe('#fff');
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16));
      expect(r).toBeGreaterThan(b);          // varm, sandig
      expect(r - b).toBeLessThan(100);       // men inte mättad orange
      expect(r + g + b).toBeGreaterThan(450); // ljus mot mörk skog
    }
    expect(VAG_KANT).toMatch(/^#1/);
  });

  it('OpenStreetMaps och Trafikverkets vägar har samma färger', () => {
    const osm = VEKTOR_LAGER.find((l) => l.id === 'rk-vag')!;
    const nvdb = grundLager().find((l: any) => l.id === RITAD_NVDB_ID.vag);
    expect(JSON.stringify(osm.paint['line-color'])).toContain(VAG_FARG.skog);
    expect(JSON.stringify(nvdb.paint['line-color'])).toContain(VAG_FARG.skog);
    expect(JSON.stringify(nvdb.paint['line-color'])).toContain(VAG_FARG.stor);
  });

  it('NVDB-lagren finns, har en källa, och alla vägkanter ligger under alla vägfyllningar', () => {
    expect(RITAD_LAGER).toContain(RITAD_NVDB_ID.kant);
    expect(RITAD_LAGER).toContain(RITAD_NVDB_ID.vag);
    expect(Object.keys(grundKallor())).toContain('ritad-nvdb');
    const kanter = ['ritad-vag-kant', 'ritad-nvdb-kant'].map((id) => lagerRang({ id } as any));
    const fyll = ['ritad-vag', 'ritad-nvdb'].map((id) => lagerRang({ id } as any));
    expect(Math.max(...kanter)).toBeLessThan(Math.min(...fyll));
    expect(Math.min(...fyll)).toBeGreaterThan(lagerRang({ id: 'ritad-blott-tat' } as any));
  });

  it('nyckeln stannar på servern', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '../../app/api/ritad-karta/vagar/route.ts'), 'utf8');
    expect(route).toContain('process.env.TRAFIKVERKET_API_KEY');
    expect(route).toContain('kravInloggad');
    const hook = fs.readFileSync(path.resolve(__dirname, '../hooks/useRitadKarta.ts'), 'utf8');
    expect(hook).not.toContain('TRAFIKVERKET');
    expect(hook).toContain("'/api/ritad-karta/vagar'");
  });
});

describe('OpenStreetMap och Trafikverket delar på zoomen (Martin 2026-11-03: "det känns dubbelt")', () => {
  it('Trafikverkets vägar börjar där OpenStreetMaps slutar', () => {
    for (const l of grundLager().filter((l: any) => l.id.startsWith('ritad-nvdb'))) expect(l.minzoom).toBe(OSM_TILL_ZOOM);
  });
  it('hooken byter OSM:s zoomgräns, aldrig ett filter på plats (OSM:s kartrutor är för stora för within)', () => {
    const hook = fs.readFileSync(path.resolve(__dirname, '../hooks/useRitadKarta.ts'), 'utf8');
    expect(hook).toContain('setLayerZoomRange');
    expect(hook).not.toContain("'within'");
  });
});
