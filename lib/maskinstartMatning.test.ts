import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { markeraStart, lasStartMatning, aterstallStartMatning } from './maskinstartMatning';

// Node-miljö: ingen window → matningen ska ändå fungera (hamnar i ett lokalt objekt) och aldrig kasta.
beforeEach(() => { vi.stubGlobal('window', {}); aterstallStartMatning(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('markeraStart', () => {
  it('första anropet per steg sätter tiden, senare ignoreras (effekter kör om)', () => {
    expect(markeraStart('sekvensStart', () => 1500)).toBe(1500);
    expect(markeraStart('sekvensStart', () => 9999)).toBeNull();
    expect(lasStartMatning().marks.sekvensStart).toBe(1500);
  });

  it('kartaRedo = svart slut → svartMs; landat → totalMs', () => {
    markeraStart('kartaRedo', () => 842);
    markeraStart('landat', () => 3100);
    const m = lasStartMatning();
    expect(m.svartMs).toBe(842);
    expect(m.totalMs).toBe(3100);
  });

  it('loggar EN rad när svart släpps och EN när kameran landat — inte för mellansteg', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    markeraStart('positionKand', () => 700);
    markeraStart('objektValt', () => 760);
    markeraStart('kartaLaddad', () => 1200);
    expect(info).not.toHaveBeenCalled();
    markeraStart('kartaRedo', () => 1500);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain('SVART SLUT efter 1500 ms');
    markeraStart('kartaRedo', () => 9999);          // redan satt → ingen ny rad
    markeraStart('landat', () => 3300);
    expect(info).toHaveBeenCalledTimes(2);
    expect(String(info.mock.calls[1][0])).toContain('LANDAT efter 3300 ms');
  });

  it('en konsol som kastar stoppar aldrig starten', () => {
    vi.spyOn(console, 'info').mockImplementation(() => { throw new Error('konsol'); });
    expect(() => markeraStart('kartaRedo', () => 10)).not.toThrow();
  });
});
