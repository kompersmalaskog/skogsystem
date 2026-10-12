import { describe, it, expect } from 'vitest';
import { filtreraHyttsparRad, hyttsparInsertRad, kanLoggaHyttspar } from './hyttsparNyckel';
import { skapaMinnesDb } from './testStod/minnesDb';

// Raden-för-dagen hittas på OBJEKT när objektet finns, annars på MASKINEN (objekt_id IS NULL). Prövas mot en riktig liten tabell, inte mot anropsordning.

const DAG = '2026-10-09';
const rad = (id: string, objekt_id: string | null, roll: string, maskin_id: string | null, datum = DAG) => ({ id, objekt_id, roll, maskin_id, datum, points: [] });

describe('filtreraHyttsparRad', () => {
  const db = () => skapaMinnesDb({ hyttspar: [
    rad('a', 'o1', 'skordare', 'R64428'),
    rad('b', 'o2', 'skordare', 'R64428'),
    rad('c', null, 'skordare', 'R64428'),
    rad('d', null, 'skordare', 'A030353'),
    rad('e', null, 'skotare', 'R64428'),
    rad('f', null, 'skordare', 'R64428', '2026-10-08'),
  ] });
  const hitta = async (ctx: any, datum = DAG) => ((await (filtreraHyttsparRad(db().from('hyttspar').select('id'), ctx, datum) as any)) as any).data.map((r: any) => r.id);

  it('med objekt: bara den radens objekt+roll+datum', async () => {
    expect(await hitta({ objektId: 'o1', roll: 'skordare', maskinId: 'R64428' })).toEqual(['a']);
  });
  it('utan objekt: maskinens rad för rollen och dagen — aldrig en annan maskins, annan rolls eller annan dags', async () => {
    expect(await hitta({ objektId: null, roll: 'skordare', maskinId: 'R64428' })).toEqual(['c']);
    expect(await hitta({ objektId: null, roll: 'skordare', maskinId: 'A030353' })).toEqual(['d']);
    expect(await hitta({ objektId: null, roll: 'skotare', maskinId: 'R64428' })).toEqual(['e']);
    expect(await hitta({ objektId: null, roll: 'skordare', maskinId: 'R64428' }, '2026-10-08')).toEqual(['f']);
  });
  it('utan objekt OCH utan maskin: träffar INGET (ett tomt maskin_id får aldrig plocka någon annans rad)', async () => {
    expect(await hitta({ objektId: null, roll: 'skordare', maskinId: null })).toEqual([]);
  });
});

describe('kanLoggaHyttspar / hyttsparInsertRad', () => {
  it('med objekt alltid; utan objekt bara med maskin', () => {
    expect(kanLoggaHyttspar({ objektId: 'o1', maskinId: null })).toBe(true);
    expect(kanLoggaHyttspar({ objektId: null, maskinId: 'R64428' })).toBe(true);
    expect(kanLoggaHyttspar({ objektId: null, maskinId: null })).toBe(false);
    expect(kanLoggaHyttspar({ objektId: null, maskinId: '  ' })).toBe(false);
  });
  it('insert-raden bär objekt_id null och maskin_id när objekt saknas', () => {
    expect(hyttsparInsertRad({ objektId: null, roll: 'skordare', maskinId: 'R64428' }, DAG, [{ lat: 1, lng: 2 }])).toEqual({
      objekt_id: null, roll: 'skordare', datum: DAG, maskin_id: 'R64428', points: [{ lat: 1, lng: 2 }], status: 'recording',
    });
  });
  it('den partiella unika nyckeln (maskin, roll, datum) där objekt_id är null: en andra rad för samma dag nekas som i Postgres', async () => {
    // migrationen lägger hyttspar_utan_objekt_unik; i minnesdatabasen modelleras den som en unik nyckel på de tre kolumnerna
    const d = skapaMinnesDb({ hyttspar: [] }, { hyttspar: [['maskin_id', 'roll', 'datum']] });
    const r1: any = await d.from('hyttspar').insert(hyttsparInsertRad({ objektId: null, roll: 'skordare', maskinId: 'R64428' }, DAG, [])).select('id').single();
    expect(r1.error).toBeNull();
    const r2: any = await d.from('hyttspar').insert(hyttsparInsertRad({ objektId: null, roll: 'skordare', maskinId: 'R64428' }, DAG, [])).select('id').single();
    expect(r2.error?.code).toBe('23505');
  });
});
