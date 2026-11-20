import { describe, expect, it } from 'vitest';
import { linjeGeometriNyckel, medVidaNycklar, vidaNycklar } from './vidaNycklar';
import { vidaObjekt } from './larm/objekt';

const O = { lat: 56.5, lon: 14.7 };
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos(56.5 * Math.PI / 180));
const c = (ost: number, nord: number): [number, number] => [O.lon + ost * M_LON, O.lat + nord * M_LAT];
const linje = (beskr: string, pts: [number, number][], typ: 'LineString' | 'MultiLineString' = 'LineString') =>
  ({ type: 'Feature', properties: { _typ: 'linje', _lager: 'L_TILLAGGSLINJER', FLBESKR: beskr }, geometry: typ === 'LineString' ? { type: 'LineString', coordinates: pts.map(([x, y]) => c(x, y)) } : { type: 'MultiLineString', coordinates: [pts.map(([x, y]) => c(x, y))] } });

// Två kraftledningar på samma trakt: "låg ledning vid bäcken" (A) och en annan (B).
const A = () => linje('Kraftledning', [[-120, 40], [-30, 42], [60, 35]]);
const B = () => linje('Kraftledning', [[-100, -60], [0, -55], [140, -70]]);

describe('Vidas linjer nycklas på geometrin', () => {
  it('nyckeln är linje:<hash> — inte beskrivning och ordning', () => {
    const k = vidaNycklar([A(), B()]);
    expect(k[0]).toMatch(/^linje:[0-9a-f]{8}$/);
    expect(k[1]).toMatch(/^linje:[0-9a-f]{8}$/);
    expect(k[0]).not.toBe(k[1]);
    expect(k[0]).not.toContain('kraftledning');
  });

  it('en omimport i ANNAN ORDNING ger samma nyckel per linje', () => {
    const fore = vidaNycklar([A(), B()]);
    const efter = vidaNycklar([B(), A()]);
    expect(efter[0]).toBe(fore[1]);
    expect(efter[1]).toBe(fore[0]);
  });

  it('kommentaren sitter kvar på RÄTT ledning efter en omimport i ny ordning (och med nya rader emellan)', () => {
    const [nyckelA] = vidaNycklar([A(), B()]);
    const kommentarer = { [nyckelA!]: 'Låg ledning vid bäcken' };
    const rattOrd = vidaObjekt({ features: [A(), B()] }, O, 60, kommentarer);
    const omvandOrd = vidaObjekt({ features: [linje('Basväg', [[0, 0], [50, 0]]), B(), A()] }, O, 60, kommentarer);
    const medKomm = (u: ReturnType<typeof vidaObjekt>) => u.filter((o) => o.kommentar);
    expect(medKomm(rattOrd)).toHaveLength(1);
    expect(medKomm(omvandOrd)).toHaveLength(1);
    // Samma ledning i båda: den som ligger ~40 m norr om punkten (A), inte den södra (B).
    expect(medKomm(rattOrd)[0].avstandM).toBeCloseTo(medKomm(omvandOrd)[0].avstandM as number, 0);
    expect(medKomm(omvandOrd)[0].avstandM).toBeGreaterThan(30);
    expect(medKomm(omvandOrd)[0].avstandM).toBeLessThan(50);
  });

  it('en linje som levereras åt andra hållet får samma nyckel', () => {
    const fram = A();
    const bak = { ...A(), geometry: { type: 'LineString', coordinates: [...A().geometry.coordinates].reverse() } };
    expect(vidaNycklar([bak])[0]).toBe(vidaNycklar([fram])[0]);
  });

  it('ändrad beskrivning ändrar inte nyckeln', () => {
    expect(vidaNycklar([linje('Kraftledning 12 kV', [[-120, 40], [-30, 42], [60, 35]])])[0]).toBe(vidaNycklar([A()])[0]);
  });

  it('en bråkdel av en meter i leveransen ger samma nyckel; en flyttad ändpunkt (>1 m) eller en annan längd ger en ny', () => {
    const brus = linje('Kraftledning', [[-120.0002, 40.0003], [-30, 42.0001], [60.0002, 35]]);
    expect(vidaNycklar([brus])[0]).toBe(vidaNycklar([A()])[0]);
    expect(vidaNycklar([linje('Kraftledning', [[-120, 40], [-30, 42], [95, 35]])])[0]).not.toBe(vidaNycklar([A()])[0]);
    expect(vidaNycklar([linje('Kraftledning', [[-123, 40], [-30, 42], [60, 35]])])[0]).not.toBe(vidaNycklar([A()])[0]);
  });

  it('två exakt lika linjer får ett löpnummer efter den första; en MultiLineString nyckelas som sin sammanfogade linje', () => {
    const k = vidaNycklar([A(), A()]);
    expect(k[0]).toMatch(/^linje:[0-9a-f]{8}$/);
    expect(k[1]).toBe(`${k[0]}~2`);
    expect(vidaNycklar([linje('Kraftledning', [[-120, 40], [-30, 42], [60, 35]], 'MultiLineString')])[0]).toBe(k[0]);
  });

  it('ytor och punkter behåller sina egna nycklar; en linje utan punkter får ingen nyckel', () => {
    const hansyn = { type: 'Feature', properties: { _lager: 'L_TILLAGGSYTOR', LOPNR: '7' }, geometry: { type: 'Polygon', coordinates: [[c(0, 0), c(1, 0), c(1, 1), c(0, 0)]] } };
    const tom = { type: 'Feature', properties: { _typ: 'linje', _lager: 'L_TILLAGGSLINJER' }, geometry: { type: 'LineString', coordinates: [] } };
    expect(vidaNycklar([hansyn, tom])).toEqual(['hansyn:7', null]);
    expect(linjeGeometriNyckel(null)).toBeNull();
  });

  it('medVidaNycklar sätter _nyckel på featuren och rör inte indatan', () => {
    const fc = { features: [A()] };
    const ut = medVidaNycklar(fc);
    expect((ut.features![0].properties as any)._nyckel).toBe(vidaNycklar(fc.features)[0]);
    expect((fc.features[0].properties as any)._nyckel).toBeUndefined();
  });
});
