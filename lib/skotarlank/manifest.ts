// Appmanifestet för skotarsidan: start och räckvidd = just den länken, helskärm, appens ikoner.

export function skotarManifest(token: string) {
  const start = `/skotare/${token}`;
  return {
    id: start,
    name: 'Skotning – Kompersmåla Skog',
    short_name: 'Skotning',
    description: 'Körspår och högar på trakten',
    start_url: start,
    scope: start,
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    theme_color: '#000000',
    background_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
