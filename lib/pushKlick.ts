/**
 * Tryck på en push-notis → rätt vy. Delad logik mellan service workern (public/sw.js, ren JS utan importer) och sidan
 * (components/PushNavigering.tsx).
 *
 * Varför sidan hjälper till: på iOS-hemskärmsappar är service workerns egen navigering opålitlig —
 *  - WindowClient.navigate() kastar ("navigate failed") och hela notificationclick-löftet avvisas → inget öppnas,
 *  - clients.openWindow(url) öppnar appen på SENAST ÖPPNADE sida eller roten i stället för url (WebKit 263687).
 * Därför lagrar workern målet i Cache API (samma origin som sidan) och skickar det även med postMessage; sidan läser
 * det vid start, när appen blir synlig och när meddelandet kommer, och byter själv sida — EN gång, och bara om målet är färskt.
 */

/** Måste stå ordagrant likadant i public/sw.js (vaktas av lib/pushKlick.test.ts). */
export const PUSH_MAL_CACHE = 'push-mal-v1';
export const PUSH_MAL_NYCKEL = '/__push-mal';
export const PUSH_MAL_MAX_ALDER_MS = 2 * 60 * 1000;
export const PUSH_NAVIGERA = 'push-navigera';

export type LagratMal = { url: string; t: number };

/**
 * Vart ska sidan navigera? Returnerar en url (path + query) eller null.
 * null när målet är gammalt/ogiltigt, ligger på ett annat origin, eller sidan REDAN är där (ingen omladdning i onödan).
 */
export function valjNavigering(
  mal: Partial<LagratMal> | null | undefined,
  nu: { origin: string; pathname: string; search: string; tid: number },
): string | null {
  if (!mal || typeof mal.url !== 'string' || typeof mal.t !== 'number') return null;
  if (nu.tid - mal.t > PUSH_MAL_MAX_ALDER_MS || mal.t > nu.tid + PUSH_MAL_MAX_ALDER_MS) return null;
  let u: URL;
  try { u = new URL(mal.url, nu.origin); } catch { return null; }
  if (u.origin !== nu.origin) return null;
  const mot = u.pathname + u.search;
  if (mot === nu.pathname + nu.search) return null;
  return mot + u.hash;
}
