// Service Worker for push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Kompersmåla Skog';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'kompersmala',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tryck på notisen → rätt vy. Måste fungera på iOS-hemskärmsappar, där workerns egen navigering är opålitlig
// (se lib/pushKlick.ts): navigate() kastar och hade förr avvisat hela löftet utan att något öppnades, och
// openWindow(url) landar på senast öppnade sida/roten. Därför: (1) absolut url mot workerns egen origin,
// (2) målet lagras i Cache API och skickas med postMessage så SIDAN byter sida själv (components/PushNavigering.tsx),
// (3) varje steg i eget try/catch, (4) openWindow som sista utväg om inget fönster kunde fokuseras. Löftet avvisas aldrig.
// Konstanterna nedan måste vara ordagrant lika lib/pushKlick.ts (vaktas av ett test).
const PUSH_MAL_CACHE = 'push-mal-v1';
const PUSH_MAL_NYCKEL = '/__push-mal';
const PUSH_NAVIGERA = 'push-navigera';

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  let mal;
  try { mal = new URL((data && data.url) || '/', self.location.origin).href; } catch (_) { mal = self.location.origin + '/'; }

  event.waitUntil((async () => {
    // Lagra målet: sidan läser det vid start / när appen blir synlig (täcker openWindow som landar på fel sida).
    try {
      const cache = await caches.open(PUSH_MAL_CACHE);
      await cache.put(PUSH_MAL_NYCKEL, new Response(JSON.stringify({ url: mal, t: Date.now() })));
    } catch (_) { /* Cache API saknas/full — då återstår postMessage och openWindow */ }

    let fokuserad = false;
    try {
      const lista = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const fonster = lista.find((c) => { try { return new URL(c.url).origin === self.location.origin; } catch (_) { return false; } });
      if (fonster) {
        try { await fonster.focus(); fokuserad = true; } catch (_) { /* iOS: kan avvisas */ }
        try { fonster.postMessage({ typ: PUSH_NAVIGERA, url: mal }); } catch (_) { /* sidan läser lagrat mål ändå */ }
        // Bästa försök: navigate() kastar på iOS. Får aldrig avvisa löftet.
        if (fokuserad && 'navigate' in fonster && fonster.url !== mal) {
          try { await fonster.navigate(mal); } catch (_) { /* sidan navigerar själv */ }
        }
      }
    } catch (_) { /* matchAll misslyckades — openWindow nedan */ }

    if (!fokuserad) {
      try { await clients.openWindow(mal); } catch (_) { /* inget mer att göra härifrån */ }
    }
  })());
});
