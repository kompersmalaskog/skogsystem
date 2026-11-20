import { describe, expect, it } from 'vitest';
import { hamtaKvittens, medKvittens, sparaKvittens } from './kvittens';

function fakeDb(rader: any[] = [], fel: string | null = null) {
  const logg: any[] = [];
  return {
    logg,
    from: (tabell: string) => ({
      select: () => { const q: any = { eq: (k: string, v: any) => { logg.push(['eq', k, v]); q.filter = (q.filter ?? []).concat([[k, v]]); return q; }, then: (res: any) => res({ data: fel ? null : rader.filter((r) => (q.filter ?? []).every(([k, v]: any) => r[k] === v)), error: fel ? { message: fel } : null }) }; return q; },
      upsert: (rad: any, opt: any) => { logg.push(['upsert', tabell, rad, opt]); return Promise.resolve({ error: fel ? { message: fel } : null }); },
    }),
  };
}

describe('kvittens per förare', () => {
  it('läser bara förarens egna rader på objektet', async () => {
    const db = fakeDb([
      { objekt_id: 'o1', forare_id: 'A', marker_id: 'm1', innehall_hash: 'h', kvitterad_at: 't' },
      { objekt_id: 'o1', forare_id: 'B', marker_id: 'm2', innehall_hash: 'h', kvitterad_at: 't' },
    ]);
    const { karta, fel } = await hamtaKvittens(db, 'o1', 'A');
    expect(fel).toBeNull();
    expect([...karta.keys()]).toEqual(['m1']);
    expect(karta.get('m1')).toMatchObject({ forareId: 'A', hash: 'h' });
  });
  it('ett läsfel ger tom karta (fullt larm) och felet rapporteras', async () => {
    const { karta, fel } = await hamtaKvittens(fakeDb([], 'nätet'), 'o1', 'A');
    expect(karta.size).toBe(0); expect(fel).toBe('nätet');
  });
  it('sparar med förare, namn och grupp (tiden sätter servern); en rad per objekt+markering+förare', async () => {
    const db = fakeDb();
    const fel = await sparaKvittens(db, { objektId: 'o1', markerId: 'm1', forareId: 'A', forareNamn: 'Stefan', typ: 'powerline', namn: 'El-ledning', grupp: 'fara', hash: 'h' });
    expect(fel).toBeNull();
    const [, tabell, rad, opt] = db.logg.find((l) => l[0] === 'upsert')!;
    expect(tabell).toBe('korvy_kvittens_forare');
    expect(rad).toMatchObject({ objekt_id: 'o1', marker_id: 'm1', forare_id: 'A', forare_namn: 'Stefan', grupp: 'fara', innehall_hash: 'h' });
    expect(rad).not.toHaveProperty('kvitterad_at');   // tiden sätts av servern (trigger), aldrig av klienten
    expect(opt).toEqual({ onConflict: 'objekt_id,marker_id,forare_id' });
  });
  it('ett skrivfel returneras (sidan visar det, larmet står kvar)', async () => {
    expect(await sparaKvittens(fakeDb([], 'RLS'), { objektId: 'o', markerId: 'm', forareId: 'A', hash: 'h' })).toBe('RLS');
  });
  it('medKvittens ändrar inte den gamla kartan', () => {
    const a = new Map(); const b = medKvittens(a, 'm', { hash: 'h', forareId: 'A' });
    expect(a.size).toBe(0); expect(b.get('m')).toBeTruthy();
  });
});
