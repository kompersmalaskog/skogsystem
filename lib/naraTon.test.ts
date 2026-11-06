import { describe, it, expect } from 'vitest';
import { cirkel, meterMellan, naraTonYta, NARA_RINGAR } from './naraTon';
import { lagerRang } from './lagerOrdning';

describe('nära-tonen i skotarläget', () => {
  it('utan position: ingen ton; med position en ring per avstånd med hål runt maskinen', () => {
    expect(naraTonYta(null).features).toHaveLength(0);
    const y = naraTonYta({ lat: 56.3, lng: 15.4 });
    expect(y.features).toHaveLength(NARA_RINGAR.length);
    const hal = (y.features[0].geometry as any).coordinates[1] as [number, number][];
    expect(meterMellan({ lat: 56.3, lng: 15.4 }, { lat: hal[5][1], lng: hal[5][0] })).toBeCloseTo(NARA_RINGAR[0].radieM, -1);
  });
  it('ringarna blir större utåt och längst bort är det högst ca 40 % mörkare', () => {
    for (let i = 1; i < NARA_RINGAR.length; i++) expect(NARA_RINGAR[i].radieM).toBeGreaterThan(NARA_RINGAR[i - 1].radieM);
    const ljus = NARA_RINGAR.reduce((p, r) => p * (1 - r.op), 1);
    expect(1 - ljus).toBeLessThanOrEqual(0.45);
  });
  it('cirkeln är sluten', () => {
    const c = cirkel(56, 15, 100);
    expect(c[0][0]).toBeCloseTo(c[c.length - 1][0], 9);
  });
});

describe('nära-tonen i lagerordningen', () => {
  it('över vägar och spår, under linjer man ska vara rädd om, högar och symboler', () => {
    const r = (id: string, type = 'line') => lagerRang({ id, type });
    const ton = r('skotar-nara-ton', 'fill');
    expect(ton).toBeGreaterThan(r('line-mainRoad-base'));
    expect(ton).toBeGreaterThan(r('hyttspar-egen-mitt'));
    expect(ton).toBeLessThan(r('trakt-kraftledning-line'));
    expect(ton).toBeLessThan(r('skotar-hogar-dots', 'circle'));
    expect(ton).toBeLessThan(r('markers-layer', 'symbol'));
    expect(ton).toBeLessThan(r('larm-pin', 'symbol'));
  });
});
