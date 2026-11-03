// @vitest-environment jsdom
// Bakgrunden laddar ner maskinens trakter av sig själv — men aldrig på okänt nät i en telefon, aldrig med ont om plats.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const db = vi.hoisted(() => ({
  ko: [{ objekt_id: 'a', ordning: 1 }, { objekt_id: 'b', ordning: 2 }, { objekt_id: 'c', ordning: 3 }],
  geo: { features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { coordinates: [[[15.700, 56.800], [15.703, 56.802]]] } }] },
}));
vi.mock('@/lib/supabase', () => {
  const kedja = (tabell: string) => {
    const f: any = {};
    f.select = () => f; f.eq = () => f; f.in = () => f;
    f.maybeSingle = async () => (tabell === 'objekt_geometri' ? { data: { geometri: db.geo }, error: null } : { data: null, error: null });
    f.then = (res: any) => Promise.resolve(tabell === 'maskin_ko' ? { data: db.ko, error: null } : { data: db.ko.map((k) => ({ id: k.objekt_id, status: 'planerad' })), error: null }).then(res);
    return f;
  };
  return { supabase: { from: kedja } };
});

import { useBakgrundsNedladdning } from './useBakgrundsNedladdning';
import { lasMeta } from '@/lib/kartNedladdning';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let lager: Map<string, any>;
let fetchMock: ReturnType<typeof vi.fn>;
const satt = (nyckel: string, v: any) => Object.defineProperty(navigator, nyckel, { configurable: true, value: v });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  lager = new Map();
  (globalThis as any).caches = { open: async () => ({ match: async (k: string) => lager.get(k), put: async (k: string, v: any) => { lager.set(k, v); }, delete: async (k: string) => lager.delete(k) }) };
  fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => 'image/png' } }));
  (globalThis as any).fetch = fetchMock;
  satt('serviceWorker', { getRegistration: async () => ({}), register: async () => ({}) });
  satt('onLine', true);
  satt('connection', { type: 'wifi' });
  satt('storage', { estimate: async () => ({ usage: 0, quota: 5e9 }) });
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); rot = null; vi.useRealTimers(); });

async function kor(p: Parameters<typeof useBakgrundsNedladdning>[0]) {
  function H() { useBakgrundsNedladdning(p); return null; }
  rot = createRoot(document.createElement('div'));
  await act(async () => { rot!.render(<H />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(21_000); });
  for (let i = 0; i < 200; i++) await act(async () => { await vi.advanceTimersByTimeAsync(5); });
}

describe('bakgrundsnedladdning', () => {
  it('maskinen på wifi: den öppna trakten och de två nästa i kön sparas, utan att någon trycker', async () => {
    await kor({ roll: 'maskin', maskinId: 'R64428', oppenId: 'a' });
    expect(lasMeta(localStorage).map((m) => m.id).sort()).toEqual(['a', 'b', 'c']);
    expect(fetchMock).toHaveBeenCalled();
  });
  it('mobildata: ingenting hämtas', async () => {
    satt('connection', { type: 'cellular' });
    await kor({ roll: 'maskin', maskinId: 'R64428', oppenId: 'a' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('ont om plats: ingenting hämtas', async () => {
    satt('storage', { estimate: async () => ({ usage: 1.9e9, quota: 2e9 }) });
    await kor({ roll: 'maskin', maskinId: 'R64428', oppenId: 'a' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('ingen roll (förare utan maskin, testläget): ingenting', async () => {
    await kor({ roll: null, maskinId: null, oppenId: 'a' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
