import { describe, it, expect } from 'vitest';
import { atgardPoster, tidigasteFore, unikaMarkorer, type DatumPunkt, type Markor } from './atgarder';
import { statistik } from './statistik';

/** n punkter per dag, `traff` av dem inom ±4 mm. */
const dagar = (fran: string, antal: number, perDag: number, traff: number): DatumPunkt[] => {
  const ut: DatumPunkt[] = [];
  for (let d = 0; d < antal; d++) {
    const datum = new Date(new Date(`${fran}T00:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
    for (let i = 0; i < perDag; i++) ut.push({ datum, avvik: i < traff ? 1 : 9 });
  }
  return ut;
};
const atg = (datum: string, text = 'Höjt trycket'): Markor => ({ datum, kalla: 'atgard', text });
const rep = (datum: string): Markor => ({ datum, kalla: 'reparation', text: 'Reparation av mätsystem' });

describe('markörerna', () => {
  it('dubbletter slås ihop (en reparation loggas för både längd och diameter), äldst först', () => {
    expect(unikaMarkorer([atg('2026-07-18'), rep('2026-03-07'), rep('2026-03-07')]).map(m => m.datum)).toEqual(['2026-03-07', '2026-07-18']);
  });
  it('en kalibrering ur historiken är en markör med egen före/efter (sorten behålls)', () => {
    expect(unikaMarkorer([{ datum: '2026-05-01', kalla: 'kalibrering', text: 'Diameterkalibrering tall' }])).toEqual([{ datum: '2026-05-01', kalla: 'kalibrering', text: 'Diameterkalibrering tall' }]);
  });
  it('tidigaste "före" = 90 dagar före äldsta markören', () => {
    expect(tidigasteFore([atg('2026-07-18'), rep('2026-03-07')])).toBe('2025-12-07');
    expect(tidigasteFore([])).toBeNull();
  });
});

describe('automatiska kalibreringsmarkörer bryter inte förarens åtgärd', () => {
  const kal = (datum: string): Markor => ({ datum, kalla: 'kalibrering', text: 'Diameterkalibrering tall' });
  // 30 dagar före (30 mått) och en kalibrering efter 4 dagar: åtgärdens efter-period ska fortfarande vara allt till nästa ÅTGÄRD, inte till kalibreringen.
  const punkter = [...dagar('2026-06-18', 30, 1, 1), ...dagar('2026-07-18', 40, 1, 1)];
  it('förarens åtgärd: efter slutar vid nästa åtgärd eller reparation, inte vid en kalibrering', () => {
    const poster = atgardPoster({ markorer: [atg('2026-07-18'), kal('2026-07-22')], punkter, tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(poster.find(p => p.kalla === 'atgard')).toMatchObject({ nEfter: 40, forTidigt: false });
  });
  it('en kalibrering slutar vid nästa markör av vilket slag som helst', () => {
    const poster = atgardPoster({ markorer: [atg('2026-07-01'), kal('2026-07-10'), kal('2026-07-20')], punkter: dagar('2026-07-01', 40, 1, 1), tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(poster.find(p => p.datum === '2026-07-10')?.nEfter).toBe(10);
  });
});

describe('före och efter', () => {
  it('90 dagar före markören mot allt efter — för den sista markören', () => {
    const punkter = [...dagar('2026-04-19', 90, 5, 3), ...dagar('2026-07-18', 30, 5, 5)]; // 450 före (60 %), 150 efter (100 %)
    const [p] = atgardPoster({ markorer: [atg('2026-07-18')], punkter, tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(p).toMatchObject({ datum: '2026-07-18', kalla: 'atgard', forTidigt: false, nFore: 450, nEfter: 150 });
    expect(p.fore?.traffPct).toBe(60);
    expect(p.efter?.traffPct).toBe(100);
  });
  it('markörens egen dag räknas som efter, dagen före som före', () => {
    const punkter = [...dagar('2026-07-17', 1, 40, 0), ...dagar('2026-07-18', 1, 40, 40)];
    const [p] = atgardPoster({ markorer: [atg('2026-07-18')], punkter, tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect([p.nFore, p.nEfter]).toEqual([40, 40]);
    expect([p.fore?.traffPct, p.efter?.traffPct]).toEqual([0, 100]);
  });
  it('mätpunkter äldre än 90 dagar före ingår inte i före', () => {
    const punkter = [...dagar('2026-04-17', 1, 40, 40) /* 92 dagar före */, ...dagar('2026-06-01', 1, 40, 0), ...dagar('2026-07-18', 1, 40, 40)];
    const [p] = atgardPoster({ markorer: [atg('2026-07-18')], punkter, tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(p.nFore).toBe(40);
    expect(p.fore?.traffPct).toBe(0);
  });
  it('under 30 mått på någon sida → för tidigt, och inga tal lämnar servern', () => {
    const [p] = atgardPoster({ markorer: [atg('2026-07-18')], punkter: [...dagar('2026-07-10', 1, 100, 100), ...dagar('2026-07-18', 1, 29, 29)], tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(p).toMatchObject({ forTidigt: true, fore: null, efter: null, nFore: 100, nEfter: 29 });
    const [q] = atgardPoster({ markorer: [atg('2026-07-18')], punkter: [...dagar('2026-07-10', 1, 29, 29), ...dagar('2026-07-18', 1, 100, 100)], tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(q.forTidigt).toBe(true);
    const [r] = atgardPoster({ markorer: [atg('2026-07-18')], punkter: [...dagar('2026-07-10', 1, 30, 30), ...dagar('2026-07-18', 1, 30, 30)], tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(r.forTidigt).toBe(false);
  });
});

describe('flera markörer: efter slutar vid nästa', () => {
  const punkter = [...dagar('2026-03-01', 6, 10, 5), ...dagar('2026-03-07', 10, 10, 8), ...dagar('2026-06-01', 10, 10, 6), ...dagar('2026-07-18', 10, 10, 10)];
  const markorer = [rep('2026-03-07'), atg('2026-07-18')];
  const [a, b] = atgardPoster({ markorer, punkter, tolTraff: 4, tolGrov: null, kalibreringar: [] });
  it('reparationen får bara de mätningar fram till åtgärden', () => {
    expect(a).toMatchObject({ kalla: 'reparation', nFore: 60, nEfter: 200 });
    expect(a.efter?.traffPct).toBe(70);
  });
  it('åtgärden får det som kom efter den', () => {
    expect(b).toMatchObject({ kalla: 'atgard', nEfter: 100 });
    expect(b.efter?.traffPct).toBe(100);
  });
  it('markörer på samma dag delar samma efter (nästa räknas från ett senare datum)', () => {
    const [x, y] = atgardPoster({ markorer: [rep('2026-03-07'), atg('2026-03-07', 'Annat')], punkter, tolTraff: 4, tolGrov: null, kalibreringar: [] });
    expect(x.nEfter).toBe(y.nEfter);
  });
  it('den SISTA markören får exakt de tal "Hjälpte åtgärden?" räknade (före 90 dagar, efter allt) — samma statistik-funktion', () => {
    const efterAv = punkter.filter(p => p.datum >= '2026-07-18').map(p => p.avvik);
    expect(b.efter).toEqual(statistik(efterAv, 4, null));
  });
  it('diameterkalibreringar räknas bara fram till nästa markör', () => {
    const [m1, m2] = atgardPoster({ markorer, punkter, tolTraff: 4, tolGrov: null, kalibreringar: ['2026-03-09', '2026-07-20', '2026-07-20'] });
    expect(m1.kalibreringarEfter).toEqual(['2026-03-09']);
    expect(m2.kalibreringarEfter).toEqual(['2026-07-20']);
  });
});
