import { describe, it, expect, vi, beforeEach } from 'vitest';

// En liten tabell i minnet som förstår precis det sparaKopplingar gör.
type Rad = { risjobb_objekt_id: string; avverknings_objekt_id: string; kalla?: string };
let rader: Rad[] = [];
let kallaSaknas = false;

function fraga() {
  const filter: Array<(r: Rad) => boolean> = [];
  let op: { typ: 'select' | 'delete' | 'update' | 'insert'; data?: any } = { typ: 'select' };
  const q: any = {
    select: () => q,
    eq: (k: keyof Rad, v: string) => { filter.push(r => r[k] === v); return q; },
    in: (k: keyof Rad, v: string[]) => { filter.push(r => v.includes(r[k] as string)); return q; },
    delete: () => { op = { typ: 'delete' }; return q; },
    update: (d: any) => { op = { typ: 'update', data: d }; return q; },
    insert: (d: Rad[]) => { op = { typ: 'insert', data: d }; return q; },
    then: (los: (v: any) => void) => {
      const traff = rader.filter(r => filter.every(f => f(r)));
      if (op.typ === 'delete') rader = rader.filter(r => !traff.includes(r));
      if (op.typ === 'update') {
        if (kallaSaknas && 'kalla' in op.data) return los({ data: null, error: { code: '42703', message: 'column "kalla" does not exist' } });
        traff.forEach(r => Object.assign(r, op.data));
      }
      if (op.typ === 'insert') { rader.push(...op.data.map((r: Rad) => ({ kalla: 'manuell', ...r }))); return los({ data: op.data, error: null }); }
      return los({ data: traff.map(r => ({ ...r })), error: null });
    },
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => fraga() } }));

import { sparaKopplingar } from './grot-koppling';

describe('sparaKopplingar', () => {
  beforeEach(() => { rader = []; kallaSaknas = false; });

  it('en koppling appen satt och som människan behåller blir manuell (timjobbet rör den då aldrig)', async () => {
    rader = [{ risjobb_objekt_id: 'R1', avverknings_objekt_id: 'H1', kalla: 'auto' }];
    const r = await sparaKopplingar('R1', ['H1', 'H2']);
    expect(r.ok).toBe(true);
    expect(rader).toEqual([
      { risjobb_objekt_id: 'R1', avverknings_objekt_id: 'H1', kalla: 'manuell' },
      { risjobb_objekt_id: 'R1', avverknings_objekt_id: 'H2', kalla: 'manuell' },
    ]);
  });

  it('borttagen koppling försvinner, också en automatisk', async () => {
    rader = [{ risjobb_objekt_id: 'R1', avverknings_objekt_id: 'H1', kalla: 'auto' }];
    expect((await sparaKopplingar('R1', [])).ok).toBe(true);
    expect(rader).toEqual([]);
  });

  it('utan kolumnen kalla (migrationen inte körd) sparas kopplingen ändå', async () => {
    kallaSaknas = true;
    const r = await sparaKopplingar('R1', ['H1']);
    expect(r.ok).toBe(true);
    expect(rader.map(x => x.avverknings_objekt_id)).toEqual(['H1']);
  });
});
