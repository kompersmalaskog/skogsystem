/** Lagrens rutor: tak på zoomen (lib/lagerRutor) och sparade rutor i den RIKTIGA public/sw.js (sandbox, fejkade fetch och caches). */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { lagerMaxZoom, LAGER_CACHE, LAGER_STANDARD_TAK } from './lagerRutor';

const SW = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
const SIDA = fs.readFileSync(path.resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
const ORIGIN = 'https://app.exempel.se';
const FUKT = `${ORIGIN}/api/wms-proxy?layer=sks_markfuktighet&bbox=1,2,3,4&width=256&height=256`;
const NB = `${ORIGIN}/api/wms-proxy?layer=nyckelbiotoper&bbox=1,2,3,4&width=256&height=256`;
const DYGN = 86400000;

function ladda(fetchImpl: (r: any) => Promise<any>, nu = { t: 100 * 30 * DYGN + 1000 }) {
  const lager = new Map<string, Map<string, any>>();
  const caches = {
    open: async (n: string) => {
      if (!lager.has(n)) lager.set(n, new Map());
      const m = lager.get(n)!;
      return { put: async (k: any, v: any) => { m.set(typeof k === 'string' ? k : k.url, v); }, match: async (k: any) => m.get(typeof k === 'string' ? k : k.url), keys: async () => [...m.keys()], delete: async (k: any) => m.delete(typeof k === 'string' ? k : k.url) };
    },
    keys: async () => [...lager.keys()],
    delete: async (n: string) => lager.delete(n),
  };
  const h: Record<string, (e: any) => void> = {};
  const fetchMock = vi.fn(fetchImpl);
  const self = { location: { origin: ORIGIN }, registration: {}, clients: { claim: async () => {} }, skipWaiting: () => {}, addEventListener: (t: string, fn: any) => { h[t] = fn; } };
  const Tid = { now: () => nu.t };
  vm.runInNewContext(SW, { self, clients: {}, caches, fetch: fetchMock, URL, Response, Date: Tid, JSON, Promise, Set, setTimeout, Math, Number });
  return { h, fetch: fetchMock, lager, nu };
}
async function hamta(w: ReturnType<typeof ladda>, url: string) {
  let p: Promise<any> | undefined;
  w.h.fetch({ request: { method: 'GET', url, mode: 'cors', referrer: '' }, respondWith: (x: Promise<any>) => { p = x; } });
  return p ? await p : undefined;
}
const bild = (namn: string) => ({ ok: true, namn, headers: { get: () => 'image/png' }, clone() { return this; } });

describe('tak på zoomen', () => {
  it('markfuktighet hämtas aldrig skarpare än z15, trädslag z14, ritade lager z16', () => {
    expect(lagerMaxZoom('sks_markfuktighet')).toBe(15);
    expect(lagerMaxZoom('nmd_tradslag')).toBe(14);
    expect(lagerMaxZoom('fornlamningar')).toBe(14);
    expect(lagerMaxZoom('nyckelbiotoper')).toBe(LAGER_STANDARD_TAK);
  });
  it('flygbilderna har inget tak', () => {
    expect(lagerMaxZoom('lm_ortofoto')).toBeNull();
    expect(lagerMaxZoom('lm_ortofoto_ir')).toBeNull();
  });
  it('planeringssidan sätter taket på varje lagers källa', () => {
    expect(SIDA).toMatch(/const tak = lagerMaxZoom\(def\.id\);\s*if \(tak != null\) sourceOpts\.maxzoom = tak;/);
  });
});

describe('service workern: lagrens rutor', () => {
  it('cachens namn är samma i sw.js som i lib/lagerRutor', () => {
    expect(SW).toContain(`const LAGER_CACHE = '${LAGER_CACHE}';`);
  });
  it('en lagerruta sparas när den visas — andra gången frågas inte nätet', async () => {
    const w = ladda(async () => bild('fukt'));
    expect((await hamta(w, FUKT)).namn).toBe('fukt');
    expect((await hamta(w, FUKT)).namn).toBe('fukt');
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });
  it('externa WMS-värdar sparas också, men bara rutor (bbox)', async () => {
    const w = ladda(async () => bild('x'));
    const u = 'https://geodpags.skogsstyrelsen.se/arcgis/services/x/MapServer/WmsServer?SERVICE=WMS&BBOX=1,2,3,4&WIDTH=256';
    await hamta(w, u); await hamta(w, u);
    expect(w.fetch).toHaveBeenCalledTimes(1);
    expect(await hamta(w, 'https://geodpags.skogsstyrelsen.se/arcgis/services/x?request=GetCapabilities')).toBeUndefined();
    expect(await hamta(w, `${ORIGIN}/api/wms-proxy?layer=x`)).toBeUndefined();
  });
  it('en inloggningssida eller ett fel sparas aldrig som ruta', async () => {
    const w = ladda(async () => ({ ok: true, headers: { get: () => 'text/html' }, clone() { return this; } }));
    await hamta(w, FUKT); await hamta(w, FUKT);
    expect(w.fetch).toHaveBeenCalledTimes(2);
  });
  it('en ny period hämtar på nytt: fasta kartor efter 30 dagar, övriga efter 7', async () => {
    const w = ladda(async () => bild('ny'));
    await hamta(w, FUKT); await hamta(w, NB);
    w.nu.t += 8 * DYGN;
    await hamta(w, FUKT); await hamta(w, NB);
    expect(w.fetch).toHaveBeenCalledTimes(3);   // nyckelbiotoperna hämtades om, markfuktigheten inte
    w.nu.t += 30 * DYGN;
    await hamta(w, FUKT);
    expect(w.fetch).toHaveBeenCalledTimes(4);
  });
  it('utan nät i en ny period kommer förra periodens ruta', async () => {
    let nat = true;
    const w = ladda(async () => { if (!nat) throw new Error('offline'); return bild('gammal'); });
    await hamta(w, NB);
    w.nu.t += 7 * DYGN; nat = false;
    expect((await hamta(w, NB)).namn).toBe('gammal');
  });
  it('utan nät och utan sparad ruta är det ett fel, inte en tom bild', async () => {
    const w = ladda(async () => { throw new Error('offline'); });
    await expect(hamta(w, FUKT)).rejects.toThrow('offline');
  });
});
