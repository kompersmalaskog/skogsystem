/**
 * MASKINEN PÅ KARTAN ÄR EN PIL – INGET ANNAT (Martin 2026-11-16: "både pilen och pricken och det blå strecket … så att ett barn förstår direkt").
 * Förut ritades fyra saker för samma sak: en blå prick med vit ring, en liten pil framför den, en svag blå kägla och ett blått streck 75 m framåt.
 * Nu EN blå pil med vit kant, som i Apple Kartor: spetsen pekar dit maskinen kör, pilens mitt är positionen. Lika stor på skärmen vid varje zoom.
 * Grå när positionen inte går att lita på (ingen färsk GPS).
 */
import { FARG } from './design/tokens';

export const MASKIN_PIL_BILD = 'maskin-ikon';
export const MASKIN_PIL_BILD_GRA = 'maskin-ikon-gra';
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

export const maskinPilFarg = (gammal: boolean): string => (gammal ? FARG.text3 : FARG.bla);

/** Vilken bild lagret ritar: grå när featurens `gammal` är satt. */
export const MASKIN_PIL_UTTRYCK = ['case', ['==', ['get', 'gammal'], true], MASKIN_PIL_BILD_GRA, MASKIN_PIL_BILD] as const;
