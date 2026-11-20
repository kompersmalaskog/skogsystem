import { describe, expect, it } from 'vitest';
import { provytaStatus, sammanstallProvytor, skadeandel, type ProvytaVarden } from './provytor';

const MATT = '2026-10-04T15:43:28.181+00:00';

function yta(over: Partial<ProvytaVarden> = {}): ProvytaVarden {
  return {
    matt: null, overhoppad: false, antal_frisk: null, antal_skadad: null,
    stickvagsbredd_m: null, stickvagsavstand_m: null, grundyta_m2_ha: null,
    ...over,
  };
}
const matt = (frisk: number, skadad: number, over: Partial<ProvytaVarden> = {}) =>
  yta({ matt: MATT, antal_frisk: frisk, antal_skadad: skadad, ...over });

describe('provytaStatus - tre tillstand', () => {
  it('orord yta ar omatt', () => {
    expect(provytaStatus({ matt: null, overhoppad: false })).toBe('omatt');
  });
  it('matt yta ar matt', () => {
    expect(provytaStatus({ matt: MATT, overhoppad: false })).toBe('matt');
  });
  it('overhoppad yta ar overhoppad - ocksa nar matt ar satt', () => {
    // hoppaOverProvyta sattar matt (tidsstampeln for "avklarad"). En kontroll pa matt
    // ensam laser den som matt: det var kartans fel, tre matta + en overhoppad = fyra fyllda.
    expect(provytaStatus({ matt: MATT, overhoppad: true })).toBe('overhoppad');
  });
  it('overhoppad utan tidsstampel ar ocksa overhoppad', () => {
    expect(provytaStatus({ matt: null, overhoppad: true })).toBe('overhoppad');
  });
});

describe('sammanstallProvytor - skadeandel ur summorna', () => {
  // Hossjomala yta 1 ur prod: 8 friska, 1 skadad, bredd 4,5, avstand 32, grundyta 26.
  const hossjomala = matt(8, 1, { stickvagsbredd_m: 4.5, stickvagsavstand_m: 32, grundyta_m2_ha: 26, markt_i_falt: true } as any);
  const omatta = Array.from({ length: 6 }, () => yta());

  it('Hossjomala: 1 matt yta av 7 - samma tal som SQL pa ytornas egna rader', () => {
    const s = sammanstallProvytor([hossjomala, ...omatta]);
    expect(s.antalYtor).toBe(7);
    expect(s.antalMatta).toBe(1);
    expect(s.skadeandel).toEqual({ procent: 11, skadade: 1, trad: 9, ytor: 1 });
    expect(s.stickvagsbredd).toEqual({ medel: 4.5, n: 1 });
    expect(s.stickvagsavstand).toEqual({ medel: 32, n: 1 });
    expect(s.grundyta).toEqual({ medel: 26, n: 1 });
  });

  it('INTE medelvardet av ytornas procent: 1/9, 4/24 och 0/12 ger 11 %, inte 9 %', () => {
    const s = sammanstallProvytor([matt(8, 1), matt(20, 4), matt(12, 0)]);
    // medel av procent = (11 + 17 + 0) / 3 = 9,3 -> 9. Summorna: 5 av 45 = 11,1 -> 11.
    expect(s.skadeandel).toEqual({ procent: 11, skadade: 5, trad: 45, ytor: 3 });
    const medelAvProcent = Math.round((11 + 17 + 0) / 3);
    expect(medelAvProcent).toBe(9);
    expect(s.skadeandel.procent).not.toBe(medelAvProcent);
  });

  it('en stor yta vager tyngre an en liten', () => {
    // 1 av 100 (1 %) och 5 av 10 (50 %): summorna ger 6/110 = 5 %, medel av procent vore 26 %.
    const s = sammanstallProvytor([matt(99, 1), matt(5, 5)]);
    expect(s.skadeandel.procent).toBe(5);
  });

  it('inga matta ytor: inga tal, inget "0 %"', () => {
    const s = sammanstallProvytor(omatta);
    expect(s.antalMatta).toBe(0);
    expect(s.skadeandel).toEqual({ procent: null, skadade: 0, trad: 0, ytor: 0 });
    expect(s.stickvagsbredd).toEqual({ medel: null, n: 0 });
  });

  it('matta ytor utan nagot raknat trad: procent null, inte 0 %', () => {
    const s = sammanstallProvytor([matt(0, 0)]);
    expect(s.skadeandel.procent).toBeNull();
    expect(s.skadeandel.ytor).toBe(0);
  });

  it('0 skadade av 20 ar 0 % - ett riktigt tal, inte saknat', () => {
    expect(sammanstallProvytor([matt(20, 0)]).skadeandel.procent).toBe(0);
  });
});

describe('sammanstallProvytor - medelvarden och n', () => {
  it('medel over de ytor dar vardet finns, med n', () => {
    const s = sammanstallProvytor([
      matt(8, 1, { stickvagsbredd_m: 4.5, stickvagsavstand_m: 32, grundyta_m2_ha: 26 }),
      matt(20, 4, { stickvagsbredd_m: 3.8, stickvagsavstand_m: 21, grundyta_m2_ha: 22 }),
      matt(12, 0, { stickvagsavstand_m: 25 }),
      yta(), yta(), yta(), yta(),
    ]);
    expect(s.antalYtor).toBe(7);
    expect(s.stickvagsbredd.n).toBe(2);
    expect(s.stickvagsbredd.medel).toBeCloseTo(4.15, 10);
    expect(s.stickvagsavstand).toEqual({ medel: 26, n: 3 });
    expect(s.grundyta).toEqual({ medel: 24, n: 2 });
  });

  it('en yta utan vardet drar inte medlet mot noll', () => {
    const s = sammanstallProvytor([matt(5, 0, { stickvagsbredd_m: 4 }), matt(5, 0)]);
    expect(s.stickvagsbredd).toEqual({ medel: 4, n: 1 });
  });

  it('0 ar ett varde, tom text och NaN ar det inte', () => {
    const s = sammanstallProvytor([
      matt(5, 0, { stickvagsbredd_m: 0 }),
      matt(5, 0, { stickvagsbredd_m: '' }),
      matt(5, 0, { stickvagsbredd_m: 'abc' }),
      matt(5, 0, { stickvagsbredd_m: NaN }),
    ]);
    expect(s.stickvagsbredd).toEqual({ medel: 0, n: 1 });
  });

  it('numeric som text raknas som tal', () => {
    const s = sammanstallProvytor([matt(5, 0, { stickvagsbredd_m: '4.5' }), matt(5, 0, { stickvagsbredd_m: '3.5' })]);
    expect(s.stickvagsbredd).toEqual({ medel: 4, n: 2 });
  });
});

describe('sammanstallProvytor - vilka ytor som raknas', () => {
  it('omatta ytor raknas inte, aven om de bar varden', () => {
    const s = sammanstallProvytor([matt(8, 1), yta({ antal_frisk: 1, antal_skadad: 50, stickvagsbredd_m: 99 })]);
    expect(s.antalMatta).toBe(1);
    expect(s.antalOmatta).toBe(1);
    expect(s.skadeandel.trad).toBe(9);
    expect(s.stickvagsbredd.n).toBe(0);
  });

  it('overhoppade ytor raknas inte - aven om de bar gamla matvarden', () => {
    // hoppaOverProvyta nollar inte tidigare varden. En yta som matts och sedan
    // hoppats over far inte dra med sig sina gamla tal in i medlet.
    const s = sammanstallProvytor([
      matt(8, 1),
      matt(1, 40, { overhoppad: true, stickvagsbredd_m: 99, kommentar: 'kärr' } as any),
    ]);
    expect(s.antalMatta).toBe(1);
    expect(s.antalOverhoppade).toBe(1);
    expect(s.skadeandel).toEqual({ procent: 11, skadade: 1, trad: 9, ytor: 1 });
    expect(s.stickvagsbredd.n).toBe(0);
  });

  it('antalen summerar till alla ytor', () => {
    const s = sammanstallProvytor([matt(1, 0), matt(1, 0), yta({ matt: MATT, overhoppad: true }), yta(), yta()]);
    expect(s.antalMatta + s.antalOverhoppade + s.antalOmatta).toBe(s.antalYtor);
    expect([s.antalMatta, s.antalOverhoppade, s.antalOmatta]).toEqual([2, 1, 2]);
  });

  it('tom lista ger nollor, inget kast', () => {
    const s = sammanstallProvytor([]);
    expect(s.antalYtor).toBe(0);
    expect(s.skadeandel.procent).toBeNull();
  });

  it('negativa antal raknas som noll i stallet for att dra summan', () => {
    const s = sammanstallProvytor([matt(10, 0), yta({ matt: MATT, antal_frisk: -5, antal_skadad: -3 })]);
    expect(s.skadeandel.trad).toBe(10);
  });
});

describe('skadeandel per yta - oforandrad', () => {
  it('avrundar till hela procent och ger null utan trad', () => {
    expect(skadeandel(8, 1)).toBe(11);
    expect(skadeandel(0, 0)).toBeNull();
    expect(skadeandel(null, null)).toBeNull();
  });
});
