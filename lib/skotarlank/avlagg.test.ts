// Skotarlänken: avlägg och lass från den externa skotaren. Egna tabeller, objektet ur token, sortimenten måste finnas på trakten.
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { byggAvlagg, lassSortiment, nastaNummer, rensaSortiment } from './avlagg';
import { naraTrakten, skotarAvlaggNytt, skotarAvlaggTaBort, skotarLassNytt, skotarLassTaBort } from './lassSkriv';
import { rensaSkotarCache } from './server';
import { arOffentligSkotarSokvag } from './offentlig';

const TOKEN = 'd'.repeat(64);
const OBJ = 'o-1';
const ID = '11111111-2222-4333-8444-555555555555';
const ID2 = '21111111-2222-4333-8444-555555555555';

type Rad = Record<string, any>;
function fake(t: Record<string, Rad[]>) {
  const skrivet: { typ: string; tabell: string; rad?: Rad }[] = [];
  const sb: any = {
    from(tabell: string) {
      const filter: ((r: Rad) => boolean)[] = [];
      let lage: 'las' | 'upd' = 'las'; let patch: Rad = {}; let head = false;
      const rader = () => (t[tabell] ?? []).filter((r) => filter.every((f) => f(r)));
      const b: any = {
        select(_k: string, o?: { head?: boolean }) { if (o?.head) head = true; return b; },
        eq(k: string, v: any) { filter.push((r) => r[k] === v); return b; },
        in(k: string, v: any[]) { filter.push((r) => v.includes(r[k])); return b; },
        is(k: string, v: any) { filter.push((r) => (r[k] ?? null) === v); return b; },
        gte(k: string, v: any) { filter.push((r) => String(r[k]) >= String(v)); return b; },
        like() { return b; }, not() { return b; }, order() { return b; }, range() { return b; },
        maybeSingle() { return Promise.resolve({ data: rader()[0] ?? null, error: null }); },
        insert(rad: Rad) { skrivet.push({ typ: 'insert', tabell, rad }); (t[tabell] ??= []).push({ ...rad, skapad_at: new Date().toISOString() }); return Promise.resolve({ error: null }); },
        update(p: Rad) { lage = 'upd'; patch = p; return b; },
        then(res: any, rej?: any) {
          if (lage === 'upd') { const r = rader(); r.forEach((x) => Object.assign(x, patch)); skrivet.push({ typ: 'update', tabell, rad: patch }); return Promise.resolve({ data: r, error: null }).then(res, rej); }
          if (head) return Promise.resolve({ count: rader().length, error: null }).then(res, rej);
          return Promise.resolve({ data: rader(), error: null }).then(res, rej);
        },
      };
      return b;
    },
    storage: { from: () => ({}) },
    _skrivet: skrivet,
  };
  return sb;
}
const stam = (lat: number, lng: number, sortiment: string) => ({ id: Math.random(), objekt_id: 'P-1', latitude: lat, longitude: lng, total_volym: 1, tradslag_id: '1', sortiment });
function bas(): Record<string, Rad[]> {
  return {
    objekt_skotar_lank: [{ objekt_id: OBJ, token: TOKEN, aktiv: true }],
    objekt: [{ id: OBJ, namn: 'Test', vo_nummer: 'P-1', status: 'pagaende', lat: 56.6, lng: 15.0, kartbild_bounds: null, fastighetsbeteckning: null, dim_objekt_id: null }],
    objekt_alt_nummer: [], planering_markeringar: [], objekt_geometri: [], hyttspar: [], kartkommentar: [], skotning_uttag: [], skotar_lass: [], skotar_hog_markering: [],
    detalj_stam: [stam(56.6, 15.0, 'Massaved'), stam(56.6, 15.0001, 'Massaved'), stam(56.6001, 15.0, 'Kubb')],
    dim_tradslag: [{ tradslag_id: '1', namn: 'Gran' }],
    vy_sortiment_klass: [],
    skotar_lank_avlagg: [], skotar_lank_lass: [],
  };
}
beforeEach(() => rensaSkotarCache());

describe('ren logik', () => {
  it('sortimenten rensas: bara positiva tal under taket', () => {
    expect(rensaSortiment({ Massaved: 12, Kubb: 0, X: -3, Y: 'a', Z: 99 })).toEqual({ Massaved: 12 });
    expect(rensaSortiment(null)).toEqual({});
  });
  it('avläggen får sina lass, strukna räknas inte', () => {
    const a = byggAvlagg({
      egna: [{ id: 'a1', nummer: 3, lat: 56.6, lng: 15.0 }], markeringar: [], origo: null,
      vida: [{ geometry: { type: 'Point', coordinates: [15.1, 56.6] }, properties: { _typ: 'punkt', EXTRA_LABE: '01-1' } }],
      lass: [
        { id: 'l1', avlagg: 'egen:a1', sortiment: { Massaved: 15, Kubb: 3 }, skapad_at: '2026-11-06T08:00:00Z' },
        { id: 'l2', avlagg: 'egen:a1', sortiment: { Massaved: 10 }, skapad_at: '2026-11-06T09:00:00Z' },
        { id: 'l3', avlagg: 'egen:a1', sortiment: { Massaved: 10 }, struken: true, skapad_at: '2026-11-06T10:00:00Z' },
      ],
    });
    const egen = a.find((x) => x.ref === 'egen:a1')!;
    expect(egen).toMatchObject({ nr: '3', lass: 2, m3: 28, sortiment: [{ namn: 'Massaved', m3: 25 }, { namn: 'Kubb', m3: 3 }] });
    expect(egen.senaste.map((l) => l.id)).toEqual(['l2', 'l1']);
    expect(a.find((x) => x.ref === 'vida:01-1')).toMatchObject({ lass: 0, m3: 0 });
  });
  it('nästa nummer kommer efter det högsta som står på kartan', () => {
    expect(nastaNummer([{ nr: '2' }, { nr: '01-1' }], [{ id: 'a', nummer: 4, lat: 0, lng: 0 }])).toBe(5);
    expect(nastaNummer([], [])).toBe(1);
  });
  it('lasskortets sortiment: skördarens, störst först', () => {
    expect(lassSortiment([{ volym: 1, sortiment: 'Kubb' }, { volym: 3, sortiment: 'Massaved' }, { volym: 1, sortiment: null }])).toEqual(['Massaved', 'Kubb']);
  });
  it('nära trakten', () => {
    expect(naraTrakten([15.0, 56.6], [[15.0, 56.6]])).toBe(true);
    expect(naraTrakten([15.0, 56.7], [[15.0, 56.6]])).toBe(false);
    expect(naraTrakten([15.0, 56.6], [])).toBe(false);
  });
});

describe('servern', () => {
  it('nytt avlägg får nummer och sparas på länkens objekt', async () => {
    const t = bas(); const sb = fake(t);
    const s = await skotarAvlaggNytt(sb, TOKEN, { id: ID, punkt: [15.0, 56.6], objekt_id: 'annat' });
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ ref: `egen:${ID}`, nr: '1' });
    expect(t.skotar_lank_avlagg[0]).toMatchObject({ id: ID, objekt_id: OBJ, nummer: 1 });
  });
  it('ett avlägg långt från trakten sparas inte', async () => {
    const t = bas();
    expect((await skotarAvlaggNytt(fake(t), TOKEN, { id: ID, punkt: [16.0, 57.0] })).status).toBe(422);
    expect(t.skotar_lank_avlagg).toHaveLength(0);
  });
  it('ett lass sparas mot ett avlägg på trakten, med traktens sortiment', async () => {
    const t = bas(); t.skotar_lank_avlagg.push({ id: 'a1', objekt_id: OBJ, nummer: 1, lat: 56.6, lng: 15.0, borttagen: false });
    const s = await skotarLassNytt(fake(t), TOKEN, { id: ID, avlagg: 'egen:a1', sortiment: { Massaved: 14 } });
    expect(s.status).toBe(200);
    expect(t.skotar_lank_lass[0]).toMatchObject({ objekt_id: OBJ, avlagg: 'egen:a1', sortiment: { Massaved: 14 } });
  });
  it('lass mot okänt avlägg, okänt sortiment, tomt eller för stort sparas inte', async () => {
    const t = bas(); t.skotar_lank_avlagg.push({ id: 'a1', objekt_id: OBJ, nummer: 1, lat: 56.6, lng: 15.0, borttagen: false });
    const sb = fake(t);
    expect((await skotarLassNytt(sb, TOKEN, { id: ID, avlagg: 'egen:finns-inte', sortiment: { Massaved: 14 } })).status).toBe(422);
    expect((await skotarLassNytt(sb, TOKEN, { id: ID, avlagg: 'egen:a1', sortiment: { Timmer: 14 } })).status).toBe(422);
    expect((await skotarLassNytt(sb, TOKEN, { id: ID, avlagg: 'egen:a1', sortiment: {} })).status).toBe(400);
    expect((await skotarLassNytt(sb, TOKEN, { id: ID, avlagg: 'egen:a1', sortiment: { Massaved: 40, Kubb: 30 } })).status).toBe(400);
    expect(t.skotar_lank_lass).toHaveLength(0);
  });
  it('ta bort ett lass = struket; ett avlägg med lass går inte att ta bort', async () => {
    const t = bas(); t.skotar_lank_avlagg.push({ id: ID2, objekt_id: OBJ, nummer: 1, lat: 56.6, lng: 15.0, borttagen: false });
    const sb = fake(t);
    await skotarLassNytt(sb, TOKEN, { id: ID, avlagg: `egen:${ID2}`, sortiment: { Massaved: 14 } });
    expect((await skotarAvlaggTaBort(sb, TOKEN, ID2)).status).toBe(409);
    expect((await skotarLassTaBort(sb, TOKEN, ID)).status).toBe(200);
    expect(t.skotar_lank_lass[0].struken).toBe(true);
    rensaSkotarCache();
    expect((await skotarAvlaggTaBort(sb, TOKEN, ID2)).status).toBe(200);
    expect(t.skotar_lank_avlagg[0].borttagen).toBe(true);
  });
  it('en okänd länk skriver ingenting', async () => {
    const t = bas(); const sb = fake(t);
    expect((await skotarAvlaggNytt(sb, 'e'.repeat(64), { id: ID, punkt: [15.0, 56.6] })).status).toBe(404);
    expect(sb._skrivet).toHaveLength(0);
  });
});

describe('källvakter', () => {
  it('hans lass skrivs aldrig i våra lasstabeller', () => {
    const k = fs.readFileSync(path.resolve(__dirname, 'lassSkriv.ts'), 'utf8');
    expect(k).not.toMatch(/from\('skotar_lass'\)|from\('skotar_lass_del'\)|from\('fakt_lass'\)/);
  });
  it('rutterna är öppna med token', () => {
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/avlagg`)).toBe(true);
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/lass`)).toBe(true);
  });
});

describe('cachen efter en skrivning', () => {
  it('ett lass mot ett avlägg som en annan serverinstans just skapat godtas (vyn läses om, inte ur cachen)', async () => {
    const t = bas(); const sb = fake(t);
    const { skotarVySvar } = await import('./server');
    expect((await skotarVySvar(sb, TOKEN)).status).toBe(200);              // vyn hamnar i cachen utan avlägget
    t.skotar_lank_avlagg.push({ id: ID2, objekt_id: OBJ, nummer: 1, lat: 56.6, lng: 15.0, borttagen: false });   // skrivet på en annan instans
    expect((await skotarLassNytt(sb, TOKEN, { id: ID, avlagg: `egen:${ID2}`, sortiment: { Massaved: 10 } })).status).toBe(200);
  });
  it('farsk=1 läser förbi cachen', async () => {
    const t = bas(); const sb = fake(t);
    const { skotarVySvar } = await import('./server');
    await skotarVySvar(sb, TOKEN);
    t.skotar_lank_avlagg.push({ id: ID2, objekt_id: OBJ, nummer: 1, lat: 56.6, lng: 15.0, borttagen: false });
    expect(((await skotarVySvar(sb, TOKEN)).body.avlagg as unknown[]).length).toBe(0);
    expect(((await skotarVySvar(sb, TOKEN, Date.now(), true)).body.avlagg as unknown[]).length).toBe(1);
  });
});
