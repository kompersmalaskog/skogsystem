// @vitest-environment jsdom
// Besöken i hytten: ALLT går via serverrutterna /api/besok/hytt och /api/besok/hytt/kvittera (hytten läser aldrig tabellerna). Hooken skickar bara VILKET besök och VILKEN maskin –
// roll, förare och tid avgörs av servern. Spelar ETT ljud per nytt besök; "Stäng av när du ser hen" kvitterar och stänger av ringen för besöket.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ljud = vi.hoisted(() => ({ spelaLarmLjud: vi.fn(() => true) }));
vi.mock('@/lib/larm/ljud', () => ljud);

import { useBesokHytt } from './useBesokHytt';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const OBJ = '00000000-0000-4000-8000-0000000000aa';
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
let rot: Root | null = null;
let ruta: HTMLElement | null = null;

type Server = { besok: any[]; kvitterade: string[]; status: number; postStatus: number; anrop: { url: string; metod: string; body?: any }[] };
let server: Server;
function svar(status: number, body: any) { return { ok: status >= 200 && status < 300, status, json: async () => body } as Response; }

beforeEach(() => {
  ljud.spelaLarmLjud.mockClear();
  try { localStorage.clear(); } catch { /* */ }
  server = { besok: [], kvitterade: [], status: 200, postStatus: 200, anrop: [] };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metod = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    server.anrop.push({ url: String(url), metod, body });
    if (metod === 'POST') {
      if (server.postStatus === 200) server.kvitterade.push(body.besok_id);
      return svar(server.postStatus, { ok: server.postStatus === 200 });
    }
    if (server.status !== 200) return svar(server.status, { ok: false });
    return svar(200, { ok: true, besok: server.besok, kvitterade: server.kvitterade, testlage: false });
  }));
});
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

type Ut = ReturnType<typeof useBesokHytt>;
async function montera(inp: Partial<Parameters<typeof useBesokHytt>[0]> = {}) {
  const ref: { ut: Ut | null } = { ut: null };
  function Probe() { ref.ut = useBesokHytt({ aktiv: true, objektId: OBJ, maskinId: 'M1', testlage: false, ljudCtx: () => ({}) as any, ...inp }); return null; }
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(<Probe />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return ref;
}
const b = (id: string, min: number) => ({ id, namn: `Gäst ${id}`, telefon: '070', besokstid: iso(min) });

describe('useBesokHytt – via servern', () => {
  it('läser /api/besok/hytt med objekt och maskin – och rör aldrig Supabase-klienten', async () => {
    server.besok = [b('a', 30)];
    const ref = await montera();
    expect(ref.ut!.aktiva.map((x) => x.id)).toEqual(['a']);
    expect(ref.ut!.vantar.map((x) => x.id)).toEqual(['a']);
    expect(server.anrop[0].url).toBe(`/api/besok/hytt?objekt=${OBJ}&maskin=M1`);
  });
  it('ett ljud för ett nytt besök; inget för ett som den här maskinen redan kvitterat', async () => {
    server.besok = [b('a', 30)];
    await montera();
    expect(ljud.spelaLarmLjud).toHaveBeenCalledTimes(1);
    act(() => { rot!.unmount(); }); ruta!.remove();
    ljud.spelaLarmLjud.mockClear();
    server.kvitterade = ['a'];
    const ref = await montera();
    expect(ljud.spelaLarmLjud).not.toHaveBeenCalled();
    expect(ref.ut!.vantar).toEqual([]);
  });
  it('Uppfattat skickar BARA besök och maskin – ingen roll, ingen förare, ingen tid, inget testläge', async () => {
    server.besok = [b('a', 30)];
    const ref = await montera();
    let ok = false;
    await act(async () => { ok = await ref.ut!.kvittera('a'); });
    expect(ok).toBe(true);
    const post = server.anrop.find((x) => x.metod === 'POST')!;
    expect(post.url).toBe('/api/besok/hytt/kvittera');
    expect(post.body).toEqual({ besok_id: 'a', maskin_id: 'M1' });
    expect(ref.ut!.vantar).toEqual([]);
    expect(ref.ut!.ringBesok).toHaveLength(1);   // ringen ligger kvar efter Uppfattat
  });
  it('testläget (admin i "Visar som maskin") ber om det – både vid läsning och kvittens; servern avgör om det gäller', async () => {
    server.besok = [b('a', 30)];
    const ref = await montera({ testlage: true });
    expect(server.anrop[0].url).toContain('&test=1');
    await act(async () => { await ref.ut!.kvittera('a'); });
    expect(server.anrop.find((x) => x.metod === 'POST')!.body).toEqual({ besok_id: 'a', maskin_id: 'M1', testlage: true });
  });
  it('"Stäng av när du ser hen": kvitterar och stänger av ringen för just det besöket – och minns det', async () => {
    server.besok = [b('a', 30), b('c', 40)];
    const ref = await montera();
    await act(async () => { await ref.ut!.stangAv('a'); });
    expect(server.anrop.some((x) => x.metod === 'POST' && x.body.besok_id === 'a')).toBe(true);
    expect(ref.ut!.ringBesok.map((x) => x.id)).toEqual(['c']);
    expect(ref.ut!.aktiva).toHaveLength(2);
    // efter omladdning (nytt montage) är ringen för 'a' fortfarande av, 'c' har sin
    act(() => { rot!.unmount(); }); ruta!.remove();
    const ref2 = await montera();
    expect(ref2.ut!.ringBesok.map((x) => x.id)).toEqual(['c']);
  });
  it('stängs inte av om kvittensen inte kunde sparas', async () => {
    server.besok = [b('a', 30)];
    const ref = await montera();
    server.postStatus = 503;
    let ok = true;
    await act(async () => { ok = await ref.ut!.stangAv('a'); });
    expect(ok).toBe(false);
    expect(ref.ut!.ringBesok).toHaveLength(1);
    expect(ref.ut!.fel).toContain('Kunde inte spara');
  });
  it('403 (maskinen är inte kopplad till objektet): inga besök, ingen ring, inget kort', async () => {
    server.status = 403;
    const ref = await montera();
    expect(ref.ut!.aktiva).toEqual([]);
    expect(ref.ut!.vantar).toEqual([]);
  });
  it('blir maskinen avkopplad från objektet (403) medan kortet visas försvinner besöken vid nästa läsning', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    server.besok = [b('a', 30)];
    const ref = await montera();
    expect(ref.ut!.vantar).toHaveLength(1);
    server.status = 403;
    await act(async () => { vi.advanceTimersByTime(4000); for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(ref.ut!.aktiva).toEqual([]);
    expect(ref.ut!.vantar).toEqual([]);
  });
  it('ett serverfel behåller det som visades (kortet försvinner inte för att nätet hackar)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    server.besok = [b('a', 30)];
    const ref = await montera();
    server.status = 503;
    await act(async () => { vi.advanceTimersByTime(4000); for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(ref.ut!.vantar.map((x) => x.id)).toEqual(['a']);
  });
  it('saknas maskin sparas ingenting och felet sägs', async () => {
    server.besok = [b('a', 30)];
    const ref = await montera({ maskinId: null });
    let ok = true;
    await act(async () => { ok = await ref.ut!.kvittera('a'); });
    expect(ok).toBe(false);
    expect(ref.ut!.fel).toContain('maskinen saknas');
    expect(server.anrop).toEqual([]);
  });
  it('passiv utanför maskinläget: ingen läsning, inga besök', async () => {
    server.besok = [b('a', 30)];
    const ref = await montera({ aktiv: false });
    expect(ref.ut!.aktiva).toEqual([]);
    expect(server.anrop).toEqual([]);
  });
  it('läser om var 4:e sekund (kravet är ≤ 5 s) – ett nytt besök dyker upp av sig självt', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const ref = await montera();
    expect(ref.ut!.vantar).toEqual([]);
    server.besok = [b('ny', 20)];
    await act(async () => { vi.advanceTimersByTime(4000); for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(ref.ut!.vantar.map((x) => x.id)).toEqual(['ny']);
  });
});
