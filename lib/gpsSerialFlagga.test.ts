import { describe, it, expect, afterEach, vi } from 'vitest';
import { SERIAL_FLAGG, harWebSerial, serialGpsVald, glomSerialGps, antalBeviljadeSerialPortar } from './gpsSerialFlagga';
import * as gpsKalla from './gpsKalla';

afterEach(() => { vi.unstubAllGlobals(); });

function lagring(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

describe('serial-GPS-flaggan', () => {
  it('serialGpsVald läser exakt flaggan "1"; glomSerialGps tar bort den', () => {
    vi.stubGlobal('localStorage', lagring({ [SERIAL_FLAGG]: '1' }));
    expect(serialGpsVald()).toBe(true);
    glomSerialGps();
    expect(serialGpsVald()).toBe(false);
  });
  it('annat värde än "1" räknas inte', () => {
    vi.stubGlobal('localStorage', lagring({ [SERIAL_FLAGG]: 'true' }));
    expect(serialGpsVald()).toBe(false);
  });
  it('blockerad localStorage → false, kastar aldrig', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blockerad'); }, removeItem: () => { throw new Error('blockerad'); } });
    expect(serialGpsVald()).toBe(false);
    expect(() => glomSerialGps()).not.toThrow();
  });
  it('nyckeln är den gamla (befintliga enheter behåller sitt val)', () => expect(SERIAL_FLAGG).toBe('gps-serial-vald'));
});

describe('beviljade portar (getPorts)', () => {
  it('ingen Web Serial → 0', async () => {
    vi.stubGlobal('navigator', {});
    expect(harWebSerial()).toBe(false);
    expect(await antalBeviljadeSerialPortar()).toBe(0);
  });
  it('räknar portar användaren beviljat; getPorts som kastar → 0', async () => {
    vi.stubGlobal('navigator', { serial: { getPorts: async () => [{}, {}] } });
    expect(harWebSerial()).toBe(true);
    expect(await antalBeviljadeSerialPortar()).toBe(2);
    vi.stubGlobal('navigator', { serial: { getPorts: async () => { throw new Error('nekad'); } } });
    expect(await antalBeviljadeSerialPortar()).toBe(0);
  });
});

describe('gpsKalla återexporterar samma funktioner (befintliga importer oförändrade)', () => {
  it('samma referenser', () => {
    expect(gpsKalla.harWebSerial).toBe(harWebSerial);
    expect(gpsKalla.serialGpsVald).toBe(serialGpsVald);
    expect(gpsKalla.glomSerialGps).toBe(glomSerialGps);
    expect(gpsKalla.antalBeviljadeSerialPortar).toBe(antalBeviljadeSerialPortar);
  });
});
