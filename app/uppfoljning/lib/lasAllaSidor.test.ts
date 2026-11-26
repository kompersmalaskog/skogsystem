import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lasAllaSidor, SIDA } from './lasAllaSidor';

// En tabell i minnet som svarar som PostgREST: högst SIDA rader per fråga.
function tabell(n: number, felPaSida?: number) {
  const rader = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const fragor: [number, number][] = [];
  const bygg = async (fran: number, till: number) => {
    fragor.push([fran, till]);
    if (felPaSida != null && fran === felPaSida * SIDA) return { data: null, error: { message: 'timeout' } };
    return { data: rader.slice(fran, Math.min(till + 1, fran + SIDA)), error: null };
  };
  return { bygg, fragor };
}

describe('lasAllaSidor', () => {
  it('läser alla rader när de är fler än en sida (Svinhult A: 1 044 produktionsrader)', async () => {
    const t = tabell(1044);
    const r = await lasAllaSidor(t.bygg);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1044);
    expect(r.data!.at(-1)).toEqual({ id: 1044 });
    expect(t.fragor).toEqual([[0, 999], [1000, 1999]]);
  });

  it('exakt en full sida läser en tom sida till och slutar där', async () => {
    const t = tabell(1000);
    const r = await lasAllaSidor(t.bygg);
    expect(r.data).toHaveLength(1000);
    expect(t.fragor).toHaveLength(2);
  });

  it('färre än en sida = en fråga', async () => {
    const t = tabell(12);
    const r = await lasAllaSidor(t.bygg);
    expect(r.data).toHaveLength(12);
    expect(t.fragor).toHaveLength(1);
  });

  it('inga rader = tom lista, inget fel', async () => {
    const r = await lasAllaSidor(tabell(0).bygg);
    expect(r).toEqual({ data: [], error: null });
  });

  it('ett fel på sida två är ett fel — aldrig de första 1 000 raderna som om de vore alla', async () => {
    const r = await lasAllaSidor(tabell(2500, 1).bygg);
    expect(r.data).toBeNull();
    expect(r.error).toEqual({ message: 'timeout' });
  });
});

describe('detaljvyn läser maskinens rader sida för sida', () => {
  const kalla = readFileSync('app/uppfoljning/hooks/useObjektUppfoljning.ts', 'utf8');

  it('ingen fråga mot fakt_-tabellerna utan range (PostgREST-taket på 1 000 rader)', () => {
    const fragor = kalla.match(/supabase\.from\('fakt_[a-z_]+'\)[^\n]*/g) ?? [];
    expect(fragor.length).toBeGreaterThan(0);
    for (const f of fragor) {
      expect(f, f).toContain(".order('id').range(");
    }
  });

  it('ett läsfel på maskinens egna rader blir ett fel, aldrig en tom lista', () => {
    expect(kalla).toMatch(/throw new Error\(`\$\{namn\} kunde inte läsas/);
    expect(kalla).not.toContain('1000-rader');
  });
});
