/**
 * MASKINEN PÅ KARTAN ÄR EN PIL – INGET ANNAT (Martin 2026-11-16: "både pilen och pricken och det blå strecket … så att ett barn förstår direkt").
 * Förut ritades fyra saker för samma sak: en blå prick med vit ring, en liten pil framför den, en svag blå kägla och ett blått streck 75 m framåt.
 * Nu EN blå pil med vit kant, som i Apple Kartor: spetsen pekar dit maskinen kör, pilens mitt är positionen. Lika stor på skärmen vid varje zoom.
 * TRE LÄGEN, pilen bär dem själv (ingen cirkel runt): BLÅ = bra position · GUL = dålig noggrannhet (telefonens/iPadens egen GPS sämre än
 * TELEFON_GPS.BRA_M) · GRÅ = ingen färsk GPS, positionen går inte att lita på.
 */
import { FARG } from './design/tokens';
import { TELEFON_GPS } from './telefonGps';

export const MASKIN_PIL_BILD = 'maskin-ikon';
export const MASKIN_PIL_BILD_GRA = 'maskin-ikon-gra';
export const MASKIN_PIL_BILD_GUL = 'maskin-ikon-gul';
/** Bildens sida i px (ritas i dubbel upplösning: pixelRatio 2 → 44 px på skärmen, en tumnagel). */
export const MASKIN_PIL_PX = 88;
export const MASKIN_PIL_PIXELRATIO = 2;

/** Pilen: spets uppåt (norr = 0°, roteras med kursen), inskuret bakstycke. Mitten av bilden är positionen. */
export function maskinPilSvg(farg: string): string {
  const s = MASKIN_PIL_PX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 88 88">`
    // Tunn mörk kant ytterst (syns mot ljus karta), vit kant innanför (syns mot skog och flygfoto), blå fyllning.
    + `<path d="M44 10 L71 74 L44 61 L17 74 Z" fill="none" stroke="#000000" stroke-opacity="0.45" stroke-width="10" stroke-linejoin="round"/>`
    + `<path d="M44 10 L71 74 L44 61 L17 74 Z" fill="${farg}" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round"/>`
    + `</svg>`;
}

export type MaskinPilLage = 'bra' | 'grov' | 'gammal';

/** Ingen färsk GPS går före allt. Noggrannheten är bara känd för telefonens/iPadens egen GPS (null = fast GPS i maskinen → aldrig gul). */
export function maskinPilLage(a: { farsk: boolean; noggrannhetM: number | null | undefined }): MaskinPilLage {
  if (!a.farsk) return 'gammal';
  return a.noggrannhetM != null && Number.isFinite(a.noggrannhetM) && a.noggrannhetM > TELEFON_GPS.BRA_M ? 'grov' : 'bra';
}

export const maskinPilFarg = (lage: MaskinPilLage): string => (lage === 'gammal' ? FARG.text3 : lage === 'grov' ? FARG.gul : FARG.bla);

/** Vilken bild lagret ritar, efter featurens `lage`. */
export const MASKIN_PIL_UTTRYCK = ['match', ['get', 'lage'], 'gammal', MASKIN_PIL_BILD_GRA, 'grov', MASKIN_PIL_BILD_GUL, MASKIN_PIL_BILD] as const;
