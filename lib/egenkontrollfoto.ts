// Egenkontrollens foton: komprimering, uppladdning och signerad lasning.
//
// BUCKETEN AR PRIVAT. Databasen lagrar PATH, aldrig URL. All lasning gar via
// createSignedUrl harifran - aldrig getPublicUrl. Samma monster som
// lib/kartfiler.ts, av samma skal: bilderna visar markagarens trakt.
//
// PREVIEW OCH PRODUKTION DELAR BUCKET. Allt som laddas upp fran en preview
// hamnar i skarp lagring. Darfor ar rundans id forsta mappniva - da gar en
// runda att stada bort som en enhet, filer och allt.

import { supabase } from '@/lib/supabase';

const BUCKET = 'egenkontroll-foto';

/** Langsta sida efter omskalning. */
const MAX_SIDA = 1600;
/** Mal for filstorleken. Kvaliteten sanks stegvis tills bilden ryms. */
const MAL_BYTES = 300 * 1024;
/** Under detta slutar vi sanka - suddig bild bevisar ingenting. */
const LAGSTA_KVALITET = 0.5;

/**
 * Skalar ner och komprimerar en kamerabild.
 *
 * VARFOR: planeringsvyns foton gar rakt in i JSONB som base64 utan nagon
 * omskalning alls - 21 markeringar bar i dag 171 MB, i snitt 8,3 MB per bild.
 * Det upprepar vi inte. En avvikelsebild ska vara laslig i falt, inte
 * arkivkvalitet.
 *
 * Returnerar alltid JPEG. Bucketen tillater aven webp, men JPEG far ratt
 * storlek pa alla telefoner utan att vi behover grena pa stod.
 */
export async function komprimeraBild(fil: File): Promise<Blob> {
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

  // Sank kvaliteten stegvis tills bilden ryms. Ett enda hopp traffar antingen
  // for stort eller onodigt fult - stegen ger minsta tillrackliga forlust.
  for (const kvalitet of [0.82, 0.72, 0.62, LAGSTA_KVALITET]) {
    const blob = await tillBlob(canvas, kvalitet);
    if (blob.size <= MAL_BYTES || kvalitet === LAGSTA_KVALITET) return blob;
  }
  throw new Error('Kunde inte komprimera bilden.');
}

/** createImageBitmap nar den finns (ratt EXIF-rotation), annars <img>. */
async function laddaBild(fil: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(fil, { imageOrientation: 'from-image' });
    } catch {
      // Faller igenom till img-vagen nedan.
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

function tillBlob(canvas: HTMLCanvasElement, kvalitet: number): Promise<Blob> {
  return new Promise((klar, fel) => {
    canvas.toBlob(
      (b) => (b ? klar(b) : fel(new Error('Kunde inte skapa bildfilen.'))),
      'image/jpeg',
      kvalitet,
    );
  });
}

/**
 * Sokvag i bucketen. Rundans id ar forsta mappniva - se filhuvudet.
 * Tidsstampeln gor att ett omtag inte skriver over foregaende bild.
 */
export function byggSokvag(egenkontrollId: string, punktId: string): string {
  return `${egenkontrollId}/${punktId}-${Date.now()}.jpg`;
}

/**
 * Laddar upp en redan komprimerad bild. Returnerar sokvagen.
 *
 * upsert: false - varje bild far en egen sokvag, och en krock ska larma i
 * stallet for att tyst skriva over nagon annans fil.
 */
export async function laddaUppFoto(sokvag: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(sokvag, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Bilden kunde inte laddas upp: ${error.message}`);
  return sokvag;
}

/**
 * Signerad las-URL. null = kunde inte signeras - anroparen ska visa ett
 * arligt tomt tillstand, aldrig en trasig bildikon.
 */
export async function signeraFoto(
  sokvag: string | null | undefined,
  ttlSek = 3600,
): Promise<string | null> {
  if (!sokvag) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(sokvag, ttlSek);
  if (error || !data?.signedUrl) {
    console.error('[egenkontrollfoto] kunde inte signera', sokvag, error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Tar bort filer ur bucketen. Kaskaden pa tabellen tar rader, inte filer. */
export async function raderaFoton(sokvagar: string[]): Promise<void> {
  if (sokvagar.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(sokvagar);
  if (error) throw new Error(`Kunde inte radera bilderna: ${error.message}`);
}
