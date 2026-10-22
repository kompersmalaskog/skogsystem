// Serverns del av "Hur mycket står kvar?": vilka 10 m-rutor i Skogsstyrelsens raster provpunkterna ligger i,
// och vad rutorna innehåller. Rena funktioner — anropet mot Skogsstyrelsen bor i app/api/laser-grundyta/route.ts.
//
// Rastret (SkogligaGrunddata_3_1) ligger i SWEREF99 TM med 10 m rutor på jämna 10-tal. Utsnittet läggs därför på
// jämna 10 m, så varje pixel i svaret ÄR en ruta i Skogsstyrelsens data (ingen omsampling).
// Två provpunkter i samma ruta räknas en gång.

import proj4 from 'proj4';
import type { LaserRuta } from './laserKvar';

const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
export const RUTA_M = 10;
/** Största utsnitt vi begär (pixlar per sida). 3 km — mer än någon trakt. */
export const MAX_SIDA = 300;

export type Utsnitt = { minX: number; minY: number; maxX: number; maxY: number; bredd: number; hojd: number };

export function tillSweref(punkter: [number, number][]): [number, number][] {
  return punkter.map(([lng, lat]) => proj4('EPSG:4326', SWEREF99TM, [lng, lat]) as [number, number]);
}

/** Utsnittet på jämna 10 m som rymmer alla punkter. Null om punkterna saknas eller ytan är orimligt stor. */
export function utsnitt(xy: [number, number][]): Utsnitt | null {
  if (xy.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of xy) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const u = {
    minX: Math.floor(minX / RUTA_M) * RUTA_M,
    minY: Math.floor(minY / RUTA_M) * RUTA_M,
    maxX: Math.floor(maxX / RUTA_M) * RUTA_M + RUTA_M,
    maxY: Math.floor(maxY / RUTA_M) * RUTA_M + RUTA_M,
  };
  const bredd = Math.round((u.maxX - u.minX) / RUTA_M);
  const hojd = Math.round((u.maxY - u.minY) / RUTA_M);
  if (bredd > MAX_SIDA || hojd > MAX_SIDA) return null;
  return { ...u, bredd, hojd };
}

/** Ett tal ur rastret som "ingen data": nodata-värdet, NaN eller negativt. */
const saknas = (v: number, nodata: number | null) => !Number.isFinite(v) || v < 0 || (nodata !== null && v === nodata);

/** Slår upp rutan för varje punkt (en gång per ruta). Banden är grundyta, medeldiameter och skanningsdag, rad 0 = norr. */
export function slaUpp(
  xy: [number, number][],
  u: Utsnitt,
  grundyta: ArrayLike<number>,
  diameter: ArrayLike<number>,
  dag: ArrayLike<number>,
  nodata: number | null,
): LaserRuta[] {
  const sett = new Set<number>();
  const ut: LaserRuta[] = [];
  for (const [x, y] of xy) {
    const kol = Math.floor((x - u.minX) / RUTA_M);
    const rad = Math.floor((u.maxY - y) / RUTA_M);
    if (kol < 0 || rad < 0 || kol >= u.bredd || rad >= u.hojd) continue;
    const i = rad * u.bredd + kol;
    if (sett.has(i)) continue;
    sett.add(i);
    const g = grundyta[i], dia = diameter[i], d = dag[i];
    ut.push({
      g: saknas(g, nodata) ? null : g,
      d: saknas(dia, nodata) || dia === 0 ? null : dia,
      dag: saknas(d, nodata) || d === 0 ? null : Math.round(d),
    });
  }
  return ut;
}
