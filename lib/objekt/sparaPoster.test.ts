import { beforeEach, describe, expect, it, vi } from 'vitest';

// Merge-nyckeln är (ar, manad, typ, bolag_id) — som det gamla formuläret. Fake av supabase som loggar skrivningar.
const DB: { rader: any[]; skriv: { op: string; payload: any; filter: string[] }[]; fel: { code?: string; message: string } | null } = { rader: [], skriv: [], fel: null };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      let op = 'select', payload: any = null; const filter: string[] = []; let ar: number[] | null = null;
      const p: any = new Proxy(() => {}, {
        get(_t, prop: string) {
          if (prop === 'then') return (res: any, rej: any) => {
            if (op === 'select') return Promise.resolve({ data: DB.rader.filter(r => !ar || ar.includes(r.ar)), error: null }).then(res, rej);
            if (DB.fel) return Promise.resolve({ data: null, error: DB.fel }).then(res, rej);
            DB.skriv.push({ op, payload, filter });
            const n = op === 'update' ? 1 : (payload as any[]).length;
            return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })), error: null }).then(res, rej);
          };
          if (prop === 'select') return () => p;
          if (prop === 'insert' || prop === 'update') return (pl: any) => { op = prop; payload = pl; return p; };
          if (prop === 'in') return (_k: string, v: number[]) => { ar = v; return p; };
          if (prop === 'eq') return (k: string, v: any) => { filter.push(`${k}=${v}`); return p; };
          return () => p;
        },
      });
      return p;
    },
  },
}));

import { sparaPoster, type NyPost } from './data';

const BAS = { ar: 2026, manad: 10, typ: 'gallring' as const, bolag: 'Vida', bolag_id: 1, volym: 1200 };
beforeEach(() => {
  DB.rader = [{ id: 'g-vida', ar: 2026, manad: 10, typ: 'gallring', bolag: 'Vida', bolag_id: 1 }, { id: 'legacy', ar: 2026, manad: 11, typ: 'gallring', bolag: 'Vida', bolag_id: null }];
  DB.skriv = []; DB.fel = null;
});

describe('sparaPoster — merge på (ar, manad, typ, bolag_id)', () => {
  it('samma nyckel → den befintliga posten uppdateras, ingenting nytt läggs till', async () => {
    await sparaPoster([BAS]);
    expect(DB.skriv).toEqual([{ op: 'update', payload: expect.objectContaining({ volym: 1200 }), filter: ['id=g-vida'] }]);
  });

  it('nyckeln är bolag_id, inte texten: samma bolag_id med annan stavning uppdaterar posten', async () => {
    await sparaPoster([{ ...BAS, bolag: 'Vida AB' }]);
    expect(DB.skriv.map(s => s.op)).toEqual(['update']);
    expect(DB.skriv[0].filter).toEqual(['id=g-vida']);
  });

  it('annat bolag_id på samma månad och typ → en NY post (två kunder kan beställa samma typ)', async () => {
    await sparaPoster([{ ...BAS, bolag: 'ATA Timber', bolag_id: 7, volym: 300 }]);
    expect(DB.skriv).toHaveLength(1);
    expect(DB.skriv[0].op).toBe('insert');
    expect(DB.skriv[0].payload).toEqual([expect.objectContaining({ bolag: 'ATA Timber', bolag_id: 7, volym: 300 })]);
  });

  it('annan månad eller annan typ med samma bolag → ny post', async () => {
    await sparaPoster([{ ...BAS, manad: 12 }, { ...BAS, typ: 'slutavverkning' }]);
    expect(DB.skriv.map(s => s.op)).toEqual(['insert']);
    expect(DB.skriv[0].payload).toHaveLength(2);
  });

  it('en post med id uppdateras direkt, också när raden är gammal och saknar bolag_id', async () => {
    await sparaPoster([{ ...BAS, manad: 11, bolag_id: null, id: 'legacy', volym: 77 }]);
    expect(DB.skriv).toEqual([{ op: 'update', payload: expect.objectContaining({ volym: 77 }), filter: ['id=legacy'] }]);
  });

  it('ett id som inte finns längre är ett fel — aldrig en tyst ny rad', async () => {
    await expect(sparaPoster([{ ...BAS, id: 'borta' }])).rejects.toThrow('finns inte längre');
    expect(DB.skriv).toEqual([]);
  });
});

describe('sparaPoster — ingen reserv', () => {
  it('en ny post utan bolag_id eller utan bolagsnamn skrivs aldrig (ingen "Vida" fylls i)', async () => {
    await expect(sparaPoster([{ ...BAS, bolag_id: null } as NyPost])).rejects.toThrow('Välj bolag');
    await expect(sparaPoster([{ ...BAS, bolag: ' ' }])).rejects.toThrow('Välj bolag');
    expect(DB.skriv).toEqual([]);
  });

  it('det unika indexet (23505) blir ett läsbart fel', async () => {
    DB.fel = { code: '23505', message: 'duplicate key value violates unique constraint' };
    await expect(sparaPoster([{ ...BAS, bolag: 'ATA Timber', bolag_id: 7 }])).rejects.toThrow('Det finns redan en beställning på ATA Timber');
  });
});
