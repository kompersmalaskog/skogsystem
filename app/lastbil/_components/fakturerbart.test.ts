import { describe, it, expect } from 'vitest';
import { summeraFakturerbart, type FaktureratRad } from './fakturerbart';

// De åtta riktiga raderna i fakturaunderlag_flytt (prod 2026-10-14): alla status 'aktiv', ingen fakturerad.
const REAL: FaktureratRad[] = [34, 40, 31, 47, 49, 44, 36, 53].map(km => ({ km, status: 'aktiv', fakturerad_tid: null }));

describe('summeraFakturerbart', () => {
  it('de åtta riktiga flyttarna: 334 km, alla hos faktureringen', () => {
    expect(summeraFakturerbart(REAL)).toEqual({ km: 334, antal: 8, hos: 8, fakturerad: 0, struken: 0, utanKm: 0 });
  });

  it('oktober (36 + 53) = 89 km', () => {
    expect(summeraFakturerbart(REAL.slice(6)).km).toBe(89);
  });

  it('en struken flytt är inte fakturerbar: ingen km, inget antal, men den räknas som struken', () => {
    const r = summeraFakturerbart([...REAL, { km: 100, status: 'struken', fakturerad_tid: null }]);
    expect(r.km).toBe(334);
    expect(r.antal).toBe(8);
    expect(r.struken).toBe(1);
  });

  it('fakturerad räknas separat från hos faktureringen', () => {
    const r = summeraFakturerbart([
      { km: 50, status: 'aktiv', fakturerad_tid: '2026-10-09T08:00:00Z' },
      { km: 40, status: 'aktiv', fakturerad_tid: null },
    ]);
    expect(r).toMatchObject({ antal: 2, hos: 1, fakturerad: 1, km: 90 });
  });

  it('summan är summan av avrundade delar, inte råsumman avrundad', () => {
    // 10,4 + 10,4 + 10,4 = 31,2 → 31 (rå). Avrundade delar: 10 + 10 + 10 = 30, och det är det som visas.
    const rader = [10.4, 10.4, 10.4].map(km => ({ km, status: 'aktiv', fakturerad_tid: null }));
    expect(summeraFakturerbart(rader).km).toBe(30);
  });

  it('en flytt utan km räknas i antal men adderar ingen km (och syns som utanKm)', () => {
    const r = summeraFakturerbart([{ km: null, status: 'aktiv', fakturerad_tid: null }, { km: 31, status: 'aktiv', fakturerad_tid: null }]);
    expect(r).toMatchObject({ km: 31, antal: 2, utanKm: 1 });
  });

  it('inga rader → nollor (det är lästa utan fel; ett läsfel hanteras av hooken, aldrig här)', () => {
    expect(summeraFakturerbart([])).toEqual({ km: 0, antal: 0, hos: 0, fakturerad: 0, struken: 0, utanKm: 0 });
  });
});
