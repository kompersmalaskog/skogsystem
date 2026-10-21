// @vitest-environment jsdom
// Kön för kommentarer: en kommentar är sparad när den ligger lokalt; den skickas när nätet finns, utan dubbletter, och ett fel som aldrig blir bättre ger inte en
// kö som fastnar för alltid.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { antalVantande, laggIKo, korKartkommentarKo, lasKo, nollstallKartkommentarKo, sattKartkommentarAuto, vantandePosterFor, type KoDb } from './kartkommentarKo';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

type Anrop = { op: string; arg?: any; id?: string };
function fakeDb(styr: { fel?: (a: Anrop) => any; rader?: Set<string> } = {}) {
  const anrop: Anrop[] = [];
  const rader = styr.rader ?? new Set<string>();
  const db: KoDb = {
    from: () => ({
      insert: async (r: any) => {
        const a = { op: 'insert', arg: r }; anrop.push(a);
        const fel = styr.fel?.(a); if (fel) return { error: fel };
        if (rader.has(r.id)) return { error: { code: '23505', message: 'duplicate' } };
        rader.add(r.id); return { error: null };
      },
      update: (v: any) => ({
        eq: (_k: string, id: string) => {
          const a = { op: 'update', arg: v, id }; anrop.push(a);
          const fel = styr.fel?.(a);
          const res = { error: fel ?? null, data: fel ? null : rader.has(id) ? [{ id }] : [] };
          const p: any = Promise.resolve(res);
          p.select = () => Promise.resolve(res);
          return p;
        },
      }),
      delete: () => ({ eq: async (_k: string, id: string) => { const a = { op: 'delete', id }; anrop.push(a); const fel = styr.fel?.(a); if (!fel) rader.delete(id); return { error: fel ?? null }; } }),
    }),
  };
  return { db, anrop, rader };
}
const ny = (id: string, text = 'hej') => ({ id, objekt_id: 'o1', yta_nyckel: 'linje:abc', op: 'ny' as const, text, skapad_av: 'm1', namn: 'Martin', skapad_lokalt: '2026-10-20T14:20:00Z' });
const natfel = { message: 'Failed to fetch' };

beforeEach(() => { nollstallKartkommentarKo(); sattKartkommentarAuto(false); localStorage.clear(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });

describe('kartkommentarKo', () => {
  it('utan täckning: kommentaren ligger kvar i kön (lokalt sparad) och skickas när nätet kommer — ett insert, ingen dubblett', async () => {
    const f = fakeDb({ fel: () => natfel });
    laggIKo(ny('k1'));
    await korKartkommentarKo(true, f.db);
    expect(antalVantande()).toBe(1);
    expect(lasKo()[0]).toMatchObject({ id: 'k1', forsok: 1 });
    expect(lasKo()[0].nasta).toBeGreaterThan(Date.now());   // väntetid före nästa försök
    // Nätet kommer tillbaka:
    const ok = fakeDb();
    await korKartkommentarKo(true, ok.db);
    expect(ok.anrop.filter((a) => a.op === 'insert')).toHaveLength(1);
    expect(ok.anrop[0].arg).toMatchObject({ id: 'k1', objekt_id: 'o1', yta_nyckel: 'linje:abc', text: 'hej', skapad_av: 'm1' });
    expect(ok.anrop[0].arg).not.toHaveProperty('skapad_at');   // tiden sätts av servern
    expect(antalVantande()).toBe(0);
  });

  it('kön överlever att appen laddas om (localStorage)', () => {
    laggIKo(ny('k1'));
    expect(JSON.parse(localStorage.getItem('kartkommentar_ko_v1')!)[0].id).toBe('k1');
    expect(vantandePosterFor('o1')).toHaveLength(1);
    expect(vantandePosterFor('annat')).toHaveLength(0);
  });

  it('en väntetid hoppas över av den vanliga tickan men inte av ett tvingat försök (nätet kom tillbaka)', async () => {
    const f = fakeDb({ fel: () => natfel });
    laggIKo(ny('k1'));
    await korKartkommentarKo(true, f.db);
    const ok = fakeDb();
    await korKartkommentarKo(false, ok.db);          // före väntetidens slut
    expect(ok.anrop).toHaveLength(0);
    await korKartkommentarKo(true, ok.db);
    expect(ok.anrop).toHaveLength(1);
  });

  it('omförsök ger ingen dubblett: finns raden redan på servern (23505) skickas bara texten som en ändring', async () => {
    const rader = new Set(['k1']);
    const f = fakeDb({ rader });
    laggIKo(ny('k1', 'senaste texten'));
    await korKartkommentarKo(true, f.db);
    expect(f.anrop.map((a) => a.op)).toEqual(['insert', 'update']);
    expect(f.anrop[1].arg).toEqual({ text: 'senaste texten' });
    expect(antalVantande()).toBe(0);
  });

  it('ny + ändra medan den väntar = ETT insert med nya texten; ny + radera = inget alls', async () => {
    const f = fakeDb({ fel: () => natfel });
    laggIKo(ny('k1', 'första'));
    await korKartkommentarKo(true, f.db);
    laggIKo({ ...ny('k1', 'andra'), op: 'andra' });
    expect(lasKo()).toHaveLength(1);
    expect(lasKo()[0]).toMatchObject({ op: 'ny', text: 'andra' });
    const ok = fakeDb();
    await korKartkommentarKo(true, ok.db);
    expect(ok.anrop.filter((a) => a.op === 'insert')).toHaveLength(1);
    expect(ok.anrop[0].arg.text).toBe('andra');

    laggIKo(ny('k2'));
    laggIKo({ ...ny('k2'), op: 'radera' });
    expect(vantandePosterFor('o1').filter((p) => p.id === 'k2')).toHaveLength(0);
  });

  it('ändra och radera på en kommentar som redan finns skickas som update resp. delete', async () => {
    const f = fakeDb({ rader: new Set(['s1']) });
    laggIKo({ ...ny('s1', 'ändrad'), op: 'andra' });
    await korKartkommentarKo(true, f.db);
    expect(f.anrop.map((a) => a.op)).toEqual(['update']);
    laggIKo({ ...ny('s1'), op: 'radera' });
    await korKartkommentarKo(true, f.db);
    expect(f.anrop.map((a) => a.op)).toEqual(['update', 'delete']);
    expect(f.rader.has('s1')).toBe(false);
  });

  it('ett fel som aldrig blir bättre (behörighet) ger upp posten i stället för att fastna: nästa post kommer ändå fram', async () => {
    const f = fakeDb({ fel: (a) => (a.arg?.id === 'k1' ? { code: '42501', message: 'new row violates row-level security' } : null) });
    laggIKo(ny('k1')); laggIKo(ny('k2'));
    await korKartkommentarKo(true, f.db);
    expect(antalVantande()).toBe(0);
    expect(f.rader.has('k2')).toBe(true);
    expect(f.rader.has('k1')).toBe(false);
  });

  it('en ändring av någon annans (0 rader) ger upp och lämnar ingenting i kön', async () => {
    const f = fakeDb();               // raden finns inte som "min" → update ger 0 rader
    laggIKo({ ...ny('annans'), op: 'andra' });
    await korKartkommentarKo(true, f.db);
    expect(antalVantande()).toBe(0);
  });

  it('inget nät: ingenting skickas och inget kastas; ordningen bevaras (ett fel stoppar resten)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const f = fakeDb();
    laggIKo(ny('k1'));
    await korKartkommentarKo(true, f.db);
    expect(f.anrop).toHaveLength(0);
    expect(antalVantande()).toBe(1);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const nat = fakeDb({ fel: () => natfel });
    laggIKo(ny('k2'));
    await korKartkommentarKo(true, nat.db);
    expect(nat.anrop).toHaveLength(1);        // första misslyckades → den andra försöktes inte
    expect(antalVantande()).toBe(2);
  });
});
