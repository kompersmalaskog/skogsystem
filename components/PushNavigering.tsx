'use client';
import { useEffect } from 'react';
import { PUSH_MAL_CACHE, PUSH_MAL_NYCKEL, PUSH_NAVIGERA, valjNavigering, type LagratMal } from '@/lib/pushKlick';

/**
 * Tar emot "gå hit" från service workern när någon trycker på en push-notis (public/sw.js, lib/pushKlick.ts).
 * Workerns egen navigering är opålitlig på iOS-hemskärmsappar, så SIDAN byter sida själv:
 *  1. postMessage från workern (appen är igång),
 *  2. lagrat mål i Cache API vid start och när appen blir synlig igen (appen startades av trycket, eller openWindow
 *     landade på senast öppnade sida/roten).
 * Det lagrade målet läses EN gång (raderas först) och gäller bara om det är färskt och på samma origin.
 */
export default function PushNavigering({
  navigera = (url: string) => window.location.assign(url),
}: {
  /** Injicerbar så testet kan ersätta den (jsdom tillåter inte att location.assign byts ut). */
  navigera?: (url: string) => void;
} = {}) {
  useEffect(() => {
    let avbruten = false;

    const nuLage = () => ({ origin: window.location.origin, pathname: window.location.pathname, search: window.location.search, tid: Date.now() });
    const gaTill = (mal: string) => { if (!avbruten) navigera(mal); };

    const lasLagrat = async () => {
      if (typeof caches === 'undefined') return;
      try {
        const cache = await caches.open(PUSH_MAL_CACHE);
        const svar = await cache.match(PUSH_MAL_NYCKEL);
        if (!svar) return;
        await cache.delete(PUSH_MAL_NYCKEL); // EN gång: ett gammalt mål får aldrig navigera om vid nästa start
        const mal = (await svar.json()) as LagratMal;
        const dit = valjNavigering(mal, nuLage());
        if (dit) gaTill(dit);
      } catch { /* Cache API otillgängligt — då gäller postMessage-vägen */ }
    };

    const vidMeddelande = (e: MessageEvent) => {
      if (!e.data || e.data.typ !== PUSH_NAVIGERA || typeof e.data.url !== 'string') return;
      const dit = valjNavigering({ url: e.data.url, t: Date.now() }, nuLage());
      if (dit) gaTill(dit);
    };
    const vidSynlig = () => { if (document.visibilityState === 'visible') void lasLagrat(); };

    void lasLagrat();
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    sw?.addEventListener('message', vidMeddelande);
    document.addEventListener('visibilitychange', vidSynlig);
    return () => {
      avbruten = true;
      sw?.removeEventListener('message', vidMeddelande);
      document.removeEventListener('visibilitychange', vidSynlig);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
