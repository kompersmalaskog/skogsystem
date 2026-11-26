import { describe, expect, it } from 'vitest';
import { liggetidDagar, liggetidText } from './liggetid';

const nu = Date.parse('2026-11-21T12:00:00Z');

describe('liggetid', () => {
  it('räknar hela dagar sedan sista avverkningsdagen', () => {
    expect(liggetidDagar('2026-10-29', nu)).toBe(23);
    expect(liggetidText('2026-10-29', nu)).toMatch(/^avverkat 29 okt\.? · legat 23 dgr$/);
  });
  it('samma svar på morgonen och kvällen (kalenderdagar i svensk tid)', () => {
    expect(liggetidDagar('2026-10-29', Date.parse('2026-11-21T06:00:00Z'))).toBe(23);
    expect(liggetidDagar('2026-10-29', Date.parse('2026-11-21T22:30:00Z'))).toBe(23);
    // 23:30 UTC är redan nästa dag i Sverige.
    expect(liggetidDagar('2026-10-29', Date.parse('2026-11-21T23:30:00Z'))).toBe(24);
  });
  it('en dag heter dag, och från 60 dagar står månader också', () => {
    expect(liggetidText('2026-11-20', nu)).toMatch(/legat 1 dag$/);
    expect(liggetidText('2026-08-01', nu)).toMatch(/legat 112 dgr \(4 mån\)$/);
  });
  it('saknat datum skrivs ut ärligt', () => {
    expect(liggetidText(null, nu)).toBe('avverkningsdatum saknas');
  });
  it('aldrig negativt (datum i framtiden)', () => {
    expect(liggetidDagar('2026-12-01', nu)).toBe(0);
  });
});
