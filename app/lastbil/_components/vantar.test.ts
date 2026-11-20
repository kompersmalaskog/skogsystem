import { describe, it, expect } from 'vitest';
import { pamminnelse } from './vantar';

const SEP = { typ: 'man', ar: 2026, man: 9 } as const;
const OKT = { typ: 'man', ar: 2026, man: 10 } as const;
const r = (id: string, datum: string | null) => ({ id, datum });

describe('påminnelsen "N flyttar väntar på godkännande"', () => {
  it('inget väntar → ingen rad (aldrig "0 väntar")', () => {
    expect(pamminnelse([], null)).toBeNull();
    expect(pamminnelse([], OKT)).toBeNull();
  });

  it('en flytt: "1 flytt väntar på godkännande", trycket leder till dess månad', () => {
    expect(pamminnelse([r('a', '2026-10-06')], null)).toEqual({ antal: 1, mal: { typ: 'man', ar: 2026, man: 10 }, text: '1 flytt väntar på godkännande' });
  });

  it('två flyttar: "2 flyttar väntar på godkännande" — och trycket går till ÄLDSTA månaden', () => {
    const p = pamminnelse([r('a', '2026-10-06'), r('b', '2026-09-25')], null)!;
    expect(p.text).toBe('2 flyttar väntar på godkännande');
    expect(p.mal).toEqual({ typ: 'man', ar: 2026, man: 9 });
  });

  it('över årsskiftet är december äldre än januari', () => {
    expect(pamminnelse([r('a', '2027-01-03'), r('b', '2026-12-30')], null)!.mal).toEqual({ typ: 'man', ar: 2026, man: 12 });
  });

  it('på Fakturering räknas bara det som väntar UTANFÖR den visade perioden — texten säger det', () => {
    const rader = [r('a', '2026-10-06'), r('b', '2026-09-25'), r('c', '2026-09-28')];
    const p = pamminnelse(rader, OKT)!;
    expect(p).toMatchObject({ antal: 2, mal: SEP });
    expect(p.text).toBe('2 flyttar väntar på godkännande i en annan period');
    // allt som väntar ligger i den visade månaden → raden behövs inte (listan visar det)
    expect(pamminnelse([r('a', '2026-10-06')], OKT)).toBeNull();
  });

  it('årsvyn på Fakturering: bara andra år räknas', () => {
    const ar2026 = { typ: 'ar', ar: 2026 } as const;
    expect(pamminnelse([r('a', '2026-10-06'), r('b', '2026-09-25')], ar2026)).toBeNull();
    expect(pamminnelse([r('a', '2026-10-06'), r('b', '2027-01-02')], ar2026)).toMatchObject({ antal: 1, mal: { typ: 'man', ar: 2027, man: 1 } });
  });

  it('en rad utan läsbart datum räknas ändå (den väntar), men ger inget mål', () => {
    const p = pamminnelse([r('a', null)], null)!;
    expect(p.antal).toBe(1);
    expect(p.mal).toBeNull();
  });
});
