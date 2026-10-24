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

// Notiser från hytten (lib/hytt/notiser.ts) bär data.hytt = true och kan ha knappar. "Uppfattat" kvitterar DIREKT härifrån (ingen app öppnas, inget fönster tas fram) mot samma serverrutt och
// samma regler som kortet i hytten (/api/besok/hytt/kvittera: maskin, roll, förare och tid avgörs av servern). Går det inte (ingen täckning, utgången session) öppnas appen i stället, där kortet
// med Uppfattat finns kvar. "Öppna kartan" och ett tryck på själva notisen gör som en vanlig notis: appen fokuseras. Konstanterna nedan är samma som lib/hytt/notiser.ts.
const HYTT_KVITTERA = '/api/besok/hytt/kvittera';
const HYTT_UPPFATTAT = 'hytt-uppfattat';

async function skickaTillSidor(meddelande) {
  try {
    const lista = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lista) { try { c.postMessage(meddelande); } catch (_) { /* sidan läser om själv */ } }
  } catch (_) { /* inga sidor att berätta för */ }
}

async function oppnaApp(mal) {
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
}

async function hyttUppfattat(data, mal) {
  // Testnotisen i Inställningar kvitterar inget — den berättar bara för sidan att knappen trycktes.
  if (data.typ === 'test') { await skickaTillSidor({ typ: HYTT_UPPFATTAT, test: true, tid: Date.now() }); return; }
  try {
    if (data.besokId && data.maskinId) {
      const r = await fetch(HYTT_KVITTERA, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ besok_id: data.besokId, maskin_id: data.maskinId, ...(data.test ? { testlage: true } : {}) }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok) { await skickaTillSidor({ typ: HYTT_UPPFATTAT, besokId: data.besokId, tid: Date.now() }); return; }
    }
  } catch (_) { /* ingen täckning — appen öppnas nedan */ }
  await oppnaApp(mal);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  let mal;
  try { mal = new URL((data && data.url) || '/', self.location.origin).href; } catch (_) { mal = self.location.origin + '/'; }

  if (data && data.hytt && event.action === 'uppfattat') {
    event.waitUntil(hyttUppfattat(data, mal).catch(() => undefined));
    return;
  }
  if (data && data.hytt && data.typ === 'test') { event.waitUntil(skickaTillSidor({ typ: 'hytt-testnotis-oppnad', tid: Date.now() }).then(() => oppnaApp(mal))); return; }
  event.waitUntil(oppnaApp(mal));
});
