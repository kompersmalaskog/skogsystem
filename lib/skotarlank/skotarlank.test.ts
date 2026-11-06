// Skotarlänken: högarna, vitlistorna, länkens regler och källvakter (det som INTE får hända syns inte i ett beteendetest, så det läses ur källan).
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { skotarHogar, type Stam } from './hogar';
import { arGiltigtSkotarToken, arOffentligSkotarSokvag, arSkotarSida, skotarUrl } from './offentlig';
import { lasSkotarVy, origoUtanVida, rensaMarkering, rensaSkotarCache, rensaVida, skotarFoto, skotarVySvar, slaUppSkotarLank, MARKERING_FALT } from './server';
import { KALLA, kallor, markeringKort, vidaKort, lagerIdn, lagerOrdning } from './karta';
import { skotarManifest } from './manifest';

const rot = path.resolve(__dirname, '../..');
const las = (rel: string) => fs.readFileSync(path.join(rot, rel), 'utf8');
const TOKEN = 'a'.repeat(64);

// --- En liten Supabase-fake: tabeller som arrayer, de filter servern använder, storage. -------------------------------------------------------
type Rad = Record<string, any>;
function fake(tabeller: Record<string, Rad[]>, opt: { fel?: Record<string, string> } = {}) {
  const valda: { tabell: string; kolumner: string }[] = [];
  const sb: any = {
    from(tabell: string) {
      const filter: ((r: Rad) => boolean)[] = [];
      let fran = 0, till = Infinity;
      const kor = () => {
        if (opt.fel?.[tabell]) return { data: null, error: { message: opt.fel[tabell] } };
        return { data: (tabeller[tabell] ?? []).filter((r) => filter.every((f) => f(r))).slice(fran, till + 1), error: null };
      };
      const b: any = {
        select(k: string) { valda.push({ tabell, kolumner: k }); return b; },
        eq(k: string, v: any) { filter.push((r) => r[k] === v); return b; },
        in(k: string, v: any[]) { filter.push((r) => v.includes(r[k])); return b; },
        like(k: string, v: string) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); filter.push((r) => re.test(String(r[k]))); return b; },
        not(k: string, _op: string, _v: any) { filter.push((r) => r[k] != null); return b; },
        order() { return b; },
        range(a: number, z: number) { fran = a; till = z; return b; },
        maybeSingle() { const r = kor(); return Promise.resolve(r.error ? r : { data: r.data![0] ?? null, error: null }); },
        then(res: any, rej?: any) { return Promise.resolve(kor()).then(res, rej); },
      };
      return b;
    },
    storage: { from: () => ({ createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://lagring/${p}?sig=1` }, error: null }) }) },
    _valda: valda,
  };
  return sb;
}

const OBJ = 'o-1';
function bas(extra: Record<string, Rad[]> = {}) {
  return {
    objekt_skotar_lank: [{ objekt_id: OBJ, token: TOKEN, aktiv: true }],
    objekt: [{ id: OBJ, namn: 'Bjällerhult gallring P-1027', vo_nummer: 'P-1027', status: 'pagaende', lat: 56.6, lng: 15.0, kartbild_bounds: null, fastighetsbeteckning: 'Bjällerhult 1:2', dim_objekt_id: 'R64428_55', markagare: 'Hemlig Ägare', markagare_tel: '0701234567' }],
    objekt_alt_nummer: [],
    planering_markeringar: [
      { objekt_id: OBJ, data: { id: 'm1', isMarker: true, type: 'landing', x: 0, y: 0, nummer: 3, comment: 'Lägg massan här', photoPath: 'o-1/m1.jpg', photoAv: 'u-9', photoAvNamn: 'Oskar Nilsson', notes: 'intern' } },
      { objekt_id: OBJ, data: { id: 'm2', isLine: true, lineType: 'mainRoad', farg: 'red', path: [{ x: 0, y: 0 }, { x: 40, y: 10 }] } },
    ],
    objekt_geometri: [],
    hyttspar: [
      { objekt_id: OBJ, roll: 'skordare', maskin_id: 'R64428', points: Array.from({ length: 20 }, (_, i) => ({ lat: 56.6 + i * 0.00005, lng: 15.0, tid: `2026-11-05T08:${String(i).padStart(2, '0')}:00Z` })) },
      { objekt_id: OBJ, roll: 'skotare', maskin_id: 'JD810E', points: [{ lat: 56.7, lng: 15.1, tid: '2026-11-05T08:00:00Z' }, { lat: 56.7001, lng: 15.1, tid: '2026-11-05T08:01:00Z' }] },
    ],
    detalj_stam: [
      { objekt_id: 'R64428_55', latitude: 56.6, longitude: 15.0, total_volym: 0.2, tradslag_id: '1', sortiment: 'Gran Massa: BmavFall_V3' },
      { objekt_id: 'R64428_55', latitude: 56.60001, longitude: 15.00001, total_volym: 0.3, tradslag_id: '2', sortiment: 'Tall Massa: BmavFall_V3' },
      { objekt_id: 'ANNAT', latitude: 56.6, longitude: 15.0, total_volym: 99, tradslag_id: '1', sortiment: 'Gran Massa: BmavFall_V3' },
    ],
    dim_tradslag: [{ tradslag_id: '1', namn: 'Gran' }, { tradslag_id: '2', namn: 'Tall' }],
    kartkommentar: [{ objekt_id: OBJ, yta_nyckel: 'marker:m1', text: 'Blött i svängen', skapad_at: '2026-11-04T10:00:00Z', skapad_av: 'u-9' }],
    skotning_uttag: [],
    skotar_lass: [],
    skotar_hog_markering: [],
    ...extra,
  };
}

beforeEach(() => rensaSkotarCache());

describe('länken', () => {
  it('bara en lång url-säker token, och bara exakt de adresserna', () => {
    expect(arGiltigtSkotarToken(TOKEN)).toBe(true);
    expect(arGiltigtSkotarToken('kort')).toBe(false);
    expect(arSkotarSida(`/skotare/${TOKEN}`)).toBe(true);
    for (const s of ['karta', 'foto', 'manifest']) expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/${s}`)).toBe(true);
    for (const s of [`/skotare/${TOKEN}/annat`, `/api/skotare/${TOKEN}/lank`, '/skotare/', `/skotare/${TOKEN}x/../planering`, `/planering?x=/skotare/${TOKEN}`]) expect(arOffentligSkotarSokvag(s), s).toBe(false);
    expect(skotarUrl('https://skogsystem.vercel.app/', TOKEN)).toBe(`https://skogsystem.vercel.app/skotare/${TOKEN}`);
  });
  it('okänd 404, avstängd och avslutad 410', async () => {
    expect((await skotarVySvar(fake(bas()), 'b'.repeat(64))).status).toBe(404);
    expect((await skotarVySvar(fake(bas({ objekt_skotar_lank: [{ objekt_id: OBJ, token: TOKEN, aktiv: false }] })), TOKEN)).status).toBe(410);
    const t = bas();
    t.objekt[0].status = 'avslutat';
    expect((await slaUppSkotarLank(fake(t), TOKEN)).ok).toBe(false);
    expect((await skotarVySvar(fake(t), TOKEN)).status).toBe(410);
  });
  it('manifestet startar på länken, i helskärm', () => {
    const m = skotarManifest(TOKEN);
    expect(m.start_url).toBe(`/skotare/${TOKEN}`);
    expect(m.scope).toBe(`/skotare/${TOKEN}`);
    expect(m.display).toBe('fullscreen');
    expect(m.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
  });
});

describe('det som lämnar servern', () => {
  it('bara det objektets stammar, bara skördarens spår, inga tider, inga namn', async () => {
    const sb = fake(bas());
    const s = await skotarVySvar(sb, TOKEN);
    expect(s.status).toBe(200);
    const text = JSON.stringify(s.body);
    for (const ord of ['Hemlig', '0701234567', 'Oskar', 'photoAv', 'photoPath', 'o-1/m1.jpg', 'intern', 'P-1027', 'R64428', 'JD810E', 'T08:', 'u-9', 'maskin_id']) expect(text, ord).not.toContain(ord);
    const b = s.body as any;
    expect(b.namn).toBe('Bjällerhult');
    expect(b.hogar.skordatM3).toBe(1);   // 0,2 + 0,3 → avrundat; 99 m³ från ett annat objekt är inte med
    expect(b.spar.length).toBeGreaterThan(0);
    expect(b.spar.flat().every((p: number[]) => p[0] === 15.0)).toBe(true);   // skotarens spår (lng 15.1) är inte med
    expect(b.kommentarer).toEqual({ m1: ['Blött i svängen'] });
    expect(b.markeringar[0]).toMatchObject({ id: 'm1', type: 'landing', nummer: 3, foto: true });
  });
  it('markeringen: bara vitlistade fält', () => {
    const r = rensaMarkering({ id: 1, type: 'x', photoAvNamn: 'N', framtidaFalt: 'hemligt', photoData: 'data:image/jpeg;base64,AAA' })!;
    expect(Object.keys(r).every((k) => (MARKERING_FALT as readonly string[]).includes(k) || k === 'foto')).toBe(true);
    expect(r.foto).toBe(true);
    expect(r).not.toHaveProperty('photoData');
  });
  it('Vida: aldrig fastigheterna runt omkring eller larmpunkten, bara vitlistade egenskaper', () => {
    const ut = rensaVida([
      { type: 'Feature', properties: { _typ: 'fastighet', _lager: 'SV_FASTIGHET', BETECKNING: 'Granne 1:1' }, geometry: { type: 'Polygon', coordinates: [] } },
      { type: 'Feature', properties: { _typ: 'punkt', FLBESKR: 'Larmkoordinat' }, geometry: { type: 'Point', coordinates: [1, 2] } },
      { type: 'Feature', properties: { _typ: 'punkt', FLBESKR: 'Avlägg', EXTRA_LABE: '01-1', AGARE: 'x' }, geometry: { type: 'Point', coordinates: [1, 2] } },
      { type: 'Feature', properties: { _typ: 'hänsynsyta', LOPNR: 3, TYP: '24', FLBESKR: 'Kantzon' }, geometry: { type: 'Polygon', coordinates: [] } },
      { type: 'Feature', properties: { _typ: 'linje', FLBESKR: 'Kraftledning' }, geometry: { type: 'LineString', coordinates: [] } },
    ]);
    expect(ut.map((f) => f.properties._typ)).toEqual(['punkt', 'hänsynsyta', 'linje']);
    expect(JSON.stringify(ut)).not.toMatch(/Granne|AGARE|Larm/);
  });
  it('fotot: bara en markering i länkens objekt, aldrig en sökväg från klienten', async () => {
    const sb = fake(bas());
    expect(await skotarFoto(sb, TOKEN, 'm1')).toEqual({ typ: 'url', url: 'https://lagring/o-1/m1.jpg?sig=1' });
    expect((await skotarFoto(sb, TOKEN, 'm2')).typ).toBe('fel');
    expect(await skotarFoto(sb, TOKEN, '../o-2/x.jpg')).toEqual({ typ: 'fel', status: 400 });
    expect(await skotarFoto(sb, 'c'.repeat(64), 'm1')).toEqual({ typ: 'fel', status: 404 });
  });
  it('ett läsfel tar inte bort resten, och sägs i ord', async () => {
    const v = await lasSkotarVy(fake(bas(), { fel: { hyttspar: 'nere' } }), bas().objekt[0] as any);
    expect(v.fel).toContain('körspåren');
    expect(v.hogar).not.toBeNull();
  });
});

describe('origot på en egen trakt utan Vida-gräns', () => {
  const obj = { lat: 56.4391374, lng: 14.6327509, kartbild_bounds: null };
  const ref: [number, number][] = [[14.6305311, 56.4402161], [14.6331914, 56.4421931]];   // P-1027: stammarnas ruta
  it('markeringar där skördaren arbetat ritas mot objektets punkt (som planeringsvyn)', () => {
    expect(origoUtanVida(obj, [{ x: -43.3, y: -140.7 }, { x: -98.2, y: -207.1 }], ref)).toMatchObject({ lat: obj.lat, lng: obj.lng });
  });
  it('markeringar långt från stammarna och spåret ritas inte', () => {
    expect(origoUtanVida(obj, [{ x: 3000, y: 3000 }, { x: 3100, y: 2900 }], ref)).toBeNull();
  });
  it('inget att pröva mot = objektets punkt; ingen punkt = inget origo', () => {
    expect(origoUtanVida(obj, [{ x: 3000, y: 3000 }], [])).not.toBeNull();
    expect(origoUtanVida({ lat: null, lng: null, kartbild_bounds: null }, [{ x: 0, y: 0 }], ref)).toBeNull();
  });
});

describe('högarna', () => {
  const st = (lat: number, ts: string, sort: string, volym: number): Stam => ({ lat, lng: 15, volym, tradslag: ts, sortiment: sort });
  it('m³fub per sortiment, med klartextnamnet, och samma högar som planeringens klustring', () => {
    const r = skotarHogar([st(56.6, 'Gran', 'Gran Massa: A', 1), st(56.60001, 'Tall', 'Tall Massa: A', 0.5), st(56.7, 'Gran', 'Gran Timmer: T', 2)], [], [], [], (n) => `[${n}]`);
    expect(r.hogar).toHaveLength(2);
    expect(r.hogar[0].sortiment.map((t) => [t.namn, t.visning, t.m3])).toEqual([['Gran Massa: A', '[Gran Massa: A]', 1], ['Tall Massa: A', '[Tall Massa: A]', 0.5]]);
    expect(r.kvar.map((t) => t.namn)).toEqual(['Gran Timmer: T', 'Gran Massa: A', 'Tall Massa: A']);
    expect(r.kvarM3).toBe(4);   // 2 + 1 + 1 (0,5 avrundas uppåt) — summan av de avrundade raderna
  });
  it('planerarens uttag dras av per sortiment', () => {
    const r = skotarHogar([st(56.6, 'Gran', 'Gran Massa: A', 1), st(56.60001, 'Tall', 'Tall Massa: A', 1)], [{ tradslag: 'Gran Massa: A', volym: 1 }], [], []);
    expect(r.hogar[0].sortiment.map((t) => t.namn)).toEqual(['Tall Massa: A']);
  });
  it('en hög som förarna markerat som tagen finns inte med', () => {
    const r = skotarHogar([st(56.6, 'Gran', 'Gran Massa: A', 1)], [], [], [{ id: 'x', typ: 'tagen', geometri: { type: 'Point', coordinates: [15, 56.6] }, bredd_m: 8, grupp: null, skapad_at: '2026-11-05T10:00:00Z' }]);
    expect(r.hogar).toHaveLength(0);
    expect(r.kvarM3).toBe(0);
  });
});

describe('kartan', () => {
  it('alla avlägg (hans, planerarens, Vidas) blir vita rutor med numret, och ett tryck visar namn, betydelse, kommentar och foto', () => {
    const origo = { lat: 56.6, lng: 15.0 } as any;
    const avlagg = [
      { ref: 'egen:a', kalla: 'egen', nr: '1', lng: 15, lat: 56.6 },
      { ref: 'plan:m1', kalla: 'plan', nr: '3', lng: 15, lat: 56.6 },
      { ref: 'vida:01-1', kalla: 'vida', nr: '01-1', lng: 15, lat: 56.6 },
      { ref: 'plan:m2', kalla: 'plan', nr: '', lng: 15, lat: 56.6 },
    ];
    const k = kallor({ origo, markeringar: [{ id: 'm1', isMarker: true, type: 'landing', x: 0, y: 0, nummer: 3, comment: 'Lägg massan här', foto: true }], vida: [], gran: [], spar: [], hogar: null, avlagg });
    expect((k[KALLA.avlagg] as any).features.map((f: any) => f.properties.nr)).toEqual(['1', '3', '01-1', 'Avlägg']);
    // Planerarens avläggssymbol ritas inte en gång till under rutan, och Vidas punkt har inget eget lager längre.
    const sym = lagerOrdning().find((l) => l.id === 'sk-v-sym');
    expect(JSON.stringify(sym.filter)).toContain('landing');
    expect(lagerOrdning().map((l) => l.id).filter((id) => /avlagg/.test(id))).toEqual(['sk-avlagg']);
    expect(lagerOrdning().find((l) => l.id === 'sk-avlagg')?.layout['icon-image']).toBe('skotar-avlagg-ruta');
    const kort = markeringKort({ id: 'm1', type: 'landing', nummer: 3, comment: 'Lägg massan här', foto: true }, { m1: ['Blött i svängen'] });
    expect(kort).toMatchObject({ typ: 'markering', fotoId: 'm1', kommentarer: ['Lägg massan här', 'Blött i svängen'] });
    expect((kort as any).namn).toMatch(/3/);
    expect((kort as any).forklaring.length).toBeGreaterThan(0);
  });
  it('bubbla när någon skrivit något, kamera när det finns foto — på symbolen, och mitt på linjer och ytor', () => {
    const origo = { lat: 56.6, lng: 15.0 } as any;
    const k = kallor({
      origo, gran: [], spar: [], hogar: null, vida: [], kommentarer: { s2: ['Blött'], l1: ['Kör inte här'] },
      markeringar: [
        { id: 's1', isMarker: true, type: 'warning', x: 0, y: 0, foto: true },
        { id: 's2', isMarker: true, type: 'warning', x: 10, y: 0 },
        { id: 's3', isMarker: true, type: 'warning', x: 20, y: 0, comment: 'Sten', foto: true },
        { id: 's4', isMarker: true, type: 'warning', x: 30, y: 0, comment: '  ' },
        { id: 'l1', isLine: true, lineType: 'stonewall', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      ],
    });
    const mark = (k[KALLA.mark] as any).features;
    expect(mark.map((f: any) => f.properties.kommentar ?? null)).toEqual(['foto', 'text', 'bada', null, null]);
    const fri = (k[KALLA.tecken] as any).features;
    expect(fri).toHaveLength(1);
    expect(fri[0].properties).toMatchObject({ kommentar: 'text', i: 4 });
    // Tecknen följer sitt lagerval: varje tecken-lager hör till ett val.
    const idn = Object.values(lagerIdn()).flat();
    for (const l of lagerOrdning().filter((x) => /tecken/.test(x.id))) expect(idn).toContain(l.id);
  });
  it('Vidas hänsyn och avlägg har namn och betydelse', () => {
    expect(vidaKort({ _typ: 'hänsynsyta', LOPNR: 3, FLBESKR: 'Kantzon' })).toMatchObject({ namn: expect.stringMatching(/3$/), kommentarer: ['Kantzon'] });
    expect(vidaKort({ _typ: 'punkt', EXTRA_LABE: '01-1' })).toMatchObject({ namn: 'Avlägg 01-1' });
  });
  it('varje lager har ett unikt id och hör till ett val', () => {
    const idn = lagerOrdning().map((l) => l.id);
    expect(new Set(idn).size).toBe(idn.length);
    const valda = Object.values(lagerIdn()).flat();
    expect(new Set(valda)).toEqual(new Set(idn));
  });
});

describe('källvakter', () => {
  const server = las('lib/skotarlank/server.ts');
  const middleware = las('middleware.ts');
  it('servern läser aldrig markägare, förare, maskinens position eller priser', () => {
    const selects = Array.from(server.matchAll(/\.select\('([^']*)'/g)).map((m) => m[1]).join('|');
    for (const ord of ['markagare', 'forare', 'medarbetare', 'pris', 'maskin_id', 'telefon', 'datum, points']) expect(selects, ord).not.toContain(ord);
    expect(server).toMatch(/\.eq\('roll', 'skordare'\)/);
  });
  it('rutterna använder service-klienten, ingen session, och kartrutorna är bakom token', () => {
    for (const f of ['app/api/skotare/[token]/route.ts', 'app/api/skotare/[token]/karta/route.ts', 'app/api/skotare/[token]/foto/route.ts']) {
      const s = las(f);
      expect(s).toContain('tjanstKlient');
      expect(s).not.toMatch(/cookies\(|kravInloggad|kravRoll/);
    }
    const k = las('app/api/skotare/[token]/karta/route.ts');
    expect(k.indexOf('skotarLankGiltig')).toBeLessThan(k.indexOf('forarkarta(new'));
  });
  it('middleware släpper igenom skotarlänken före inloggningskontrollen, med noindex', () => {
    const i = middleware.indexOf('arOffentligSkotarSokvag(request.nextUrl.pathname)');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(middleware.indexOf('createServerClient('));
    expect(middleware.slice(i, i + 300)).toContain("'X-Robots-Tag', 'noindex, nofollow'");
  });
  it('AppRamverk hoppar över appens startare på skotarsidan (före toppfältet)', () => {
    const r = las('components/AppRamverk.tsx');
    expect(r).toMatch(/if \(arSkotarSida\(pathname\)\) return <>\{children\}<\/>/);
    expect(r.indexOf('arSkotarSida(pathname)')).toBeLessThan(r.indexOf('<TopBar />'));
  });
  it('tabellen med token har ingen åtkomst för anon eller inloggade', () => {
    const mig = las('supabase/migrations/20261105165337_skotar_lank.sql');
    expect(mig).toContain('revoke all on public.objekt_skotar_lank from anon, authenticated');
    expect(mig).not.toMatch(/create policy/i);
    expect(las('app/skotare/[token]/page.tsx')).toMatch(/robots: \{ index: false, follow: false/);
  });
});
