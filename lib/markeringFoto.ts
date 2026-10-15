// Planeringsvyns markeringsfoton: komprimering, uppladdning och signerad läsning.
//
// VARFÖR: fotona låg som base64 i planering_markeringar.data.photoData utan omskalning
// (22 rader = ~180 MB av tabellens 299 MB). Postgres måste packa upp hela data för att
// läsa ett enda fält → alla frågor mot tabellen riskerade statement timeout.
//
// BUCKETEN ÄR PRIVAT. data lagrar PATH (data.photoPath), aldrig URL. All läsning går via
// createSignedUrl härifrån — aldrig getPublicUrl. Samma mönster som lib/egenkontrollfoto.ts.
//
// BAKÅTKOMPATIBELT: markeringar som ännu bär photoData visas som förut tills de migrerats.

import { supabase } from '@/lib/supabase';
import { MARKERING_FOTO_BUCKET, harFoto, byggFotoSokvag } from './markeringFotoSokvag';

// Rena helpers bor i ./markeringFotoSokvag (utan supabase-import → delas med migreringsskriptet).
export { MARKERING_FOTO_BUCKET, harFoto, byggFotoSokvag };


/** Mål för filstorleken: ett foto över dålig täckning ska hinna upp (förut ~600 KB i snitt, upp till 1,2 MB). */
export const MAL_BYTES = 200 * 1024;
/**
 * Steg från bäst till knappast acceptabelt (längsta sida i px, JPEG-kvalitet). Första som ryms under MAL_BYTES vinner; ryms inget tas det sista.
 * Text på en skylt ska fortfarande gå att läsa: 960 px och kvalitet 0,5 är botten, aldrig under.
 */
export const KOMPRIMERINGSSTEG: ReadonlyArray<{ sida: number; kvalitet: number }> = [
  { sida: 1280, kvalitet: 0.72 }, { sida: 1280, kvalitet: 0.62 }, { sida: 1280, kvalitet: 0.52 }, { sida: 1100, kvalitet: 0.5 }, { sida: 960, kvalitet: 0.5 },
];

/** Skalar ner (max 1280 px längsta sida) och komprimerar till JPEG, stegvis tills filen är under ~200 KB. */
export async function komprimeraMarkeringFoto(fil: File): Promise<Blob> {
  const bild = await laddaBild(fil);
  const { width, height } = bild;
  try {
    let blob: Blob | null = null;
    for (const steg of KOMPRIMERINGSSTEG) {
      blob = await ritaTillJpeg(bild, width, height, steg.sida, steg.kvalitet);
      if (blob.size <= MAL_BYTES) return blob;
    }
    return blob as Blob;
  } finally {
    if ('close' in bild && typeof bild.close === 'function') bild.close();
  }
}

async function ritaTillJpeg(bild: ImageBitmap | HTMLImageElement, width: number, height: number, maxSida: number, kvalitet: number): Promise<Blob> {
  const skala = Math.min(1, maxSida / Math.max(width, height));
  const b = Math.max(1, Math.round(width * skala));
  const h = Math.max(1, Math.round(height * skala));
  const canvas = document.createElement('canvas');
  canvas.width = b;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kunde inte behandla bilden i den här webbläsaren.');
  ctx.drawImage(bild as CanvasImageSource, 0, 0, b, h);
  return new Promise<Blob>((klar, fel) => {
    canvas.toBlob((blob) => (blob ? klar(blob) : fel(new Error('Kunde inte skapa bildfilen.'))), 'image/jpeg', kvalitet);
  });
}

/** createImageBitmap när den finns (rätt EXIF-rotation), annars <img>. */
async function laddaBild(fil: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(fil, { imageOrientation: 'from-image' });
    } catch {
      // Faller igenom till img-vägen nedan.
    }
  }
  const url = URL.createObjectURL(fil);
  try {
    return await new Promise<HTMLImageElement>((klar, fel) => {
      const img = new Image();
      img.onload = () => klar(img);
      img.onerror = () => fel(new Error('Kunde inte läsa bilden.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Laddar upp en komprimerad bild. upsert: ett omtag ersätter markeringens förra foto. */
export async function laddaUppMarkeringFoto(sokvag: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage
    .from(MARKERING_FOTO_BUCKET)
    .upload(sokvag, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Fotot kunde inte laddas upp: ${error.message}`);
  return sokvag;
}

/** Signerad läs-URL. null = kunde inte signeras — anroparen visar ett ärligt tomt tillstånd. */
export async function signeraMarkeringFoto(sokvag: string | null | undefined, ttlSek = 3600): Promise<string | null> {
  if (!sokvag) return null;
  const { data, error } = await supabase.storage.from(MARKERING_FOTO_BUCKET).createSignedUrl(sokvag, ttlSek);
  if (error || !data?.signedUrl) {
    console.error('[markeringFoto] kunde inte signera', sokvag, error?.message);
    return null;
  }
  return data.signedUrl;
}
