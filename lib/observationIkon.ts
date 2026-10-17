// Observationens tre ikoner. EN specifikation som bade kartan (canvas -> addImage) och
// formularets knappar ritar efter, sa de aldrig kan se olika ut.
//
// FORMEN SKILJER, INTE BARA FARGEN - rott i solljus ar brunt:
//   bra        cirkel med bock             gron
//   battre     triangel med utropstecken   orange
//   avvikelse  romb med kryss              rod
//
// Alla tre har vit kant (syns pa ljus satellitkarta) och svart tecken. De ska aldrig forvaxlas
// med provytans ringar (bla/gra) eller positionspricken (bla skiva): ingen observation ar bla.

import { FARG } from './design/tokens';
import type { ObservationTon } from './egenkontrollObservation';

/** Ikonens ruta i enheter. Formens mitt ligger i (RUTA / 2, RUTA / 2). */
export const OBS_RUTA = 38;
/** Canvasen ritas i 3x och laggs till med pixelRatio 3 - skarpt pa tatt skarm. */
export const OBS_PIXELRATIO = 3;

export type ObsForm = 'cirkel' | 'triangel' | 'romb';
export type ObsGlyf = 'bock' | 'utrop' | 'kryss';

export type ObservationIkonSpec = {
  form: ObsForm;
  glyf: ObsGlyf;
  fyllning: string;
  kant: string;
  kantBredd: number;
  glyfFarg: string;
  glyfBredd: number;
};

const VIT = '#FFFFFF';

export const OBSERVATION_IKON: Record<ObservationTon, ObservationIkonSpec> = {
  bra: { form: 'cirkel', glyf: 'bock', fyllning: FARG.gron, kant: VIT, kantBredd: 2.5, glyfFarg: FARG.bg, glyfBredd: 2.8 },
  battre: { form: 'triangel', glyf: 'utrop', fyllning: FARG.orange, kant: VIT, kantBredd: 2.5, glyfFarg: FARG.bg, glyfBredd: 2.8 },
  avvikelse: { form: 'romb', glyf: 'kryss', fyllning: FARG.rod, kant: VIT, kantBredd: 2.5, glyfFarg: FARG.bg, glyfBredd: 2.8 },
};

/** Tonens farg i text och knappar - samma som ikonens fyllning. Bar aldrig tonen ensam: tecknet och ordet star bredvid. */
export const OBSERVATION_TON_FARG: Record<ObservationTon, string> = {
  bra: OBSERVATION_IKON.bra.fyllning,
  battre: OBSERVATION_IKON.battre.fyllning,
  avvikelse: OBSERVATION_IKON.avvikelse.fyllning,
};

type Punkt = readonly [number, number];

/** Formens hornpunkter relativt mitten (cirkeln har en radie i stallet). */
export const CIRKEL_RADIE = 13;
export const TRIANGEL_PUNKTER: ReadonlyArray<Punkt> = [[0, -14], [13, 10], [-13, 10]];
export const ROMB_PUNKTER: ReadonlyArray<Punkt> = [[0, -15], [15, 0], [0, 15], [-15, 0]];

/** Tecknens linjer relativt mitten. Utropstecknets prick ar en egen "linje" med noll langd. */
export const BOCK_PUNKTER: ReadonlyArray<Punkt> = [[-5.5, 0.5], [-1.8, 4.5], [5.8, -4.2]];
export const KRYSS_LINJER: ReadonlyArray<readonly [Punkt, Punkt]> = [
  [[-4.5, -4.5], [4.5, 4.5]],
  [[4.5, -4.5], [-4.5, 4.5]],
];
export const UTROP_STRECK: readonly [Punkt, Punkt] = [[0, -4], [0, 3]];
export const UTROP_PRICK: Punkt = [0, 7];

/** Alla punkter en ikon ritar, relativt mitten - for ruttestet. */
export function ikonPunkter(ton: ObservationTon): Punkt[] {
  const s = OBSERVATION_IKON[ton];
  const form: Punkt[] =
    s.form === 'cirkel'
      ? [[CIRKEL_RADIE, 0], [-CIRKEL_RADIE, 0], [0, CIRKEL_RADIE], [0, -CIRKEL_RADIE]]
      : [...(s.form === 'triangel' ? TRIANGEL_PUNKTER : ROMB_PUNKTER)];
  const glyf: Punkt[] =
    s.glyf === 'bock' ? [...BOCK_PUNKTER]
    : s.glyf === 'kryss' ? KRYSS_LINJER.flat()
    : [...UTROP_STRECK, UTROP_PRICK];
  return [...form, ...glyf];
}

/** Namnet bilden far i kartstilen. */
export function observationBildNamn(ton: ObservationTon): string {
  return `observation-${ton}`;
}

/**
 * Ritar ikonen pa en ny canvas. Anropas i webblasaren (kartan) - lib-koden i ovrigt ar ren, och
 * testerna kontrollerar specifikationen, inte pixlarna.
 */
export function ritaObservationIkon(ton: ObservationTon, ratio: number = OBS_PIXELRATIO): HTMLCanvasElement {
  const spec = OBSERVATION_IKON[ton];
  const c = document.createElement('canvas');
  c.width = OBS_RUTA * ratio;
  c.height = OBS_RUTA * ratio;
  const x = c.getContext('2d');
  if (!x) return c;
  x.scale(ratio, ratio);
  const mx = OBS_RUTA / 2;
  const my = OBS_RUTA / 2;
  x.lineCap = 'round';
  x.lineJoin = 'round';

  // Formen: fyllning, sedan vit kant.
  x.beginPath();
  if (spec.form === 'cirkel') {
    x.arc(mx, my, CIRKEL_RADIE, 0, Math.PI * 2);
  } else {
    const pts = spec.form === 'triangel' ? TRIANGEL_PUNKTER : ROMB_PUNKTER;
    pts.forEach(([dx, dy], i) => (i === 0 ? x.moveTo(mx + dx, my + dy) : x.lineTo(mx + dx, my + dy)));
    x.closePath();
  }
  x.fillStyle = spec.fyllning;
  x.fill();
  x.lineWidth = spec.kantBredd;
  x.strokeStyle = spec.kant;
  x.stroke();

  // Tecknet.
  x.strokeStyle = spec.glyfFarg;
  x.fillStyle = spec.glyfFarg;
  x.lineWidth = spec.glyfBredd;
  if (spec.glyf === 'bock') {
    x.beginPath();
    BOCK_PUNKTER.forEach(([dx, dy], i) => (i === 0 ? x.moveTo(mx + dx, my + dy) : x.lineTo(mx + dx, my + dy)));
    x.stroke();
  } else if (spec.glyf === 'kryss') {
    for (const [a, b] of KRYSS_LINJER) {
      x.beginPath();
      x.moveTo(mx + a[0], my + a[1]);
      x.lineTo(mx + b[0], my + b[1]);
      x.stroke();
    }
  } else {
    x.beginPath();
    x.moveTo(mx + UTROP_STRECK[0][0], my + UTROP_STRECK[0][1]);
    x.lineTo(mx + UTROP_STRECK[1][0], my + UTROP_STRECK[1][1]);
    x.stroke();
    x.beginPath();
    x.arc(mx + UTROP_PRICK[0], my + UTROP_PRICK[1], spec.glyfBredd / 2 + 0.3, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}
