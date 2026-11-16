// Service Worker for push notifications
// Server-push till MASKINEN (lib/hytt/maskinPush): payload.hyttNotis är samma notis som sidan skapar lokalt (samma tag, knappar och data), så en server-push och en lokal notis ersätter varandra.
// Är appen framme (ett fönster som är synligt OCH har fokus) visas ingen notis – kortet i hytten räcker – utan sidan får veta att något hänt och läser besöken direkt.
// Chrome tillåter en push utan notis bara när en sida är synlig, så villkoret måste vara exakt det: annars straffar Chrome oss med en generisk "webbplatsen uppdaterades"-notis.
const HYTT_PUSH = 'hytt-push';

async function hyttPush(n) {
  let framme = false;
  try {
    const lista = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lista) {
      try { c.postMessage({ typ: HYTT_PUSH, tid: Date.now() }); } catch (_) { /* sidan läser om själv */ }
      if (c.visibilityState === 'visible' && c.focused) framme = true;
    }
  } catch (_) { /* matchAll misslyckades – hellre en notis för mycket */ }
  if (framme) return;
  await self.registration.showNotification(n.titel || 'Kompersmåla Skog', {
    body: n.text || '', icon: n.ikon || '/icon.png', badge: n.ikon || '/icon.png', tag: n.tag || 'hytt', renotify: !!n.renotify,
    requireInteraction: n.kvarTillTryck !== false, silent: false, actions: Array.isArray(n.knappar) ? n.knappar : [], data: n.data || { hytt: true, url: '/' },
  });
}

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  if (data && data.hyttNotis && data.hyttNotis.data && data.hyttNotis.data.hytt) {
    event.waitUntil(hyttPush(data.hyttNotis).catch(() => undefined));
    return;
  }
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// "Om något händer" utan täckning (components/arbetsmiljo/OmNagotHander, components/NodStartare).
// Appen ber om NOD_CACHA när den har nät: då hämtas sidan /om-nagot-hander och alla filer den laddar (/_next/static/…) och
// sparas i NOD_CACHE. Sidan och dess filer hämtas sedan NÄT FÖRST — med nät är allt som vanligt, utan nät tas det sparade.
// Utöver kartrutorna (nedan) går INGET annat i appen genom den här workern: bara själva nödsidan och filer som just den sidan begär.
// En utloggad användare (sidan svarar med /login) sparar ingenting — då står den förra sparade kvar.
const NOD_CACHE = 'nod-v1';
const NOD_SIDA = '/om-nagot-hander';
const NOD_CACHA = 'nod-cacha';
const NOD_SIDA_VANTA_MS = 5000;
// Bilder sidan visar utan att de står i dess HTML (toppfältets hemknapp ritas av klienten). Best effort: saknas en sparas sidan ändå.
const NOD_EXTRA = ['/home-icon.png'];

function nodFiler(html) {
  const filer = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-.~/%]+?\.(?:js|css|woff2)/g)) filer.add(m[0]);
  // App-routerns flight-data skriver chunkarna utan "/_next/": "static/chunks/…js" (ibland med \/ i stället för /).
  for (const m of html.replace(/\\\//g, '/').matchAll(/(?:^|["'\s,(])static\/(?:chunks|css)\/[A-Za-z0-9_\-.~/%]+?\.(?:js|css)/g)) {
    filer.add('/_next/' + m[0].replace(/^["'\s,(]/, ''));
  }
  return [...filer];
}

async function nodCacha() {
  const svar = await fetch(NOD_SIDA, { credentials: 'same-origin', cache: 'no-store' });
  let stig = '';
  try { stig = new URL(svar.url).pathname; } catch (_) { return; }
  if (!svar.ok || stig !== NOD_SIDA) return;
  const html = await svar.clone().text();
  const filer = nodFiler(html);
  const hamtade = [];
  for (const f of filer) {
    const r = await fetch(f, { credentials: 'same-origin' });
    if (!r.ok) return; // en fil saknas: behåll det förra sparade hellre än en halv sida
    hamtade.push([f, r]);
  }
  await caches.delete(NOD_CACHE);
  const cache = await caches.open(NOD_CACHE);
  await cache.put(NOD_SIDA, svar);
  for (const [f, r] of hamtade) await cache.put(f, r);
  for (const f of NOD_EXTRA) {
    try { const r = await fetch(f, { credentials: 'same-origin' }); if (r.ok) await cache.put(f, r); } catch (_) { /* utan bilden fungerar sidan ändå */ }
  }
}

async function nodNatForst(req, sida) {
  try {
    const nat = sida
      ? await Promise.race([fetch(req), new Promise((_, nej) => setTimeout(() => nej(new Error('tid')), NOD_SIDA_VANTA_MS))])
      : await fetch(req);
    if (nat.ok || !sida) return nat;
  } catch (_) { /* ingen täckning — ta det sparade */ }
  try {
    const cache = await caches.open(NOD_CACHE);
    const sparad = await cache.match(sida ? NOD_SIDA : req, { ignoreSearch: sida });
    if (sparad) return sparad;
  } catch (_) { /* inget sparat */ }
  return fetch(req);
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('message', (event) => {
  if (event.data && event.data.typ === NOD_CACHA) event.waitUntil(nodCacha().catch(() => undefined));
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// KARTRUTOR (lib/kartNedladdning, Martin 2026-11-02): Lantmäteriets bakgrunder (/api/forarkarta?…z=…) och höjddatan (AWS terrarium)
// tas ur det sparade FÖRST — kartan kommer direkt, också utan täckning. KART_CACHE fylls av "Ladda ner trakten" i sidan och rensas där
// (de senaste trakterna). En ruta som visas med nät sparas också i KART_LOPANDE, som hålls under KART_LOPANDE_MAX rutor.
// Bara bilder sparas (en utgången session ger inloggningssidan, inte en ruta). OpenStreetMap går aldrig hit — deras regler.
// Namnen måste vara ordagrant lika lib/kartNedladdning.ts (vaktas av ett test).
const KART_CACHE = 'kartrutor-v1';
const KART_LOPANDE = 'kartrutor-lopande-v1';
const KART_LOPANDE_MAX = 3000;
// Ritads vägar och vatten (OpenFreeMap, vektorrutor): rutorna ligger under en versionsmapp och ändras aldrig → sparat först. Beskrivningen
// av källan (/planet, pekar ut versionen) hämtas med nät först och tas ur det sparade utan nät. Få och små — ingen gräns.
const KART_VEKTOR = 'kartrutor-vektor-v1';
const OFM_HOST = 'tiles.openfreemap.org';
let kartSparade = 0;

function arKartruta(url) {
  if (url.origin === self.location.origin) return url.pathname === '/api/forarkarta' && url.searchParams.has('z');
  return url.hostname === 's3.amazonaws.com' && url.pathname.indexOf('/elevation-tiles-prod/terrarium/') === 0;
}
const arBild = (r) => !!r && r.ok && (r.headers.get('content-type') || '').indexOf('image/') === 0;

async function kartRensa(cache) {
  try {
    const nycklar = await cache.keys();
    for (let i = 0; i < nycklar.length - KART_LOPANDE_MAX; i++) await cache.delete(nycklar[i]);   // äldst först
  } catch (_) { /* nästa gång */ }
}

const arVektorSvar = (r) => !!r && r.ok && /protobuf|mapbox-vector-tile|octet-stream/.test(r.headers.get('content-type') || '');

async function vektorruta(req) {
  try { const sparad = await (await caches.open(KART_VEKTOR)).match(req.url); if (sparad) return sparad; } catch (_) { /* */ }
  const svar = await fetch(req);
  if (arVektorSvar(svar)) { try { await (await caches.open(KART_VEKTOR)).put(req.url, svar.clone()); } catch (_) { /* */ } }
  return svar;
}

async function vektorKalla(req) {
  try {
    const svar = await fetch(req);
    if (svar.ok) { try { await (await caches.open(KART_VEKTOR)).put(req.url, svar.clone()); } catch (_) { /* */ } }
    return svar;
  } catch (e) {
    try { const sparad = await (await caches.open(KART_VEKTOR)).match(req.url); if (sparad) return sparad; } catch (_) { /* */ }
    throw e;
  }
}

async function kartruta(req) {
  const nyckel = req.url;
  try {
    const sparad = (await (await caches.open(KART_CACHE)).match(nyckel)) || (await (await caches.open(KART_LOPANDE)).match(nyckel));
    if (sparad) return sparad;
  } catch (_) { /* Cache API saknas — hämta som vanligt */ }
  const svar = await fetch(req);
  if (arBild(svar)) {
    try {
      const lopande = await caches.open(KART_LOPANDE);
      await lopande.put(nyckel, svar.clone());
      if (++kartSparade % 100 === 0) kartRensa(lopande);
    } catch (_) { /* full — kartan visas ändå */ }
  }
  return svar;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// LAGRENS RUTOR (lib/lagerRutor, Martin 2026-11-13): markfuktighet, sumpskog, nyckelbiotoper … sparas på enheten när de visas och tas
// ur det sparade FÖRST. Mätt: Markfuktighet = 54 rutor, över 5 MB och 6,6 s varje gång lagret tändes — andra gången kommer det nu direkt,
// också utan täckning. Ett lager blir aldrig äldre än sin period (data som ändras 7 dagar, fasta kartor 30): cachens namn bär periodens
// nummer, så en ny period hämtar på nytt; förra periodens rutor används bara när nätet saknas. Bara bilder sparas.
const LAGER_CACHE = 'lagerrutor-v1';
const LAGER_MAX = 4000;
const LAGER_VARDAR = ['geodpags.skogsstyrelsen.se', 'inspire.msb.se', 'maps3.sgu.se', 'geo-netinfo.trafikverket.se'];
const LAGER_FASTA = /sks_|lm_skuggning|nmd_|sumpskog|ackumulation|jord/i;   // kartor som inte ändras från vecka till vecka
const DYGN_MS = 86400000;
let lagerSparade = 0;

function arLagerruta(url) {
  let bbox = false;
  url.searchParams.forEach((_, k) => { if (k.toLowerCase() === 'bbox') bbox = true; });
  if (!bbox) return false;
  if (url.origin === self.location.origin) return url.pathname === '/api/wms-proxy';
  return LAGER_VARDAR.indexOf(url.hostname) !== -1;
}

async function lagerStada(nu) {
  try {
    const namn = await caches.keys();
    for (const n of namn) {
      const m = /^lagerrutor-v1-(\d+)-(\d+)$/.exec(n);
      if (m && Number(m[2]) < Math.floor(nu / (Number(m[1]) * DYGN_MS)) - 1) await caches.delete(n);
    }
  } catch (_) { /* nästa gång */ }
}

async function lagerruta(req, url) {
  const dagar = LAGER_FASTA.test(url.search) ? 30 : 7;
  const nu = Date.now();
  const period = Math.floor(nu / (dagar * DYGN_MS));
  const namn = LAGER_CACHE + '-' + dagar + '-' + period;
  try { const sparad = await (await caches.open(namn)).match(req.url); if (sparad) return sparad; } catch (_) { /* hämta som vanligt */ }
  let svar;
  try { svar = await fetch(req); }
  catch (e) {
    try { const gammal = await (await caches.open(LAGER_CACHE + '-' + dagar + '-' + (period - 1))).match(req.url); if (gammal) return gammal; } catch (_) { /* */ }
    throw e;
  }
  if (arBild(svar)) {
    try {
      const c = await caches.open(namn);
      await c.put(req.url, svar.clone());
      if (++lagerSparade % 100 === 0) {
        const nycklar = await c.keys();
        for (let i = 0; i < nycklar.length - LAGER_MAX; i++) await c.delete(nycklar[i]);
        lagerStada(nu);
      }
    } catch (_) { /* full — lagret visas ändå */ }
  }
  return svar;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (arLagerruta(url)) { event.respondWith(lagerruta(req, url)); return; }
  if (url.hostname === OFM_HOST) {
    if (url.pathname.endsWith('.pbf')) { event.respondWith(vektorruta(req)); return; }
    if (url.pathname === '/planet') { event.respondWith(vektorKalla(req)); return; }
    return;
  }
  if (arKartruta(url)) { event.respondWith(kartruta(req)); return; }
  if (url.origin !== self.location.origin) return;
  const sida = req.mode === 'navigate' && url.pathname === NOD_SIDA;
  const franSidan = !sida && (url.pathname.startsWith('/_next/static/') || NOD_EXTRA.indexOf(url.pathname) !== -1)
    && typeof req.referrer === 'string' && req.referrer.indexOf(NOD_SIDA) !== -1;
  if (!sida && !franSidan) return;
  event.respondWith(nodNatForst(req, sida));
});
