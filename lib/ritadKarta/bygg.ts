// Bygger det som ritas ur laserdatan: skogsbilden (PNG), hörnen den läggs på, träden och 3D-kronorna. EN funktion för /karta-ritad och för
// bakgrunden "Ritad" i planeringen och maskinen (lib/hooks/useRitadKarta), så de två aldrig ritar skogen olika.

import { avverkadeRutor, bildHorn, klasser, renderaSkog, skak, trad, type Rutnat, type Trad } from './skog';
import { kronor, type Krona } from './kronor';
import { KLASS_FARG } from './stil';

export type Ritat = { url: string; horn: ReturnType<typeof bildHorn>; trad: Trad[]; avverkade: number; kronor: Krona[] };

/** Pixlar per ruta: högst ~1 600 px på längsta sidan, så en stor trakt ritas lika fort. */
export const skalaFor = (rn: Pick<Rutnat, 'bredd' | 'hojd'>) => Math.max(2, Math.min(6, Math.floor(1600 / Math.max(rn.bredd, rn.hojd))));

/** Kräver en webbläsare (canvas). */
export function byggRitat(rn: Rutnat, stammar: { lat: number; lng: number }[]): Ritat {
  const avv = avverkadeRutor(rn, stammar);
  const kl = klasser(rn, avv);
  const bild = renderaSkog(rn, avv, KLASS_FARG, skalaFor(rn));
  const c = document.createElement('canvas');
  c.width = bild.bredd; c.height = bild.hojd;
  c.getContext('2d')!.putImageData(new ImageData(bild.data as Uint8ClampedArray<ArrayBuffer>, bild.bredd, bild.hojd), 0, 0);
  return { url: c.toDataURL('image/png'), horn: bildHorn(rn), trad: trad(rn, kl), avverkade: avv.size, kronor: kronor(rn, avv, skak) };
}

export const tradData = (r: Ritat) => ({
  type: 'FeatureCollection' as const,
  features: r.trad.map((t) => ({ type: 'Feature' as const, properties: { s: t.storlek, k: t.klass }, geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] } })),
});

export const kronorData = (r: Ritat) => ({
  type: 'FeatureCollection' as const,
  features: r.kronor.map((y) => ({ type: 'Feature' as const, properties: { k: y.klass, h: y.hojd, b: y.bas, t: y.ton }, geometry: { type: 'Polygon' as const, coordinates: [y.ring] } })),
});
