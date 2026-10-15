// Fotokön kopplad till appen: IndexedDB (reserv: minne) + Supabase Storage + markeringens rad. Logiken bor i ./fotoKo (ren, testad).
//
//   Ett taget foto → laggFotoIKo (lokalt, beständigt, direkt) → kön laddar upp i bakgrunden: när nätet kommer tillbaka, när appen öppnas/blir synlig
//   och med jämna mellanrum. Misslyckas det försöker kön igen med väntetid — aldrig "ta om bilden".

import { supabase } from '@/lib/supabase';
import { fotoNyckel, skapaFotoKo, skapaIndexedDbLager, skapaMinnesLager, type FotoKo, type PatchSvar } from './fotoKo';
import { MARKERING_FOTO_BUCKET, byggFotoSokvag } from './markeringFotoSokvag';

export const FOTO_UPPE_EVENT = 'markering-foto-uppe';
/** `skapad` = när fotot togs: stabil mellan omförsök, så `photoTs` (som styr signerad URL) inte ändras i onödan */
export interface FotoUppeDetail { objektId: string; markerId: string; sokvag: string; skapad: number }

const lyssnare = new Set<() => void>();
/** Något i kön ändrades (nytt foto, uppe, borttaget). Ger en funktion som avprenumererar. */
export function prenumereraFotoKo(fn: () => void): () => void {
  lyssnare.add(fn);
  return () => { lyssnare.delete(fn); };
}
const meddela = () => lyssnare.forEach((fn) => { try { fn(); } catch { /* */ } });

/** Sätter photoPath på markeringens rad (UPDATE — aldrig upsert, så en borttagen markering inte återuppstår). */
export async function patchaMarkeringFoto(f: { objektId: string; markerId: string; sokvag: string; skapad: number }): Promise<PatchSvar> {
  const { data, error } = await supabase.from('planering_markeringar').select('data').eq('objekt_id', f.objektId).eq('marker_id', f.markerId).maybeSingle();
  if (error) return 'fel';
  if (!data) return 'saknas';   // markeringen är inte synkad (än) — kön väntar och försöker igen
  const ny: Record<string, unknown> = { ...(data.data as Record<string, unknown>), photoPath: f.sokvag, photoTs: f.skapad };
  delete ny.photoData;
  const { data: rader, error: e2 } = await supabase.from('planering_markeringar').update({ data: ny }).eq('objekt_id', f.objektId).eq('marker_id', f.markerId).select('marker_id');
  if (e2) return 'fel';
  return rader && rader.length > 0 ? 'ok' : 'saknas';
}

let kon: Promise<{ ko: FotoKo; varaktig: boolean }> | null = null;
function hamtaKo() {
  if (!kon) {
    kon = (async () => {
      const idb = await skapaIndexedDbLager();
      const lager = idb ?? skapaMinnesLager();
      const ko = skapaFotoKo({
        lager,
        ladda: async (sokvag, blob) => {
          const { error } = await supabase.storage.from(MARKERING_FOTO_BUCKET).upload(sokvag, blob, { contentType: 'image/jpeg', upsert: true });
          if (error) throw new Error(error.message);
        },
        patcha: patchaMarkeringFoto,
        paForandring: meddela,
        paUppe: (f) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<FotoUppeDetail>(FOTO_UPPE_EVENT, { detail: f })); },
      });
      return { ko, varaktig: !!idb };
    })();
  }
  return kon;
}

/** Sparar fotot lokalt direkt. `varaktig=false` = IndexedDB gick inte att öppna (privat läge): fotot ligger bara i minnet tills det är uppe. */
export async function laggFotoIKo(objektId: string, markerId: string, blob: Blob): Promise<{ varaktig: boolean }> {
  const { ko, varaktig } = await hamtaKo();
  await ko.laggTill(objektId, markerId, byggFotoSokvag(objektId, markerId), blob);
  void korFotoKo(true);
  return { varaktig };
}

export async function tomFotoForMarkering(objektId: string, markerId: string): Promise<void> {
  const { ko } = await hamtaKo();
  await ko.tomForMarkering(objektId, markerId);
}

export async function lokaltMarkeringFoto(objektId: string, markerId: string): Promise<Blob | null> {
  const { ko } = await hamtaKo();
  return ko.lokaltFoto(objektId, markerId);
}

/** Nycklar (`objekt/markering`) för alla foton som väntar på uppladdning. */
export async function vantandeFotoNycklar(): Promise<Set<string>> {
  const { ko } = await hamtaKo();
  return new Set((await ko.vantande()).map((f) => f.nyckel));
}

/** Ett varv över kön — bara ett i taget, även mellan flikar (Web Locks där det finns). */
export async function korFotoKo(tvinga = false): Promise<void> {
  try {
    const { ko } = await hamtaKo();
    const nav: any = typeof navigator === 'undefined' ? null : navigator;
    if (nav?.locks?.request) await nav.locks.request('markering-foto-ko', { ifAvailable: true }, async (lock: unknown) => { if (lock) await ko.kor(tvinga); });
    else await ko.kor(tvinga);
  } catch { /* nästa trigger försöker igen */ }
}

/** Startar triggers: nu, när nätet kommer tillbaka, när appen blir synlig och var minut. Ger en funktion som stoppar dem. Anropas EN gång (global startare). */
export function startaFotoKoTriggers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void korFotoKo(true); };
  const synlig = () => { if (document.visibilityState === 'visible') void korFotoKo(true); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void korFotoKo(false); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', synlig);
  const iv = window.setInterval(tick, 60_000);
  void korFotoKo(true);
  // Be webbläsaren behålla lagringen (annars kan ett foto som väntar rensas under minnesbrist).
  try { void (navigator as any).storage?.persist?.(); } catch { /* */ }
  return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', synlig); window.clearInterval(iv); };
}

export { fotoNyckel };
