import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Telefonens GPS genom hubben (lib/gpsKalla, geolocation-grenen): dålig noggrannhet och hopp ignoreras, första fixen är grov och SÄGER det,
// och den seriella källan (maskindatorn) går aldrig genom filtret. Hubben har modul-state → färsk modul per test.

type Kalla = typeof import('./gpsKalla');
let g: Kalla;
let klar: (p: any) => void = () => {};     // watchPosition-callbacken
let enGang: (p: any) => void = () => {};   // getCurrentPosition-callbacken
let clearWatch: ReturnType<typeof vi.fn>;

const LAT0 = 56.4, LNG0 = 14.7, MPL = 111320 * Math.cos(LAT0 * Math.PI / 180);
const pos = (xM: number, acc: number, tid: number, fart: number | null = 1.2) => ({
  coords: { latitude: LAT0, longitude: LNG0 + xM / MPL, accuracy: acc, speed: fart, heading: null }, timestamp: tid,
});

beforeEach(async () => {
  clearWatch = vi.fn();
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: vi.fn((ok: any) => { enGang = ok; }),
      watchPosition: vi.fn((ok: any) => { klar = ok; return 3; }),
      clearWatch,
    },
  });
  vi.resetModules();
  g = await import('./gpsKalla');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('telefon-GPS genom hubben', () => {
  it('första positionen är den grova (cachad, 300 m) och bär sin noggrannhet; den bra fixen efteråt tar över', () => {
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    enGang(pos(250, 300, 1_000_000));          // getCurrentPosition (maximumAge 60 s): grov
    klar(pos(0, 8, 1_003_000));                // watchPosition: bra fix
    h.stop();
    expect(fixar[0]).toMatchObject({ giltig: true, noggrannhetM: 300 });   // visas som grov (cirkel i appen), inte som exakt
    expect(fixar[1].noggrannhetM).toBe(8);
  });

  it('ett hopp (200 m, rapporterat 10 m) och en dålig fix (90 m) når aldrig abonnenterna — pricken står kvar', () => {
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    for (let t = 0; t < 20; t++) klar(pos(t * 1.2, 7, 1_000_000 + t * 1000));
    const antalFore = fixar.length;
    klar(pos(200, 10, 1_020_000));             // hopp
    klar(pos(0, 90, 1_021_000));               // dålig noggrannhet
    expect(fixar.length).toBe(antalFore);
    klar(pos(24, 7, 1_022_000));               // en vanlig fix går fram igen
    h.stop();
    expect(fixar.length).toBe(antalFore + 1);
  });

  it('en äldre cachad fix som kommer EFTER en nyare ignoreras', () => {
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    klar(pos(0, 8, 1_010_000));
    enGang(pos(5, 12, 1_000_000));              // äldre än den vi redan har
    h.stop();
    expect(fixar.length).toBe(1);
  });

  it('hubben sparar de senaste filtrerade fixarna (för medelvärdet vid placering) och tömmer dem när den stängs', () => {
    const h = g.startaGpsKalla(() => {});
    for (let t = 0; t < 15; t++) klar(pos(t, 8, 1_000_000 + t * 1000));
    const s = g.senasteTelefonFixar();
    expect(s.length).toBe(12);                  // ringbuffert, aldrig obegränsad
    expect(s.every((f) => f.noggrannhetM === 8)).toBe(true);
    h.stop();
    expect(g.senasteTelefonFixar()).toEqual([]);
  });
});

describe('maskinernas seriella GPS går aldrig genom filtret (källvakt)', () => {
  const k = readFileSync(resolve(__dirname, './gpsKalla.ts'), 'utf8');
  it('filtreraFix används på ETT ställe och det ligger i geolocation-grenen, efter serial-grenen', () => {
    expect(k.split('filtreraFix(').length - 1).toBe(1);
    const serial = k.indexOf('// --- Serial ---');
    const geo = k.indexOf('// --- Geolocation (fallback, dagens beteende) ---');
    const anrop = k.indexOf('filtreraFix(');
    expect(serial).toBeGreaterThan(0);
    expect(geo).toBeGreaterThan(serial);
    expect(anrop).toBeGreaterThan(geo);
    expect(k.slice(serial, geo)).not.toContain('filtreraFix');
    expect(k.slice(serial, geo)).not.toContain('telefonGps');
  });
});
