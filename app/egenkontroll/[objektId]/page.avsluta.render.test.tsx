// @vitest-environment jsdom
// RADEN SOM SÄGER ATT RUNDAN ÄR KLAR, renderad för riktigt i rundvyn. Kartan är utbytt mot en stubb.
//
// VARFÖR TESTET FINNS (prod 2026-11-13): tre rundor stod färdiggångna och aldrig avslutade — Ulfsnäs 22 av 22 sedan 28 aug,
// Rävemåla 25 av 25 sedan 17 okt, Krokshult 11 av 11 sedan 19 okt. Ingenting spärrade dem; ingenting sa att de var klara.
//
// DET SOM FÅR GÅ SÖNDER TYST:
//  - raden uteblir när rundan är färdig (då är vi tillbaka i felet som gjorde att tre rundor aldrig avslutades),
//  - raden hamnar INNE i dockan (då flyttar sig varje bricka när sista punkten besvaras — rundvyns hårdaste regel),
//  - raden och Ångra-kvittot står samtidigt i samma spår (två knappar under samma finger),
//  - raden visas på en runda som har något kvar, eller på en redan avslutad runda,
//  - knappen avslutar utan bekräftelse (avslutet går inte att ta tillbaka),
//  - bekräftelsen tiger om att en gammal runda får dagens datum som slutdag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { utforandeKatalog } from '@/lib/egenkontroll';
import { DOCK_SKYDD_MS, RAD_MAX_DVH } from '@/lib/egenkontrollBricka';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RUNDA = { id: 'runda-1', objekt_id: 'ob1', status: 'pagaende', startad: '2026-10-17T07:00:00Z', klar: null, vader: null, maskiner: null, objekt_typ: 'slutavverkning', utford_av: 'Martin', kommentar: null };

const rad = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', ordning: 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
  markering_marker_id: null, punkt_typ: 'wet', rubrik: `Punkt ${id}`, antal_planerat: null,
  geometri_snapshot: { x: 0, y: 0 }, plan_kommentar: null, status: null, avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: null, ...over,
});

/** Katalogens utförandepunkter, id u0..u10, i katalogens ordning. */
const utforande = (typ: 'slutavverkning' | 'gallring' = 'slutavverkning', over: Record<number, Record<string, any>> = {}) =>
  utforandeKatalog(typ).map((m, i) => rad(`u${i}`, { ordning: 10 + i, del: 'utforande', kalla: 'fast', grupp: null, punkt_typ: m.slug, rubrik: m.rubrik, geometri_snapshot: null, ...(over[i] ?? {}) }));

let vyn: any;
/** Fotoraderna hamtaFoton ger (egenkontroll_foto). Tom som standard. */
let foton: any[] = [];
const fotoRad = (id: string, punktId: string, sokvag: string) => ({ id, egenkontroll_id: 'runda-1', punkt_id: punktId, provyta_id: null, sokvag, tackningsgrad: null, lat: null, lng: null, tagen: null, skapad: '2026-10-17T08:00:00Z' });
const hamtaRunda = vi.fn(async () => vyn);
const svaraPaPunkt = vi.fn(async (id: string, status: string, _del: string) => ({ ...vyn.punkter.find((p: any) => p.id === id), status }));
const avslutaRunda = vi.fn(async () => ({ ...RUNDA, status: 'klar' }));
const angraForstaSvaret = vi.fn(async (id: string, _del: string, _svar: string) => {
  const p = vyn.punkter.find((q: any) => q.id === id);
  p.status = null;
  return p;
});
let positionen: any = { status: 'ok', position: { lat: 56.0501, lng: 14.0502, noggrannhet: 6 }, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {} };

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => ({}) }));   // vägavståndet hämtas från OSRM; ett test når aldrig nätet
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    kompletteraRunda: async () => ({ tillagda: [] }),
    kompletteraVader: async () => ({ fyllt: false, skal: 'test' }),
    svaraPaPunkt: (id: string, s: string, d: string) => svaraPaPunkt(id, s, d),
    angraForstaSvaret: (id: string, d: string, s: string) => angraForstaSvaret(id, d, s),
    avslutaRunda: () => avslutaRunda(),
    hamtaFoton: async () => foton,
    hamtaProvytor: async () => [],
    hamtaNoteringar: async () => [],
    hamtaKontextmarkeringar: async () => [],
    hamtaVidaGrans: async () => ({ typ: 'saknas' }),
    hamtaAvverkadeStammar: async () => [],
    hamtaStammoln: async () => ({ punkter: [], antal: 0 }),
    hamtaHyttspar: async () => [],
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
vi.mock('../useMinPosition', () => ({ useLevandePosition: () => positionen }));
// Kartan: en stubb som visar vad sidan gav den och kan "trycka" på en punkt.
vi.mock('../RundKarta', () => ({
  default: (p: any) => createElement('div', {
    'data-testid': 'karta', 'data-vald': p.valdPunktId ?? '', 'data-origo': JSON.stringify(p.origo), 'data-origotext': p.origoText ?? '',
    'data-centrera': p.centreraPa ? JSON.stringify(p.centreraPa) : '',
  }, p.punkter.filter((q: any) => q.del === 'plan').map((q: any) => createElement('button', { key: q.id, 'data-testid': `karta-punkt-${q.id}`, onClick: () => p.onValjPunkt?.(q.id) }, `karta:${q.id}`))),
}));
vi.mock('../AvvikelseSheet', () => ({
  default: (p: any) => createElement('div', { 'data-testid': 'avv-sheet', 'data-lage': p.lage, 'data-punkt': p.punkt.id }),
}));
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
const knappar = () => Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const brickor = () => Array.from(document.querySelectorAll('[data-testid=bricka]')) as HTMLButtonElement[];
const bricka = (id: string) => document.querySelector(`[data-bricka-id=${id}]`) as HTMLButtonElement;
const raden = () => document.querySelector('[data-testid=bricka-rad]') as HTMLElement | null;
const radKnapp = (svar: string) => document.querySelector(`[data-testid=bricka-rad] [data-svar=${svar}]`) as HTMLButtonElement | null;
const ark = () => document.querySelector('[data-testid=rund-ark]') as HTMLElement;
const huvud = () => document.querySelector('[data-testid=kart-huvud]') as HTMLElement;

// Klockan som dockvakten läser (Date.now): verklig tid + ett förskott testet själv skjuter fram. Utan förskott ligger två tryck i ett test
// några millisekunder isär, alltså INOM skyddstiden — precis som ett dubbeltryck. `efterSkyddet()` = nästa tryck är ett nytt, avsiktligt.
let klockForskott = 0;
const efterSkyddet = () => { klockForskott += DOCK_SKYDD_MS + 50; };
const efter = (ms: number) => { klockForskott += ms; };


const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };

/** Alla utförandepunkter besvarade, besvarad-tid satt. `nar` styr om rundan räknas som gammal. */
const alltBesvarat = (nar: string) =>
  utforande().map((p) => ({ ...p, status: 'bra', besvarad: nar }));

const avslutaRaden = () => document.querySelector('[data-testid=avsluta-rad]') as HTMLElement | null;
const avslutaRadKnapp = () => document.querySelector('[data-testid=avsluta-rad-knapp]') as HTMLButtonElement | null;
const dialogen = () => document.querySelector('[data-testid=avsluta-konsekvens]') as HTMLElement | null;
const noten = () => document.querySelector('[data-testid=gammal-runda-not]') as HTMLElement | null;

beforeEach(() => {
  svaraPaPunkt.mockImplementation(async (id: string, status: string, _del: string) => ({ ...vyn.punkter.find((p: any) => p.id === id), status, besvarad: new Date().toISOString() }));
  klockForskott = 0;
  const verkligNu = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => verkligNu() + klockForskott);
  localStorage.clear();
  foton = [];
  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();
  positionen = { status: 'ok', position: { lat: 56.0501, lng: 14.0502, noggrannhet: 6 }, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {} };
  vyn = {
    objektNamn: 'Rävemåla AU 2026', objektStatus: 'pagaende', kartObjekt, egenkontroll: RUNDA,
    punkter: alltBesvarat(new Date().toISOString()),
    observationer: [],
  };
});

afterEach(async () => {
  vi.mocked(Date.now).mockRestore();
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

describe('rundan är klar: raden säger det där fingret är', () => {
  it('ALLT BESVARAT: raden syns, och huvudet säger Klart', async () => {
    await montera();
    expect(avslutaRaden()).not.toBeNull();
    expect(avslutaRaden()!.textContent).toContain('Rundan är klar');
    expect(huvud().textContent).toContain('Klart');
  });

  it('EN PUNKT KVAR: ingen rad — det var det som var felet, inte lösningen', async () => {
    vyn = { ...vyn, punkter: [...alltBesvarat(new Date().toISOString()).slice(0, -1), ...utforande().slice(-1)] };
    await montera();
    expect(avslutaRaden()).toBeNull();
    expect(huvud().textContent).toContain('1 kvar');
  });

  it('REDAN AVSLUTAD runda: ingen rad — den ska kännas låst, inte som en knapp', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-11-01T10:00:00Z' } };
    await montera();
    expect(avslutaRaden()).toBeNull();
  });

  it('RADEN LIGGER UTANFÖR DOCKAN — annars flyttar sig varje bricka när sista punkten besvaras', async () => {
    await montera();
    const dock = document.querySelector('[data-testid=rund-dock]') as HTMLElement;
    expect(dock).not.toBeNull();
    expect(dock.contains(avslutaRaden())).toBe(false);
  });

  it('ÅNGRA-KVITTOT OCH RADEN STÅR ALDRIG SAMTIDIGT: svaret får tas tillbaka först', async () => {
    // En punkt kvar; ett tryck på dess bricka skriver Bra -> rundan blir klar OCH Ångra-kvittot kommer upp.
    const kvar = utforande().slice(-1)[0];
    vyn = { ...vyn, punkter: [...alltBesvarat(new Date().toISOString()).slice(0, -1), kvar] };
    await montera();
    expect(avslutaRaden()).toBeNull();

    efterSkyddet();
    await klick(bricka(kvar.id));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

    expect(document.querySelector('[data-testid=angra-kvitto]')).not.toBeNull();
    expect(avslutaRaden()).toBeNull();
  });

  it('HEL-LÄGET: raden göms (sidoknapparna göms där) och arkets egen Avsluta-knapp finns kvar', async () => {
    await montera();
    expect(avslutaRaden()).not.toBeNull();
    const grepp = document.querySelector('[data-testid=ark-grepp]') as HTMLElement;
    expect(grepp).not.toBeNull();
    await klick(grepp); // dock -> hel
    expect(ark().getAttribute('data-lage')).toBe('hel');
    expect(avslutaRaden()).toBeNull();
    expect(document.querySelector('[data-testid=avsluta-knapp]')).not.toBeNull();
  });
});

describe('bekräftelsen', () => {
  it('knappen AVSLUTAR INTE direkt — den öppnar bekräftelsen med konsekvensen i klartext', async () => {
    await montera();
    await klick(avslutaRadKnapp()!);
    expect(avslutaRunda).not.toHaveBeenCalled();
    expect(dialogen()).not.toBeNull();
    expect(dialogen()!.textContent).toContain('låses');
  });

  it('GAMMAL RUNDA (Ulfsnäs): bekräftelsen säger att i dag blir slutdagen', async () => {
    const iAugusti = new Date(Date.now() - 77 * 86400000).toISOString();
    vyn = { ...vyn, punkter: alltBesvarat(iAugusti) };
    await montera();
    await klick(avslutaRadKnapp()!);
    expect(noten()).not.toBeNull();
    expect(noten()!.textContent).toContain('i dag');
  });

  it('runda som gicks i dag: ingen not — i dag ÄR besöksdagen', async () => {
    await montera();
    await klick(avslutaRadKnapp()!);
    expect(dialogen()).not.toBeNull();
    expect(noten()).toBeNull();
  });
});
