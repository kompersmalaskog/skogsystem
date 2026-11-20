import { describe, expect, it } from 'vitest';
import { fakeSb } from './fakeSb.testStod';
import { hyttBesok, kvitteraBesok, maskinKopplad } from './hyttserver';

const OBJ = '00000000-0000-4000-8000-0000000000aa';
const ANNAT = '00000000-0000-4000-8000-0000000000bb';
const B1 = '11111111-1111-4111-8111-111111111111';
const B2 = '22222222-2222-4222-8222-222222222222';
const B_ANNAT = '33333333-3333-4333-8333-333333333333';
const NU = new Date('2026-10-23T10:00:00Z');
const min = (m: number) => new Date(NU.getTime() + m * 60000).toISOString();

const FORARE = { medarbetareId: 'f-1', roll: 'forare' };
const ADMIN = { medarbetareId: 'a-1', roll: 'admin' };

function varld(over: Record<string, any[]> = {}) {
  return fakeSb({
    objekt: [{ id: OBJ, skordare_maskin_id: 'GIANT', skotare_maskin_id: 'WISENT' }, { id: ANNAT, skordare_maskin_id: null, skotare_maskin_id: null }],
    maskin_ko: [],
    hyttspar: [],
    dim_maskin: [{ maskin_id: 'GIANT', maskin_typ: 'Harvester' }, { maskin_id: 'WISENT', maskin_typ: 'Forwarder' }, { maskin_id: 'ANNAN', maskin_typ: 'Harvester' }, { maskin_id: 'OKAND', maskin_typ: null }],
    objekt_besok: [
      { id: B1, objekt_id: OBJ, namn: 'Anna', telefon: '070-1', besokstid: min(30), skapad_at: min(-10), hemligt: 'x' },
      { id: B2, objekt_id: OBJ, namn: 'Per', telefon: '070-2', besokstid: min(-300), skapad_at: min(-400) },
      { id: B_ANNAT, objekt_id: ANNAT, namn: 'Annan trakt', telefon: '070-3', besokstid: min(30), skapad_at: min(-10) },
    ],
    objekt_besok_kvittens: [],
    ...over,
  });
}

describe('maskinKopplad: tilldelad, i kön eller har arbetat där', () => {
  it('tilldelad som skördare eller skotare', async () => {
    expect(await maskinKopplad(varld(), OBJ, 'GIANT', NU)).toBe(true);
    expect(await maskinKopplad(varld(), OBJ, 'WISENT', NU)).toBe(true);
  });
  it('i objektets maskinkö', async () => {
    expect(await maskinKopplad(varld({ maskin_ko: [{ objekt_id: OBJ, maskin_id: 'ANNAN' }] }), OBJ, 'ANNAN', NU)).toBe(true);
  });
  it('har loggat hyttspår på objektet senaste 30 dagarna – men inte äldre', async () => {
    expect(await maskinKopplad(varld({ hyttspar: [{ objekt_id: OBJ, maskin_id: 'ANNAN', datum: '2026-10-20' }] }), OBJ, 'ANNAN', NU)).toBe(true);
    expect(await maskinKopplad(varld({ hyttspar: [{ objekt_id: OBJ, maskin_id: 'ANNAN', datum: '2026-08-01' }] }), OBJ, 'ANNAN', NU)).toBe(false);
  });
  it('en maskin som inte hör till objektet är inte kopplad; en kö på ett ANNAT objekt räknas inte', async () => {
    expect(await maskinKopplad(varld({ maskin_ko: [{ objekt_id: ANNAT, maskin_id: 'ANNAN' }] }), OBJ, 'ANNAN', NU)).toBe(false);
  });
  it('ett läsfel är "fel" – aldrig ett ja', async () => {
    expect(await maskinKopplad(fakeSb({ objekt: [] }, {}, { fel: { objekt: 'nät' } }), OBJ, 'GIANT', NU)).toBe('fel');
    expect(await maskinKopplad(fakeSb({ objekt: [{ id: OBJ }], maskin_ko: [] }, {}, { fel: { maskin_ko: 'nät' } }), OBJ, 'GIANT', NU)).toBe('fel');
    expect(await maskinKopplad(fakeSb({ objekt: [{ id: OBJ }], maskin_ko: [], hyttspar: [] }, {}, { fel: { hyttspar: 'nät' } }), OBJ, 'GIANT', NU)).toBe('fel');
  });
});

describe('GET /api/besok/hytt – vem får läsa besökens namn och telefonnummer', () => {
  it('en förare på en kopplad maskin ser objektets aktiva besök – exakt fyra fält, inga andra trakters, inga gamla', async () => {
    const r = await hyttBesok(varld(), FORARE, { objekt: OBJ, maskin: 'GIANT' }, NU);
    expect(r.status).toBe(200);
    expect(r.body.besok).toEqual([{ id: B1, namn: 'Anna', telefon: '070-1', besokstid: min(30) }]);
    expect(Object.keys((r.body.besok as any[])[0]).sort()).toEqual(['besokstid', 'id', 'namn', 'telefon']);
    expect(JSON.stringify(r.body)).not.toContain('hemligt');
    expect(r.body.testlage).toBe(false);
  });
  it('en förare på en maskin som INTE är kopplad till objektet får 403 och ingen data – och servern frågade aldrig efter besöken', async () => {
    const sb = varld();
    const r = await hyttBesok(sb, FORARE, { objekt: OBJ, maskin: 'ANNAN' }, NU);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain('Anna');
    expect(sb._valda.some((v: any) => v.tabell === 'objekt_besok')).toBe(false);
  });
  it('en maskin som inte finns / har okänd typ ger samma 403 (ingen ledtråd)', async () => {
    expect((await hyttBesok(varld(), FORARE, { objekt: OBJ, maskin: 'FINNS_INTE' }, NU)).status).toBe(403);
    expect((await hyttBesok(varld(), FORARE, { objekt: OBJ, maskin: 'OKAND' }, NU)).status).toBe(403);
  });
  it('en förare kan inte be om testläge för att komma förbi kopplingen', async () => {
    expect((await hyttBesok(varld(), FORARE, { objekt: OBJ, maskin: 'ANNAN', test: '1' }, NU)).status).toBe(403);
  });
  it('admin utan testläge måste också ha en kopplad maskin; med testläge (Visar som maskin) behövs ingen koppling', async () => {
    expect((await hyttBesok(varld(), ADMIN, { objekt: OBJ, maskin: 'ANNAN' }, NU)).status).toBe(403);
    const t = await hyttBesok(varld(), ADMIN, { objekt: OBJ, maskin: 'ANNAN', test: '1' }, NU);
    expect(t.status).toBe(200);
    expect(t.body.testlage).toBe(true);
  });
  it('visar bara DEN HÄR maskinens kvittenser', async () => {
    const sb = varld({ objekt_besok_kvittens: [{ besok_id: B1, maskin_id: 'GIANT' }, { besok_id: B1, maskin_id: 'WISENT' }] });
    expect((await hyttBesok(sb, FORARE, { objekt: OBJ, maskin: 'GIANT' }, NU)).body.kvitterade).toEqual([B1]);
    expect((await hyttBesok(varld({ objekt_besok_kvittens: [{ besok_id: B1, maskin_id: 'WISENT' }] }), FORARE, { objekt: OBJ, maskin: 'GIANT' }, NU)).body.kvitterade).toEqual([]);
  });
  it('ogiltig begäran = 400; ingen medarbetare = 403; läsfel = 503 (aldrig ett tomt "inga besök")', async () => {
    expect((await hyttBesok(varld(), FORARE, { objekt: 'x', maskin: 'GIANT' }, NU)).status).toBe(400);
    expect((await hyttBesok(varld(), FORARE, { objekt: OBJ, maskin: "GIANT'; drop" }, NU)).status).toBe(400);
    expect((await hyttBesok(varld(), { medarbetareId: null, roll: 'forare' }, { objekt: OBJ, maskin: 'GIANT' }, NU)).status).toBe(403);
    const sb = fakeSb({ objekt: [{ id: OBJ, skordare_maskin_id: 'GIANT' }], maskin_ko: [], hyttspar: [], dim_maskin: [{ maskin_id: 'GIANT', maskin_typ: 'Harvester' }], objekt_besok: [] }, {}, { fel: { objekt_besok: 'nät' } });
    expect((await hyttBesok(sb, FORARE, { objekt: OBJ, maskin: 'GIANT' }, NU)).status).toBe(503);
    const sb3 = fakeSb({ objekt: [{ id: OBJ, skordare_maskin_id: 'GIANT' }], dim_maskin: [] }, {}, { fel: { dim_maskin: 'nät' } });
    expect((await hyttBesok(sb3, FORARE, { objekt: OBJ, maskin: 'GIANT' }, NU)).status).toBe(503);
  });
});

describe('POST /api/besok/hytt/kvittera – servern avgör maskin, roll, förare och testläge', () => {
  const rader = (sb: any) => sb._loggar.filter((l: any) => l.tabell === 'objekt_besok_kvittens').map((l: any) => l.rad);

  it('sparar med roll ur maskinregistret och förare ur sessionen – det klienten skickar om dem ignoreras', async () => {
    const sb = varld();
    const r = await kvitteraBesok(sb, FORARE, { besok_id: B1, maskin_id: 'WISENT', roll: 'skordare', forare_id: 'nagon-annan', testlage: true, kvitterad_at: '2000-01-01' }, NU);
    expect(r.status).toBe(200);
    expect(rader(sb)).toEqual([{ besok_id: B1, maskin_id: 'WISENT', roll: 'skotare', forare_id: 'f-1', testlage: false }]);
  });
  it('en förare kan inte kvittera för en maskin som inte är kopplad till objektet (ingen rad skrivs)', async () => {
    const sb = varld();
    expect((await kvitteraBesok(sb, FORARE, { besok_id: B1, maskin_id: 'ANNAN' }, NU)).status).toBe(403);
    expect(rader(sb)).toEqual([]);
  });
  it('testläge gäller bara för en admin som uttryckligen ber om det – då märks kvittensen och ingen koppling krävs', async () => {
    const sb = varld();
    expect((await kvitteraBesok(sb, ADMIN, { besok_id: B1, maskin_id: 'ANNAN' }, NU)).status).toBe(403);   // admin utan testläge
    expect(rader(sb)).toEqual([]);
    expect((await kvitteraBesok(sb, ADMIN, { besok_id: B1, maskin_id: 'ANNAN', testlage: true }, NU)).status).toBe(200);
    expect(rader(sb)).toEqual([{ besok_id: B1, maskin_id: 'ANNAN', roll: 'skordare', forare_id: 'a-1', testlage: true }]);
  });
  it('testlage: "ja" som text eller 1 räknas inte – bara true', async () => {
    const sb = varld();
    expect((await kvitteraBesok(sb, ADMIN, { besok_id: B1, maskin_id: 'ANNAN', testlage: 'true' }, NU)).status).toBe(403);
    expect((await kvitteraBesok(sb, ADMIN, { besok_id: B1, maskin_id: 'ANNAN', testlage: 1 }, NU)).status).toBe(403);
  });
  it('ett besök som inte finns är 404, ett som är över är 410, en okänd maskin 403 – och inget skrivs', async () => {
    const sb = varld();
    expect((await kvitteraBesok(sb, FORARE, { besok_id: '44444444-4444-4444-8444-444444444444', maskin_id: 'GIANT' }, NU)).status).toBe(404);
    expect((await kvitteraBesok(sb, FORARE, { besok_id: B2, maskin_id: 'GIANT' }, NU)).status).toBe(410);
    expect((await kvitteraBesok(sb, FORARE, { besok_id: B1, maskin_id: 'FINNS_INTE' }, NU)).status).toBe(403);
    expect(rader(sb)).toEqual([]);
  });
  it('ett besök på ett ANNAT objekt kan inte kvitteras av en maskin som bara hör till det här', async () => {
    const sb = varld();
    expect((await kvitteraBesok(sb, FORARE, { besok_id: B_ANNAT, maskin_id: 'GIANT' }, NU)).status).toBe(403);
    expect(rader(sb)).toEqual([]);
  });
  it('en andra kvittens för samma maskin lyckas men skriver inte över den första', async () => {
    const sb = varld();
    await kvitteraBesok(sb, FORARE, { besok_id: B1, maskin_id: 'GIANT' }, NU);
    expect((await kvitteraBesok(sb, FORARE, { besok_id: B1, maskin_id: 'GIANT' }, NU)).status).toBe(200);
    expect(rader(sb)).toHaveLength(1);
  });
  it('ogiltig begäran = 400, ingen medarbetare = 403, skrivfel = 503', async () => {
    expect((await kvitteraBesok(varld(), FORARE, { besok_id: 'x', maskin_id: 'GIANT' }, NU)).status).toBe(400);
    expect((await kvitteraBesok(varld(), FORARE, null, NU)).status).toBe(400);
    expect((await kvitteraBesok(varld(), { medarbetareId: null, roll: 'forare' }, { besok_id: B1, maskin_id: 'GIANT' }, NU)).status).toBe(403);
    const fel = fakeSb({ objekt: [{ id: OBJ, skordare_maskin_id: 'GIANT' }], dim_maskin: [{ maskin_id: 'GIANT', maskin_typ: 'Harvester' }], objekt_besok: [{ id: B1, objekt_id: OBJ, besokstid: min(30) }] }, {}, { fel: { objekt_besok_kvittens: 'nät' } });
    expect((await kvitteraBesok(fel, FORARE, { besok_id: B1, maskin_id: 'GIANT' }, NU)).status).toBe(503);
  });
});
