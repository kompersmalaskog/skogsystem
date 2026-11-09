import { describe, expect, it } from 'vitest';
import {
  arGallringsskordare, dagOrd, fordelning, forraVeckan, iPeriod, meterText, perForare, perTradslag, pillEtikett, pillVarde, summera, valjJag,
  type MassaRad,
} from './massaLangd';

const r = (p: Partial<MassaRad>): MassaRad => ({
  maskin_id: 'R64428', operator_id: 'o1', operator_namn: 'OSKAR NILSSON', medarbetare_id: 'm1', dag: '2026-11-09', tradslag: 'GRAN', langd_dm: 45, antal: 10, summa_cm: 4500, ...p,
});

describe('massaLangd', () => {
  it('gallringsskördare = H8E och Harvester, inte Giant, inte avslutad', () => {
    expect(arGallringsskordare({ maskin_typ: 'Harvester', modell: 'H8E', aktiv_till: null }, '2026-11-09')).toBe(true);
    expect(arGallringsskordare({ maskin_typ: 'Harvester', modell: 'PONSSE Scorpion Giant 8W' })).toBe(false);
    expect(arGallringsskordare({ maskin_typ: 'Forwarder', modell: 'H8E' })).toBe(false);
    expect(arGallringsskordare({ maskin_typ: 'Harvester', modell: 'H8E', aktiv_till: '2026-03-11' }, '2026-11-09')).toBe(false);
  });

  it('snittet är summa/antal, aldrig snitt av snitt', () => {
    const s = summera([r({ antal: 1, summa_cm: 300 }), r({ antal: 9, summa_cm: 4500 })]);
    expect(s).toEqual({ antal: 10, cm: 480 });
    expect(meterText(480)).toBe('4,8 m');
    expect(summera([])).toBeNull();
  });

  it('förra veckan är måndag–söndag före den här', () => {
    expect(forraVeckan('2026-11-09')).toEqual({ fran: '2026-11-02', till: '2026-11-08' }); // måndag
    expect(forraVeckan('2026-11-15')).toEqual({ fran: '2026-11-02', till: '2026-11-08' }); // söndag
  });

  it('dagOrd och pillens etikett', () => {
    expect(dagOrd('2026-11-09', '2026-11-09')).toBe('idag');
    expect(dagOrd('2026-11-08', '2026-11-09')).toBe('igår');
    expect(pillEtikett('2026-11-06', '2026-11-09')).toBe('Massa 6 nov');
  });

  it('jag = inloggad om hen har rader, annars flest stockar senaste dagen', () => {
    const rader = [r({ medarbetare_id: 'm1', dag: '2026-11-08', antal: 50 }), r({ medarbetare_id: 'm2', operator_id: 'o2', operator_namn: 'MARTIN', dag: '2026-11-09', antal: 5 })];
    expect(valjJag(rader, 'R64428', 'm1')?.namn).toBe('Oskar');
    expect(valjJag(rader, 'R64428', null)?.namn).toBe('Martin');
    expect(valjJag(rader, 'R64101', null)).toBeNull();
  });

  it('pillen visar förarens senaste dag på maskinen', () => {
    const rader = [r({ dag: '2026-11-07', antal: 1, summa_cm: 300 }), r({ dag: '2026-11-08', antal: 2, summa_cm: 900 })];
    expect(pillVarde(rader, 'R64428', 'm:m1', '2026-11-09')).toEqual({ dag: '2026-11-08', cm: 450 });
    expect(pillVarde(rader, 'R64428', null, '2026-11-09')).toBeNull();
  });

  it('per trädslag med svenska namn, störst först', () => {
    const t = perTradslag([r({ tradslag: 'TALL', antal: 2, summa_cm: 800 }), r({ tradslag: 'GRAN', antal: 5, summa_cm: 2500 })]);
    expect(t.map(x => [x.tradslag, x.cm])).toEqual([['Gran', 500], ['Tall', 400]]);
  });

  it('fördelningen summerar till 100', () => {
    const f = fordelning([r({ langd_dm: 30, antal: 1 }), r({ langd_dm: 45, antal: 1 }), r({ langd_dm: 50, antal: 1 })]);
    expect(f.map(k => k.etikett)).toEqual(['3,0 m', '4,5 m', '5,0 m']);
    expect(f.reduce((s, k) => s + k.procent, 0)).toBe(100);
  });

  it('per förare: en rad per person, längst först, period idag/7/30', () => {
    const rader = [
      r({ dag: '2026-11-09', antal: 2, summa_cm: 800 }),
      r({ dag: '2026-10-01', antal: 2, summa_cm: 1000 }),
      r({ medarbetare_id: null, operator_id: 'o9', operator_namn: 'Daniel', dag: '2026-11-05', antal: 1, summa_cm: 500 }),
    ];
    expect(perForare(iPeriod(rader, 'idag', '2026-11-09')).map(f => f.namn)).toEqual(['Oskar']);
    expect(perForare(iPeriod(rader, 'vecka', '2026-11-09')).map(f => f.namn)).toEqual(['Daniel', 'Oskar']);
    expect(perForare(iPeriod(rader, 'manad', '2026-11-09'))[1].antal).toBe(2);
  });
});
