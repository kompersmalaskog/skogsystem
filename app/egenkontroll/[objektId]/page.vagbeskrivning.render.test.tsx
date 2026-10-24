// @vitest-environment jsdom
//
// Vägbeskrivningen i rundans hel-läge (PR 5): en knapp under namn och åtgärd, samma navigering (lib/navigera) som listans bilknapp och
// objektlistan i planeringen. Hela sidan i jsdom; kartan är en stub, vägavståndet (OSRM) styrs av testet.
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtur from '@/lib/__fixtures__/origo_kvitto_prod_2026-10-19.json';

type FixObjekt = { lat: number; lng: number; vida: number[] | null; granser: number[][][]; punkter: number[][] };
const OBJEKT = fixtur.objekt as unknown as Record<string, FixObjekt>;
const NAMN = 'Betet gallring 2026';

const h = vi.hoisted(() => ({
  vag: {} as Record<string, number>,
  position: null as null | { status: string; position: { lat: number; lng: number; noggrannhet: number } | null; skal: null; senasteNoggrannhet: number | null; forsokIgen: () => void },
  navigerade: [] as unknown[],
  kartObjekt: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'obj-1' }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => h.vag }));
vi.mock('@/lib/navigera', async () => {
  const a = await vi.importActual<Record<string, unknown>>('@/lib/navigera');
  return { ...a, startaNavigering: (o: unknown) => { h.navigerade.push(o); return true; } };
});
vi.mock('../useMinPosition', () => ({ useLevandePosition: () => h.position }));
vi.mock('../RundKarta', () => ({ default: () => createElement('div', { 'data-testid': 'rundkarta' }) }));
vi.mock('@/lib/egenkontrollfoto', () => ({ signeraFoto: async () => null }));
vi.mock('@/lib/egenkontroll', async () => {
  const a = await vi.importActual<Record<string, unknown>>('@/lib/egenkontroll');
  // Fabriken körs när sidan importeras, före modulens egna const-rader: fixturen och namnet hämtas därför här, inte ur toppnivån.
  const f = (fixtur.objekt as unknown as Record<string, FixObjekt>)['Betet gallring 2026'];
  return {
    ...a,
    hamtaRunda: async () => ({
      objektNamn: 'Betet gallring 2026', objektStatus: 'pagaende',
      kartObjekt: { lat: f.lat, lng: f.lng, kartbild_url: null, kartbild_bounds: null, vo_nummer: null, ...h.kartObjekt },
      egenkontroll: { id: 'e1', objekt_id: 'obj-1', objekt_typ: 'gallring', status: 'pagaende', utford_av: null, startad: '2026-10-19T08:00:00Z', klar: null, kommentar: null, vader: null, maskiner: null, skapad: '2026-10-19T08:00:00Z' },
      punkter: [],
      observationer: [],
    }),
    kompletteraRunda: async () => ({ tillagda: [] }),
    hamtaKontextmarkeringar: async () => f.granser.map((g, i) => ({ marker_id: `m${i + 1}`, data: { lineType: 'boundary', isLine: true, path: g.map(([x, y]) => ({ x, y })) } })),
    hamtaVidaGrans: async () => ({ typ: 'ok', gran: [[f.vida![0], f.vida![1]], [f.vida![2], f.vida![3]]] }),
    hamtaProvytor: async () => [],
    hamtaNoteringar: async () => [],
    hamtaFoton: async () => [],
    hamtaAvverkadeStammar: async () => [],
    hamtaStammoln: async () => ({ punkter: [], antal: 0 }),
    hamtaHyttspar: async () => [],
  };
});

import Page from './page';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const stilla = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function vantaTills(villkor: () => boolean, beskrivning: string, tidsgransMs = 3000) {
  const slut = Date.now() + tidsgransMs;
  while (!villkor()) {
    if (Date.now() > slut) throw new Error(`Väntade ${tidsgransMs} ms men det hände aldrig: ${beskrivning}`);
    await stilla();
  }
}
async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Page)); });
  await vantaTills(() => !!host!.querySelector('[data-testid="rund-rubrik"]'), 'rundans rubrik');
}
const knapp = () => host!.querySelector('[data-testid="vagbeskrivning"]') as HTMLButtonElement | null;

const MED_POSITION = { status: 'ok', position: { lat: 56.4, lng: 15.0, noggrannhet: 5 }, skal: null, senasteNoggrannhet: 5, forsokIgen: () => {} };
const UTAN_POSITION = { status: 'saknas', position: null, skal: null, senasteNoggrannhet: null, forsokIgen: () => {} };

beforeEach(() => { h.vag = {}; h.position = MED_POSITION; h.navigerade = []; h.kartObjekt = {}; });
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

describe('rundvyn — vägbeskrivningen i hel-läget', () => {
  it('knappen finns under namn och åtgärd, och ett tryck startar navigeringen mot objektets plats', async () => {
    await montera();
    const k = knapp();
    expect(k, 'vägbeskrivningsknappen').not.toBeNull();
    expect(k!.getAttribute('aria-label')).toContain(`Vägbeskrivning till ${NAMN}`);
    // Direkt under namn och åtgärd: rubriken kommer före knappen i dokumentet.
    const rubrik = host!.querySelector('[data-testid="rund-rubrik"]')!;
    expect(rubrik.compareDocumentPosition(k!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => { k!.click(); });
    expect(h.navigerade).toEqual([{ lat: OBJEKT[NAMN].lat, lng: OBJEKT[NAMN].lng }]);
  });

  it('vägavståndet visas med decimalkomma när det kommit', async () => {
    h.vag = { 'obj-1': 12.34 };
    await montera();
    expect(knapp()!.textContent).toContain('12,3 km');
    expect(knapp()!.textContent).not.toContain('~');
  });

  it('i väntan på vägavståndet visas fågelvägen med ~ — aldrig utan ~', async () => {
    await montera();
    expect(knapp()!.textContent).toMatch(/~\d/);
  });

  it('utan position står knappen kvar men inget avstånd gissas', async () => {
    h.position = UTAN_POSITION;
    await montera();
    expect(knapp()).not.toBeNull();
    expect(knapp()!.textContent).toBe('Vägbeskrivning');
  });

  it('objekt utan plats: ingen knapp (ingenting att navigera till)', async () => {
    h.kartObjekt = { lat: null, lng: null };
    await montera();
    expect(knapp()).toBeNull();
  });
});
