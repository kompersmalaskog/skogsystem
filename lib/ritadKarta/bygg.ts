// Bygger det som ritas ur laserdatan: skogsbilden (PNG), hörnen den läggs på, träden och 3D-kronorna. EN funktion för /karta-ritad och för
// bakgrunden "Ritad" i planeringen och maskinen (lib/hooks/useRitadKarta), så de två aldrig ritar skogen olika.
//
// Med marken (lib/ritadKarta/mark.ts) läggs i SAMMA bild: blöt mark som blå ton och terrängskuggningen (soft-light, så skogens färger
// behålls och bara backarna blir ljusare/mörkare). Brant mark blir egna ytor (`brant`) för ett snedstreckslager på kartan.

import { avverkadeRutor, bildHorn, klasser, renderaKlasser, renderaSkog, skak, trad, type Rutnat, type Trad } from './skog';
import { kronor, type Krona } from './kronor';
import { KLASS_FARG } from './stil';
import { FUKT_FARG, brantYtor, type MarkRutnat } from './mark';

export type Ritat = {
  url: string; horn: ReturnType<typeof bildHorn>; trad: Trad[]; avverkade: number; kronor: Krona[];
  /** Brant mark (lng/lat), tom utan marken. */
  brant: GeoJSON.FeatureCollection;
};

/** Hur mycket terrängskuggningen syns (0–1). */
export const SKUGGA_STYRKA = 0.85;

/** Pixlar per ruta: högst ~1 600 px på längsta sidan, så en stor trakt ritas lika fort. */
export const skalaFor = (rn: Pick<Rutnat, 'bredd' | 'hojd'>) => Math.max(2, Math.min(6, Math.floor(1600 / Math.max(rn.bredd, rn.hojd))));

const tomFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Kräver en webbläsare (canvas). `mark` och `skugga` är valfria: saknas de ritas skogen ensam. */
export function byggRitat(rn: Rutnat, stammar: { lat: number; lng: number }[], mark?: MarkRutnat | null, skugga?: CanvasImageSource | null): Ritat {
  const avv = avverkadeRutor(rn, stammar);
  const kl = klasser(rn, avv);
  const bild = renderaSkog(rn, avv, KLASS_FARG, skalaFor(rn));
  const c = document.createElement('canvas');
  c.width = bild.bredd; c.height = bild.hojd;
  const g = c.getContext('2d')!;
  g.putImageData(new ImageData(bild.data as Uint8ClampedArray<ArrayBuffer>, bild.bredd, bild.hojd), 0, 0);

  if (mark) {
    // Blött: egen mjuk bild i markens rutnät, utsträckt över samma utsnitt.
    const msk = Math.max(1, Math.round((bild.bredd / mark.bredd)));
    const f = renderaKlasser(mark.bredd, mark.hojd, mark.fukt, FUKT_FARG, msk);
    const fc = document.createElement('canvas');
    fc.width = f.bredd; fc.height = f.hojd;
    fc.getContext('2d')!.putImageData(new ImageData(f.data as Uint8ClampedArray<ArrayBuffer>, f.bredd, f.hojd), 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(fc, 0, 0, c.width, c.height);
  }
  if (skugga) {
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = SKUGGA_STYRKA;
    g.drawImage(skugga, 0, 0, c.width, c.height);
    g.restore();
    // Rutor utan data ska förbli genomskinliga: skuggningen får bara finnas där skogsbilden finns.
    g.save();
    g.globalCompositeOperation = 'destination-in';
    const maskC = document.createElement('canvas');
    maskC.width = bild.bredd; maskC.height = bild.hojd;
    maskC.getContext('2d')!.putImageData(new ImageData(bild.data as Uint8ClampedArray<ArrayBuffer>, bild.bredd, bild.hojd), 0, 0);
    g.drawImage(maskC, 0, 0);
    g.restore();
  }

  return {
    url: c.toDataURL('image/png'), horn: bildHorn(rn), trad: trad(rn, kl), avverkade: avv.size, kronor: kronor(rn, avv, skak),
    brant: mark ? brantYtor(mark) : tomFC,
  };
}

export const tradData = (r: Ritat) => ({
  type: 'FeatureCollection' as const,
  features: r.trad.map((t) => ({ type: 'Feature' as const, properties: { s: t.storlek, k: t.klass }, geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] } })),
});

export const kronorData = (r: Ritat) => ({
  type: 'FeatureCollection' as const,
  features: r.kronor.map((y) => ({ type: 'Feature' as const, properties: { k: y.klass, h: y.hojd, b: y.bas, t: y.ton }, geometry: { type: 'Polygon' as const, coordinates: [y.ring] } })),
});
