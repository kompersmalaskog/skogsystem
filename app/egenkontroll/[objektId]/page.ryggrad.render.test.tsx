// @vitest-environment jsdom
// Ryggraden renderad: sidan lagger till utforandepunkter som katalogen kraver NAR EN PAGAENDE RUNDA OPPNAS - och bara da.
//
// Det som far ga sonder tyst:
//  - en klar runda eller en full runda skrivs till,
//  - en lasare (hamtaRunda) skriver - komplettering ar en egen funktion som sidan anropar,
//  - sidan visar den gamla, ofullstandiga listan efter en lyckad komplettering (ingen omlasning),
//  - en misslyckad komplettering stoppar rundan fran att oppnas, eller sags inte,
//  - hookordningen (React #310).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RUNDA = { id: 'runda-1', objekt_id: 'ob1', status: 'pagaende', startad: '2026-08-28T07:00:00Z', klar: null, vader: null, maskiner: null, objekt_typ: 'slutavverkning', utford_av: 'Martin' };

const punkt = (id: string, ordning: number, slug: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', ordning, del: 'utforande', grupp: null, kalla: 'fast', markering_id: null,
  markering_marker_id: null, punkt_typ: slug, rubrik: `Punkt ${slug}`, antal_planerat: null,
  geometri_snapshot: null, plan_kommentar: null, status: 'bra', avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: '2026-08-28T08:00:00Z', ...over,
});
const NIO = ['risning_basvag', 'rishogar', 'korspar', 'avlagg', 'upplagg_avverkning', 'stubbhojder', 'frotrad_eller_skarm', 'kantzon_mot_vatten', 'hyggesrester_mot_markberedning'];
const ELVA = [...NIO, 'naturhansyn_utforande', 'grotuttag'];

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };
const vyMed = (slugs: string[], runda: any = RUNDA) => ({
  objektNamn: 'Ulfsnas', objektStatus: 'pagaende', kartObjekt, egenkontroll: runda,
  punkter: slugs.map((s, i) => punkt(`p${i}`, i + 1, s)), observationer: [],
});

let lasningar: any[] = [];
const hamtaRunda = vi.fn(async () => lasningar[Math.min(hamtaRunda.mock.calls.length - 1, lasningar.length - 1)]);
const kompletteraRunda = vi.fn(async (_id: string) => ({ tillagda: ['naturhansyn_utforande', 'grotuttag'] }));

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    kompletteraRunda: (id: string) => kompletteraRunda(id),
    hamtaFoton: async () => [],
    hamtaProvytor: async () => [],
    hamtaKontextmarkeringar: async () => [],
    hamtaAvverkadeStammar: async () => [],
  };
});
vi.mock('@/lib/egenkontrollfoto', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontrollfoto')>();
  return { ...verklig, signeraFoto: async (s: string) => `https://signerad/${s}` };
});
vi.mock('@/lib/hooks/useMapLayers', () => ({
  useMapLayers: () => [{}, () => {}],
  useStringSetting: (_k: string, standard: string) => [standard, () => {}],
}));
vi.mock('../useMinPosition', () => ({
  useLevandePosition: () => ({ status: 'ok', position: { lat: 56.0501, lng: 14.0502, noggrannhet: 6 }, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {} }),
}));
vi.mock('../RundKarta', () => ({ default: () => createElement('div', { 'data-testid': 'karta' }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('../Forutsattningar', () => ({ default: () => null }));
vi.mock('../GaTillYta', () => ({ default: () => null }));
vi.mock('@/components/KartLagerMeny', () => ({ default: () => null }));

import Sida from './page';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Sida)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}
const text = () => document.body.textContent ?? '';

beforeEach(() => { localStorage.clear(); (URL as any).createObjectURL = vi.fn(() => 'blob:test'); (URL as any).revokeObjectURL = vi.fn(); });
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
  vi.clearAllMocks();
});

describe('komplettering nar en pagaende runda oppnas', () => {
  it('en runda med 9 av 11: kompletteras EN gang med rundans id, och rundan LASES OM sa att sidan visar de nya punkterna', async () => {
    lasningar = [vyMed(NIO), vyMed(ELVA)];
    await montera();
    expect(kompletteraRunda).toHaveBeenCalledTimes(1);
    expect(kompletteraRunda).toHaveBeenCalledWith('runda-1');
    expect(hamtaRunda).toHaveBeenCalledTimes(2);                    // lasning, komplettering, omlasning
    expect(text()).not.toContain('saknas och läggs');
  });

  it('en FULL runda: ingen komplettering, en enda lasning', async () => {
    lasningar = [vyMed(ELVA)];
    await montera();
    expect(kompletteraRunda).not.toHaveBeenCalled();
    expect(hamtaRunda).toHaveBeenCalledTimes(1);
  });

  it('en KLAR runda ror vi aldrig - ingen komplettering aven om den saknar punkter (Tjuvon, Raveboda har 9)', async () => {
    lasningar = [vyMed(NIO, { ...RUNDA, status: 'klar', klar: '2026-08-20T10:00:00Z' })];
    await montera();
    expect(kompletteraRunda).not.toHaveBeenCalled();
    expect(hamtaRunda).toHaveBeenCalledTimes(1);
  });

  it('en gammal runda med noll utforandepunkter far alla (11) - det ar katalogen som avgor, inte rundans alder', async () => {
    lasningar = [vyMed([]), vyMed(ELVA)];
    await montera();
    expect(kompletteraRunda).toHaveBeenCalledTimes(1);
  });

  it('GAR KOMPLETTERINGEN INTE (ingen tackning) oppnas rundan anda, och sidan SAGER hur manga punkter som saknas', async () => {
    kompletteraRunda.mockRejectedValueOnce(new Error('nat'));
    lasningar = [vyMed(NIO)];
    await montera();
    expect(text()).toContain('Ulfsnas');                                   // rundan oppnades
    expect(text()).toContain('2 punkter saknas och läggs till när det finns täckning.');
    expect(hamtaRunda).toHaveBeenCalledTimes(1);                    // ingen omlasning efter ett fel
  });

  it('en punkt som saknas: "1 punkt saknas och laggs" (singular)', async () => {
    kompletteraRunda.mockRejectedValueOnce(new Error('nat'));
    lasningar = [vyMed(ELVA.slice(0, 10))];
    await montera();
    expect(text()).toContain('1 punkt saknas och läggs till när det finns täckning.');
  });
});
