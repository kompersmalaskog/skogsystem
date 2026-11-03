import { describe, expect, it } from 'vitest';
import { filFel, ordna, radUnder, svar, type Kemikalie } from './kemikalier';
import { byggRader } from './oversikt';

const k = (namn: string, blad: boolean, varFinns: string | null = 'Verkstaden'): Kemikalie =>
  ({ id: namn, namn, varFinns, sdbSokvag: blad ? `${namn}/1.pdf` : null, sdbTid: blad ? '2026-11-03T10:00:00Z' : null, etikettSokvag: null });

describe('kemikalier', () => {
  it('svaret säger hur många som saknar blad', () => {
    expect(svar([])).toMatchObject({ text: 'Inga produkter än' });
    expect(svar([k('A', true), k('B', true)])).toEqual({ text: 'Säkerhetsblad finns för allt', under: '2 produkter' });
    expect(svar([k('A', false), k('B', true)])).toEqual({ text: '1 saknar säkerhetsblad', under: '2 produkter', ton: 'orange' });
    expect(svar([k('A', false), k('B', false)]).text).toBe('2 saknar säkerhetsblad');
  });

  it('de som saknar blad står först, sedan bokstavsordning', () => {
    expect(ordna([k('Ö', true), k('B', false), k('A', true), k('C', false)]).map(x => x.namn)).toEqual(['B', 'C', 'A', 'Ö']);
  });

  it('raden säger var den finns, eller att det inte är ifyllt', () => {
    expect(radUnder(k('A', true, 'Giant'))).toBe('Giant');
    expect(radUnder(k('A', true, '  '))).toBe('Var den finns är inte ifyllt');
  });

  it('bara PDF upp till 20 MB', () => {
    expect(filFel({ type: 'application/pdf', size: 1000, name: 'a.pdf' })).toBeNull();
    expect(filFel({ type: '', size: 1000, name: 'A.PDF' })).toBeNull();
    expect(filFel({ type: 'image/jpeg', size: 1000, name: 'a.jpg' })).toMatch(/PDF/);
    expect(filFel({ type: 'application/pdf', size: 21 * 1024 * 1024, name: 'a.pdf' })).toMatch(/20 MB/);
  });

  describe('raden på Arbetsmiljö', () => {
    const bas = { serArbetsledning: false, arAdmin: false, medarbetareId: 'm', maskinkoll: 0, atgarder: null, skyddsrond: null, risk: null };
    const rad = (d: object) => byggRader({ ...bas, ...d } as never).find(r => r.id === 'kemikalier');

    it('saknat blad är att göra för admin men information för föraren', () => {
      expect(rad({ arAdmin: true, kemikalier: [k('A', false)] })).toMatchObject({ under: '1 saknar säkerhetsblad', ton: 'orange', attGora: true });
      expect(rad({ kemikalier: [k('A', false)] })).toMatchObject({ under: '1 saknar säkerhetsblad', attGora: false });
    });
    it('allt finns', () => {
      expect(rad({ kemikalier: [k('A', true)] })).toMatchObject({ under: 'Säkerhetsblad finns för allt · 1 produkt', attGora: false });
    });
    it('läsfel säger det, aldrig "allt finns"', () => {
      expect(rad({ kemikalier: null })).toMatchObject({ fel: true });
    });
    it('utan data visas ingen rad', () => {
      expect(rad({})).toBeUndefined();
    });
  });
});
