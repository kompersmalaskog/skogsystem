import { describe, expect, it } from 'vitest';
import { BOCK_PUNKTER, IKON_RADIE, IKON_RUTA, PROVYTA_IKON, STRECK_PUNKTER, provytaBildNamn } from './provytaIkon';
import type { ProvytaStatus } from './provytor';

const STATUS: ProvytaStatus[] = ['omatt', 'matt', 'overhoppad'];

describe('provytans tre ikoner - formen skiljer, inte bara fargen', () => {
  it('alla tre tillstand har en ikon', () => {
    for (const s of STATUS) expect(PROVYTA_IKON[s]).toBeDefined();
  });

  it('omatt ar en ihalig ring: ingen fyllning, ingen bock, inget streck', () => {
    expect(PROVYTA_IKON.omatt).toMatchObject({ fylld: false, bock: false, streck: false });
  });

  it('matt ar en fylld skiva MED bock', () => {
    expect(PROVYTA_IKON.matt).toMatchObject({ fylld: true, bock: true, streck: false });
  });

  it('overhoppad ar en ring MED tvarstreck, och nedtonad', () => {
    expect(PROVYTA_IKON.overhoppad).toMatchObject({ fylld: false, bock: false, streck: true });
    expect(PROVYTA_IKON.overhoppad.opacitet).toBeLessThan(PROVYTA_IKON.omatt.opacitet);
  });

  it('inga tva tillstand delar form (fylld, bock, streck)', () => {
    const former = STATUS.map((s) => {
      const i = PROVYTA_IKON[s];
      return `${i.fylld}|${i.bock}|${i.streck}`;
    });
    expect(new Set(former).size).toBe(3);
  });

  it('matt skiljer sig fran positionspricken: bock inuti, inte en bar fylld skiva', () => {
    // ek-jag ar en fylld bla skiva med vit kant. Utan bocken ar de tva identiska.
    expect(PROVYTA_IKON.matt.bock).toBe(true);
  });

  it('overhoppad ar inte bla - den ar ingen "halvt matt" yta', () => {
    expect(PROVYTA_IKON.overhoppad.linje).not.toBe(PROVYTA_IKON.omatt.linje);
  });

  it('bildnamnen ar unika per tillstand', () => {
    const namn = STATUS.map(provytaBildNamn);
    expect(new Set(namn).size).toBe(3);
  });

  it('allt ryms i ikonens ruta, inklusive tvarstrecket', () => {
    const m = IKON_RUTA / 2;
    for (const [dx, dy] of [...BOCK_PUNKTER, ...STRECK_PUNKTER]) {
      expect(m + dx).toBeGreaterThanOrEqual(0);
      expect(m + dx).toBeLessThanOrEqual(IKON_RUTA);
      expect(m + dy).toBeGreaterThanOrEqual(0);
      expect(m + dy).toBeLessThanOrEqual(IKON_RUTA);
    }
    expect(IKON_RADIE + PROVYTA_IKON.omatt.linjeBredd).toBeLessThan(m);
  });

  it('tvarstrecket gar forbi ringens kant (annars ser det ut som en tom ring med ett kluddigt hal)', () => {
    const [[ax, ay], [bx, by]] = STRECK_PUNKTER;
    expect(Math.hypot(ax, ay)).toBeGreaterThan(IKON_RADIE);
    expect(Math.hypot(bx, by)).toBeGreaterThan(IKON_RADIE);
  });
});
