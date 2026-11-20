// @vitest-environment jsdom
// "Ladda ner trakten" i React mot fejkad Cache Storage och fetch: allt hämtas en gång, nästa öppning är klar utan nät, dåligt nät hämtar inget.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useLaddaNerTrakt } from './useLaddaNerTrakt';
import { planeraRutor, type Bbox } from '@/lib/kartNedladdning';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const TRAKT: Bbox = { vast: 15.70, ost: 15.705, syd: 56.80, nord: 56.803 };
let lager: Map<string, any>;
let fetchMock: ReturnType<typeof vi.fn>;
let rot: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  lager = new Map();
  (globalThis as any).caches = { open: async () => ({ match: async (k: string) => lager.get(k), put: async (k: string, v: any) => { lager.set(k, v); }, delete: async (k: string) => lager.delete(k) }) };
  fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => 'image/png' } }));
  (globalThis as any).fetch = fetchMock;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({}), register: async () => ({}) } });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); rot = null; vi.useRealTimers(); });

async function montera(id = 'obj-1') {
  const ut: { lage: any } = { lage: null };
  function H() { ut.lage = useLaddaNerTrakt({ objektId: id, bbox: TRAKT, aktiv: true }); return null; }
  const d = document.createElement('div'); rot = createRoot(d);
  await act(async () => { rot!.render(<H />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  for (let i = 0; i < 50 && ut.lage?.lage === 'laddar'; i++) await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  return ut;
}

describe('ladda ner trakten', () => {
  it('hämtar varje ruta en gång och säger klar; nästa öppning är klar UTAN nät', async () => {
    const ut = await montera();
    const antal = planeraRutor(TRAKT).length;
    expect(ut.lage).toEqual({ lage: 'klar' });
    expect(fetchMock).toHaveBeenCalledTimes(antal);
    expect(lager.size).toBe(antal);
    await act(async () => { rot!.unmount(); });
    fetchMock.mockClear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const igen = await montera();
    expect(igen.lage).toEqual({ lage: 'klar' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('dåligt nät: inget hämtas, ingen rad', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const ut = await montera();
    expect(ut.lage).toEqual({ lage: 'av' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('inloggningssidan i stället för en bild sparas aldrig och ger fel', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, headers: { get: () => 'text/html' } }));
    const ut = await montera();
    expect(lager.size).toBe(0);
    expect(ut.lage).toEqual({ lage: 'fel' });
  });
});
