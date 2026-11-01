// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const svar: { select: { data: unknown; error: unknown }; insert: { error: unknown } } = { select: { data: [], error: null }, insert: { error: null } };
const inserts: unknown[] = [];
vi.mock('@/lib/supabase', () => {
  const kedja = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = () => q; q.order = () => Promise.resolve(svar.select);
    q.insert = (r: unknown) => { inserts.push(r); return Promise.resolve(svar.insert); };
    q.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
    return q;
  };
  return { supabase: { from: () => kedja() } };
});

import { useHogMarkeringar, type HogMarkeringarIn } from './useHogMarkeringar';

function renderHook(f: () => ReturnType<typeof useHogMarkeringar>) {
  const result: { current: ReturnType<typeof useHogMarkeringar> } = { current: null as any };
  const Probe = () => { result.current = f(); return null; };
  const el = document.createElement('div');
  act(() => { createRoot(el).render(React.createElement(Probe)); });
  return { result };
}
async function waitFor(fn: () => void) {
  for (let i = 0; i < 50; i++) { try { fn(); return; } catch { await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); } }
  fn();
}
void (0 as unknown as HogMarkeringarIn);

const ny = { typ: 'tagen' as const, geometri: { type: 'Point' as const, coordinates: [15, 57] as [number, number] }, bredd_m: 8, grupp: null };

beforeEach(() => { inserts.length = 0; svar.select = { data: [], error: null }; svar.insert = { error: null }; localStorage.clear(); });

describe('useHogMarkeringar', () => {
  it('saknas tabellen: inte tillgänglig och lägg returnerar null (inget skrivs)', async () => {
    svar.select = { data: null, error: { code: 'PGRST205' } };
    const { result } = renderHook(() => useHogMarkeringar({ objektId: 'o1', minId: 'm1', maskinId: null, torr: false }));
    await waitFor(() => expect(result.current.tillganglig).toBe(false));
    let id: string | null = 'x';
    act(() => { id = result.current.lagg(ny); });
    expect(id).toBeNull();
    expect(inserts).toHaveLength(0);
  });
  it('lägg skickar raden med förarens id och syns direkt; Ångra tar bort den', async () => {
    const { result } = renderHook(() => useHogMarkeringar({ objektId: 'o1', minId: 'm1', maskinId: 'A130743', torr: false }));
    let id: string | null = null;
    act(() => { id = result.current.lagg(ny); });
    expect(result.current.markeringar.map((m) => m.id)).toEqual([id]);
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({ objekt_id: 'o1', skapad_av: 'm1', maskin_id: 'A130743', typ: 'tagen' });
    act(() => { result.current.taBort(id!); });
    expect(result.current.markeringar).toHaveLength(0);
  });
  it('testläget sparar bara i minnet', () => {
    const { result } = renderHook(() => useHogMarkeringar({ objektId: 'o1', minId: null, maskinId: null, torr: true }));
    act(() => { result.current.lagg(ny); });
    expect(result.current.markeringar).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });
});
