// @vitest-environment jsdom
// KÖRVYNS GRUNDZOOM (Martin 2026-11-23): förarens egen zoom, sparad per maskin. Reglerna prövas här; sidans inkoppling vaktas i `korvyZoom.vakter.test.ts`.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  KORVY_BASE_ZOOM, KORVY_FULL_ZOOM, KORVY_NARA_TILLAGG, KORVY_ZOOM_MAX, KORVY_ZOOM_MIN, KORVY_ZOOM_START_M, ZOOM_HALL_MS, ZOOM_KVITTO_MS, ZOOM_NYCKEL,
  grundzoomFor, hamtaGrundzoom, narhetsZoom, normaliseraZoom, sparaGrundzoom, tolkaGrundzoom, zoomNyckel,
} from './korvyZoom';

const FALLNING_M = 40;   // FALLNINGSRADIE_M i sidan: full närhets-zoom här
const GIANT = 'PONS20SDJAA270231';
const H8E = 'R64428';

beforeEach(() => { localStorage.clear(); });

describe('standardvärden (oförändrade)', () => {
  it('bas 17,5, full 18, börja glida in vid 100 m', () => {
    expect(KORVY_BASE_ZOOM).toBe(17.5);
    expect(KORVY_FULL_ZOOM).toBe(18);
    expect(KORVY_ZOOM_START_M).toBe(100);
    expect(KORVY_NARA_TILLAGG).toBe(0.5);
  });
  it('håll in 0,6 s, bekräftelsen 1,5 s', () => {
    expect(ZOOM_HALL_MS).toBe(600);
    expect(ZOOM_KVITTO_MS).toBe(1500);
  });
});

describe('närhets-zoomen räknas från grundzoomen', () => {
  it('med standard (17,5) ger den exakt samma tal som förut', () => {
    const gammal = (d: number | null) => {
      if (d == null || d > 100) return 17.5;
      if (d <= 40) return 18;
      return 17.5 + (18 - 17.5) * ((100 - d) / (100 - 40));
    };
    for (const d of [null, 150, 100.1, 100, 99, 80, 70, 55, 41, 40, 20, 0]) expect(narhetsZoom(d, KORVY_BASE_ZOOM, FALLNING_M)).toBeCloseTo(gammal(d), 12);
  });
  it('inget nära → grundzoomen, vilken den än är', () => {
    expect(narhetsZoom(null, 16, FALLNING_M)).toBe(16);
    expect(narhetsZoom(undefined, 16, FALLNING_M)).toBe(16);
    expect(narhetsZoom(101, 16, FALLNING_M)).toBe(16);
  });
  it('inom 100 m zoomar den in relativt grundzoomen: samma tillägg (0,5) som idag, på förarens nivå', () => {
    expect(narhetsZoom(40, 16, FALLNING_M)).toBe(16.5);
    expect(narhetsZoom(10, 16, FALLNING_M)).toBe(16.5);
    expect(narhetsZoom(70, 16, FALLNING_M)).toBeCloseTo(16.25, 12);   // halvvägs i rampen
    expect(narhetsZoom(100, 16, FALLNING_M)).toBe(16);
  });
  it('lämnar han hindret går den tillbaka till grundzoomen', () => {
    expect(narhetsZoom(30, 16.2, FALLNING_M)).toBeCloseTo(16.7, 12);
    expect(narhetsZoom(null, 16.2, FALLNING_M)).toBe(16.2);
  });
  it('växer jämnt med närheten (ingen studs)', () => {
    let forra = narhetsZoom(100, 16, FALLNING_M);
    for (let d = 99; d >= 0; d--) { const z = narhetsZoom(d, 16, FALLNING_M); expect(z).toBeGreaterThanOrEqual(forra - 1e-12); forra = z; }
  });
});

describe('sparad grundzoom — per maskin, gäller nästa dag och nästa objekt', () => {
  it('utan sparad zoom gäller standard', () => {
    expect(hamtaGrundzoom(GIANT)).toBeNull();
    expect(grundzoomFor(GIANT)).toBe(KORVY_BASE_ZOOM);
  });

  it('spara → gäller (ny läsning = omstart / nästa dag, inget objekt ingår i nyckeln)', () => {
    expect(sparaGrundzoom(GIANT, 16.4)).toBe(16.4);
    expect(grundzoomFor(GIANT)).toBe(16.4);
    expect(zoomNyckel(GIANT)).toBe(`${ZOOM_NYCKEL}:${GIANT}`);
    expect(localStorage.getItem(`${ZOOM_NYCKEL}:${GIANT}`)).toBe('16.4');
  });

  it('en annan maskin har sin egen (valet är per maskin)', () => {
    sparaGrundzoom(GIANT, 16.4);
    expect(grundzoomFor(H8E)).toBe(KORVY_BASE_ZOOM);
    sparaGrundzoom(H8E, 18.2);
    expect(grundzoomFor(GIANT)).toBe(16.4);
    expect(grundzoomFor(H8E)).toBe(18.2);
  });

  it('en ny spara ersätter den förra', () => {
    sparaGrundzoom(GIANT, 16.4);
    sparaGrundzoom(GIANT, 17.1);
    expect(grundzoomFor(GIANT)).toBe(17.1);
  });

  it('okänd maskin delar nyckeln "ingen"', () => {
    sparaGrundzoom(null, 16);
    expect(zoomNyckel(null)).toBe(`${ZOOM_NYCKEL}:ingen`);
    expect(grundzoomFor(undefined)).toBe(16);
  });
});

describe('robusthet', () => {
  it('avrundar till två decimaler och håller zoomen i spannet', () => {
    expect(normaliseraZoom(16.4567891)).toBe(16.46);
    expect(normaliseraZoom(3)).toBe(KORVY_ZOOM_MIN);
    expect(normaliseraZoom(22)).toBe(KORVY_ZOOM_MAX);
  });

  it('icke-tal sparas aldrig', () => {
    expect(normaliseraZoom(NaN)).toBeNull();
    expect(normaliseraZoom(Infinity)).toBeNull();
    expect(sparaGrundzoom(GIANT, NaN)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('trasigt eller utanför spannet ger standard — aldrig en konstig zoom', () => {
    for (const raw of [null, undefined, '', 'abc', '0', '5', '25', 'NaN', 'Infinity']) expect(tolkaGrundzoom(raw as any), String(raw)).toBeNull();
    localStorage.setItem(zoomNyckel(GIANT), 'skräp');
    expect(grundzoomFor(GIANT)).toBe(KORVY_BASE_ZOOM);
    localStorage.setItem(zoomNyckel(GIANT), '16.5');
    expect(grundzoomFor(GIANT)).toBe(16.5);
  });

  it('blockerad localStorage kastar inte: läsning ger standard, spara returnerar ändå värdet (gäller medan sidan är öppen)', () => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blockerad'); } });
    try {
      expect(() => hamtaGrundzoom(GIANT)).not.toThrow();
      expect(hamtaGrundzoom(GIANT)).toBeNull();
      expect(sparaGrundzoom(GIANT, 16.4)).toBe(16.4);
    } finally { Object.defineProperty(window, 'localStorage', orig); }
  });
});
