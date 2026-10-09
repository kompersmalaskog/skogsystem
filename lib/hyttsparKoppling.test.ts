import { describe, it, expect } from 'vitest';
import { kopplaHyttsparTillObjekt, objektTackerSpar } from './hyttsparKoppling';
import { slaIhopPunkter } from './hyttsparSlaIhop';
import { skapaMinnesDb } from './testStod/minnesDb';
import { kvadrat, spar } from './testStod/geometri';

// HYTTSPÅR UTAN OBJEKT → OBJEKT: ett objekts traktgräns (eller 300 m-punkt) som täcker spåret kopplar det automatiskt. Prövas på SLUTTILLSTÅNDET i en minnesdatabas.

const LAT = 56.40, LNG = 14.90;
const NU = new Date('2026-10-09T12:00:00.000Z');
const gransObj = { id: 'v1', lat: LAT, lng: LNG, geometri: kvadrat(LAT, LNG, 0.004) };
const rad = (id: string, objekt_id: string | null, roll: string, datum: string, points: any[], maskin_id: string | null = 'R64428') =>
  ({ id, objekt_id, roll, datum, points, maskin_id, antal_punkter: points.length });

describe('objektTackerSpar', () => {
  it('traktgräns: spåret inne → ja; spåret ute → nej; för få punkter inne → nej', () => {
    expect(objektTackerSpar(gransObj, spar(LAT - 0.002, LNG, 10))).toBe(true);
    expect(objektTackerSpar(gransObj, spar(LAT + 0.1, LNG, 10))).toBe(false);
    expect(objektTackerSpar(gransObj, spar(LAT, LNG, 2))).toBe(false);
    expect(objektTackerSpar(gransObj, spar(LAT, LNG, 2), { punkterMin: 1 })).toBe(true);
    expect(objektTackerSpar(gransObj, [])).toBe(false);
    expect(objektTackerSpar(gransObj, null)).toBe(false);
  });
  it('bara en punkt (jobb utan gräns): spår inom 300 m täcks', () => {
    const jobb = { id: 'p1', lat: LAT, lng: LNG, geometri: null };
    expect(objektTackerSpar(jobb, spar(LAT, LNG, 6, 0.0001, 0.0001))).toBe(true);
    expect(objektTackerSpar(jobb, spar(LAT + 0.02, LNG, 6))).toBe(false);
  });
});

describe('kopplaHyttsparTillObjekt', () => {
  it('spår utan objekt inom gränsen byter till objektet; spår utanför och spår som HAR objekt rörs inte', async () => {
    const db = skapaMinnesDb({ hyttspar: [
      rad('inne', null, 'skordare', '2026-10-08', spar(LAT - 0.001, LNG, 10)),
      rad('ute', null, 'skordare', '2026-10-08', spar(LAT + 0.2, LNG, 10), 'A030353'),
      rad('annat', 'v9', 'skordare', '2026-10-08', spar(LAT, LNG, 10)),
    ] });
    const r = await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU });
    expect(r).toEqual({ ok: true, kopplade: 1, sammanslagna: 0, ejTackta: 1 });
    const rader = db.tabeller.hyttspar;
    expect(rader.find((x) => x.id === 'inne')!.objekt_id).toBe('v1');
    expect(rader.find((x) => x.id === 'ute')!.objekt_id).toBeNull();
    expect(rader.find((x) => x.id === 'annat')!.objekt_id).toBe('v9');
  });
  it('har objektet redan dagens rad för samma roll slås punkterna ihop (inga tappas, inga dubletter) och källraden försvinner', async () => {
    const a = spar(LAT - 0.001, LNG, 5, 0.0001, 0, '2026-10-08T08:00:00.000Z');
    const b = spar(LAT - 0.001, LNG, 5, 0.0001, 0, '2026-10-08T09:00:00.000Z');
    const dubblett = a[2];
    const db = skapaMinnesDb({ hyttspar: [
      rad('mal', 'v1', 'skordare', '2026-10-08', a),
      rad('kalla', null, 'skordare', '2026-10-08', [...b, dubblett]),
    ] });
    const r = await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU });
    expect(r).toMatchObject({ ok: true, kopplade: 1, sammanslagna: 1 });
    expect(db.tabeller.hyttspar.map((x) => x.id)).toEqual(['mal']);
    const mal = db.tabeller.hyttspar[0];
    expect(mal.points).toHaveLength(10);            // 5 + 5, dubbletten räknad en gång
    expect(mal.antal_punkter).toBe(10);
    expect(mal.points.map((p: any) => p.tid)).toEqual([...mal.points.map((p: any) => p.tid)].sort());   // tidsordning
  });
  it('maskinId: bara den maskinens rader flyttas', async () => {
    const db = skapaMinnesDb({ hyttspar: [
      rad('min', null, 'skordare', '2026-10-09', spar(LAT, LNG, 6), 'R64428'),
      rad('annans', null, 'skordare', '2026-10-09', spar(LAT, LNG, 6), 'A030353'),
    ] });
    const r = await kopplaHyttsparTillObjekt(db as any, gransObj, { maskinId: 'R64428', nu: NU });
    expect(r.kopplade).toBe(1);
    expect(db.tabeller.hyttspar.find((x) => x.id === 'annans')!.objekt_id).toBeNull();
  });
  it('för gamla rader (äldre än dagar) lämnas', async () => {
    const db = skapaMinnesDb({ hyttspar: [rad('gammal', null, 'skordare', '2026-06-01', spar(LAT, LNG, 6))] });
    const r = await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU, dagar: 60 });
    expect(r).toMatchObject({ ok: true, kopplade: 0 });
    expect(db.tabeller.hyttspar[0].objekt_id).toBeNull();
  });
  it('idempotent: andra körningen hittar inget kvar att koppla', async () => {
    const db = skapaMinnesDb({ hyttspar: [rad('inne', null, 'skordare', '2026-10-08', spar(LAT, LNG, 8))] });
    expect((await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU })).kopplade).toBe(1);
    expect(await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU })).toMatchObject({ ok: true, kopplade: 0, ejTackta: 0 });
  });
  it('läsfel → ok:false med felet, ingenting skrivet', async () => {
    const db = skapaMinnesDb({ hyttspar: [rad('inne', null, 'skordare', '2026-10-08', spar(LAT, LNG, 8))] });
    db.injiceraFel('hyttspar.select', { message: 'statement timeout' });
    const r = await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU });
    expect(r.ok).toBe(false);
    expect(db.skrivlogg).toEqual([]);
  });
  it('en uppdatering som inte träffar någon rad räknas som FEL, aldrig som lyckad koppling', async () => {
    const db = skapaMinnesDb({ hyttspar: [rad('inne', null, 'skordare', '2026-10-08', spar(LAT, LNG, 8))] });
    // raden försvinner mellan läsningen och skrivningen (annan klient)
    db.fore('hyttspar.update', () => { db.tabeller.hyttspar = []; });
    const r = await kopplaHyttsparTillObjekt(db as any, gransObj, { nu: NU });
    expect(r.ok).toBe(false);
    expect(r.kopplade).toBe(0);
  });
});

describe('slaIhopPunkter', () => {
  it('lägger ihop, tar bort exakta dubbletter, tidsordnar; punkter utan tid hamnar sist i sin inbördes ordning', () => {
    const a = [{ lat: 1, lng: 1, tid: '2026-10-09T08:00:00.000Z' }, { lat: 3, lng: 3, tid: '2026-10-09T10:00:00.000Z' }];
    const b = [{ lat: 2, lng: 2, tid: '2026-10-09T09:00:00.000Z' }, { lat: 3, lng: 3, tid: '2026-10-09T10:00:00.000Z' }, { lat: 9, lng: 9 }, { lat: 8, lng: 8 }];
    expect(slaIhopPunkter(a, b).map((p) => p.lat)).toEqual([1, 2, 3, 9, 8]);
  });
  it('ogiltigt in → tomt; muterar aldrig indata', () => {
    expect(slaIhopPunkter(null, undefined)).toEqual([]);
    expect(slaIhopPunkter([{ lat: NaN, lng: 1 }], 'x')).toEqual([]);
    const a = [{ lat: 1, lng: 1, tid: 'b' }]; const kopia = JSON.stringify(a);
    slaIhopPunkter(a, [{ lat: 2, lng: 2, tid: 'a' }]);
    expect(JSON.stringify(a)).toBe(kopia);
  });
});
