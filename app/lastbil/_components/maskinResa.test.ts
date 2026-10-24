import { describe, it, expect } from 'vitest';
import { byggResa, type FilDag } from './maskinResa';
import type { Flytt } from './maskiner';

// Giant, prod 2026-08-25 – 2026-10-23 (fakt_produktion per dag och trakt, maskin_flytt). Facit räknat för hand 2026-10-24:
// fem hjulningar som lastbilen aldrig såg (Stänkelsmåla, Vindfällen, Kämpamåla, Gallring Vällust, Mölleryd, Skälviken).
const P = (datum: string, namn: string, tid: string | null = null): FilDag => ({ datum, namn, tid });
const GIANT_DAGAR: FilDag[] = [
  P('2026-08-25', 'Rävemåla AU 2026', '2026-08-25T17:15:00Z'), P('2026-08-25', 'Dockemåla AU 2026', '2026-08-25T07:11:37Z'),
  P('2026-08-26', 'Rävemåla AU 2026'), P('2026-08-27', 'Stänkelsmåla 2025'), P('2026-08-27', 'Rävemåla AU 2026'),
  P('2026-08-28', 'Stänkelsmåla 2025'), P('2026-08-31', 'Stänkelsmåla 2025'),
  P('2026-09-01', '400763 Akelius Tåget SA -26'), P('2026-09-01', 'Stänkelsmåla 2025'),
  ...['02', '03', '04', '07'].map(d => P(`2026-09-${d}`, '400763 Akelius Tåget SA -26')),
  P('2026-09-08', 'Vindfällen Akelius Tåget', '2026-09-08T13:37:46Z'), P('2026-09-08', '400763 Akelius Tåget SA -26', '2026-09-08T06:03:54Z'),
  P('2026-09-09', 'Kämpamåla AU 2026'),
  P('2026-09-10', 'Hallaslätt AU 2026'), P('2026-09-11', 'Hallaslätt AU 2026'),
  P('2026-09-14', 'Hallaslätt AU 2026', '2026-09-14T06:00:00Z'), P('2026-09-14', 'Hålabäck au 2025', '2026-09-14T12:00:00Z'),
  ...['15', '16', '17', '18', '21'].map(d => P(`2026-09-${d}`, 'Hålabäck au 2025')),
  P('2026-09-22', 'Hålabäck au 2025'),
  ...['23', '24', '25'].map(d => P(`2026-09-${d}`, 'Östra-Hoka 17 A-C -25')),
  P('2026-09-28', 'Kroksjömåla 123 A-A -25', '2026-09-28T12:00:00Z'), P('2026-09-28', 'Östra-Hoka 17 A-C -25', '2026-09-28T06:00:00Z'),
  P('2026-09-29', 'Kroksjömåla 123 A-A -25'), P('2026-09-30', 'Kroksjömåla 123 A-A -25'),
  P('2026-10-01', 'Kroksjömåla 123 A-A -25', '2026-10-01T06:25:21Z'), P('2026-10-01', 'Vällust RP M-R -25', '2026-10-01T10:56:38Z'),
  P('2026-10-02', 'Vällust RP M-R -25'),
  P('2026-10-05', 'Gallring Vällust', '2026-10-05T13:47:57Z'), P('2026-10-05', 'Vällust RP M-R -25', '2026-10-05T06:25:42Z'),
  P('2026-10-06', 'Gallring Vällust'),
  ...['07', '08', '09', '12'].map(d => P(`2026-10-${d}`, 'Bågskyttebanan RP J-Hus- 25')),
  P('2026-10-13', 'Mölleryd RP J-Hus -25', '2026-10-13T12:00:00Z'), P('2026-10-13', 'Bågskyttebanan RP J-Hus- 25', '2026-10-13T06:00:00Z'),
  ...['19', '20'].map(d => P(`2026-10-${d}`, 'Mölleryd RP J-Hus -25')),
  P('2026-10-21', 'Skälviken RP J-Hus -25', '2026-10-21T12:00:00Z'), P('2026-10-21', 'Mölleryd RP J-Hus -25', '2026-10-21T06:00:00Z'),
  P('2026-10-22', 'Skälviken RP J-Hus -25'), P('2026-10-23', 'Skälviken RP J-Hus -25'),
];
const F = (id: string, lossad: string, till: string): Flytt => ({
  id, nyckel: 'PONS20SDJAA270231', maskinNamn: 'Giant', lastad: lossad, lossad, km: 30, min: 60, franId: null, tillId: null, franNamn: null, tillNamn: till,
});
const GIANT_FLYTTAR: Flytt[] = [
  F('f1', '2026-08-25T05:00:00Z', 'Dockemåla AU 2026'), F('f2', '2026-08-25T15:00:00Z', 'Rävemåla AU 2026'),
  F('f3', '2026-09-01T09:00:00Z', '400763 Akelius Tåget SA'), F('f4', '2026-09-10T07:00:00Z', 'Hallaslätt AU 2026'),
  F('f5', '2026-09-14T09:00:00Z', 'Hålabäck au 2025'), F('f6', '2026-09-22T14:00:00Z', 'Östra-Hoka 1:7 A-C -25'),
  F('f7', '2026-09-28T09:00:00Z', 'Kroksjömåla 1:23 A-A -25'), F('f8', '2026-10-01T09:00:00Z', 'Vällust RP M-R -25'),
  F('f9', '2026-10-06T13:00:00Z', 'Bågskyttebanan RP J-Hus- 25'),
];

describe('Maskinens resa: var den jobbat och hur den kom dit', () => {
  const r = byggResa(GIANT_DAGAR, GIANT_FLYTTAR);

  it('Giant står på Skälviken, inte på Bågskyttebanan där lastbilen lämnade den', () => {
    expect(r.steg[0].stopp).toMatchObject({ namn: 'Skälviken RP J-Hus -25', fran: '2026-10-21', dagar: 3 });
    expect(r.steg[0].hit).toEqual({ typ: 'sjalv', datum: '2026-10-21' });
  });

  it('varje trakt en gång, nyast först, med lastbil eller körde själv mellan', () => {
    expect(r.steg.map(s => [s.stopp.namn, s.stopp.dagar, s.hit?.typ === 'lastbil' ? s.hit.flytt.id : s.hit?.typ])).toEqual([
      ['Skälviken RP J-Hus -25', 3, 'sjalv'],
      ['Mölleryd RP J-Hus -25', 4, 'sjalv'],
      ['Bågskyttebanan RP J-Hus- 25', 5, 'f9'],
      ['Gallring Vällust', 2, 'sjalv'],
      ['Vällust RP M-R -25', 3, 'f8'],
      ['Kroksjömåla 123 A-A -25', 4, 'f7'],
      ['Östra-Hoka 17 A-C -25', 4, 'f6'],
      ['Hålabäck au 2025', 7, 'f5'],
      ['Hallaslätt AU 2026', 3, 'f4'],
      ['Kämpamåla AU 2026', 1, 'sjalv'],
      ['Vindfällen Akelius Tåget', 1, 'sjalv'],
      ['400763 Akelius Tåget SA -26', 6, 'f3'],
      ['Stänkelsmåla 2025', 4, 'sjalv'],
      ['Rävemåla AU 2026', 3, 'f2'],
      ['Dockemåla AU 2026', 1, 'f1'],
    ]);
    expect([r.lastbil, r.sjalv]).toEqual([9, 6]);
  });

  it('snittet räknar avslutade stopp, inte det pågående: 48 dagar på 14 trakter', () => {
    expect(r.dagarPerTrakt.antal).toBe(14);
    expect(r.dagarPerTrakt.snitt).toBeCloseTo(48 / 14);
  });

  it('en dag med två trakter ordnas på klockslaget, och utan klockslag kommer trakten den redan var på först', () => {
    const a = byggResa([P('2026-09-01', 'B', '2026-09-01T12:00:00Z'), P('2026-09-01', 'A', '2026-09-01T06:00:00Z')], []);
    expect(a.steg.map(s => s.stopp.namn)).toEqual(['B', 'A']);
    const b = byggResa([P('2026-08-31', 'B'), P('2026-09-01', 'A'), P('2026-09-01', 'B')], []);
    expect(b.steg.map(s => s.stopp.namn)).toEqual(['A', 'B']);
  });

  it('en lastbilsflytt utan byte i filerna blir ett eget stopp utan arbetsdagar (verkstad, eller en trakt den inte börjat på)', () => {
    const v = byggResa([P('2026-10-01', 'A'), P('2026-10-02', 'A')], [F('v', '2026-10-05T10:00:00Z', 'Verkstaden')]);
    expect(v.steg.map(s => [s.stopp.namn, s.stopp.dagar, s.hit?.typ ?? null])).toEqual([['Verkstaden', 0, 'lastbil'], ['A', 2, null]]);
  });

  it('för få avslutade trakter ger inget snitt; inga filer och inga flyttar ger en tom resa', () => {
    expect(byggResa([P('2026-10-01', 'A'), P('2026-10-03', 'B'), P('2026-10-05', 'C')], []).dagarPerTrakt).toEqual({ snitt: null, antal: 2 });
    expect(byggResa([], [])).toEqual({ steg: [], lastbil: 0, sjalv: 0, dagarPerTrakt: { snitt: null, antal: 0 } });
  });
});

describe('Maskinens resa: årets första stopp', () => {
  it('tar närmaste flytt före sin första dag; äldre flyttar blir egna stopp', () => {
    const r = byggResa([P('2026-09-28', 'A'), P('2026-09-29', 'A')], [F('gammal', '2026-09-01T10:00:00Z', 'Verkstaden'), F('fre', '2026-09-25T10:00:00Z', 'A')]);
    expect(r.steg.map(s => [s.stopp.namn, s.hit?.typ === 'lastbil' ? s.hit.flytt.id : null])).toEqual([['A', 'fre'], ['Verkstaden', 'gammal']]);
  });
});
