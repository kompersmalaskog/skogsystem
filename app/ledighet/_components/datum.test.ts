import { describe, it, expect } from 'vitest';
import { arbetsdagarIManad, ledigaVardagarIManad, arbetsfriaAftnar, arLedigDag, arbetsdagar, rodaDagar } from './datum';

// Facit från helikopter-v2:s kapacitetsräkning (PR #287, verifierat mot kalender):
// juni 2026 = 21 arbetsdagar (nationaldagen lördag, midsommarafton fredag 19/6),
// juli 2026 = 23, december 2026 = 20 (julafton tors, juldagen fre, nyårsafton tors).
describe('arbetsdagar i månad (röda dagar + aftnar)', () => {
  it('juni 2026 = 21', () => expect(arbetsdagarIManad(2026, 6)).toHaveLength(21));
  it('juli 2026 = 23', () => expect(arbetsdagarIManad(2026, 7)).toHaveLength(23));
  it('december 2026 = 20', () => expect(arbetsdagarIManad(2026, 12)).toHaveLength(20));
  it('september 2026 = 22', () => expect(arbetsdagarIManad(2026, 9)).toHaveLength(22));
  it('midsommarafton 2026 är fredag 19 juni och ledig', () => {
    expect(arbetsfriaAftnar(2026).has('2026-06-19')).toBe(true);
    expect(arLedigDag('2026-06-19')).toBe(true);
    expect(arbetsdagarIManad(2026, 6)).not.toContain('2026-06-19');
  });
  it('julafton och nyårsafton är lediga men inte röda', () => {
    expect(arLedigDag('2026-12-24')).toBe(true);
    expect(arLedigDag('2026-12-31')).toBe(true);
    expect(rodaDagar(2026).has('2026-12-24')).toBe(false);
  });
  it('lediga vardagar december 2026 = 3 (julafton, juldagen, nyårsafton; annandagen är lördag)', () => {
    expect(ledigaVardagarIManad(2026, 12)).toBe(3);
  });
  it('ledighetens arbetsdagar() räknar aftnar som lediga', () => {
    // 21–31 dec 2026: mån 21 – fre 25 (24 + 25 lediga → 3), mån 28 – tor 31 (31 ledig → 3)
    expect(arbetsdagar('2026-12-21', '2026-12-31')).toBe(6);
  });
});
