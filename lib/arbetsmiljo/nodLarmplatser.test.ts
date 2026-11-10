// Nödsidans larmplatser (hamtaNodData): Vidas larmplatser (en vid varje avlägg, RPC objekt_tillaggspunkter) + objektets egen.
// Kunde Vidas inte läsas gäller objektets egen som förut — nödsidan får aldrig bli tom för att ett tillägg föll.
import { describe, it, expect, vi } from 'vitest';
import santhe from '../__fixtures__/larmpunkter_santhe_2026-11-10.json';

vi.mock('./saGorVi', () => ({ hamta: async () => null }));
import { hamtaNodData } from './tillbud';

function fake(vida: { data: unknown; error: unknown } | 'kastar') {
  const tabell = (rader: unknown[]) => {
    const b: any = { select: () => b, neq: () => b, not: () => b, then: (ok: any) => Promise.resolve({ data: rader, error: null }).then(ok) };
    return b;
  };
  return {
    rpc: (namn: string) => {
      if (namn === 'am_nodkontakter') return Promise.resolve({ data: [{ namn: 'Martin', telefon: '070' }], error: null });
      if (namn === 'objekt_tillaggspunkter') return vida === 'kastar' ? Promise.reject(new Error('nät')) : Promise.resolve(vida);
      throw new Error(namn);
    },
    from: (t: string) => tabell(t === 'objekt' ? [
      { id: 'santhe', namn: 'Gallring Santhe 2026.', larmkoordinat_lat: santhe.objektLarm.lat, larmkoordinat_lng: santhe.objektLarm.lng, larmkoordinat_beskrivning: null, status: 'pagaende' },
      { id: 'utan', namn: 'Utan larm', larmkoordinat_lat: null, larmkoordinat_lng: null, larmkoordinat_beskrivning: null, status: 'planerad' },
    ] : []),
  } as any;
}

describe('hamtaNodData — larmplatserna', () => {
  it('Santhe: fem larmplatser, var och en med sitt avlägg', async () => {
    const rader = santhe.features.map((punkt) => ({ objekt_id: 'santhe', punkt }));
    const d = await hamtaNodData(fake({ data: rader, error: null }));
    expect(d!.larmplatser).toHaveLength(5);
    expect(d!.larmplatser.every((l) => l.objektId === 'santhe' && l.namn === 'Gallring Santhe 2026.')).toBe(true);
    expect(d!.larmplatser.map((l) => l.beskrivning)).toContain('Avlägg 01-3 · skbv gräskulla');
  });
  it('Vidas punkter går inte att läsa: objektets egen, som förut', async () => {
    for (const vida of [{ data: null, error: { message: 'saknas' } }, 'kastar' as const]) {
      const d = await hamtaNodData(fake(vida));
      expect(d!.larmplatser).toHaveLength(1);
      expect(d!.larmplatser[0]).toMatchObject({ objektId: 'santhe', lat: santhe.objektLarm.lat });
    }
  });
});

describe('hamtaNodData — rutinkorten och larmplatserna blandas inte ihop', () => {
  it('admins ändrade kort kommer med, och larmplatserna är objektens', async () => {
    const sb = fake({ data: [], error: null });
    const fromOrig = sb.from;
    sb.from = (t: string) => t === 'am_rutinkort'
      ? (() => { const b: any = { select: () => b, then: (ok: any) => Promise.resolve({ data: [{ id: 'brand', titel: 'Det brinner i maskinen', steg1: 'a', steg2: 'b', steg3: 'c', andrad_tid: 'nu' }], error: null }).then(ok) }; return b; })()
      : fromOrig(t);
    const d = await hamtaNodData(sb);
    expect(d!.larmplatser.map((l) => l.objektId)).toEqual(['santhe']);
    expect(d!.andringar).toEqual([{ id: 'brand', titel: 'Det brinner i maskinen', steg: ['a', 'b', 'c'], andradTid: 'nu' }]);
  });
});
