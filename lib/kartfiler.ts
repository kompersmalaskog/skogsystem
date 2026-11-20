// Kartbilder-bucketen är PRIVAT (den bär markägardata: namn, telefon,
// e-post i traktdirektiv-PDF:er). ALL läsning går via signerade URL:er
// härifrån — aldrig getPublicUrl. DB lagrar storage-PATHS, inte URL:er;
// helpern tål gamla fulla URL:er under övergången och plockar ut pathen.

import { supabase } from '@/lib/supabase';

const BUCKET = 'kartbilder';

// Storage-path ur ett lagrat värde: rena paths passerar, gamla fulla
// URL:er (public/sign/authenticated) strippas till path. Främmande
// http-URL:er ger null — vi signerar aldrig något vi inte känner igen.
export function kartfilPath(varde: string | null | undefined): string | null {
  if (!varde) return null;
  const s = String(varde);
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/kartbilder\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  if (/^https?:\/\//i.test(s)) return null;
  return s;
}

// Signerad läs-URL (TTL 1h som default). null = kunde inte signeras —
// anroparen ska hantera det ärligt (dölja/logga), inte visa trasig bild.
export async function signeraKartfil(varde: string | null | undefined, ttlSek = 3600): Promise<string | null> {
  const path = kartfilPath(varde);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSek);
  if (error || !data?.signedUrl) {
    console.error('[kartfiler] kunde inte signera', path, error?.message);
    return null;
  }
  return data.signedUrl;
}
