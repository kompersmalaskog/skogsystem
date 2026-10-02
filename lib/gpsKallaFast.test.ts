import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fast läge (testfliken /maskin?som=): hubben får ALDRIG öppna datorns egen GPS — bara den utlagda positionen
// (maskinens senast kända) går ut till abonnenterna. Hubben har modul-state → färsk modul per test.

type Kalla = typeof import('./gpsKalla');
let g: Kalla;
let getCurrentPosition: ReturnType<typeof vi.fn>;
let watchPosition: ReturnType<typeof vi.fn>;
let clearWatch: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  getCurrentPosition = vi.fn();
  watchPosition = vi.fn(() => 7);
  clearWatch = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition, watchPosition, clearWatch } });
  vi.resetModules();
  g = await import('./gpsKalla');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('fast läge — datorns GPS används aldrig', () => {
  it('kontrollfall: UTAN fast läge öppnar hubben navigator.geolocation (annars bevisar testen nedan ingenting)', () => {
    const h = g.startaGpsKalla(() => { /* */ });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition).toHaveBeenCalledTimes(1);
    h.stop();
  });

  it('med fast läge: prenumeration + hämta-en-fix rör aldrig navigator.geolocation', async () => {
    g.startaFastGpsLage();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    g.sattFastGpsPosition(56.3573, 15.048);
    const fix = await g.hamtaEnGpsFix(50);
    h.stop();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
    expect(fix).toMatchObject({ lat: 56.3573, lng: 15.048, giltig: true });
    expect(fixar).toHaveLength(1);
  });

  it('abonnenten får den utlagda positionen som en vanlig giltig fix (typ geolocation, aldrig serial)', () => {
    g.startaFastGpsLage();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    expect(h.typ).toBe('geolocation');
    expect(fixar).toHaveLength(0);                       // inget utlagt än → ingen fix (ingen gissning)
    g.sattFastGpsPosition(56.1, 15.2);
    expect(fixar).toHaveLength(1);
    expect(fixar[0]).toMatchObject({ lat: 56.1, lng: 15.2, giltig: true, kurs: null, fart: null });
    h.stop();
  });

  it('position utlagd FÖRE prenumerationen → ny abonnent får den direkt', () => {
    g.startaFastGpsLage();
    g.sattFastGpsPosition(56.5, 15.5);
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    expect(fixar).toHaveLength(1);
    expect(fixar[0]).toMatchObject({ lat: 56.5, lng: 15.5 });
    h.stop();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('en ny position ersätter den förra (alla abonnenter ser samma källa)', () => {
    g.startaFastGpsLage();
    const a: any[] = [], b: any[] = [];
    const h1 = g.startaGpsKalla((f) => a.push(f));
    const h2 = g.startaGpsKalla((f) => b.push(f));
    g.sattFastGpsPosition(1, 2);
    g.sattFastGpsPosition(3, 4);
    expect(a.map((f) => [f.lat, f.lng])).toEqual([[1, 2], [3, 4]]);
    expect(b.map((f) => [f.lat, f.lng])).toEqual([[1, 2], [3, 4]]);
    h1.stop(); h2.stop();
  });

  it('ogiltiga koordinater läggs inte ut', () => {
    g.startaFastGpsLage();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    g.sattFastGpsPosition(NaN, 15);
    g.sattFastGpsPosition(56, Infinity);
    expect(fixar).toHaveLength(0);
    h.stop();
  });

  it('hamtaEnGpsFix utan utlagd position → null efter timeout (aldrig datorns position)', async () => {
    g.startaFastGpsLage();
    expect(await g.hamtaEnGpsFix(30)).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('en redan igång geolocation-källa stängs när fast läge slås på', () => {
    const h = g.startaGpsKalla(() => { /* */ });
    expect(watchPosition).toHaveBeenCalledTimes(1);
    g.startaFastGpsLage();
    expect(clearWatch).toHaveBeenCalledWith(7);
    h.stop();
  });

  it('fastGpsLageAktivt / stoppaFastGpsLage', () => {
    expect(g.fastGpsLageAktivt()).toBe(false);
    g.startaFastGpsLage();
    expect(g.fastGpsLageAktivt()).toBe(true);
    g.stoppaFastGpsLage();
    expect(g.fastGpsLageAktivt()).toBe(false);
  });
});

describe('senasteGiltigaGpsFix', () => {
  it('null innan någon fix, annars senaste giltiga (ren läsning — startar ingen källa)', () => {
    expect(g.senasteGiltigaGpsFix()).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    g.startaFastGpsLage();
    const h = g.startaGpsKalla(() => { /* */ });
    g.sattFastGpsPosition(56.2, 15.3);
    expect(g.senasteGiltigaGpsFix()).toMatchObject({ lat: 56.2, lng: 15.3 });
    h.stop();
    expect(g.senasteGiltigaGpsFix()).toBeNull();   // sista abonnenten borta → hubben nollställd
  });
});
