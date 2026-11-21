// @vitest-environment jsdom
// "Vem svarade" på larmplatsen när radnivåspärren döljer andras namn (förare och maskin ser bara sin egen medarbetarrad):
// namnet kompletteras som NAMN (medarbetare_visning) och inget mer; faller funktionen står raden utan namn, aldrig ett fel.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const h = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as any[] }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, a: any) => h.rpc(fn, a),
    from: () => {
      const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data: h.rows, error: null }), insert: () => q };
      return q;
    },
  },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useLarmKontroll } from './useLarmKontroll';

const rad = (id: string, av: string, namn: string | null) => ({ id, lat: 56.1, lng: 14.5, svar: 'ja', kommentar: null, skapad_at: '2026-11-12T10:00:00Z', medarbetare_id: av, medarbetare: namn ? { namn } : null });
let ut: ReturnType<typeof useLarmKontroll>;
async function montera() {
  function H() { ut = useLarmKontroll({ objektId: 'o1', medarbetareId: 'maskin-1', maskinId: 'R64428', torr: false }); return null; }
  const c = document.createElement('div'); document.body.appendChild(c);
  await act(async () => { createRoot(c).render(<H />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => { h.rpc.mockReset(); document.body.innerHTML = ''; localStorage.clear(); });

describe('larmplatsens "vem svarade"', () => {
  it('andras namn (dolda av RLS) hämtas som namn; det egna namnet frågas inte om', async () => {
    h.rows = [rad('1', 'daniel', null), rad('2', 'maskin-1', 'H8E -26 Maskin')];
    h.rpc.mockResolvedValue({ data: [{ id: 'daniel', namn: 'Daniel' }], error: null });
    await montera();
    expect(ut.rader!.map((r) => r.vem)).toEqual(['Daniel', 'H8E']);
    expect(h.rpc).toHaveBeenCalledWith('medarbetare_visning', { p_ids: ['daniel'] });
  });
  it('funktionen faller: raden står utan namn och läsningen är ändå klar (rader finns)', async () => {
    h.rows = [rad('1', 'daniel', null)];
    h.rpc.mockResolvedValue({ data: null, error: { message: 'saknas' } });
    await montera();
    expect(ut.rader).toHaveLength(1); expect(ut.rader![0].vem).toBeNull();
  });
});
