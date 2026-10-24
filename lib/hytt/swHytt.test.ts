/**
 * Notiser i hytten — knapparna i den RIKTIGA public/sw.js (sandbox, fejkade clients/fetch/caches).
 *  • Uppfattat på en besöksnotis kvitterar DIREKT mot /api/besok/hytt/kvittera (samma serverregler som kortet), utan att öppna appen.
 *  • Går det inte (nätfel, servern säger nej, saknad maskin) öppnas appen i stället — kortet med Uppfattat finns där.
 *  • Uppfattat på testnotisen kvitterar inget, den berättar bara för sidan.
 *  • Löftet till event.waitUntil får aldrig avvisas.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const SW = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://app.exempel.se';

type Klient = { url: string; focus: any; navigate?: any; postMessage: any };
const klient = (url = `${ORIGIN}/planering`): Klient => ({ url, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined), postMessage: vi.fn() });

function ladda(opts: { fonster?: Klient[]; fetchSvar?: () => Promise<any> } = {}) {
  const hanterare: Record<string, (e: any) => void> = {};
  const clients = { matchAll: vi.fn(async () => opts.fonster ?? []), openWindow: vi.fn(async () => null) };
  const fetchMock = vi.fn<(url: string, init?: any) => Promise<any>>(opts.fetchSvar ?? (async () => ({ ok: true, json: async () => ({ ok: true }) })));
  const caches = { open: async () => ({ put: async () => undefined }) };
  const self = { location: { origin: ORIGIN }, registration: { showNotification: vi.fn() }, addEventListener: (t: string, fn: (e: any) => void) => { hanterare[t] = fn; } };
  vm.runInNewContext(SW, { self, clients, caches, fetch: fetchMock, URL, Response, Date, JSON });
  return { hanterare, clients, fetch: fetchMock };
}

async function klicka(w: ReturnType<typeof ladda>, data: unknown, action = '') {
  const stang = vi.fn();
  let lofte: Promise<unknown> | undefined;
  w.hanterare.notificationclick({ action, notification: { close: stang, data }, waitUntil: (p: Promise<unknown>) => { lofte = p; } });
  expect(lofte, 'workern måste anropa event.waitUntil').toBeDefined();
  await expect(lofte).resolves.toBeUndefined();
  expect(stang).toHaveBeenCalled();
}

const BESOK = { hytt: true, typ: 'besok', url: '/planering', besokId: 'b-1', maskinId: 'R64428', test: false };

describe('sw.js — Uppfattat på besöksnotisen', () => {
  it('kvitterar direkt mot servern med besök, maskin och inget annat', async () => {
    const sida = klient();
    const w = ladda({ fonster: [sida] });
    await klicka(w, BESOK, 'uppfattat');
    expect(w.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = w.fetch.mock.calls[0];
    expect(url).toBe('/api/besok/hytt/kvittera');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ besok_id: 'b-1', maskin_id: 'R64428' });   // roll, förare och tid avgörs av servern
    expect(w.clients.openWindow).not.toHaveBeenCalled();
    expect(sida.focus).not.toHaveBeenCalled();                                          // ingen app tas fram
    expect(sida.postMessage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'hytt-uppfattat', besokId: 'b-1' }));
  });

  it('testläge (admin som maskin) skickar testlage: true', async () => {
    const w = ladda();
    await klicka(w, { ...BESOK, test: true }, 'uppfattat');
    expect(JSON.parse(w.fetch.mock.calls[0][1].body)).toEqual({ besok_id: 'b-1', maskin_id: 'R64428', testlage: true });
  });

  it('servern säger nej → appen öppnas, där kortet finns', async () => {
    const w = ladda({ fetchSvar: async () => ({ ok: false, json: async () => ({ ok: false }) }) });
    await klicka(w, BESOK, 'uppfattat');
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/planering`);
  });

  it('ingen täckning (fetch kastar) → appen öppnas, löftet avvisas aldrig', async () => {
    const w = ladda({ fetchSvar: async () => { throw new Error('offline'); } });
    await klicka(w, BESOK, 'uppfattat');
    expect(w.clients.openWindow).toHaveBeenCalledTimes(1);
  });

  it('saknar maskin i notisen → ingen kvittens skickas, appen öppnas', async () => {
    const w = ladda();
    await klicka(w, { ...BESOK, maskinId: null }, 'uppfattat');
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.clients.openWindow).toHaveBeenCalledTimes(1);
  });
});

describe('sw.js — testnotisen och övriga knappar', () => {
  it('Uppfattat på testnotisen kvitterar INGET mot servern, berättar bara för sidan', async () => {
    const sida = klient();
    const w = ladda({ fonster: [sida] });
    await klicka(w, { hytt: true, typ: 'test', url: '/planering', test: true }, 'uppfattat');
    expect(w.fetch).not.toHaveBeenCalled();
    expect(sida.postMessage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'hytt-uppfattat', test: true }));
  });

  it('tryck på själva testnotisen / Öppna kartan: sidan får veta, appen fokuseras', async () => {
    const sida = klient();
    const w = ladda({ fonster: [sida] });
    await klicka(w, { hytt: true, typ: 'test', url: '/planering', test: true }, 'visa');
    expect(sida.postMessage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'hytt-testnotis-oppnad' }));
    expect(sida.focus).toHaveBeenCalled();
  });

  it('Öppna kartan på en besöksnotis fokuserar appen och kvitterar inget', async () => {
    const sida = klient();
    const w = ladda({ fonster: [sida] });
    await klicka(w, BESOK, 'visa');
    expect(w.fetch).not.toHaveBeenCalled();
    expect(sida.focus).toHaveBeenCalled();
  });

  it('en vanlig push-notis (utan hytt) beter sig som förut: appen öppnas, ingen kvittens', async () => {
    const w = ladda();
    await klicka(w, { url: '/ledighet?godkann=1' });
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/ledighet?godkann=1`);
  });
});
