// Fotokön för maskinkollen: samma kö som markeringarnas (lib/fotoKo — sparat lokalt direkt, uppladdat när nätet finns, aldrig
// "ta om bilden"), men i en EGEN databas i webbläsaren så de två köerna aldrig ser varandras foton.
//
// Sökvägen bestäms när fotot tas och skrivs i am_svar.foto_url / am_maskinkoll.kontrollfoto_url direkt — raden pekar alltså på
// filen innan den finns i Storage. Kön har därför inget att patcha: när filen är uppe är den klar.

import { supabase } from '@/lib/supabase';
import { skapaFotoKo, skapaIndexedDbLager, skapaMinnesLager, type FotoKo } from '@/lib/fotoKo';
import { komprimeraMarkeringFoto } from '@/lib/markeringFoto';
import { MASKINKOLL_BUCKET } from './regler';

const DB = { db: 'skogsystem-maskinkoll-foton', store: 'maskinkoll_foto_ko' };

let kon: Promise<FotoKo> | null = null;
function hamtaKo(): Promise<FotoKo> {
  if (!kon) {
    kon = (async () => {
      const lager = (await skapaIndexedDbLager(undefined, DB)) ?? skapaMinnesLager();
      return skapaFotoKo({
        lager,
        ladda: async (sokvag, blob) => {
          const { error } = await supabase.storage.from(MASKINKOLL_BUCKET).upload(sokvag, blob, { contentType: 'image/jpeg', upsert: false });
          // Ett omförsök efter en uppladdning som gick fram men vars svar försvann: filen finns redan = klart.
          if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);
        },
        patcha: async () => 'ok',
      });
    })();
  }
  return kon;
}

/** Komprimerar (samma som markeringsfoton, ~200 kB) och lägger fotot i kön. Kastar bara om bilden inte går att läsa. */
export async function laggMaskinkollFoto(kollId: string, del: string, sokvag: string, fil: File): Promise<void> {
  const blob = await komprimeraMarkeringFoto(fil).catch(() => fil);
  const ko = await hamtaKo();
  await ko.laggTill(kollId, del, sokvag, blob);
  void korMaskinkollFotoKo(true);
}

export async function korMaskinkollFotoKo(tvinga = false): Promise<void> {
  try {
    const ko = await hamtaKo();
    const nav: any = typeof navigator === 'undefined' ? null : navigator;
    if (nav?.locks?.request) await nav.locks.request('maskinkoll-foto-ko', { ifAvailable: true }, async (lock: unknown) => { if (lock) await ko.kor(tvinga); });
    else await ko.kor(tvinga);
  } catch { /* nästa trigger försöker igen */ }
}

/** Nu, när nätet kommer tillbaka, när appen blir synlig och var minut. Ger en funktion som stoppar. */
export function startaMaskinkollFotoKo(): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void korMaskinkollFotoKo(true); };
  const synlig = () => { if (document.visibilityState === 'visible') void korMaskinkollFotoKo(true); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void korMaskinkollFotoKo(false); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', synlig);
  const iv = window.setInterval(tick, 60_000);
  void korMaskinkollFotoKo(true);
  return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', synlig); window.clearInterval(iv); };
}
