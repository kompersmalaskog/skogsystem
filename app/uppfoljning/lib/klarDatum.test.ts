import { describe, it, expect } from 'vitest';
import { klarDatumFor, klarDatumText } from './klarDatum';

const trakt = (id: string, roll: 'skordare' | 'skotare', o: any = {}) => ({ objekt_id: id, roll, ...o });
const plan = (rader: any[], saknar = false) => ({ maskin: {}, rader, klar: null, saknar, efterManad: false, uppskattad: false }) as any;

describe('klarDatumFor', () => {
  it('tar traktens slutdag per roll ur maskinernas planer', () => {
    const r = klarDatumFor({
      G: plan([{ trakt: trakt('A', 'skordare'), till: '2026-11-28' }, { trakt: trakt('B', 'skordare'), till: '2026-12-04' }]),
      W: plan([{ trakt: trakt('B', 'skotare'), till: '2026-12-10' }]),
    }, 'B');
    expect(r).toEqual({ skordare: { datum: '2026-12-04', ca: false }, skotare: { datum: '2026-12-10', ca: false } });
  });

  it('ca när ett G15-förslag ligger före i kön, inte när trakten följer uppmätt takt', () => {
    const r = klarDatumFor({ G: plan([
      { trakt: trakt('A', 'skordare', { uppskattad: true }), till: '2026-11-28' },
      { trakt: trakt('B', 'skordare'), till: '2026-12-04' },
    ]) }, 'B');
    expect(r.skordare?.ca).toBe(true);
    const r2 = klarDatumFor({ G: plan([{ trakt: trakt('B', 'skordare', { uppskattad: true, foljer: {} }), till: '2026-12-04' }]) }, 'B');
    expect(r2.skordare?.ca).toBe(false);
  });

  it('inget datum: trakten finns inte, planen saknar prognos, eller raden har inget slut', () => {
    expect(klarDatumFor({ G: plan([{ trakt: trakt('A', 'skordare'), till: '2026-11-28' }]) }, 'B')).toEqual({});
    expect(klarDatumFor({ G: plan([{ trakt: trakt('B', 'skordare'), till: '2026-11-28' }], true) }, 'B')).toEqual({});
    expect(klarDatumFor({ G: plan([{ trakt: trakt('B', 'skordare'), till: null }]) }, 'B')).toEqual({});
  });

  it('två maskiner i samma roll: den som blir klar sist avgör', () => {
    const r = klarDatumFor({
      W: plan([{ trakt: trakt('B', 'skotare'), till: '2026-12-10' }]),
      E: plan([{ trakt: trakt('B', 'skotare'), till: '2026-12-02' }]),
    }, 'B');
    expect(r.skotare?.datum).toBe('2026-12-10');
  });
});

describe('klarDatumText', () => {
  it('svenskt kort datum, ca när det är en uppskattning', () => {
    expect(klarDatumText({ datum: '2026-12-04', ca: false })).toBe('klar 4 dec');
    expect(klarDatumText({ datum: '2026-12-04', ca: true })).toBe('klar ca 4 dec');
  });
});
