import { describe, it, expect } from 'vitest';
import { startFas, startOverlaySynlig, startRadText, LOGGA_MS, FIX_TIMEOUT_MS, FIX_RAD_MS } from './maskinstart';

const fas = (gått: number, forstaFixMs: number | null) => startFas({ startMs: 0, nuMs: gått, forstaFixMs });

describe('startFas — tillståndsmaskinen logga → söker → fix → klar / ingen fix', () => {
  it('loggan först ~2 s', () => {
    expect(fas(0, null)).toBe('logga');
    expect(fas(LOGGA_MS - 1, null)).toBe('logga');
    expect(fas(LOGGA_MS, null)).toBe('soker');
  });

  it('loggan visas alltid först — även om en fix kommer under de 2 s', () => {
    expect(fas(1500, 1500)).toBe('logga');     // fix mitt i loggan → fortfarande logga
    expect(fas(LOGGA_MS, 1500)).toBe('fix');   // efter loggan → fix
  });

  it('söker tills första fix eller 30 s', () => {
    expect(fas(5000, null)).toBe('soker');
    expect(fas(FIX_TIMEOUT_MS - 1, null)).toBe('soker');
  });

  it('ingen fix på 30 s → ingenFix, och står kvar', () => {
    expect(fas(FIX_TIMEOUT_MS, null)).toBe('ingenFix');
    expect(fas(60000, null)).toBe('ingenFix');
  });

  it('första giltiga fix → fix, sedan klar efter 5 s', () => {
    expect(fas(4000, 3000)).toBe('fix');                 // 1 s sedan fixen
    expect(fas(3000 + FIX_RAD_MS - 1, 3000)).toBe('fix');
    expect(fas(3000 + FIX_RAD_MS, 3000)).toBe('klar');   // raden tonat bort
  });

  it('ingenFix → fix när fixen äntligen kommer', () => {
    expect(fas(31000, null)).toBe('ingenFix');
    expect(fas(32000, 31500)).toBe('fix');               // fix kom vid 31,5 s
  });
});

describe('startOverlaySynlig', () => {
  it('synlig i alla faser utom klar', () => {
    for (const f of ['logga', 'soker', 'fix', 'ingenFix'] as const) expect(startOverlaySynlig(f)).toBe(true);
    expect(startOverlaySynlig('klar')).toBe(false);
  });
});

describe('startRadText', () => {
  it('söker / ingen fix', () => {
    expect(startRadText('soker', null)).toBe('Söker GPS');
    expect(startRadText('ingenFix', null)).toBe('Ingen GPS-fix');
  });
  it('fix visar objekt + m³ kvar (avrundat)', () => {
    expect(startRadText('fix', { namn: 'Hålabäck au 2025', m3kvar: 1343.8 })).toBe('Hålabäck au 2025 – 1344 m³ kvar');
    expect(startRadText('fix', { namn: 'Betet', m3kvar: null })).toBe('Betet');
    expect(startRadText('fix', { namn: '', m3kvar: 10 })).toBe('Objekt – 10 m³ kvar');
  });
  it('logga och klar har ingen rad', () => {
    expect(startRadText('logga', null)).toBeNull();
    expect(startRadText('klar', { namn: 'X', m3kvar: 5 })).toBeNull();
  });
});
