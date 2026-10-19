// @vitest-environment jsdom
//
// Rundvyn genom ORIGOBESLUTET (lib/egenkontrollOrigo.ts) — hela sidan i jsdom, kartan ersatt av en stub som visar vilket origo den fick.
// Det här är rendering-kontrollen för CLAUDE.md:s hook-regel: sidan fick nya hooks (kontextstatus, Vidas traktgräns, beslutet) och ett nytt
// laddningstillstånd (`laddar` räknar nu också med att origot inte är beslutat), och tsc fångar inte hook-ordning.
// Ritningen på riktigt (MapLibre) kan jsdom inte; den provas i webbläsaren, se PR-texten.
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtur from '@/lib/__fixtures__/origo_kvitto_prod_2026-10-19.json';

type FixObjekt = { lat: number; lng: number; vida: number[] | null; granser: number[][][]; punkter: number[][] };
const OBJEKT = fixtur.objekt as unknown as Record<string, FixObjekt>;

const h = vi.hoisted(() => ({
  hamtaRunda: null as unknown as () => Promise<unknown>,
  kontext: null as unknown as () => Promise<unknown>,
  vida: null as unknown as () => Promise<unknown>,
  renderAntal: 0,
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'obj-1' }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
const STABIL_POSITION = { status: 'ok', position: { lat: 56.4, lng: 15.0, noggrannhet: 5 }, skal: null, senasteNoggrannhet: 5, forsokIgen: () => {} };
vi.mock('../useMinPosition', () => ({ useLevandePosition: () => STABIL_POSITION }));
vi.mock('../RundKarta', () => ({
  default: (p: any) => {
    h.renderAntal++;
    return createElement('div', { 'data-testid': 'rundkarta', 'data-origo': JSON.stringify(p.origo), 'data-origotext': p.origoText ?? '' });
  },
}));
vi.mock('@/lib/egenkontrollfoto', () => ({ signeraFoto: async () => null }));
vi.mock('@/lib/egenkontroll', async () => {
  const a = await vi.importActual<Record<string, unknown>>('@/lib/egenkontroll');
  return {
    ...a,
    hamtaRunda: () => h.hamtaRunda(),
    hamtaKontextmarkeringar: () => h.kontext(),
    hamtaVidaGrans: () => h.vida(),
    hamtaProvytor: async () => [],
    hamtaFoton: async () => [],
    hamtaAvverkadeStammar: async () => [],
  };
});

import Page from './page';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function utskjuten<T>() {
  let lamna!: (v: T) => void;
  let avvisa!: (e: unknown) => void;
  const p = new Promise<T>((res, rej) => { lamna = res; avvisa = rej; });
  return { p, lamna, avvisa };
}

/** En pågående runda med en planpunkt per gräns (geometri_snapshot = gränsens path) — det är punkter med plats, så kartan kan öppna. */
function rundaFor(namn: string, kartObjekt: Record<string, unknown>) {
  const f = OBJEKT[namn];
  const punkter = f.granser.map((g, i) => ({
    id: `p${i + 1}`, egenkontroll_id: 'e1', ordning: i + 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
    markering_marker_id: `m${i + 1}`, punkt_typ: 'boundary', rubrik: `Gräns ${i + 1}`, antal_planerat: null,
    geometri_snapshot: { path: g.map(([x, y]) => ({ x, y })) }, plan_kommentar: null, status: null, avvikelse_typ: null, kommentar: null,
    varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: null,
  }));
  return {
    objektNamn: namn, objektStatus: 'pagaende',
    kartObjekt: { lat: f.lat, lng: f.lng, kartbild_url: null, kartbild_bounds: null, vo_nummer: null, ...kartObjekt },
    egenkontroll: { id: 'e1', objekt_id: 'obj-1', objekt_typ: 'gallring', status: 'pagaende', utford_av: null, startad: '2026-10-19T08:00:00Z', klar: null, kommentar: null, vader: null, maskiner: null, skapad: '2026-10-19T08:00:00Z' },
    punkter,
  };
}

const kontextFor = (namn: string) => OBJEKT[namn].granser.map((g, i) => ({ marker_id: `m${i + 1}`, data: { lineType: 'boundary', isLine: true, path: g.map(([x, y]) => ({ x, y })) } }));
const vidaFor = (namn: string) => { const v = OBJEKT[namn].vida!; return { typ: 'ok', gran: [[v[0], v[1]], [v[2], v[3]]] }; };

async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Page)); });
}
const stilla = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const karta = () => host!.querySelector('[data-testid="rundkarta"]') as HTMLElement | null;
const text = () => host!.textContent ?? '';

beforeEach(() => { h.renderAntal = 0; });
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  document.body.removeAttribute('data-hide-home');
});

describe('rundvyn — origobeslutet', () => {
  it('Betet gallring (envz, inga bounds): vyn väntar på Vidas traktgräns och öppnar sedan KARTAN med lat/lng-origot på zoom 16', async () => {
    const n = 'Betet gallring 2026';
    const vida = utskjuten<unknown>();
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => kontextFor(n);
    h.vida = () => vida.p;
    await montera();
    await stilla();

    // Origot är inte beslutat: ingen karta, och INTE heller listan — vyn laddar. (Utan det fryser startvalet på listan för gott.)
    expect(karta()).toBeNull();
    expect(text()).toContain('Hämtar rundan');

    await act(async () => { vida.lamna(vidaFor(n)); });
    await stilla();

    const k = karta();
    expect(k, 'kartan ska öppnas när kvittot gått igenom').not.toBeNull();
    const f = OBJEKT[n];
    expect(JSON.parse(k!.getAttribute('data-origo')!)).toEqual({ lat: f.lat, lng: f.lng, zoom: 16 });
    expect(k!.getAttribute('data-origotext')).toBe('');
    expect(text()).not.toContain('Hämtar rundan');
  });

  it('Bjällerhult (au + ga): samlat stämmer inte men första gränsen gör det → kartan öppnas med lat/lng-origot', async () => {
    const n = 'Bjällerhult au + ga';
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => kontextFor(n);
    h.vida = async () => vidaFor(n);
    await montera();
    await stilla();
    await stilla();

    const k = karta();
    expect(k, 'kartan ska öppnas').not.toBeNull();
    const f = OBJEKT[n];
    expect(JSON.parse(k!.getAttribute('data-origo')!)).toEqual({ lat: f.lat, lng: f.lng, zoom: 16 });
    expect(k!.getAttribute('data-origotext')).toBe('');
  });

  it('gränsmarkeringar som varken samlat eller enskilt stämmer med Vida (fel zoom): kartan öppnas UTAN markeringar (origo null) och raden på kartan säger varför', async () => {
    const n = 'Bjällerhult au + ga';
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => OBJEKT[n].granser.map((g, i) => ({ marker_id: `m${i + 1}`, data: { lineType: 'boundary', isLine: true, path: g.map(([x, y]) => ({ x: x * 2, y: y * 2 })) } }));
    h.vida = async () => vidaFor(n);
    await montera();
    await stilla();
    await stilla();

    // Rundvyn är kartan även när inga markeringar kan ritas: hellre inga punkter än fel (PR 278 och 322) — och förklaringen står vid kartan.
    expect(karta()).not.toBeNull();
    expect(karta()!.getAttribute('data-origo')).toBe('null');
    expect(karta()!.getAttribute('data-origotext')).toContain('stämmer inte med Vidas traktgräns');
    expect(karta()!.getAttribute('data-origotext')).toContain('Be planeraren se över markeringarna');
    expect(text()).not.toContain('Hämtar rundan');
  });

  it('Vidas traktgräns går inte att läsa: eget besked (las_fel), aldrig "saknas" — och kartan ritar inga markeringar', async () => {
    const n = 'Betet gallring 2026';
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => kontextFor(n);
    h.vida = async () => { throw new Error('nätet föll'); };
    await montera();
    await stilla();
    await stilla();

    expect(karta()!.getAttribute('data-origo')).toBe('null');
    expect(karta()!.getAttribute('data-origotext')).toContain('Kunde inte kontrollera var punkterna ligger');
  });

  it('markeringarna går inte att läsa: inga markeringar på kartan — kvittot hade annars tyst blivit en svagare kontroll utan gränser', async () => {
    const n = 'Betet gallring 2026';
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => { throw new Error('läsfel'); };
    h.vida = async () => vidaFor(n);
    await montera();
    await stilla();
    await stilla();

    expect(karta()!.getAttribute('data-origo')).toBe('null');
    expect(karta()!.getAttribute('data-origotext')).toContain('Kunde inte kontrollera var punkterna ligger');
  });

  it('Brokamåla-fallet (ingen geometrirad): "Vidas traktgräns saknas", inga markeringar på kartan', async () => {
    const n = 'Brokamåla 1:5 V';
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => kontextFor(n);
    h.vida = async () => ({ typ: 'saknas' });
    await montera();
    await stilla();
    await stilla();

    expect(karta()!.getAttribute('data-origo')).toBe('null');
    expect(karta()!.getAttribute('data-origotext')).toContain('Vidas traktgräns saknas');
  });

  it('objekt MED kartbild_bounds: kartan öppnar direkt med bildens mitt på zoom 15 — utan att vänta på Vida (som aldrig svarar här)', async () => {
    const n = 'Betet gallring 2026';
    h.hamtaRunda = async () => rundaFor(n, { kartbild_bounds: [[56.0, 14.0], [56.2, 14.2]] });
    h.kontext = async () => kontextFor(n);
    h.vida = () => new Promise(() => {});   // svarar aldrig
    await montera();
    await stilla();
    await stilla();

    // Kontexten (markeringarna) laddas ändå före beslutet — men Vida behövs inte när origot kommer ur bilden.
    const k = karta();
    expect(k).not.toBeNull();
    expect(JSON.parse(k!.getAttribute('data-origo')!)).toEqual({ lat: 56.1, lng: 14.1, zoom: 15 });
  });

  it('en tyst omläsning av rundan ändrar inte origot och bygger inte om kartan (stabil identitet efter värde)', async () => {
    const n = 'Betet gallring 2026';
    h.hamtaRunda = async () => rundaFor(n, {});
    h.kontext = async () => kontextFor(n);
    h.vida = async () => vidaFor(n);
    await montera();
    await stilla();
    await stilla();
    const fore = karta()!.getAttribute('data-origo');
    expect(fore).toBeTruthy();
    // Ingen oändlig omrenderingsloop: antalet kartrenderingar är litet och stabilt efter att beslutet fattats.
    const antal = h.renderAntal;
    await stilla();
    await stilla();
    expect(h.renderAntal).toBe(antal);
    expect(karta()!.getAttribute('data-origo')).toBe(fore);
  });

  it('en runda utan start (ingen egenkontroll): vyn väntar inte på origot och visar startknappen', async () => {
    const n = 'Betet gallring 2026';
    h.hamtaRunda = async () => ({ ...rundaFor(n, {}), egenkontroll: null, punkter: [] });
    h.kontext = async () => [];
    h.vida = () => new Promise(() => {});
    await montera();
    await stilla();
    await stilla();

    expect(text()).toContain('Starta egenkontroll');
    expect(text()).not.toContain('Hämtar rundan');
  });
});
