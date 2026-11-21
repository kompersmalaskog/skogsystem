import { describe, it, expect } from 'vitest';
import { iSkogen, langstLegat, skogLage, stegFor, period, type StegIndata } from './iSkogen';
import type { UppfoljningObjekt } from './transform';

// 21 nov 2026 kl 18 svensk tid.
const NU = Date.parse('2026-11-21T17:00:00Z');

const obj = (p: Partial<UppfoljningObjekt>): UppfoljningObjekt => ({
  namn: 'X', vo_nummer: '1', volymSkordare: 100, volymSkotare: 0, sistaAvverkning: null,
  egenSkotning: false, skotareLastDate: null, skotareSlut: null,
  ...p,
} as UppfoljningObjekt);

describe('skogLage', () => {
  it('räknar kalenderdagar sedan sista fällningen', () => {
    expect(skogLage(obj({ sistaAvverkning: '2026-11-02' }), false, NU)).toEqual({ lage: 'vantar', dagar: 19 });
    expect(skogLage(obj({ sistaAvverkning: '2026-11-02', volymSkotare: 440 }), false, NU)).toEqual({ lage: 'skotas', dagar: 19 });
  });
  it('skördaren kör → inga dagar', () => {
    expect(skogLage(obj({ sistaAvverkning: '2026-11-21' }), true, NU)).toEqual({ lage: 'skordas' });
  });
  it('saknat datum gissas aldrig', () => {
    expect(skogLage(obj({}), false, NU)).toEqual({ lage: 'okant' });
  });
});

describe('iSkogen', () => {
  const kvar = (o: UppfoljningObjekt) => o.volymSkordare - o.volymSkotare;
  it('längst legat först, skördas sist, egen skotning bort', () => {
    const a = obj({ namn: 'Arvidstorp', sistaAvverkning: '2026-11-02', volymSkotare: 440, volymSkordare: 628 });
    const b = obj({ namn: 'Bondagård', sistaAvverkning: '2026-11-16' });
    const s = obj({ namn: 'Santhe', sistaAvverkning: '2026-11-21' });
    const e = obj({ namn: 'Egen', sistaAvverkning: '2026-10-01', egenSkotning: true });
    const { rader } = iSkogen([b, s, a, e], [], o => o === s, kvar, NU);
    expect(rader.map(r => r.o.namn)).toEqual(['Arvidstorp', 'Bondagård', 'Santhe']);
    expect(rader[0].kvarM3).toBe(188);
    expect(langstLegat(rader)).toBe(19);
  });
  it('bara skörd pågår → inget längst-tal', () => {
    const s = obj({ sistaAvverkning: '2026-11-21' });
    expect(langstLegat(iSkogen([s], [], () => true, kvar, NU).rader)).toBeNull();
  });
  it('klara: dagar till sista lasset, bara senaste 30 dagarna, senast först', () => {
    const sk = obj({ namn: 'Skälviken', sistaAvverkning: '2026-10-28', skotareLastDate: '2026-11-12' });
    const mo = obj({ namn: 'Mölleryd', sistaAvverkning: '2026-10-21', skotareLastDate: '2026-10-26' });
    const gammal = obj({ namn: 'Gammal', sistaAvverkning: '2026-09-01', skotareLastDate: '2026-09-20' });
    const { klara } = iSkogen([], [mo, gammal, sk], () => false, kvar, NU);
    expect(klara.map(k => [k.o.namn, k.dagar])).toEqual([['Skälviken', 15], ['Mölleryd', 5]]);
  });
});

const bas: StegIndata = {
  skordarDagar: ['2026-10-28', '2026-10-30', '2026-11-02'], skordareStart: null, sistaAvverkning: '2026-11-02',
  skordareKlar: true, lassDagar: ['2026-11-13', '2026-11-17'], skotareStart: null, skotareLastDate: null,
  skotningKlar: false, egenSkotning: false,
};

describe('stegFor', () => {
  it('Arvidstorp: fällde, väntade 10 dagar, kör', () => {
    const s = stegFor(bas, '2026-11-21');
    expect(s.map(x => x.rubrik)).toEqual(['Skördaren fällde', 'Virket väntade', 'Skotaren kör']);
    expect(s[0].under).toBe('28 okt – 2 nov · 6 dagar');
    expect(s[1].under).toBe('10 dagar');
    expect(s[2].under).toBe('sedan 13 nov');
  });
  it('skotaren har inte börjat: väntar sedan skördaren blev klar', () => {
    const s = stegFor({ ...bas, lassDagar: [] }, '2026-11-21');
    expect(s.map(x => x.rubrik)).toEqual(['Skördaren fällde', 'Virket väntar']);
    expect(s[1].under).toBe('19 dagar · skotaren har inte börjat');
  });
  it('skotaren började medan skördaren körde → ingen väntan', () => {
    const s = stegFor({ ...bas, lassDagar: ['2026-10-30', '2026-11-05'], skotningKlar: true }, '2026-11-21');
    expect(s.map(x => x.slag)).toEqual(['skordare', 'skotare']);
    expect(s[1].under).toBe('30 okt – 5 nov · 7 dagar');
  });
  it('skördaren kör fortfarande', () => {
    const s = stegFor({ ...bas, skordareKlar: false, lassDagar: [] }, '2026-11-21');
    expect(s).toEqual([{ slag: 'skordare', rubrik: 'Skördaren fäller', under: 'sedan 28 okt · 25 dagar' }]);
  });
  it('egen skotning: bara skördaren', () => {
    expect(stegFor({ ...bas, egenSkotning: true }, '2026-11-21').map(x => x.slag)).toEqual(['skordare']);
  });
});

describe('period', () => {
  it('pågår → till idag; klart → till sista lasset', () => {
    expect(period(bas, '2026-11-21')).toEqual({ fran: '2026-10-28', till: '2026-11-21' });
    expect(period({ ...bas, skotningKlar: true }, '2026-11-21')).toEqual({ fran: '2026-10-28', till: '2026-11-17' });
  });
  it('ingen första dag → ingen period', () => {
    expect(period({ ...bas, skordarDagar: [] }, '2026-11-21')).toBeNull();
  });
});
