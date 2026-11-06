// Skotarlänken: rita runt och kartans lager. Tagen (markering + lass) provas i avlagg.test.ts.
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { lasRing, paTrakten, skotarOmradeSvar, HOG_MARGINAL_M } from './hogSkriv';
import { rensaSkotarCache } from './server';
import { arOffentligSkotarSokvag } from './offentlig';
import { markeringDel, STANDARD_LAGER } from './karta';

const TOKEN = 'b'.repeat(64);
const OBJ = 'o-1';
const ID = '11111111-2222-4333-8444-555555555555';

type Rad = Record<string, any>;
function fake(t: Record<string, Rad[]>) {
  const skrivet: { typ: string; tabell: string; rad?: Rad }[] = [];
  const sb: any = {
    from(tabell: string) {
      const filter: ((r: Rad) => boolean)[] = [];
      let lage: 'las' | 'del' = 'las';
      let raknaHead = false;
      const rader = () => (t[tabell] ?? []).filter((r) => filter.every((f) => f(r)));
      const b: any = {
        select(_k: string, o?: { count?: string; head?: boolean }) { if (o?.head) raknaHead = true; return b; },
        eq(k: string, v: any) { filter.push((r) => r[k] === v); return b; },
        in(k: string, v: any[]) { filter.push((r) => v.includes(r[k])); return b; },
        is(k: string, v: any) { filter.push((r) => (r[k] ?? null) === v); return b; },
        gte(k: string, v: any) { filter.push((r) => String(r[k]) >= String(v)); return b; },
        not() { return b; }, order() { return b; }, range() { return b; },
        maybeSingle() { return Promise.resolve({ data: rader()[0] ?? null, error: null }); },
        insert(rad: Rad) { skrivet.push({ typ: 'insert', tabell, rad }); (t[tabell] ??= []).push({ ...rad, skapad_at: new Date().toISOString() }); return Promise.resolve({ error: null }); },
        delete() { lage = 'del'; return b; },
        then(res: any, rej?: any) {
          if (lage === 'del') { const bort = rader(); t[tabell] = (t[tabell] ?? []).filter((r) => !bort.includes(r)); skrivet.push({ typ: 'delete', tabell }); return Promise.resolve({ data: bort, error: null }).then(res, rej); }
          if (raknaHead) return Promise.resolve({ count: rader().length, error: null }).then(res, rej);
          return Promise.resolve({ data: rader(), error: null }).then(res, rej);
        },
      };
      return b;
    },
    _skrivet: skrivet,
  };
  return sb;
}

const stam = (lat: number, lng: number) => ({ objekt_id: 'P-1', latitude: lat, longitude: lng, total_volym: 0.5, tradslag_id: '1', sortiment: 'Massaved' });
function bas(): Record<string, Rad[]> {
  return {
    objekt_skotar_lank: [{ objekt_id: OBJ, token: TOKEN, aktiv: true }],
    objekt: [{ id: OBJ, namn: 'Test', vo_nummer: 'P-1', status: 'pagaende', lat: 56.6, lng: 15.0, kartbild_bounds: null, fastighetsbeteckning: null, dim_objekt_id: null }],
    objekt_alt_nummer: [],
    detalj_stam: [stam(56.6, 15.0), stam(56.6, 15.0001), stam(56.6001, 15.0)],
    dim_tradslag: [{ tradslag_id: '1', namn: 'Gran' }],
    skotning_uttag: [], skotar_lass: [],
    skotar_hog_markering: [{ id: 'egen-1', objekt_id: OBJ, typ: 'tagen', geometri: { type: 'Point', coordinates: [15.0, 56.6] }, bredd_m: 8, grupp: null, skapad_av: 'forare-1', skapad_at: new Date().toISOString() }],
  };
}

beforeEach(() => rensaSkotarCache());

describe('ringen och trakten', () => {
  it('en ring kräver minst tre giltiga hörn', () => {
    expect(lasRing([[15, 56], [15.1, 56]])).toBeNull();
    expect(lasRing([[15, 56], [15.1, 56], ['x', 1]])).toBeNull();
    expect(lasRing([[15, 56], [15.1, 56], [15.1, 56.1]])).toHaveLength(3);
  });
  it('på trakten = inom stammarna + marginal; utan stammar aldrig', () => {
    const s = [{ lat: 56.6, lng: 15.0, volym: 1, tradslag: '', sortiment: null }];
    expect(paTrakten([[15.0, 56.6]], s)).toBe(true);
    expect(paTrakten([[15.0, 56.6 + (HOG_MARGINAL_M + 50) / 111_320]], s)).toBe(false);
    expect(paTrakten([[15.0, 56.6]], [])).toBe(false);
  });
});

describe('rita runt', () => {
  it('räknar det som ligger kvar i ringen', async () => {
    const s = await skotarOmradeSvar(fake(bas()), TOKEN, { ring: [[14.999, 56.599], [15.001, 56.599], [15.001, 56.601], [14.999, 56.601]] });
    expect(s.status).toBe(200);
    expect(s.body.hogar).toBeGreaterThan(0);
  });
  it('trasig ring = 400', async () => {
    expect((await skotarOmradeSvar(fake(bas()), TOKEN, { ring: [[15, 56]] })).status).toBe(400);
  });
});

describe('ren karta', () => {
  it('bara övrigt är av från start', () => {
    expect(Object.entries(STANDARD_LAGER).filter(([, v]) => !v).map(([k]) => k)).toEqual(['ovrigt']);
  });
  it('markeringarna hamnar i rätt val', () => {
    const d = (kind: string, typ: string) => markeringDel({ properties: { kind, typ } });
    expect(d('linje', 'mainRoad')).toBe('vag');
    expect(d('linje', 'powerline')).toBe('fara');
    expect(d('linje', 'stonewall')).toBe('ovrigt');
    expect(d('symbol', 'landing')).toBe('vag');
    expect(d('symbol', 'highstump')).toBe('ovrigt');
    expect(d('zon', 'protected')).toBe('skydd');
    expect(d('zon', 'wet')).toBe('ovrigt');
  });
  it('inga ytnamn och ingen volym ovanpå kartan', () => {
    const k = fs.readFileSync(path.resolve(__dirname, 'karta.ts'), 'utf8');
    expect(k).not.toMatch(/VIDA_ETIKETT|YTA_ETIKETT/);
    const sida = fs.readFileSync(path.resolve(__dirname, '../../components/skotarlank/SkotarSida.tsx'), 'utf8');
    // Kvar-volymen finns bara i panelen "Kvar på trakten".
    expect(sida.indexOf('data-skotar-kvar=""')).toBeGreaterThan(sida.indexOf("panel === 'kvar'"));
  });
  it('rutterna för rita runt och Tagen är öppna med token; den gamla markera-rutten finns inte', () => {
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/omrade`)).toBe(true);
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/taget`)).toBe(true);
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/hog`)).toBe(false);
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/annat`)).toBe(false);
  });
});
