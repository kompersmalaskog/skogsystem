import { describe, expect, it } from 'vitest';
import { kartLagen, kartText, prickRadie } from './karta';

const s = (rot: 'bmav' | null, t = 'GRAN') => ({ lat: 56.6, lng: 15.4, dbh_mm: 200, rot_typ: rot, tradslag: t });

describe('kartan', () => {
  it('rötan är förvald när det finns röta, annars bara trädslagen', () => {
    expect(kartLagen([s(null), s('bmav')])).toEqual(['rota', 'tradslag']);
    expect(kartLagen([s(null), s(null)])).toEqual(['tradslag']);
  });

  it('texten säger vad prickarna är, i ental och flertal', () => {
    expect(kartText('rota', [s(null), s('bmav')])).toBe('Varje prick är ett träd. De röda är granen som var rutten i roten.');
    expect(kartText('rota', [s('bmav'), s('bmav')])).toBe('Varje prick är ett träd. De röda är granarna som var rutna i roten.');
    expect(kartText('tradslag', [s(null)])).toBe('Varje prick är ett träd. Färgen visar trädslaget.');
  });

  it('prickarna krymper där träden står tätt, inom gränserna', () => {
    expect(prickRadie(5483, 340, 380)).toBeCloseTo(1.2, 1);   // Tåget (5 483 träd) på en telefon
    expect(prickRadie(50000, 340, 380)).toBe(1);              // aldrig mindre än 1
    expect(prickRadie(200, 700, 380)).toBe(3.5);              // glest → största
    expect(prickRadie(5000, 700, 380)).toBeGreaterThan(1);
    expect(prickRadie(5000, 700, 380)).toBeLessThan(3.5);
  });
});
