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

export const MARKERING_FOTO_BUCKET = 'markering-foton';

/** Längsta sida efter omskalning. */
const MAX_SIDA = 1600;
const KVALITET = 0.7;

/** Har markeringen ett foto — i Storage (photoPath) eller kvar inbäddat (photoData)? */
export function harFoto(m: { photoPath?: string | null; photoData?: string | null } | null | undefined): boolean {
  return !!(m && (m.photoPath || m.photoData));
}

const sakraSegment = (s: string | number) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * Sökväg i bucketen: {objekt_id}/{marker_id}.jpg — ETT foto per markering. Ett omtag skriver
 * över filen (upsert), så inga föräldralösa äldre versioner samlas.
 */
export function byggFotoSokvag(objektId: string | number, markerId: string | number): string {
  return `${sakraSegment(objektId)}/${sakraSegment(markerId)}.jpg`;
}

/** Skalar ner (max 1600 px längsta sida) och komprimerar till JPEG 0.7. */
export async function komprimeraMarkeringFoto(fil: File): Promise<Blob> {
  const bild = await laddaBild(fil);
  const { width, height } = bild;
  const skala = Math.min(1, MAX_SIDA / Math.max(width, height));
  const b = Math.max(1, Math.round(width * skala));
  const h = Math.max(1, Math.round(height * skala));

  const canvas = document.createElement('canvas');
  canvas.width = b;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kunde inte behandla bilden i den här webbläsaren.');
  ctx.drawImage(bild as CanvasImageSource, 0, 0, b, h);
  if ('close' in bild && typeof bild.close === 'function') bild.close();

  return new Promise<Blob>((klar, fel) => {
    canvas.toBlob(
      (blob) => (blob ? klar(blob) : fel(new Error('Kunde inte skapa bildfilen.'))),
      'image/jpeg',
      KVALITET,
    );
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
