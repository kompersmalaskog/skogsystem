// Pushen "Larmplatsen fungerar inte" (lib/larmKontrollNotis).
import { describe, it, expect } from 'vitest';
import { LARMPLATS_NEJ, byggLarmplatsNejNotis, koaLarmplatsNej, nejText, type NejRad } from './larmKontrollNotis';

const rad = (o: Partial<NejRad> = {}): NejRad => ({
  id: 'k1', objekt_id: 'santhe', objekt_namn: 'Gallring Santhe 2026.', lat: 56.51626, lng: 14.70847, kommentar: 'bommen är låst', vem: 'Daniel',
  skapad_at: '2026-11-12T08:00:00Z', plats: 'Avlägg 01-4 · skbv gräskulla öst huset',
  alla: [{ id: 'k1', lat: 56.51626, lng: 14.70847, svar: 'nej', kommentar: 'bommen är låst', vem: null, skapadAt: '2026-11-12T08:00:00Z' }], ...o,
});
const n = (o: Record<string, unknown> = {}) => ({ typ: LARMPLATS_NEJ, payload: { kontroll_id: 'k1' }, skapad_at: '2026-11-12T08:01:00Z', ...o });
const nu = Date.parse('2026-11-12T08:05:00Z');

describe('byggLarmplatsNejNotis', () => {
  it('texten: trakten, avlägget, varför och vem — leder till trakten', async () => {
    const u = await byggLarmplatsNejNotis(n(), async () => ({ rad: rad() }), nu);
    expect(u).toEqual({ typ: 'skicka', meddelande: {
      title: 'Larmplatsen fungerar inte · Gallring Santhe 2026.', body: 'Avlägg 01-4 · skbv gräskulla öst huset: bommen är låst · Daniel',
      url: '/planering?objekt=santhe', tag: 'larmplats-nej-k1' } });
  });
  it('utan kommentar och utan avlägg: koordinaten och "ambulansen kommer inte fram"', () => {
    expect(nejText(rad({ kommentar: null, plats: null })).body).toBe('Larmplatsen 56.51626, 14.70847 – ambulansen kommer inte fram · Daniel');
  });
  it('någon svarade Ja efteråt: ingen push', async () => {
    const r = rad({ alla: [...rad().alla, { id: 'k2', lat: 56.51626, lng: 14.70847, svar: 'ja', kommentar: null, vem: null, skapadAt: '2026-11-12T08:03:00Z' }] });
    expect((await byggLarmplatsNejNotis(n(), async () => ({ rad: r }), nu)).typ).toBe('hoppa_over');
  });
  it('läsfel: uppskjuts; borta eller för gammal: hoppas över', async () => {
    expect((await byggLarmplatsNejNotis(n(), async () => ({ rad: null, fel: 'nät' }), nu)).typ).toBe('uppskjut');
    expect((await byggLarmplatsNejNotis(n(), async () => ({ rad: null }), nu)).typ).toBe('hoppa_over');
    expect((await byggLarmplatsNejNotis(n({ skapad_at: '2026-11-10T08:00:00Z' }), async () => ({ rad: rad() }), nu)).typ).toBe('hoppa_over');
  });
});

describe('koaLarmplatsNej', () => {
  it('en rad per aktiv admin utom den som svarade, köad med infinity och dedup på svaret', async () => {
    const upsert: any[] = [];
    const tabell = (data: unknown) => { const b: any = { select: () => b, eq: () => b, gte: () => b, limit: () => b, then: (ok: any) => Promise.resolve({ data, error: null }).then(ok) }; return b; };
    const sb: any = {
      from: (t: string) => t === 'larmplats_kontroll' ? tabell([{ id: 'k1', medarbetare_id: 'martin' }])
        : t === 'medarbetare' ? tabell([{ id: 'martin', aktiv: true }, { id: 'joacim', aktiv: true }, { id: 'gammal', aktiv: false }])
        : { upsert: (r: any[]) => { upsert.push(...r); return { select: async () => ({ data: r, error: null }) }; } },
    };
    const r = await koaLarmplatsNej(sb, new Date(nu));
    expect(r).toEqual({ ok: true, svar: 1, koade: 1 });
    expect(upsert).toEqual([{ mottagare_id: 'joacim', typ: LARMPLATS_NEJ, payload: { kontroll_id: 'k1' }, skickas_at: 'infinity', dedup_nyckel: 'larmplats:k1' }]);
  });
});
