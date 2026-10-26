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
import { besokPush } from './maskinPush';

const SW = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://app.exempel.se';

type Klient = { url: string; focus: any; navigate?: any; postMessage: any; visibilityState?: string; focused?: boolean };
const klient = (url = `${ORIGIN}/planering`): Klient => ({ url, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined), postMessage: vi.fn() });

function ladda(opts: { fonster?: Klient[]; fetchSvar?: () => Promise<any> } = {}) {
  const hanterare: Record<string, (e: any) => void> = {};
  const clients = { matchAll: vi.fn(async () => opts.fonster ?? []), openWindow: vi.fn(async () => null) };
  const fetchMock = vi.fn<(url: string, init?: any) => Promise<any>>(opts.fetchSvar ?? (async () => ({ ok: true, json: async () => ({ ok: true }) })));
  const caches = { open: async () => ({ put: async () => undefined }) };
  const visa = vi.fn(async (..._a: unknown[]) => undefined);
  const self = { location: { origin: ORIGIN }, registration: { showNotification: visa }, addEventListener: (t: string, fn: (e: any) => void) => { hanterare[t] = fn; } };
  vm.runInNewContext(SW, { self, clients, caches, fetch: fetchMock, URL, Response, Date, JSON });
  return { hanterare, clients, fetch: fetchMock, visa };
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


// ── Server-push till MASKINEN (lib/hytt/maskinPush → public/sw.js hyttPush) ───────────────────────────────────────────────────────────────

const BESOK_PUSH = JSON.parse(JSON.stringify(besokPush({ id: 'b-9', namn: 'Anna Svensson', besokstid: '2026-10-26T12:30:00Z' }, { trakt: 'Skälviken', maskinId: 'A130743', nu: new Date('2026-10-26T12:00:00Z') })));

async function pusha(w: ReturnType<typeof ladda>, payload: unknown) {
  let lofte: Promise<unknown> | undefined;
  w.hanterare.push({ data: { json: () => payload }, waitUntil: (p: Promise<unknown>) => { lofte = p; } });
  expect(lofte, 'workern måste anropa event.waitUntil').toBeDefined();
  await expect(lofte).resolves.toBeUndefined();
}

describe('sw.js — server-push till maskinen', () => {
  it('appen minimerad eller täckt (inget fönster som är synligt OCH har fokus) → notisen visas, med knappar och data som den lokala', async () => {
    const dold = { ...klient(), visibilityState: 'hidden', focused: false };
    const w = ladda({ fonster: [dold] });
    await pusha(w, BESOK_PUSH);
    expect(w.visa).toHaveBeenCalledTimes(1);
    const [titel, opt] = w.visa.mock.calls[0] as [string, any];
    expect(titel).toBe(BESOK_PUSH.hyttNotis.titel);
    expect(opt.tag).toBe('besok-b-9');
    expect(opt.requireInteraction).toBe(true);
    expect(opt.actions.map((a: any) => a.action)).toEqual(['uppfattat', 'visa']);
    expect(opt.data).toMatchObject({ hytt: true, typ: 'besok', besokId: 'b-9', maskinId: 'A130743' });
    expect(dold.postMessage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'hytt-push' }));   // sidan får veta och läser besöken direkt
  });

  it('ingen sida öppen alls (appen stängd) → notisen visas ändå', async () => {
    const w = ladda({ fonster: [] });
    await pusha(w, BESOK_PUSH);
    expect(w.visa).toHaveBeenCalledTimes(1);
  });

  it('appen framme (synlig OCH fokus) → ingen notis (kortet i hytten räcker), men sidan får veta', async () => {
    const framme = { ...klient(), visibilityState: 'visible', focused: true };
    const w = ladda({ fonster: [framme] });
    await pusha(w, BESOK_PUSH);
    expect(w.visa).not.toHaveBeenCalled();
    expect(framme.postMessage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'hytt-push' }));
  });

  it('synligt men utan fokus (ett annat program valt) räknas som borta → notis', async () => {
    const w = ladda({ fonster: [{ ...klient(), visibilityState: 'visible', focused: false }] });
    await pusha(w, BESOK_PUSH);
    expect(w.visa).toHaveBeenCalledTimes(1);
  });

  it('Uppfattat i server-notisen kvitterar som i hyttkortet: mot samma serverrutt, med maskinen från notisen och inget annat', async () => {
    const w = ladda();
    await klicka(w, BESOK_PUSH.hyttNotis.data, 'uppfattat');
    expect(w.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = w.fetch.mock.calls[0];
    expect(url).toBe('/api/besok/hytt/kvittera');
    expect(JSON.parse(init.body)).toEqual({ besok_id: 'b-9', maskin_id: 'A130743' });   // roll, förare och tid avgörs av servern
    expect(w.clients.openWindow).not.toHaveBeenCalled();
  });

  it('en vanlig push (utan hyttNotis) beter sig som förut', async () => {
    const w = ladda();
    await pusha(w, { title: 'Din ledighet är godkänd', body: 'okt', url: '/ledighet' });
    expect(w.visa).toHaveBeenCalledWith('Din ledighet är godkänd', expect.objectContaining({ body: 'okt', data: { url: '/ledighet' } }));
  });

  it('en hyttNotis utan data.hytt tas inte emot (ingen ska kunna skapa en vanlig notis via fältet)', async () => {
    const w = ladda();
    await pusha(w, { hyttNotis: { titel: 'X', text: 'Y', data: { url: '/' } } });
    expect(w.visa).toHaveBeenCalledWith('Kompersmåla Skog', expect.anything());   // faller till den vanliga vägen
  });
});
