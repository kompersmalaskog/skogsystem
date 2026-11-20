// Ljud (bucketen `audio`) är PRIVAT sedan 2026-10-23: uppspelning går bara via en kortlivad signerad länk, och bara en
// inloggad medarbetare får skapa en (storage-policyn i migrationen 20261023100000_audio_bucket_privat.sql). Det som
// ligger sparat i databasen (feedback.audio_url, objekt_yta_media.url, markeringarnas ljud) är oförändrat: antingen en
// gammal publik URL (`…/object/public/audio/<sökväg>`) eller en sökväg. `ljudSokvag` plockar ut sökvägen ur båda.
// Uppladdning skriver fortfarande URL-formen (getPublicUrl bara bygger texten) så raderingskoden hittar sökvägen.

export const LJUD_BUCKET = 'audio';
/** Hur länge en uppspelningslänk gäller. Kort: den ska bara räcka till att spela upp. */
export const LJUD_LANK_SEKUNDER = 600;

/** Sökvägen i bucketen, eller null när källan inte ligger i bucketen (blob:, data:, annan adress) och spelas som den är. */
export function ljudSokvag(kalla: string | null | undefined): string | null {
  if (!kalla) return null;
  if (/^(data|blob):/i.test(kalla)) return null;
  const m = kalla.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/audio\/([^?#]+)/) || (/^https?:/i.test(kalla) ? kalla.match(/\/audio\/([^?#]+)$/) : null);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  if (/^https?:/i.test(kalla)) return null;
  return kalla.replace(/^\/+/, '');
}

type StorageKlient = { storage: { from: (b: string) => { createSignedUrl: (path: string, sek: number) => Promise<{ data: { signedUrl?: string } | null; error: { message?: string } | null }> } } };

/** Källan att ge till <audio>: en signerad länk för det som ligger i bucketen, annars källan som den är. Kastar aldrig. */
export async function ljudSpelbarKalla(supabase: StorageKlient, kalla: string | null | undefined): Promise<{ ok: true; url: string } | { ok: false }> {
  if (!kalla) return { ok: false };
  const sokvag = ljudSokvag(kalla);
  if (sokvag === null) return { ok: true, url: kalla };
  try {
    const { data, error } = await supabase.storage.from(LJUD_BUCKET).createSignedUrl(sokvag, LJUD_LANK_SEKUNDER);
    if (error || !data?.signedUrl) return { ok: false };
    return { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false };
  }
}
