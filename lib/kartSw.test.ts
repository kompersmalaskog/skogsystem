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
  it('en 512-ruta (flygfoto på hög upplösning) hanteras som en ruta: sparas, och kommer utan nät under SIN adress (inte 256-rutans)', async () => {
    let nat = true;
    const w = ladda(async () => { if (!nat) throw new Error('offline'); return bild('flyg512'); });
    const R512 = `${RUTA}&s=512`;
    expect((await hamta(w, R512)).namn).toBe('flyg512');
    nat = false;
    expect((await hamta(w, R512)).namn).toBe('flyg512');
    await expect(hamta(w, RUTA)).rejects.toThrow();   // 256-rutan är en annan adress: den finns inte sparad
  });
  // OFFLINEKARTOR EFTER UPPDATERINGEN (flygfoto på hög upplösning, 512-rutor): telefonen laddade ner området som 256 före uppdateringen,
  // kartan begär nu 512 — adressen finns inte i cachen. Utan nät ska den gamla 256-rutan visas, inte en tom karta.
  describe('512 begärd utan nät, bara 256 sparad (nedladdning före uppdateringen)', () => {
    const R256 = RUTA, R512 = `${RUTA}&s=512`;
    it('nedladdningen (kartrutor-v1): 256-rutan visas', async () => {
      const w = ladda(async () => { throw new Error('offline'); });
      w.lager.set('kartrutor-v1', new Map([[R256, bild('gammal256')]]));
      expect((await hamta(w, R512)).namn).toBe('gammal256');
    });
    it('rutor som sparats under körning (kartrutor-lopande-v1): 256-rutan visas', async () => {
      const w = ladda(async () => { throw new Error('offline'); });
      w.lager.set('kartrutor-lopande-v1', new Map([[R256, bild('lopande256')]]));
      expect((await hamta(w, R512)).namn).toBe('lopande256');
    });
    it('finns båda sparade vinner 512; finns ingen alls är det ett fel som förut (ingen gissad ruta)', async () => {
      const w = ladda(async () => { throw new Error('offline'); });
      w.lager.set('kartrutor-v1', new Map([[R256, bild('256')], [R512, bild('512')]]));
      expect((await hamta(w, R512)).namn).toBe('512');
      const tom = ladda(async () => { throw new Error('offline'); });
      await expect(hamta(tom, R512)).rejects.toThrow('offline');
    });
    it('MED nät hämtas alltid den skarpa 512-rutan (fallbacken används bara när nätet felar), och 256-rutan sparas aldrig under 512-adressen', async () => {
      let nat = false;
      const w = ladda(async () => { if (!nat) throw new Error('offline'); return bild('ny512'); });
      w.lager.set('kartrutor-v1', new Map([[R256, bild('gammal256')]]));
      expect((await hamta(w, R512)).namn).toBe('gammal256');          // utan nät: gammal
      expect(w.lager.get('kartrutor-lopande-v1')?.has(R512) ?? false).toBe(false);
      nat = true;
      expect((await hamta(w, R512)).namn).toBe('ny512');              // med nät: den skarpa — inte den gamla
      expect(w.fetch).toHaveBeenCalledTimes(2);
      nat = false;
      expect((await hamta(w, R512)).namn).toBe('ny512');              // och nu ur det sparade
    });
    it('gäller bara flygfotots 512-adress: en 256-ruta, kartan och höjddatan faller aldrig tillbaka på något annat', async () => {
      const w = ladda(async () => { throw new Error('offline'); });
      w.lager.set('kartrutor-v1', new Map([[R256, bild('x')]]));
      await expect(hamta(w, `${ORIGIN}/api/forarkarta?layer=ortofoto&z=17&x=1&y=3&s=512`)).rejects.toThrow();   // annan ruta
      await expect(hamta(w, `${ORIGIN}/api/forarkarta?layer=farg&z=17&x=1&y=2`)).rejects.toThrow();
    });
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

describe('vakt: service workern och sidan känner igen 512-adressen på samma sätt', () => {
  it('FLYGFOTO_512 i public/sw.js är ordagrant lib/flygfotoRuta RUTA_512_SUFFIX', async () => {
    const { RUTA_512_SUFFIX } = await import('./flygfotoRuta');
    expect(SW).toContain(`const FLYGFOTO_512 = ${RUTA_512_SUFFIX.toString()};`);
  });
});
