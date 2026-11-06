import { describe, expect, it } from 'vitest';
import { lasTraktAnalys, listRad, markenRader, tolkaFynd } from './markning';
import { attSpara, behov, gransAvtryck, korTraktanalys, FEL_OMFORSOK_MS, GAMMAL_MS } from './server';
import { platsFranRingar } from './kor';
import { polygon } from '@turf/helpers';

// Namnen är riktiga träffar ur prod (trakt_data.beraknad.restriktioner, 2026-11-06).
const FOSSIL = { type: 'fornlamning', name: 'Fossil åker (Almundsryd 373:1)', details: 'Typ: Röjningsröseområde', plats: { lat: 56.5, lng: 14.9 } };
const FOSSIL2 = { type: 'fornlamning', name: 'Område med fossil åkermark (Stenbrohult 131:1)', details: '' };
const TJARA = { type: 'fornlamning', name: 'Kemisk industri (L1955:7079)', details: 'Verksamhet: Tjärränna' };
const VATTEN = { type: 'vattenskydd', name: 'Älmhult', details: 'Gällande', plats: { lat: 56.55, lng: 14.13 } };
const NB = { type: 'nyckelbiotop', name: 'HAGMARK I SÄLLHULT', details: 'Ädellövträd' };
const AT = '2026-11-06T10:00:00.000Z';

describe('tolkning: vad fyndet betyder för planeringen', () => {
  it('fossil åker och fossil åkermark → barmark; kolbotten → egen text; tjärränna är en fornlämning, inte barmark', () => {
    expect(tolkaFynd(FOSSIL)).toEqual({ kategori: 'barmark', text: 'Fossil åker · barmark', namn: FOSSIL.name, plats: FOSSIL.plats });
    expect(tolkaFynd(FOSSIL2)!.kategori).toBe('barmark');
    expect(tolkaFynd({ type: 'skogochhistoria', name: 'Kolbotten', details: '' })!.text).toBe('Kolbotten · barmark');
    expect(tolkaFynd(TJARA)).toMatchObject({ kategori: 'skydd', text: 'Fornlämning' });
    expect(tolkaFynd(VATTEN)).toMatchObject({ kategori: 'vattenskydd', text: 'Vattenskydd' });
    expect(tolkaFynd(NB)).toMatchObject({ kategori: 'skydd', text: 'Nyckelbiotop', plats: null });
    expect(tolkaFynd({ type: 'okand', name: 'x' })).toBeNull();
  });

  it('läsning: saknas = ej körd, alla sju föll = fel, några föll = ofullständig', () => {
    expect(lasTraktAnalys({})).toEqual({ lage: 'ej_kord' });
    expect(lasTraktAnalys({ trakt_analys: { at: AT, fynd: [], fel: Array(7).fill('x') } })).toEqual({ lage: 'fel', at: AT });
    const a = lasTraktAnalys({ trakt_analys: { at: AT, fynd: [FOSSIL, NB], fel: ['Fornlämningar: RAÄ nere'] } });
    expect(a).toMatchObject({ lage: 'klar', ofullstandig: true });
  });
});

describe('listans rad: högst en, bara när något finns', () => {
  const klar = (fynd: unknown[], fel: string[] = []) => lasTraktAnalys({ trakt_analys: { at: AT, fynd, fel } });
  it('fossil åker går före vattenskydd; båda på samma rad', () => {
    expect(listRad(klar([FOSSIL]))).toEqual({ text: 'Fossil åker – kräver barmark', kategori: 'barmark' });
    expect(listRad(klar([VATTEN]))).toEqual({ text: 'Vattenskydd', kategori: 'vattenskydd' });
    expect(listRad(klar([VATTEN, FOSSIL]))).toEqual({ text: 'Fossil åker · vattenskydd', kategori: 'barmark' });
  });
  it('inget hittat = ingen rad; nyckelbiotop står inte i listan; ej körd = ingen rad', () => {
    expect(listRad(klar([]))).toBeNull();
    expect(listRad(klar([NB]))).toBeNull();
    expect(listRad({ lage: 'ej_kord' })).toBeNull();
  });
  it('kunde inte kontrolleras sägs — aldrig tomt', () => {
    expect(listRad(klar([], ['Fornlämningar: fel']))).toEqual({ text: 'Ej kontrollerad', kategori: null });
    expect(listRad({ lage: 'fel', at: AT })).toEqual({ text: 'Ej kontrollerad', kategori: null });
  });
  it('märkena i texten: ett per sort, barmark först', () => {
    expect(markenRader(klar([NB, VATTEN, FOSSIL, FOSSIL2])).map((m) => m.text)).toEqual(['Fossil åker · barmark', 'Vattenskydd', 'Nyckelbiotop']);
  });
});

describe('servern: när en trakt analyseras', () => {
  const R: [number, number][][] = [[[15, 56], [15.01, 56], [15.01, 56.01], [15, 56]]];
  const G = gransAvtryck(R);
  const NU = Date.parse(AT);
  it('aldrig analyserad, ny gräns, fel efter 6 h, gammal efter 30 dagar — annars aktuell', () => {
    expect(behov(null, G, NU)).toBe(0);
    expect(behov({ at: AT, grans: 'annan', fel: [] }, G, NU)).toBe(1);
    expect(behov({ at: new Date(NU - FEL_OMFORSOK_MS).toISOString(), grans: G, fel: ['x'] }, G, NU)).toBe(2);
    expect(behov({ at: new Date(NU - FEL_OMFORSOK_MS + 1000).toISOString(), grans: G, fel: ['x'] }, G, NU)).toBeNull();
    expect(behov({ at: new Date(NU - GAMMAL_MS).toISOString(), grans: G, fel: [] }, G, NU)).toBe(3);
    expect(behov({ at: AT, grans: G, fel: [] }, G, NU)).toBeNull();
  });
  it('alla kontroller föll och en analys med samma gräns finns: den gamla står kvar', () => {
    const fel = { hits: [], errors: Array(7).fill('nere'), bbox: {} as never };
    expect(attSpara(fel, G, { at: AT, grans: G }, new Date(NU))).toBeNull();
    expect(attSpara(fel, G, null, new Date(NU))).toMatchObject({ fel: Array(7).fill('nere'), fynd: [] });
  });

  it('kör: aldrig analyserade först, utan gräns räknas, sparar i trakt_analys och läses tillbaka', async () => {
    const objekt = [
      { id: 'a', namn: 'Aktuell', status: 'planerad', trakt_analys: { at: AT, grans: G, fel: [] } },
      { id: 'b', namn: 'Ny', status: 'oplanerad', trakt_analys: null },
      { id: 'c', namn: 'Utan gräns', status: 'pagaende', trakt_analys: null },
    ];
    const geo = (id: string) => ({ objekt_id: id, geometri: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: R } }] } });
    const skrivna: Record<string, unknown> = {};
    const sb: any = {
      from: (t: string) => {
        const q: any = { _t: t };
        q.select = () => q; q.in = () => (t === 'objekt' ? Promise.resolve({ data: objekt, error: null }) : Promise.resolve({ data: [geo('a'), geo('b')], error: null }));
        q.update = (rad: unknown) => ({ eq: (_k: string, id: string) => { skrivna[id] = rad; return Promise.resolve({ error: null }); } });
        return q;
      },
    };
    const svar = await korTraktanalys(sb, { budgetMs: 40_000, nu: () => NU, analysera: async () => ({ hits: [FOSSIL as never], errors: [], bbox: {} as never }) });
    expect(svar).toMatchObject({ ok: true, analyserade: ['Ny'], oforandrade: 1, utanGrans: 1, kvar: 0 });
    expect(Object.keys(skrivna)).toEqual(['b']);
    expect(listRad(lasTraktAnalys(skrivna.b as { trakt_analys: unknown }))).toEqual({ text: 'Fossil åker – kräver barmark', kategori: 'barmark' });
  });

  it('budgeten tar slut: resten väntar till nästa körning', async () => {
    const objekt = [{ id: 'b', namn: 'B', status: 'planerad', trakt_analys: null }, { id: 'd', namn: 'D', status: 'planerad', trakt_analys: null }];
    const geo = (id: string) => ({ objekt_id: id, geometri: { features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: R } }] } });
    let t = NU;
    const sb: any = { from: (tab: string) => { const q: any = {}; q.select = () => q; q.in = () => Promise.resolve({ data: tab === 'objekt' ? objekt : [geo('b'), geo('d')], error: null }); q.update = () => ({ eq: () => Promise.resolve({ error: null }) }); return q; } };
    const svar = await korTraktanalys(sb, { budgetMs: 1000, nu: () => t, analysera: async () => { t += 5000; return { hits: [], errors: [], bbox: {} as never }; } });
    expect(svar.analyserade).toEqual(['B']);
    expect(svar.kvar).toBe(1);
  });
});

describe('platsen för markören', () => {
  const trakt = polygon([[[15, 56], [15.02, 56], [15.02, 56.02], [15, 56.02], [15, 56]]]);
  it('en yta på trakten: dess mitt; en yta som täcker trakten men har mitten utanför: traktens mitt', () => {
    expect(platsFranRingar([[[15.005, 56.005], [15.007, 56.005], [15.007, 56.007], [15.005, 56.005]]], null, trakt)).toEqual({ lat: expect.closeTo(56.0057, 3), lng: expect.closeTo(15.0063, 3) });
    const p = platsFranRingar([[[14, 55], [16, 55], [16, 55.5], [14, 55]]], null, trakt)!;
    expect(p.lat).toBeGreaterThan(56); expect(p.lat).toBeLessThan(56.02);
  });
});
