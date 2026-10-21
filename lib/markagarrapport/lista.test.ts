import { describe, it, expect } from 'vitest';
import { byggListRader, grupperaPerManad, sok, underText, kortDatum, type ListRad } from './lista';

const rad = (over: Partial<ListRad>): ListRad => ({
  objekt_id: '1', namn: 'X', skogsagare: null, datum: null, pagar: false, volym_m3: 100, ...over,
});

describe('byggListRader', () => {
  const dim = [
    { objekt_id: '11124938', object_name: 'Husjönäs 1:18', skogsagare: 'Anna' },
    { objekt_id: 'PONS20SDJAA270231_132', object_name: 'Gallring Vällust', skogsagare: 'Markus' },
    { objekt_id: '11271860', object_name: 'Skälviken', skogsagare: 'J-Hus' },
    { objekt_id: '999', object_name: 'Tom', skogsagare: null },
  ];
  const objekt = [
    { vo_nummer: '11124938', dim_objekt_id: null, typ: 'slutavverkning', status: 'avslutat' },
    { vo_nummer: 'P-1024', dim_objekt_id: 'PONS20SDJAA270231_132', typ: 'gallring', status: 'pagaende' },
    { vo_nummer: '11271860', dim_objekt_id: null, typ: 'slutavverkning', status: 'pagaende' },
  ];
  const vol = [
    { objekt_id: '11124938', volym_m3sub: 400 }, { objekt_id: '11124938', volym_m3sub: 278.4 },
    { objekt_id: 'PONS20SDJAA270231_132', volym_m3sub: 122 },
    { objekt_id: '11271860', volym_m3sub: 134 },
  ];
  const rader = byggListRader(dim, objekt, vol, new Map([['11124938', '2026-02-16']]));

  it('summerar volymen per objekt', () => {
    expect(rader.find(r => r.objekt_id === '11124938')?.volym_m3).toBeCloseTo(678.4);
  });
  it('en gallring som filen kallar slutavverkning tas bort', () => {
    expect(rader.map(r => r.namn)).not.toContain('Gallring Vällust');
  });
  it('ett objekt utan volym visas inte', () => {
    expect(rader.map(r => r.objekt_id)).not.toContain('999');
  });
  it('pågår när objektet är pågående', () => {
    expect(rader.find(r => r.objekt_id === '11271860')?.pagar).toBe(true);
    expect(underText(rader.find(r => r.objekt_id === '11271860')!)).toBe('Pågår · J-Hus');
  });
});

describe('grupperaPerManad', () => {
  it('nyast först, året bara när det inte är i år, utan datum sist', () => {
    const g = grupperaPerManad([
      rad({ objekt_id: 'a', datum: '2026-02-16' }),
      rad({ objekt_id: 'b', datum: '2026-10-13' }),
      rad({ objekt_id: 'c', datum: null }),
      rad({ objekt_id: 'd', datum: '2025-11-01' }),
      rad({ objekt_id: 'e', datum: '2026-10-21' }),
    ], new Date('2026-10-21T12:00:00'));
    expect(g.map(x => x.rubrik)).toEqual(['Oktober', 'Februari', 'November 2025', 'Utan datum']);
    expect(g[0].rader.map(r => r.objekt_id)).toEqual(['e', 'b']);
  });
});

describe('sok och text', () => {
  it('alla ord måste träffa, namn eller skogsägare', () => {
    const r = [rad({ objekt_id: 'a', namn: 'Mölleryd RP', skogsagare: 'J-Hus' }), rad({ objekt_id: 'b', namn: 'Husjönäs', skogsagare: 'Anna' })];
    expect(sok(r, 'möll hus').map(x => x.objekt_id)).toEqual(['a']);
    expect(sok(r, 'anna').map(x => x.objekt_id)).toEqual(['b']);
    expect(sok(r, '  ')).toHaveLength(2);
  });
  it('datum och skogsägare', () => {
    expect(kortDatum('2026-10-13')).toBe('13 okt');
    expect(underText(rad({ datum: '2026-10-13', skogsagare: 'J-Hus' }))).toBe('13 okt · J-Hus');
    expect(underText(rad({}))).toBe('');
  });
});
