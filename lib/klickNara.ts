// TRYCK PÅ KARTAN: vad som ligger NÄRMAST fingret (Martin 2026-11-23, Brokamåla: "vissa hänsynsytor och symboler går inte att trycka på").
//
// Orsaken, mätt med riktiga musklick på Brokamålas riktiga data (hänsyn 1–5, 20 linjer, 65 fastighetsgränser, 18 symboler):
//  1. Träfflagren är BREDA och osynliga: egna och Vidas linjer 44 px (`line-hitbox`, `trakt-linje-hit`), rågången 22 px (`trakt-ragang-hit`). På Brokamåla ligger tjugo linjer och
//     65 gränsbitar över hela trakten; i planeringsvyn (zoom 16, 1,3 m/px) täcker de 22 px = 29 m åt varje håll nästan allt. Kategorin linje/fastighet slår yta, så ett tryck
//     MITT I Hänsyn 4 öppnade en basväg som ligger 20 px bort (Hänsyn 1: 40 %, Hänsyn 4: 25 %, Hänsyn 2 och 5: 22–37 % med fastighetsgränserna på).
//  2. Ligger flera symboler tätt (en note och en bro 8 m isär) fick den som ritats sist ALLA tryck inom båda cirklarna — handlaren tog första träffen, inte den närmaste.
//  3. Vidas fornlämnings- och nyckelbiotopsytor bär ingen areal, så "minsta ytan" kunde inte avgöras: de vann alltid över en hänsyn, även när hänsynen var mindre.
//
// REGELN: en linje eller en fastighetsgräns slår en yta bara när trycket verkligen ligger PÅ linjen (`NARA_*_PX`). Annars gäller ytan man står i. Finns ingen yta under
// fingret är den generösa träffytan (22 px) kvar som förut — tunna linjer ska fortfarande gå att träffa med ett finger. Bland flera träffar av samma slag vinner den
// NÄRMASTE, aldrig den som råkar ligga överst.

import { kategoriForLager, valjKlickKategori, type KlickKategori } from './klickPrioritet';
import { avstandPx, type LinjeGeometri } from './linjeTryck';

/** En egen eller Vidas linje slår en yta under fingret bara inom så här långt från själva linjen (px). Linjen ritas 3–5 px bred; fingret får vara snett. */
export const NARA_LINJE_PX = 10;
/** Samma för fastighetsgränsen (ritas 12 px bred vid zoom 17, 8 vid 14). */
export const NARA_RAGANG_PX = 8;

type Pt = { x: number; y: number };
export type Projicera = (lng: number, lat: number) => Pt;
export interface Traff { layer?: { id?: string } | null; geometry?: LinjeGeometri | null; properties?: Record<string, any> | null }

/** Kategorier som är "specifika ytor" — de som en bred träffyta för linje/gräns inte får slå. Traktdelen (`traktyta`) räknas inte: ett tryck inne i trakten nära en väg ska öppna vägen. */
const YTA_KAT: KlickKategori = 'yta';

/**
 * Vinnande kategori givet träffarna vid tryckpunkten. Som `valjKlickKategori` (lib/klickPrioritet), men en träff i kategorin linje eller fastighet räknas bara
 * när trycket ligger inom NARA_* px från själva linjen OM det samtidigt ligger en specifik yta under fingret.
 */
export function vinnandeKategoriNara(traffar: readonly Traff[], punkt: Pt, projicera: Projicera): KlickKategori | null {
  const lagerId = (t: Traff) => t.layer?.id ?? '';
  const harYta = traffar.some((t) => kategoriForLager(lagerId(t)) === YTA_KAT);
  const kvar: string[] = [];
  for (const t of traffar) {
    const id = lagerId(t);
    if (!id) continue;
    const kat = kategoriForLager(id);
    if (harYta && (kat === 'linje' || kat === 'fastighet')) {
      const grans = kat === 'linje' ? NARA_LINJE_PX : NARA_RAGANG_PX;
      const d = avstandPx(punkt, t.geometry, projicera);
      if (d > grans) continue;   // träffytan når hit, men trycket ligger på ytan, inte på linjen
    }
    kvar.push(id);
  }
  return valjKlickKategori(kvar);
}

/** Den träff vars geometri ligger närmast fingret (px); lika långt (± 0,5 px) → den första. Punkter mäts till punkten, linjer och ytor till kanten. Tom lista → null. */
export function narmasteTraff<T extends Traff>(traffar: readonly T[], punkt: Pt, projicera: Projicera): T | null {
  let bast: T | null = null; let bastD = Infinity;
  for (const t of traffar) {
    const g = t.geometry;
    let d: number;
    if (g?.type === 'Point') { const q = projicera((g.coordinates as number[])[0], (g.coordinates as number[])[1]); d = Math.hypot(punkt.x - q.x, punkt.y - q.y); }
    else d = avstandPx(punkt, g, projicera);
    if (!Number.isFinite(d)) d = 0;
    if (!bast || d < bastD - 0.5) { bast = t; bastD = d; }
  }
  return bast;
}

/** Meter per skärmpixel vid en latitud och zoom (Web Mercator, 512 px-rutor som MapLibre). */
export function meterPerPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
}

/** Hur långt från rågången (m) ett tryck får ligga och ändå öppna "Fastighetsgräns …": träffytans halva bredd (11 px) i meter, aldrig under 14 m (som förut). */
export function ragangToleransM(lat: number, zoom: number, traffRadiePx = 11): number {
  return Math.max(14, Math.ceil(traffRadiePx * meterPerPixel(lat, zoom)) + 1);
}
