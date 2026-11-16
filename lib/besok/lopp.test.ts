import { describe, it, expect } from 'vitest';
import { byggLopp, RUBRIK, type LoppIndata } from './lopp';

const grund: LoppIndata = { gallring: false, avslutat: false, harSkordat: false, harSkotat: false, skordningKlar: false, skotningKlar: false, egenSkotning: false, roller: [] };
const lagen = (d: Partial<LoppIndata>) => byggLopp({ ...grund, ...d }).steg.map((s) => `${s.id}:${s.lage}`);

describe('loppet på markägarens länk', () => {
  it('inget har hänt: allt kommer sen och rubriken säger att vi inte börjat', () => {
    const l = byggLopp(grund);
    expect(l.rubrik).toBe(RUBRIK.ingenStart);
    expect(lagen({})).toEqual(['skordare:vantar', 'skotare:vantar', 'klart:vantar']);
  });
  it('skördaren står på trakten: rubriken är svaret och steget pågår', () => {
    const l = byggLopp({ ...grund, roller: ['skordare'] });
    expect(l.rubrik).toBe('Skördaren arbetar nu');
    expect(l.steg[0].lage).toBe('pagar');
  });
  it('båda maskinerna på trakten: båda pågår och rubriken säger båda', () => {
    expect(byggLopp({ ...grund, roller: ['skordare', 'skotare'], harSkordat: true }).rubrik).toBe(RUBRIK.bada);
    expect(lagen({ roller: ['skordare', 'skotare'] })).toEqual(['skordare:pagar', 'skotare:pagar', 'klart:vantar']);
  });
  it('skördningen avslutad och skotaren kör: grön bock, sedan pågår', () => {
    const d = { harSkordat: true, skordningKlar: true, harSkotat: true, roller: ['skotare'] as const };
    expect(byggLopp({ ...grund, ...d }).rubrik).toBe('Skotaren kör ut virket');
    expect(lagen(d)).toEqual(['skordare:klar', 'skotare:pagar', 'klart:vantar']);
  });
  it('maskinen har kört men står inte här nu (regn, haveri, helg): steget pågår fortfarande, rubriken säger att ingen maskin är här', () => {
    const l = byggLopp({ ...grund, harSkordat: true });
    expect(l.rubrik).toBe(RUBRIK.ingenNu);
    expect(l.steg[0].lage).toBe('pagar');
  });
  it('avslutat objekt: allt klart', () => {
    expect(byggLopp({ ...grund, avslutat: true }).rubrik).toBe('Vi är klara');
    expect(lagen({ avslutat: true })).toEqual(['skordare:klar', 'skotare:klar', 'klart:klar']);
  });
  it('markägaren skotar själv: inget skotarsteg, och Klart lovar inget om virke vid vägen', () => {
    const l = byggLopp({ ...grund, egenSkotning: true, gallring: true });
    expect(l.steg.map((s) => s.id)).toEqual(['skordare', 'klart']);
    expect(l.steg[0].text).toBe('Gallrar skogen');
    expect(l.steg[1].text).not.toMatch(/väg/);
  });
  it('aldrig procent eller datum i loppet', () => {
    const l = byggLopp({ ...grund, harSkordat: true, harSkotat: true, roller: ['skordare'] });
    expect(JSON.stringify(l)).not.toMatch(/%|\d/);
  });
});
