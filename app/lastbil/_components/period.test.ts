import { describe, it, expect } from 'vitest';
import { bytTyp, kanGaBakat, kanGaFramat, periodEtikett, periodFranText, periodIntervall, periodKort, periodNu, periodTillText, stegaPeriod, manadForDatum, periodInnehaller } from './period';

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

describe('svensk dag som UTC-ögonblick', () => {
  it('sommartid (+2): midnatt 1 oktober är 22:00 UTC 30 september', async () => {
    const { sthlmDagStart } = await import('./period');
    expect(sthlmDagStart('2026-10-01')).toBe('2026-09-30T22:00:00.000Z');
  });
  it('vintertid (+1): midnatt 1 november är 23:00 UTC 31 oktober', async () => {
    const { sthlmDagStart } = await import('./period');
    expect(sthlmDagStart('2026-11-01')).toBe('2026-10-31T23:00:00.000Z');
  });
  it('tidsomställningen 25 oktober 2026 (03:00 → 02:00): 25 okt börjar +2, 26 okt +1', async () => {
    const { sthlmDagStart } = await import('./period');
    expect(sthlmDagStart('2026-10-25')).toBe('2026-10-24T22:00:00.000Z');
    expect(sthlmDagStart('2026-10-26')).toBe('2026-10-25T23:00:00.000Z');
  });
  it('oktober är 31 dygn och 1 timme lång (25 timmar den 25:e)', async () => {
    const { periodTidsintervall } = await import('./period');
    const { fran, till } = periodTidsintervall({ typ: 'man', ar: 2026, man: 10 });
    expect((Date.parse(till) - Date.parse(fran)) / 3600000).toBe(31 * 24 + 1);
  });
  it('en runda 00:30 svensk tid den 1 oktober ligger i oktober, inte september', async () => {
    const { periodTidsintervall } = await import('./period');
    const { fran } = periodTidsintervall({ typ: 'man', ar: 2026, man: 10 });
    expect(Date.parse('2026-09-30T22:30:00Z')).toBeGreaterThanOrEqual(Date.parse(fran));
  });
});

describe('årsvyns månader', () => {
  it('2026 till och med oktober, juli först i datan, nyast först', async () => {
    const { manaderIAr } = await import('./period');
    expect(manaderIAr(2026, NU).map(m => m.man)).toEqual([10, 9, 8, 7]);
  });
  it('ett helt år mellan januari och december', async () => {
    const { manaderIAr } = await import('./period');
    expect(manaderIAr(2027, new Date(2028, 0, 5)).map(m => m.man)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
  it('månaden en runda hör till följer svensk tid', async () => {
    const { manadForStart } = await import('./period');
    expect(manadForStart('2026-09-30T22:30:00Z')).toEqual({ ar: 2026, man: 10 });
  });
});

describe('datum ur en date-kolumn (ingen tidszon)', () => {
  it('periodInnehaller: månad och år', () => {
    const okt = { typ: 'man', ar: 2026, man: 10 } as const;
    expect(periodInnehaller(okt, '2026-10-01')).toBe(true);
    expect(periodInnehaller(okt, '2026-10-31')).toBe(true);
    expect(periodInnehaller(okt, '2026-09-30')).toBe(false);
    expect(periodInnehaller(okt, '2025-10-06')).toBe(false);
    expect(periodInnehaller({ typ: 'ar', ar: 2026 }, '2026-01-01')).toBe(true);
    expect(periodInnehaller({ typ: 'ar', ar: 2026 }, '2027-01-01')).toBe(false);
  });

  it('saknat eller trasigt datum ligger aldrig i en period', () => {
    expect(periodInnehaller({ typ: 'ar', ar: 2026 }, null)).toBe(false);
    expect(periodInnehaller({ typ: 'ar', ar: 2026 }, 'igår')).toBe(false);
    expect(manadForDatum(null)).toBeNull();
    expect(manadForDatum('2026-13-01')).toBeNull();
  });

  it('manadForDatum läser månaden direkt ur texten', () => {
    expect(manadForDatum('2026-10-06')).toEqual({ typ: 'man', ar: 2026, man: 10 });
  });
});

