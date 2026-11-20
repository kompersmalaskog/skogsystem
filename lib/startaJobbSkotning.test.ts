import { describe, it, expect } from 'vitest';
import { sparaSkotning } from './startaJobbSkotning';

/** Liten fejk: update().in()/eq().select() → { data, error } per tabell. */
function fejk(svar: Record<string, { data?: any[]; error?: { message: string } }>) {
  const anrop: string[] = [];
  const klient: any = {
    from: (t: string) => {
      const b: any = {
        update: () => { anrop.push(t); return b; },
        in: () => b, eq: () => b,
        select: () => Promise.resolve({ data: svar[t]?.data ?? null, error: svar[t]?.error ?? null }),
      };
      return b;
    },
  };
  return { klient, anrop };
}

describe('sparaSkotning', () => {
  it('maskinobjekten först, sedan jobbet', async () => {
    const { klient, anrop } = fejk({ dim_objekt: { data: [{ objekt_id: 'A', egen_skotning: true }] }, objekt: { data: [{ id: 'o', egen_skotning: true }] } });
    expect(await sparaSkotning(klient, { jobbId: 'o', dimIds: ['A'] }, true)).toEqual({ ok: true });
    expect(anrop).toEqual(['dim_objekt', 'objekt']);
  });
  it('färre rader tillbaka än maskinobjekt är ett fel (RLS släppte inte igenom)', async () => {
    const { klient } = fejk({ dim_objekt: { data: [] } });
    const r = await sparaSkotning(klient, { jobbId: 'o', dimIds: ['A'] }, true);
    expect(r.ok).toBe(false);
  });
  it('jobbet utan kolumnen (migrationen ej körd) men maskinobjekten sparade → sparat', async () => {
    const { klient } = fejk({ dim_objekt: { data: [{ objekt_id: 'A', egen_skotning: true }] }, objekt: { error: { message: 'column objekt.egen_skotning does not exist' } } });
    expect(await sparaSkotning(klient, { jobbId: 'o', dimIds: ['A'] }, true)).toEqual({ ok: true });
  });
  it('jobb utan maskinobjekt och utan kolumnen → säger att databasen behöver uppdateras', async () => {
    const { klient } = fejk({ objekt: { error: { message: 'column objekt.egen_skotning does not exist' } } });
    const r = await sparaSkotning(klient, { jobbId: 'o', dimIds: [] }, true);
    expect(r).toEqual({ ok: false, fel: expect.stringContaining('migrationen') });
  });
  it('jobbet tillbaka med fel värde är ett fel', async () => {
    const { klient } = fejk({ objekt: { data: [{ id: 'o', egen_skotning: false }] } });
    expect((await sparaSkotning(klient, { jobbId: 'o', dimIds: [] }, true)).ok).toBe(false);
  });
});
