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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Försök hitta en befintlig flik på samma path och navigera dit
      for (const client of clientList) {
        try {
          const cu = new URL(client.url);
          const tu = new URL(targetUrl, client.url);
          if (cu.origin === tu.origin && cu.pathname === tu.pathname && 'focus' in client) {
            return client.focus().then((c) => {
              if (client.url !== tu.toString() && 'navigate' in client) {
                return client.navigate(tu.toString());
              }
              return c;
            });
          }
        } catch (_) { /* ignore */ }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
