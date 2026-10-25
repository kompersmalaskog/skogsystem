import { beforeEach, describe, expect, it } from 'vitest';
import { fakeSb } from './fakeSb.testStod';
import { maskinerPaTrakten, minAnmalan, publikVy, rensaBesokCache, rensaNamn, rensaTelefon, skapaAnmalan, slaUppLank } from './server';

const TOKEN = 'T'.repeat(40);
const OBJ = '00000000-0000-4000-8000-0000000000aa';
const NU = new Date('2026-10-22T10:00:00Z');
const min = (m: number) => new Date(NU.getTime() - m * 60000).toISOString();

const objekt = (extra: Record<string, any> = {}) => ({ id: OBJ, namn: 'Hålabäck au 2025 -25', vo_nummer: '11251359', status: 'pagaende', bolag: 'Vida', lat: 56.35, lng: 15.05, kartbild_bounds: null, volym: 1000, dim_objekt_id: null, markagare: 'Hemligsson', markagare_tel: '0709999999', ...extra });
const traktdel = { objekt_id: OBJ, geometri: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { _lager: 'L_TRAKTDEL', _typ: 'traktdel' }, geometry: { type: 'Polygon', coordinates: [[[15.048, 56.348], [15.052, 56.348], [15.052, 56.352], [15.048, 56.352], [15.048, 56.348]]] } }] } };
const punkt = (roll: string, lat: number, lng: number, tid: string) => ({ objekt_id: OBJ, roll, datum: '2026-10-22', uppdaterad_at: tid, points: [{ lat: 1, lng: 1, tid: min(500) }, { lat, lng, tid }] });

function varld(over: { tabeller?: Record<string, any[]>; rpc?: Record<string, any> } = {}) {
  return fakeSb({
    objekt_besok_lank: [{ token: TOKEN, objekt_id: OBJ, aktiv: true }],
    objekt: [objekt()],
    objekt_geometri: [traktdel],
    planering_markeringar: [],
    objekt_alt_nummer: [],
    hyttspar: [],
    objekt_besok: [],
    objekt_besok_kvittens: [],
    ...over.tabeller,
  }, { besok_volymer: [{ kalla: 'skordat', datum: '2026-10-21', m3: 250 }, { kalla: 'skordat', datum: '2026-10-22', m3: 250 }, { kalla: 'skotat', datum: '2026-10-22', m3: 0 }], ...over.rpc });
}

beforeEach(() => rensaBesokCache());

describe('länken', () => {
  it('okänd token → 404, avstängd → 410, avslutat objekt → 410, kort token → 404 utan uppslag', async () => {
    expect((await publikVy(varld(), 'x'.repeat(40), { nu: NU })).status).toBe(404);
    expect((await publikVy(varld({ tabeller: { objekt_besok_lank: [{ token: TOKEN, objekt_id: OBJ, aktiv: false }] } }), TOKEN, { nu: NU })).status).toBe(410);
    expect((await publikVy(varld({ tabeller: { objekt: [objekt({ status: 'avslutat' })] } }), TOKEN, { nu: NU })).status).toBe(410);
    expect((await publikVy(varld({ tabeller: { objekt: [objekt({ status: 'klar' })] } }), TOKEN, { nu: NU })).status).toBe(410);
    const sb = varld();
    expect((await publikVy(sb, 'kort', { nu: NU })).status).toBe(404);
    expect(sb._valda).toHaveLength(0);
  });
  it('ett läsfel är 503 — aldrig "länken finns inte"', async () => {
    const u = await slaUppLank(varld({}) as any, 'z'.repeat(40));
    expect(u).toEqual({ ok: false, skal: 'okand' });
    const sb = fakeSb({ objekt_besok_lank: [] }, {}, { fel: { objekt_besok_lank: 'nät' } });
    expect((await publikVy(sb, TOKEN, { nu: NU })).status).toBe(503);
  });
});

describe('vad besökssidan får: exakt de fält sidan visar', () => {
  it('svaret har bara de tillåtna fälten — inga markägare, inga volymer, inga förare, inga spår', async () => {
    const sb = varld({ tabeller: { hyttspar: [punkt('skordare', 56.351, 15.051, min(2)), punkt('skotare', 56.349, 15.049, min(5))] } });
    const r = await publikVy(sb, TOKEN, { nu: NU });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['besok', 'framsteg', 'gran', 'harMotorsag', 'maskiner', 'mitt', 'motorsag', 'namn', 'ok', 'ringM', 'roller', 'uppdaterad', 'utforare']);
    const json = JSON.stringify(r.body);
    for (const hemligt of ['Hemligsson', '0709999999', '11251359', '1000', 'forare_id', 'Stefan', 'points', 'volym', 'token', 'uppdaterad_at']) expect(json.includes(hemligt), hemligt).toBe(false);
    expect((r.body.maskiner as any[]).map((m) => Object.keys(m).sort())).toEqual([['lat', 'lng', 'roll', 'tid'], ['lat', 'lng', 'roll', 'tid']]);
    expect(r.body.namn).toBe('Hålabäck');   // utan VO-nummer, årssuffix och Vidas koder (au)
    expect(r.body.utforare).toBe('Kompersmåla Skog åt Vida');
  });
  it('framsteget: bara procent när prognosen inte håller (två dagar räcker inte)', async () => {
    const r = await publikVy(varld(), TOKEN, { nu: NU });
    expect(r.body.framsteg).toEqual({ procent: 25, klartCa: null, text: '25 % klart', forklaring: null });
  });
  it('framsteget: "klart ca" med förklaring när varje del har fem stabila färska dagar', async () => {
    const dag = (n: number) => `2026-10-${String(22 - n).padStart(2, '0')}`;
    const rpc = { besok_volymer: [
      ...[0, 1, 2, 3, 4].map((n) => ({ kalla: 'skordat', datum: dag(n), m3: 100 })),
      ...[0, 1, 2, 3, 4].map((n) => ({ kalla: 'skotat', datum: dag(n), m3: 50 })),
    ] };
    const r = await publikVy(varld({ rpc }), TOKEN, { nu: NU });
    const f = r.body.framsteg as any;
    expect(f.procent).toBe(Math.round(((500 / 1000 + 250 / 1000) / 2) * 100));
    expect(f.klartCa).toBe('den 12 november');   // skotningen: 750 kvar i 50/dag = 15 arbetsdagar från torsdag 22 okt
    expect(f.text).toBe(`${f.procent} % klart · klart ca den 12 november`);
    expect(f.forklaring).toContain('senaste 5 dagarna');
  });
  it('traktens namn är platsen, inte Vidas internnamn: kod bort, fastighetsbeteckning när inget namn finns kvar', async () => {
    const v = (namn: string, fastighetsbeteckning: string | null) => varld({ tabeller: { objekt: [objekt({ namn, fastighetsbeteckning })] } });
    expect((await publikVy(v('RP J-Hus -25', 'Skälviken 1:23'), TOKEN, { nu: NU })).body.namn).toBe('Skälviken 1:23');
    expect((await publikVy(v('Skälviken au 2025', null), TOKEN, { nu: NU })).body.namn).toBe('Skälviken');
    expect((await publikVy(v('RP J-Hus -25', null), TOKEN, { nu: NU })).body.namn).toBe('Trakten');
  });
  it('går volymfunktionen inte att anropa (migrationen ej körd) utelämnas framsteget — sidan faller inte', async () => {
    const sb = fakeSb({ objekt_besok_lank: [{ token: TOKEN, objekt_id: OBJ, aktiv: true }], objekt: [objekt()], objekt_geometri: [], planering_markeringar: [], objekt_alt_nummer: [], hyttspar: [], objekt_besok: [] });
    const r = await publikVy(sb, TOKEN, { nu: NU });
    expect(r.status).toBe(200);
    expect(r.body.framsteg).toEqual({ procent: null, klartCa: null, text: null, forklaring: null });
  });
});

describe('maskinerna på trakten: senaste hyttspårspunkten, bara färska', () => {
  it('färsk, gammal och framtida; en per roll — den senaste', async () => {
    const sb = varld({ tabeller: { hyttspar: [
      punkt('skordare', 56.351, 15.051, min(2)),
      { ...punkt('skordare', 56.3, 15.0, min(30)), datum: '2026-10-21' },
      punkt('skotare', 56.349, 15.049, min(300)),            // 5 h gammal → inte på trakten
      { ...punkt('skotare', 56.1, 15.1, '2026-10-22T10:30:00Z'), roll: 'skotare' },   // 30 min i framtiden → klockan går fel, visas inte
      { ...punkt('skordare', 56.0, 15.0, min(1)), objekt_id: 'annat-objekt' },
    ] } });
    const m = await maskinerPaTrakten(sb, OBJ, NU);
    expect(m).toEqual([{ roll: 'skordare', lat: 56.351, lng: 15.051, tid: min(2) }]);
  });
  it('rader utan punkter eller med trasig data ger ingen maskin', async () => {
    const sb = varld({ tabeller: { hyttspar: [{ objekt_id: OBJ, roll: 'skordare', datum: '2026-10-22', points: [] }, { objekt_id: OBJ, roll: 'skotare', datum: '2026-10-22', points: [{ lat: 'x', lng: null, tid: min(1) }] }, { objekt_id: OBJ, roll: 'lastbil', datum: '2026-10-22', points: [{ lat: 1, lng: 1, tid: min(1) }] }] } });
    expect(await maskinerPaTrakten(sb, OBJ, NU)).toEqual([]);
  });
});

describe('motorsåg: raden finns om symbolen finns; ringen bara om platsen går att styrka', () => {
  const fall = { objekt_id: OBJ, typ: 'manualfelling', data: { type: 'manualfelling', x: 0, y: 0 } };
  it('symbol + styrkt origo (mot Vidas traktgräns) → en plats nära objektet', async () => {
    const r = await publikVy(varld({ tabeller: { planering_markeringar: [fall] } }), TOKEN, { nu: NU });
    expect(r.body.harMotorsag).toBe(true);
    const m = r.body.motorsag as { lat: number; lng: number }[];
    expect(m).toHaveLength(1);
    expect(Math.abs(m[0].lat - 56.35)).toBeLessThan(0.0005);
  });
  it('utan Vidas traktgräns går platsen inte att styrka: raden finns men ingen ring', async () => {
    const r = await publikVy(varld({ tabeller: { planering_markeringar: [fall], objekt_geometri: [] } }), TOKEN, { nu: NU });
    expect(r.body.harMotorsag).toBe(true);
    expect(r.body.motorsag).toEqual([]);
  });
  it('ingen symbol → ingen rad', async () => {
    const r = await publikVy(varld({ tabeller: { planering_markeringar: [{ objekt_id: OBJ, typ: 'landing', data: { x: 0, y: 0 } }] } }), TOKEN, { nu: NU });
    expect(r.body.harMotorsag).toBe(false);
  });
});

describe('markägarens egen anmälan', () => {
  const tabeller = {
    objekt_besok: [{ id: '11111111-1111-4111-8111-111111111111', objekt_id: OBJ, namn: 'Anna', telefon: '070', besokstid: min(-30) }, { id: '22222222-2222-4222-8222-222222222222', objekt_id: 'annat', namn: 'Per', telefon: '071', besokstid: min(-30) }],
    objekt_besok_kvittens: [{ besok_id: '11111111-1111-4111-8111-111111111111', maskin_id: 'M1', roll: 'skordare', kvitterad_at: min(1), forare_id: 'f1' }],
  };
  it('visar anmälan och vilka maskiner som sett den — utan maskin- eller förar-id', async () => {
    const r = await minAnmalan(varld({ tabeller }), OBJ, '11111111-1111-4111-8111-111111111111');
    expect(r).toEqual({ id: '11111111-1111-4111-8111-111111111111', besokstid: min(-30), kvitteringar: [{ roll: 'skordare', tid: min(1) }], maskiner: [{ etikett: 'Skördaren', roll: 'skordare', tid: min(1) }] });
    expect(JSON.stringify(r)).not.toMatch(/M1|f1|Anna|070/);
  });
  it('en annan trakts anmälan, ett trasigt id eller inget id ger ingenting', async () => {
    expect(await minAnmalan(varld({ tabeller }), OBJ, '22222222-2222-4222-8222-222222222222')).toBeNull();
    expect(await minAnmalan(varld({ tabeller }), OBJ, 'inte-ett-id')).toBeNull();
    expect(await minAnmalan(varld({ tabeller }), OBJ, null)).toBeNull();
  });
});

describe('POST anmälan', () => {
  const body = { namn: ' Anna  Svensson ', telefon: '070-123 45 67', nar: 'om1h' };
  it('sparar namn, telefon och besökstid (om 1 h) — och inget annat', async () => {
    const sb = varld();
    const r = await skapaAnmalan(sb, TOKEN, body, NU);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(sb._loggar).toHaveLength(1);
    expect(sb._loggar[0].rad).toMatchObject({ objekt_id: OBJ, namn: 'Anna Svensson', telefon: '070-123 45 67', besokstid: '2026-10-22T11:00:00.000Z' });
    expect(Object.keys(sb._loggar[0].rad).sort()).toEqual(['besokstid', 'id', 'namn', 'objekt_id', 'skapad_at', 'telefon']);
  });
  it('klockslag idag', async () => {
    const sb = varld();
    const r = await skapaAnmalan(sb, TOKEN, { ...body, nar: 'tid', tid: '14:30' }, NU);
    expect(r.status).toBe(200);
    expect(sb._loggar[0].rad.besokstid).toBe('2026-10-22T12:30:00.000Z');
  });
  it('kräver namn, ett riktigt telefonnummer och en tid', async () => {
    expect((await skapaAnmalan(varld(), TOKEN, { ...body, namn: '   ' }, NU)).status).toBe(400);
    expect((await skapaAnmalan(varld(), TOKEN, { ...body, telefon: '12' }, NU)).status).toBe(400);
    expect((await skapaAnmalan(varld(), TOKEN, { ...body, telefon: 'abc' }, NU)).status).toBe(400);
    expect((await skapaAnmalan(varld(), TOKEN, { ...body, nar: 'igår' }, NU)).status).toBe(400);
    expect((await skapaAnmalan(varld(), TOKEN, { ...body, nar: 'tid', tid: '99:99' }, NU)).status).toBe(400);
    expect((await skapaAnmalan(varld(), TOKEN, null, NU)).status).toBe(400);
  });
  it('avstängd länk och avslutat objekt tar inte emot anmälningar', async () => {
    expect((await skapaAnmalan(varld({ tabeller: { objekt_besok_lank: [{ token: TOKEN, objekt_id: OBJ, aktiv: false }] } }), TOKEN, body, NU)).status).toBe(410);
    expect((await skapaAnmalan(varld({ tabeller: { objekt: [objekt({ status: 'avslutat' })] } }), TOKEN, body, NU)).status).toBe(410);
    expect((await skapaAnmalan(varld(), 'x'.repeat(40), body, NU)).status).toBe(404);
  });
  it('högst 20 anmälningar per timme och trakt', async () => {
    const mange = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, objekt_id: OBJ, namn: 'A', telefon: '0701234567', besokstid: min(0), skapad_at: min(10) }));
    const sb = varld({ tabeller: { objekt_besok: mange } });
    expect((await skapaAnmalan(sb, TOKEN, body, NU)).status).toBe(429);
    expect(sb._loggar).toHaveLength(0);
    const gamla = mange.map((m) => ({ ...m, skapad_at: min(90) }));
    expect((await skapaAnmalan(varld({ tabeller: { objekt_besok: gamla } }), TOKEN, body, NU)).status).toBe(200);
  });
  it('rensning: styrtecken bort, längd begränsad, telefon bara siffror/+/-/mellanslag', () => {
    expect(rensaNamn('A\u0000b\n c')).toBe('A b c');
    expect(rensaNamn('x'.repeat(200))).toHaveLength(80);
    expect(rensaNamn(5)).toBe('');
    expect(rensaTelefon('+46 70 123 45 67')).toBe('+46 70 123 45 67');
    expect(rensaTelefon('070<script>1234567')).toBe('0701234567');
    expect(rensaTelefon('1'.repeat(20))).toBeNull();
  });
});
