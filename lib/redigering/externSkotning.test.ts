import { describe, expect, it } from 'vitest';
import { externKostnad, lasExtern, skrivExtern } from './externSkotning';

describe('extern skotare i ovrigt_info', () => {
  it('läser det batch-sparningen skrev', () => {
    const s = JSON.stringify({ extern_skotning: true, extern_foretag: 'Nilssons', extern_pris_typ: 'timme', extern_pris: 950, extern_antal: 12 });
    expect(lasExtern(s)).toEqual({ foretag: 'Nilssons', prisTyp: 'timme', pris: 950, antal: 12 });
  });
  it('ingen inlejd skotare när fältet saknas, är tomt, inte är JSON eller saknar flaggan', () => {
    expect(lasExtern(null)).toBeNull();
    expect(lasExtern('')).toBeNull();
    expect(lasExtern('fritext')).toBeNull();
    expect(lasExtern(JSON.stringify({ annat: 1 }))).toBeNull();
  });
  it('skriver och behåller andra nycklar', () => {
    const ut = skrivExtern(JSON.stringify({ annat: 1 }), { foretag: 'A', prisTyp: 'm3', pris: 40, antal: 300 });
    expect(JSON.parse(ut!)).toEqual({ annat: 1, extern_skotning: true, extern_foretag: 'A', extern_pris_typ: 'm3', extern_pris: 40, extern_antal: 300 });
  });
  it('av tar bort bara de egna nycklarna, och null när inget är kvar', () => {
    const med = skrivExtern(JSON.stringify({ annat: 1 }), { foretag: 'A', prisTyp: 'm3', pris: 40, antal: 300 });
    expect(JSON.parse(skrivExtern(med, null)!)).toEqual({ annat: 1 });
    expect(skrivExtern(skrivExtern(null, { foretag: 'A', prisTyp: 'm3', pris: 1, antal: 1 }), null)).toBeNull();
  });
  it('skriver aldrig över text som inte är JSON', () => {
    expect(() => skrivExtern('fritext', null)).toThrow();
  });
  it('kostnaden bara när pris och antal finns', () => {
    expect(externKostnad({ foretag: '', prisTyp: 'm3', pris: 40.5, antal: 300 })).toBe(12150);
    expect(externKostnad({ foretag: '', prisTyp: 'm3', pris: 0, antal: 300 })).toBeNull();
    expect(externKostnad(null)).toBeNull();
  });
});
