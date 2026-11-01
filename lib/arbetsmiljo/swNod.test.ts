/**
 * "Om något händer" utan täckning — den RIKTIGA public/sw.js i en sandbox (fejkade fetch och caches).
 *  • NOD_CACHA sparar sidan och alla dess filer; en utloggad (svaret blev /login) sparar inget.
 *  • Saknas en fil sparas inget nytt — det förra står kvar hellre än en halv sida.
 *  • Utan nät tas sidan (oavsett ?kort=) och dess filer ur det sparade; med nät går allt till nätet.
 *  • INGET annat i appen går genom workern: andra sidor, andra filer, POST och andra domäner rörs inte.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const SW = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://app.exempel.se';

const HTML = `<!doctype html><html><head><link rel="stylesheet" href="/_next/static/css/abc.css"></head><body>
<script src="/_next/static/chunks/webpack-1.js" async></script>
<script>self.__next_f.push([1,"2:I[\\"static/chunks/app/om-nagot-hander/page-9f.js\\"]"])</script></body></html>`;

function cacheStub() {
  const lager = new Map<string, Map<string, any>>();
  const caches = {
    open: async (namn: string) => {
      if (!lager.has(namn)) lager.set(namn, new Map());
      const m = lager.get(namn)!;
      return {
        put: async (nyckel: any, svar: any) => { m.set(typeof nyckel === 'string' ? nyckel : new URL(nyckel.url).pathname, svar); },
        match: async (nyckel: any) => m.get(typeof nyckel === 'string' ? nyckel : new URL(nyckel.url).pathname),
      };
    },
    delete: async (namn: string) => lager.delete(namn),
  };
  return { caches, lager };
}

const svar = (body: string, o: { ok?: boolean; url?: string } = {}) => ({ ok: o.ok ?? true, url: o.url ?? `${ORIGIN}/om-nagot-hander`, text: async () => body, clone() { return this; }, body });

function ladda(fetchImpl: (u: any) => Promise<any>) {
  const hanterare: Record<string, (e: any) => void> = {};
  const { caches, lager } = cacheStub();
  const fetchMock = vi.fn(fetchImpl);
  const self = { location: { origin: ORIGIN }, registration: {}, clients: { claim: async () => {} }, skipWaiting: () => {}, addEventListener: (t: string, fn: (e: any) => void) => { hanterare[t] = fn; } };
  vm.runInNewContext(SW, { self, clients: {}, caches, fetch: fetchMock, URL, Response, Date, JSON, Promise, Set, setTimeout });
  return { hanterare, fetch: fetchMock, lager };
}

async function cacha(w: ReturnType<typeof ladda>) {
  let lofte: Promise<unknown> | undefined;
  w.hanterare.message({ data: { typ: 'nod-cacha' }, waitUntil: (p: Promise<unknown>) => { lofte = p; } });
  await lofte;
}

/** Skickar ett fetch-event. undefined = workern rörde det inte (webbläsaren tar det som vanligt). */
async function hamta(w: ReturnType<typeof ladda>, req: { url: string; mode?: string; method?: string; referrer?: string }) {
  let svarLofte: Promise<any> | undefined;
  w.hanterare.fetch({ request: { method: 'GET', mode: 'cors', referrer: '', ...req }, respondWith: (p: Promise<any>) => { svarLofte = p; } });
  return svarLofte ? await svarLofte : undefined;
}

const natSvar = (u: any) => {
  const url = typeof u === 'string' ? u : u.url;
  if (url.endsWith('/om-nagot-hander')) return Promise.resolve(svar(HTML));
  return Promise.resolve(svar(`fil ${url}`, { url }));
};

describe('service workern: nödsidan utan täckning', () => {
  it('sparar sidan och alla dess filer, också de som bara står i flight-datan', async () => {
    const w = ladda(natSvar);
    await cacha(w);
    expect([...w.lager.get('nod-v1')!.keys()].sort()).toEqual([
      '/_next/static/chunks/app/om-nagot-hander/page-9f.js', '/_next/static/chunks/webpack-1.js', '/_next/static/css/abc.css', '/om-nagot-hander',
    ]);
  });

  it('utloggad (svaret blev /login): sparar ingenting', async () => {
    const w = ladda(async () => svar('<html>login</html>', { url: `${ORIGIN}/login` }));
    await cacha(w);
    expect(w.lager.get('nod-v1')).toBeUndefined();
  });

  it('en fil saknas: det förra sparade står kvar', async () => {
    let trasig = false;
    const w = ladda(async (u: any) => {
      const url = typeof u === 'string' ? u : u.url;
      if (url.endsWith('/om-nagot-hander')) return svar(HTML);
      return trasig && url.includes('webpack') ? svar('', { ok: false, url }) : svar(`fil ${url}`, { url });
    });
    await cacha(w);
    const forut = w.lager.get('nod-v1');
    expect(forut?.size).toBe(4);
    trasig = true;
    await cacha(w);
    expect(w.lager.get('nod-v1')).toBe(forut);
  });

  it('utan nät: sidan (också med ?kort=) och dess filer tas ur det sparade', async () => {
    let natet = true;
    const w = ladda(async (u: any) => { if (!natet) throw new Error('offline'); return natSvar(u); });
    await cacha(w);
    natet = false;
    const sida = await hamta(w, { url: `${ORIGIN}/om-nagot-hander?kort=brand`, mode: 'navigate' });
    expect(sida.body).toBe(HTML);
    const fil = await hamta(w, { url: `${ORIGIN}/_next/static/chunks/webpack-1.js`, referrer: `${ORIGIN}/om-nagot-hander?kort=brand` });
    expect(fil.body).toBe(`fil /_next/static/chunks/webpack-1.js`);
  });

  it('med nät: sidan kommer från nätet, inte det sparade', async () => {
    const w = ladda(async (u: any) => ({ ...svar('färsk'), url: typeof u === 'string' ? u : u.url }));
    const r = await hamta(w, { url: `${ORIGIN}/om-nagot-hander`, mode: 'navigate' });
    expect(r.body).toBe('färsk');
  });

  it('allt annat rörs inte: andra sidor, andra sidors filer, POST, andra domäner', async () => {
    const w = ladda(natSvar);
    expect(await hamta(w, { url: `${ORIGIN}/planering`, mode: 'navigate' })).toBeUndefined();
    expect(await hamta(w, { url: `${ORIGIN}/_next/static/chunks/x.js`, referrer: `${ORIGIN}/planering` })).toBeUndefined();
    expect(await hamta(w, { url: `${ORIGIN}/om-nagot-hander`, mode: 'navigate', method: 'POST' })).toBeUndefined();
    expect(await hamta(w, { url: 'https://fonts.googleapis.com/css2', referrer: `${ORIGIN}/om-nagot-hander` })).toBeUndefined();
    expect(await hamta(w, { url: `${ORIGIN}/api/version`, referrer: `${ORIGIN}/om-nagot-hander` })).toBeUndefined();
  });
});
