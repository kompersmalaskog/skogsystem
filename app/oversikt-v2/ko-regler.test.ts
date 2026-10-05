import { describe, it, expect } from 'vitest';
import { koLaget } from './ko-regler';
import type { MaskinKoItem } from '../oversikt/oversikt-types';
import type { MaskinTyp } from './nasta-v2';

const ko = (id: string, maskin: string, objekt: string, ordning = 0): MaskinKoItem => ({ id, maskin_id: maskin, objekt_id: objekt, ordning });
const ROLL: Record<string, MaskinTyp> = { PONS: 'skordare', R64428: 'skordare', WISENT: 'skotare', ELEFANT: 'skotare', JD810E: 'skotare' };
const rollAv = (id: string) => ROLL[id] ?? null;
const NAMN: Record<string, string> = { PONS: 'Giant', R64428: 'Rottne', WISENT: 'Wisent', ELEFANT: 'Elefant 26', JD810E: '810E' };
const namnAv = (id: string) => NAMN[id] ?? id;
const laget = (objektId: string, maskinId: string, rader: MaskinKoItem[]) => koLaget({ objektId, maskinId, roll: ROLL[maskinId], ko: rader, rollAv, namnAv });

describe('koLaget — spärren gäller bara samma roll', () => {
  it('objektet i en skördares kö kan läggas i en skotares kö: info, ingen spärr', () => {
    expect(laget('X', 'WISENT', [ko('1', 'PONS', 'X')])).toEqual({ spar: [], info: ['Giant'] });
  });
  it('och tvärtom: i en skotares kö → en skördare får lägga det i sin', () => {
    expect(laget('X', 'PONS', [ko('1', 'WISENT', 'X')])).toEqual({ spar: [], info: ['Wisent'] });
  });
  it('två skördare på samma objekt: spärr', () => {
    expect(laget('X', 'R64428', [ko('1', 'PONS', 'X')])).toEqual({ spar: ['Giant'], info: [] });
  });
  it('två skotare på samma objekt: spärr', () => {
    expect(laget('X', 'ELEFANT', [ko('1', 'WISENT', 'X')])).toEqual({ spar: ['Wisent'], info: [] });
  });
  it('maskinens egen kö spärrar (objektet ligger redan där)', () => {
    expect(laget('X', 'WISENT', [ko('1', 'WISENT', 'X')])).toEqual({ spar: ['Wisent'], info: [] });
  });
  it('båda rollerna har det: samma roll spärrar, annan roll är info — i samma svar', () => {
    const rader = [ko('1', 'PONS', 'X'), ko('2', 'WISENT', 'X')];
    expect(laget('X', 'R64428', rader)).toEqual({ spar: ['Giant'], info: ['Wisent'] });
    expect(laget('X', 'ELEFANT', rader)).toEqual({ spar: ['Wisent'], info: ['Giant'] });
  });
  it('en kö-rad på ett ANNAT objekt påverkar inget', () => {
    expect(laget('X', 'WISENT', [ko('1', 'WISENT', 'Y'), ko('2', 'PONS', 'Z')])).toEqual({ spar: [], info: [] });
  });
  it('okänd maskin i kön (finns inte i listan) räknas som spärr — som förut', () => {
    expect(laget('X', 'WISENT', [ko('1', 'SPÖKE', 'X')])).toEqual({ spar: ['SPÖKE'], info: [] });
  });
  it('flera maskiner: sorterade på namn, utan dubbletter', () => {
    const rader = [ko('1', 'WISENT', 'X'), ko('2', 'ELEFANT', 'X'), ko('3', 'WISENT', 'X')];
    expect(laget('X', 'PONS', rader)).toEqual({ spar: [], info: ['Elefant 26', 'Wisent'] });
  });
  it('810E (skotare utan position) får lägga ett objekt som en skördare har i kön', () => {
    expect(laget('X', 'JD810E', [ko('1', 'PONS', 'X')]).spar).toEqual([]);
  });
});
