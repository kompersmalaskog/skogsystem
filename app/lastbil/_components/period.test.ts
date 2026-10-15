import { describe, it, expect } from 'vitest';
import { bytTyp, kanGaBakat, kanGaFramat, periodEtikett, periodFranText, periodIntervall, periodKort, periodNu, periodTillText, stegaPeriod } from './period';

const NU = new Date(2026, 9, 14);   // 14 okt 2026

describe('period', () => {
  it('förvald period = innevarande månad', () => {
    expect(periodNu(NU)).toEqual({ typ: 'man', ar: 2026, man: 10 });
  });

  it('månadens intervall är [första, första i nästa månad), även över årsskiftet', () => {
    expect(periodIntervall({ typ: 'man', ar: 2026, man: 10 })).toEqual({ fran: '2026-10-01', till: '2026-11-01' });
    expect(periodIntervall({ typ: 'man', ar: 2026, man: 12 })).toEqual({ fran: '2026-12-01', till: '2027-01-01' });
    expect(periodIntervall({ typ: 'ar', ar: 2026 })).toEqual({ fran: '2026-01-01', till: '2027-01-01' });
  });

  it('stegar månader och år, över årsskiftet åt båda håll', () => {
    expect(stegaPeriod({ typ: 'man', ar: 2026, man: 1 }, -1)).toEqual({ typ: 'man', ar: 2025, man: 12 });
    expect(stegaPeriod({ typ: 'man', ar: 2026, man: 12 }, 1)).toEqual({ typ: 'man', ar: 2027, man: 1 });
    expect(stegaPeriod({ typ: 'ar', ar: 2026 }, 1)).toEqual({ typ: 'ar', ar: 2027 });
  });

  it('går inte före juli 2026 (första data) och inte förbi nu', () => {
    expect(kanGaBakat({ typ: 'man', ar: 2026, man: 8 }, NU)).toBe(true);
    expect(kanGaBakat({ typ: 'man', ar: 2026, man: 7 }, NU)).toBe(false);
    expect(kanGaFramat({ typ: 'man', ar: 2026, man: 9 }, NU)).toBe(true);
    expect(kanGaFramat({ typ: 'man', ar: 2026, man: 10 }, NU)).toBe(false);
    expect(kanGaBakat({ typ: 'ar', ar: 2026 }, NU)).toBe(false);
    expect(kanGaFramat({ typ: 'ar', ar: 2026 }, NU)).toBe(false);
  });

  it('adressen: "2026-10" och "2026" läses, skräp och framtid ger null', () => {
    expect(periodFranText('2026-10', NU)).toEqual({ typ: 'man', ar: 2026, man: 10 });
    expect(periodFranText('2026', NU)).toEqual({ typ: 'ar', ar: 2026 });
    for (const dalig of ['2026-13', '2026-00', '2026-11', '2027', '2026-06', '2025', 'okt', '', null, undefined]) {
      expect(periodFranText(dalig as any, NU)).toBeNull();
    }
  });

  it('skrivs och läses tillbaka identiskt', () => {
    for (const p of [{ typ: 'man', ar: 2026, man: 9 }, { typ: 'ar', ar: 2026 }] as const) {
      expect(periodFranText(periodTillText(p), NU)).toEqual(p);
    }
  });

  it('byte mellan Månad och År: År → Månad landar på innevarande månad i innevarande år', () => {
    expect(bytTyp({ typ: 'man', ar: 2026, man: 8 }, 'ar', NU)).toEqual({ typ: 'ar', ar: 2026 });
    expect(bytTyp({ typ: 'ar', ar: 2026 }, 'man', NU)).toEqual({ typ: 'man', ar: 2026, man: 10 });
    expect(bytTyp({ typ: 'man', ar: 2026, man: 8 }, 'man', NU)).toEqual({ typ: 'man', ar: 2026, man: 8 });
  });

  it('etiketter', () => {
    expect(periodEtikett({ typ: 'man', ar: 2026, man: 10 })).toBe('Oktober 2026');
    expect(periodEtikett({ typ: 'ar', ar: 2026 })).toBe('2026');
    expect(periodKort({ typ: 'man', ar: 2026, man: 10 }, NU)).toBe('oktober');
    expect(periodKort({ typ: 'man', ar: 2025, man: 12 }, NU)).toBe('december 2025');
    expect(periodKort({ typ: 'ar', ar: 2026 }, NU)).toBe('2026');
  });
});
