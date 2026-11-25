// Blött och brant i skotningsrapporten — VARFÖR virket kördes som det gjordes.
//
// MARTIN 2026-11-25: "om det är blött eller brant så dom förstå varför vi måste
// kört som vi gjort med virket". Inköparen ser ett skotningsavstånd och ett
// tillägg; utan marken under det är talet bara ett tal. Ligger virket bakom en
// blöt svacka eller en brant backe kör skotaren runt, och då blir vägen längre
// än fågelvägen på kartan.
//
// KÄLLAN ÄR REDAN HÄMTAD: `objekt_skogsdata.rutnat` fylls av timjobbet
// (lib/skogsdata) med Skogsstyrelsens lutning och SLU:s markfuktighet per 10
// m-ruta. Rapporten frågar alltså ingen extern tjänst när den skapas — en
// rapport som hämtar markdata genom en proxy blir förr eller senare en rapport
// UTAN markdata, och det märks först hos inköparen.
//
// GRÄNSERNA ÄR APPENS EGNA: `BRANT_GRANS` (18° / 27°) och `FUKT`
// (lib/ritadKarta/mark) — samma mark som ritas i hytten, inget eget mått.
// Ytorna byggs av appens egen `maskYtor`, så små fläckar faller bort och varje
// rad slås ihop till rektanglar.
//
// Ren funktion: ingen databas, ingen karta, ingen pdf-lib.
import { maskYtor, BRANT_GRANS, FUKT, LUTNING_SAKNAS } from '@/lib/ritadKarta/mark';
import type { MarkSlag } from './skotningsrapportPdf';

export type MarkRuta = { slag: MarkSlag; ruta: { lat: number; lng: number }[] };

/** Rutnätet som det ligger i `objekt_skogsdata.rutnat` (lib/skogsdata tillSparat). */
export type SparatMarkRutnat = {
  minX: number;
  maxY: number;
  bredd: number;
  hojd: number;
  rutaM: number;
  /** base64, en byte per ruta: 1 = innanför traktgränsen. */
  inne: string;
  /** base64, grader per ruta. null = lutningen kunde inte hämtas. */
  lutning: string | null;
  /** base64, FuktKod per ruta. null = markfuktigheten kunde inte hämtas. */
  fukt: string | null;
};

/**
 * Minsta sammanhängande yta som ritas, i rutor. Skogsdatans rutor är 10 × 10 m
 * (appens markrutor är 5 m), så tröskeln är i kvadratmeter högre här: 4 rutor
 * = 400 m² blött, 8 rutor = 800 m² brant. Det är åt rätt håll — en rapport
 * till kund ska inte peka ut en svacka på en halv maskinbredd.
 */
export const BLOTT_MIN = 4;
export const BRANT_MIN = 8;

/**
 * base64 → bytes, i webbläsaren OCH i Node. Rapporten skapas i klienten (arket),
 * där `Buffer` inte finns; testerna kör i Node, där `atob` finns men inte alltid
 * har funnits. Därför båda vägarna — aldrig ett antagande om var koden körs.
 */
function avkoda(s: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const ut = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ut[i] = bin.charCodeAt(i);
    return ut;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer;
  if (!B) throw new Error('kan inte avkoda rutnätet: varken atob eller Buffer finns');
  const b = B.from(s, 'base64') as Uint8Array;
  return new Uint8Array(b);
}

/**
 * Blött och brant innanför traktgränsen, som ytor att rita.
 *
 * BARA INNANFÖR GRÄNSEN: en blöt svacka hos grannen förklarar inget om vår
 * skotning, och en inköpare som ser blått utanför trakten läser kartan som att
 * vi påstår något om mark vi inte kört på. Rutor utanför `inne` nollas därför
 * innan ytorna byggs.
 *
 * Saknas lutningen eller fukten (tjänsten svarade inte när timjobbet körde)
 * finns inga ytor av det slaget — aldrig en gissning, aldrig "ingen brant".
 */
export function rapportMark(rutnat: readonly SparatMarkRutnat[]): MarkRuta[] {
  const ut: MarkRuta[] = [];
  for (const s of rutnat) {
    const n = s.bredd * s.hojd;
    if (!(n > 0)) continue;
    let inne: Uint8Array;
    try {
      inne = avkoda(s.inne);
    } catch {
      continue;
    }
    if (inne.length !== n) continue;

    const bygg = (band: Uint8Array, med: (v: number) => boolean, minRutor: number, slag: MarkSlag) => {
      for (const f of maskYtor(
        { minX: s.minX, maxY: s.maxY, bredd: s.bredd, hojd: s.hojd, rutaM: s.rutaM },
        (i) => inne[i] === 1 && med(band[i]),
        minRutor,
      )) {
        const g = f.geometry;
        if (g.type !== 'Polygon') continue;
        const ring = (g.coordinates[0] ?? []) as [number, number][];
        if (ring.length < 4) continue;
        ut.push({ slag, ruta: ring.map(([lng, lat]) => ({ lat, lng })) });
      }
    };

    if (s.lutning) {
      let l: Uint8Array | null = null;
      try {
        l = avkoda(s.lutning);
      } catch {
        l = null;
      }
      if (l && l.length === n) {
        // Lite brant räknar MED det mycket branta i sig (som i appen), så en kort
        // mycket brant kant i en lång sluttning inte raderar den lite branta ytan.
        // Det mycket branta ritas ovanpå — därför i den ordningen.
        bygg(l, (v) => v !== LUTNING_SAKNAS && v >= BRANT_GRANS.lite, BRANT_MIN, 'brant');
        bygg(l, (v) => v !== LUTNING_SAKNAS && v >= BRANT_GRANS.mycket, BRANT_MIN, 'mycket_brant');
      }
    }
    if (s.fukt) {
      let f: Uint8Array | null = null;
      try {
        f = avkoda(s.fukt);
      } catch {
        f = null;
      }
      if (f && f.length === n) {
        bygg(f, (v) => v === FUKT.fuktig || v === FUKT.blot, BLOTT_MIN, 'fuktigt');
        bygg(f, (v) => v === FUKT.blot, BLOTT_MIN, 'blott');
      }
    }
  }
  return ut;
}

/** Slagen som finns, i den ordning de ska stå i teckenförklaringen. */
export function markSlagen(mark: readonly MarkRuta[]): MarkSlag[] {
  const ordning: MarkSlag[] = ['fuktigt', 'blott', 'brant', 'mycket_brant'];
  return ordning.filter((s) => mark.some((m) => m.slag === s));
}
