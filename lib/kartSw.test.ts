/** Kartrutorna i den RIKTIGA public/sw.js (sandbox, fejkade fetch och caches): sparat först, utan nät ur det sparade, bara bilder sparas, OSM rörs aldrig. */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const SW = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
const ORIGIN = 'https://app.exempel.se';
const RUTA = `${ORIGIN}/api/forarkarta?layer=ortofoto&z=17&x=1&y=2`;
const TERRANG = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/1/2.png';

function ladda(fetchImpl: (r: any) => Promise<any>) {
  const lager = new Map<string, Map<string, any>>();
  const caches = {
    open: async (n: string) => {
      if (!lager.has(n)) lager.set(n, new Map());
      const m = lager.get(n)!;
      return { put: async (k: any, v: any) => { m.set(typeof k === 'string' ? k : k.url, v); }, match: async (k: any) => m.get(typeof k === 'string' ? k : k.url), keys: async () => [...m.keys()], delete: async (k: any) => m.delete(typeof k === 'string' ? k : k.url) };
    },
  };
  const h: Record<string, (e: any) => void> = {};
  const fetchMock = vi.fn(fetchImpl);
  const self = { location: { origin: ORIGIN }, registration: {}, clients: { claim: async () => {} }, skipWaiting: () => {}, addEventListener: (t: string, fn: any) => { h[t] = fn; } };
  vm.runInNewContext(SW, { self, clients: {}, caches, fetch: fetchMock, URL, Response, Date, JSON, Promise, Set, setTimeout });
  return { h, fetch: fetchMock, lager };
}
async function hamta(w: ReturnType<typeof ladda>, url: string) {
  let p: Promise<any> | undefined;
  w.h.fetch({ request: { method: 'GET', url, mode: 'cors', referrer: '' }, respondWith: (x: Promise<any>) => { p = x; } });
  return p ? await p : undefined;
}
const bild = (namn: string) => ({ ok: true, namn, headers: { get: () => 'image/png' }, clone() { return this; } });

describe('service workern: kartrutor', () => {
  it('en ruta sparas när den visas — andra gången utan nät kommer den ur det sparade', async () => {
    let nat = true;
    const w = ladda(async () => { if (!nat) throw new Error('offline'); return bild('flyg'); });
    expect((await hamta(w, RUTA)).namn).toBe('flyg');
    nat = false;
    expect((await hamta(w, RUTA)).namn).toBe('flyg');
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });
  it('det nedladdade (kartrutor-v1) tas FÖRST, utan att nätet frågas', async () => {
    const w = ladda(async () => bild('nat'));
    w.lager.set('kartrutor-v1', new Map([[TERRANG, bild('sparad')]]));
    expect((await hamta(w, TERRANG)).namn).toBe('sparad');
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it('inloggningssidan (utgången session) sparas aldrig som en ruta', async () => {
    const w = ladda(async () => ({ ok: true, headers: { get: () => 'text/html' }, clone() { return this; } }));
    await hamta(w, RUTA);
    expect(w.lager.get('kartrutor-lopande-v1')?.size ?? 0).toBe(0);
  });
  it('OpenStreetMap och annat rörs aldrig', async () => {
    const w = ladda(async () => bild('x'));
    expect(await hamta(w, 'https://tile.openstreetmap.org/17/1/2.png')).toBeUndefined();
    expect(await hamta(w, `${ORIGIN}/api/forarkarta?bbox=1,2,3,4`)).toBeUndefined();
    expect(await hamta(w, `${ORIGIN}/api/version`)).toBeUndefined();
  });
  it('Ritads vägar (OpenFreeMap): rutan sparas och kommer utan nät; källbeskrivningen tas med nät först, sparad utan', async () => {
    let nat = true;
    const pbf = (namn: string) => ({ ok: true, namn, headers: { get: () => 'application/x-protobuf' }, clone() { return this; } });
    const w = ladda(async (r: any) => { if (!nat) throw new Error('offline'); return r.url.endsWith('/planet') ? { ok: true, namn: 'kalla', headers: { get: () => 'application/json' }, clone() { return this; } } : pbf('ruta'); });
    const RUTA_OFM = 'https://tiles.openfreemap.org/planet/20251022_001001_pt/14/1/2.pbf';
    expect((await hamta(w, 'https://tiles.openfreemap.org/planet')).namn).toBe('kalla');
    expect((await hamta(w, RUTA_OFM)).namn).toBe('ruta');
    nat = false;
    expect((await hamta(w, 'https://tiles.openfreemap.org/planet')).namn).toBe('kalla');
    expect((await hamta(w, RUTA_OFM)).namn).toBe('ruta');
  });
});
