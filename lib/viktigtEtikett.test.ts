// VIKTIGT SOM ETIKETT I KÖRVYN (Martin 2026-11-23): var etiketterna står, och att sidan kopplar dem rätt (bara körvyn, aldrig nedtonad, enda undantaget från "ingen text på kartan").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VIKTIGT_LAGER, viktigtEtikettText, viktigtLager, viktigtPunkter } from './viktigtEtikett';
import { SYMBOL_UNDANTAG } from './symbolZoom';
import { RANG, harEgenRegel, lagerRang } from './lagerOrdning';

const kvadrat = (lon: number, lat: number, d = 0.0005) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const hansyn = (lopnr: string) => ({ type: 'Feature', geometry: kvadrat(15, 56), properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: lopnr } });

describe('viktigtPunkter', () => {
  it('en symbol: etiketten står OVANFÖR symbolen (ovan = true), med ⚠ och Viktigt-raden', () => {
    const fc = viktigtPunkter({ viktigt: new Map([['marker:7', 'Skarpt stup']]), symboler: [{ id: 7, lng: 15.1, lat: 56.1 }], egna: [] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([15.1, 56.1]);
    expect(fc.features[0].properties).toMatchObject({ id: 'marker:7', text: '⚠ Skarpt stup', ovan: true });
    expect(viktigtEtikettText('x')).toBe('⚠ x');
  });

  it('Vidas hänsynsyta: etiketten står inne i ytan (mitt), via ytans nyckel hansyn:<LOPNR>', () => {
    const fc = viktigtPunkter({ viktigt: new Map([['hansyn:3', 'Kör inte här']]), symboler: [], egna: [], vida: { features: [hansyn('3')] } });
    expect(fc.features).toHaveLength(1);
    const [lng, lat] = fc.features[0].geometry.coordinates;
    expect(Math.abs(lng - 15)).toBeLessThan(0.0006);
    expect(Math.abs(lat - 56)).toBeLessThan(0.0006);
    expect(fc.features[0].properties.ovan).toBe(false);
  });

  it('egen yta och egen linje: mitt i ytan resp. halvvägs längs linjen', () => {
    const fc = viktigtPunkter({
      viktigt: new Map([['marker:1', 'Yta'], ['marker:2', 'Linje']]), symboler: [],
      egna: [
        { id: 1, slag: 'yta', coords: [[15, 56], [15.002, 56], [15.002, 56.002], [15, 56.002], [15, 56]] },
        { id: 2, slag: 'linje', coords: [[15, 56], [15.002, 56]] },
      ],
    });
    expect(fc.features.map((f) => f.properties.id).sort()).toEqual(['marker:1', 'marker:2']);
    const linje = fc.features.find((f) => f.properties.id === 'marker:2')!;
    expect(linje.geometry.coordinates[0]).toBeCloseTo(15.001, 4);
  });

  it('bara det som har en Viktigt-rad får en etikett, och en nyckel ger aldrig två', () => {
    const fc = viktigtPunkter({
      viktigt: new Map([['marker:7', 'A']]), symboler: [{ id: 7, lng: 1, lat: 1 }, { id: 8, lng: 2, lat: 2 }, { id: 7, lng: 3, lat: 3 }], egna: [],
      vida: { features: [hansyn('9')] },
    });
    expect(fc.features).toHaveLength(1);
  });

  it('inga Viktigt-rader → inga etiketter', () => {
    expect(viktigtPunkter({ viktigt: new Map(), symboler: [{ id: 1, lng: 1, lat: 1 }], egna: [], vida: { features: [hansyn('1')] } }).features).toHaveLength(0);
  });
});

describe('lagret', () => {
  const l = viktigtLager();
  it('gul text med mörk kant, full opacitet och aldrig bortvald av kollision', () => {
    expect(l.paint['text-color']).toBe('#ffd60a');
    expect(l.paint['text-opacity']).toBe(1);
    expect(l.layout['text-allow-overlap']).toBe(true);
    expect(l.layout['text-ignore-placement']).toBe(true);
    expect(l.paint['text-halo-width']).toBeGreaterThan(2);
  });
  it('klipps inte på zoom och ligger över övriga etiketter', () => {
    expect(SYMBOL_UNDANTAG).toContain(VIKTIGT_LAGER);
    expect(harEgenRegel(VIKTIGT_LAGER)).toBe(true);
    const rang = lagerRang({ id: VIKTIGT_LAGER, type: 'symbol', harText: true, harIkon: false });
    expect(rang).toBeGreaterThan(lagerRang({ id: 'zone-label', type: 'symbol', harText: true, harIkon: false }));
    expect(rang).toBeGreaterThanOrEqual(RANG.etiketter);
    // ... men under verktygen (rita, mäta): de tar emot tryck och måste synas över.
    expect(rang).toBeLessThan(lagerRang({ id: 'measure-line', type: 'line' }));
  });
});

describe('sidans koppling (källvakt)', () => {
  const sida = readFileSync('app/planering/page.tsx', 'utf8');
  it('lagret är med i körvyns whitelist (prefixet viktigt-)', () => {
    expect(sida).toMatch(/KEEP_PREFIX = \[[^\]]*'viktigt-'\]/);
  });
  it('etiketterna fylls BARA i körvyn: utanför körvyn töms källan', () => {
    expect(sida).toMatch(/if \(!korvyActive \|\| objektSaknarPosition \|\| viktigtNu\.size === 0\) \{ src\.setData\(\{ type: 'FeatureCollection', features: \[\] \}\); return; \}/);
  });
  it('en symbol med Viktigt tonas aldrig ned av avstånd (narStyrka får fara-flaggan)', () => {
    expect(sida).toMatch(/narStyrka\(dist, KORVY_FARO_TYPER\.has\(String\(m\.type\)\) \|\| viktigtNycklar\.has\(markerNyckel\(m\.id\)\)\)/);
  });
  it('kartan ritar etiketten med sitt eget lager (inget annat lager läser Viktigt-texten)', () => {
    expect(sida).toContain("map.addLayer(viktigtLager())");
    expect(sida.match(/viktigtLager\(\)/g)).toHaveLength(1);
  });
});
