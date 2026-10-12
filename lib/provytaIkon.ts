// Provytans tre ikoner. EN specifikation som bade kartan (canvas -> addImage) och
// listans prick (SVG) ritar efter, sa de aldrig kan se olika ut.
//
// FORMEN SKILJER, INTE BARA FARGEN:
//   omatt       ihalig ring
//   matt        fylld skiva med vit bock
//   overhoppad  nedtonad gra ring med tvarstreck
//
// BOCKEN ar inte dekoration. Utan den ar en matt yta en fylld bla skiva med vit
// kant - precis som din egen position (ek-jag), och de gick inte att skilja at pa
// kartan. Se provytaStatus i lib/provytor.ts.

import type { ProvytaStatus } from './provytor';

/** Ikonens ruta i enheter. Ringens mitt ligger i (RUTA / 2, RUTA / 2). */
export const IKON_RUTA = 30;
export const IKON_RADIE = 9;
/** Canvasen ritas i 3x och laggs till med pixelRatio 3 - skarp pa tatt skarm. */
export const IKON_PIXELRATIO = 3;

const BLA = '#0A84FF';
const GRA = '#8E8E93';
const VIT = '#FFFFFF';

export type ProvytaIkonSpec = {
  /** Fylld skiva (matt). Annars en ring. */
  fylld: boolean;
  /** Vit bock inuti skivan. */
  bock: boolean;
  /** Diagonalt tvarstreck over ringen. */
  streck: boolean;
  fyllning: string;
  linje: string;
  linjeBredd: number;
  /** Ringens och fyllningens genomskinlighet. */
  opacitet: number;
  /** Tvarstreckets egen genomskinlighet - tydligare an den nedtonade ringen. */
  streckOpacitet: number;
};

export const PROVYTA_IKON: Record<ProvytaStatus, ProvytaIkonSpec> = {
  omatt: {
    fylld: false, bock: false, streck: false,
    fyllning: 'rgba(10,132,255,0.10)', linje: BLA, linjeBredd: 2.5, opacitet: 1, streckOpacitet: 1,
  },
  matt: {
    fylld: true, bock: true, streck: false,
    fyllning: BLA, linje: VIT, linjeBredd: 2.5, opacitet: 1, streckOpacitet: 1,
  },
  overhoppad: {
    fylld: false, bock: false, streck: true,
    fyllning: 'rgba(142,142,147,0.12)', linje: GRA, linjeBredd: 2.5, opacitet: 0.6, streckOpacitet: 0.9,
  },
};

/** Bockens tre punkter, relativt ringens mitt. */
export const BOCK_PUNKTER: ReadonlyArray<readonly [number, number]> = [
  [-4.2, 0.2], [-1.2, 3.4], [4.4, -3.2],
];
export const BOCK_BREDD = 2.4;

/** Tvarstreckets andpunkter, relativt ringens mitt: nere till vanster -> uppe till hoger, forbi ringen. */
export const STRECK_PUNKTER: ReadonlyArray<readonly [number, number]> = [
  [-(IKON_RADIE + 3), IKON_RADIE + 3], [IKON_RADIE + 3, -(IKON_RADIE + 3)],
];

/** Namnet bilden far i kartstilen. */
export function provytaBildNamn(status: ProvytaStatus): string {
  return `provyta-${status}`;
}

/**
 * Ritar ikonen pa en ny canvas. Anropas i webblasaren (kartan) - lib-koden i
 * ovrigt ar ren, och testerna kontrollerar specifikationen, inte pixlarna.
 */
export function ritaProvytaIkon(status: ProvytaStatus, ratio: number = IKON_PIXELRATIO): HTMLCanvasElement {
  const spec = PROVYTA_IKON[status];
  const c = document.createElement('canvas');
  c.width = IKON_RUTA * ratio;
  c.height = IKON_RUTA * ratio;
  const x = c.getContext('2d');
  if (!x) return c;
  x.scale(ratio, ratio);
  const mx = IKON_RUTA / 2;
  const my = IKON_RUTA / 2;
  x.lineCap = 'round';
  x.lineJoin = 'round';

  x.globalAlpha = spec.opacitet;
  x.beginPath();
  x.arc(mx, my, IKON_RADIE, 0, Math.PI * 2);
  x.fillStyle = spec.fyllning;
  x.fill();
  x.lineWidth = spec.linjeBredd;
  x.strokeStyle = spec.linje;
  x.stroke();

  if (spec.bock) {
    x.globalAlpha = 1;
    x.beginPath();
    BOCK_PUNKTER.forEach(([dx, dy], i) => (i === 0 ? x.moveTo(mx + dx, my + dy) : x.lineTo(mx + dx, my + dy)));
    x.lineWidth = BOCK_BREDD;
    x.strokeStyle = VIT;
    x.stroke();
  }
  if (spec.streck) {
    x.globalAlpha = spec.streckOpacitet;
    x.beginPath();
    x.moveTo(mx + STRECK_PUNKTER[0][0], my + STRECK_PUNKTER[0][1]);
    x.lineTo(mx + STRECK_PUNKTER[1][0], my + STRECK_PUNKTER[1][1]);
    x.lineWidth = spec.linjeBredd;
    x.strokeStyle = spec.linje;
    x.stroke();
  }
  return c;
}
