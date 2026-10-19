// @vitest-environment jsdom
//
// RUNDVYNS RAM (huvud, docka, sidokolumn, Rundan-ark) — hela sidan i jsdom, kartan ersatt av en stubb som visar vad sidan gav den.
// Det här är rendering-kontrollen för CLAUDE.md:s hook-regel: sidan fick nya hooks (ark, Centrera, mätning av huvud/docka) och nya lägen,
// och tsc fångar inte hook-ordning. Layouten på riktigt (mått, safe-area, MapLibre-padding) provas i webbläsare — se PR-texten.
//
// Det som får gå sönder tyst:
//  - kartläget har kvar toppfältets tillbaka-pil/vyväxlare (TillbakaTillListan) i stället för EN rad (huvudet),
//  - listan monteras två gånger (sida + ark) eller finns kvar bakom kartan,
//  - "Notera här" ligger inte i dockan, eller finns på en avslutad runda,
//  - ett tryck på en rad i arket lämnar arket öppet över kartan,
//  - sidokolumnen (Lager, Centrera) saknas, eller Centrera skickar inte positionen till kartan,
//  - kartan får ingen padding (en vald punkt hamnar bakom dockan),
//  - listläget (ingen punkt med plats) tappar sitt eget huvud — TopBar finns inte på sidan längre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RUNDA = { id: 'runda-1', objekt_id: 'ob1', status: 'pagaende', startad: '2026-10-19T07:00:00Z', klar: null, vader: null, maskiner: null, objekt_typ: 'gallring', utford_av: 'Martin' };

const punkt = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', ordning: 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
  markering_marker_id: null, punkt_typ: 'wet', rubrik: `Punkt ${id}`, antal_planerat: null,
  geometri_snapshot: { x: 0, y: 0 }, plan_kommentar: null, status: null, avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: null, ...over,
});

let vyn: any;
const POSITION = { lat: 56.0501, lng: 14.0502, noggrannhet: 6 };
let positionen: any;

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: async () => vyn,
    hamtaFoton: async () => [],
    hamtaProvytor: async () => [],
    hamtaKontextmarkeringar: async () => [],
    hamtaVidaGrans: async () => ({ typ: 'saknas' }),
    hamtaAvverkadeStammar: async () => [],
  };
});
vi.mock('@/lib/egenkontrollfoto', () => ({ signeraFoto: async () => null }));
vi.mock('@/lib/hooks/useMapLayers', () => ({
  useMapLayers: () => [{}, () => {}],
  useStringSetting: (_k: string, standard: string) => [standard, () => {}],
}));
vi.mock('../useMinPosition', () => ({ useLevandePosition: () => positionen }));
// Kartan: en stubb som visar vad sidan gav den, och kan "trycka" på en punkt.
vi.mock('../RundKarta', () => ({
  default: (p: any) => createElement('div', {
    'data-testid': 'rundkarta',
    'data-padding': JSON.stringify(p.kartPadding ?? null),
    'data-centrera': JSON.stringify(p.centreraPa ?? null),
    'data-vald': p.valdPunktId ?? '',
  }, p.punkter.map((q: any) => createElement('button', { key: q.id, 'data-testid': `karta-punkt-${q.id}`, onClick: () => p.onValjPunkt?.(q.id) }, `karta:${q.id}`))),
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
const klick = async (el: Element | null) => { if (!el) throw new Error('Elementet finns inte'); await act(async () => { (el as HTMLElement).click(); }); };
const huvud = () => document.querySelector('[data-testid="kart-huvud"]') as HTMLElement | null;
const dock = () => document.querySelector('[data-testid="rund-dock"]') as HTMLElement | null;
const ark = () => document.querySelector('[data-testid="objekt-info"]') as HTMLElement | null;
const oppnaRundan = () => document.querySelector('[aria-label="Öppna rundan"]') as HTMLElement | null;
const rubrik = (t: string) => Array.from(document.querySelectorAll('span')).find((e) => e.textContent === t);

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };

beforeEach(() => {
  positionen = { status: 'ok', position: POSITION, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {} };
  vyn = {
    objektNamn: 'Ravemåla', objektStatus: 'pagaende', kartObjekt, egenkontroll: RUNDA,
    punkter: [punkt('p1'), punkt('p2', { status: 'ok' }), punkt('p3', { grupp: 'Vägar' })],
    observationer: [],
  };
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

describe('kartläget: EN rad uppe, dockan nere, sidokolumn, inget annat', () => {
  it('sidan monterar utan att kasta (hookordning) och visar kartan med ett flytande huvud', async () => {
    await montera();
    expect(document.querySelector('[data-testid="rundkarta"]')).not.toBeNull();
    expect(huvud()?.getAttribute('data-flytande')).toBe('1');
  });

  it('huvudet: pil till listan, objektnamnet och hur många som är kvar — i ord, inte bara en siffra', async () => {
    await montera();
    const h = huvud()!;
    const lank = h.querySelector('a')!;
    expect(lank.getAttribute('href')).toBe('/egenkontroll');
    expect(lank.getAttribute('aria-label')).toBe('Tillbaka till egenkontroll');
    expect(h.textContent).toContain('Ravemåla');
    expect(h.textContent).toContain('2 kvar');
  });

  it('INGEN vyväxlare på kartan (Lista/Karta) och inga två vägar tillbaka: pilen i huvudet är den enda', async () => {
    await montera();
    expect(knappar().some((b) => b.getAttribute('aria-label') === 'Visa listan' || b.getAttribute('aria-label') === 'Visa kartan')).toBe(false);
    expect(document.querySelectorAll('a[href="/egenkontroll"]').length).toBe(1);
  });

  it('"Notera här" ligger i DOCKANS nederkant, inte som en egen knapp på kartan', async () => {
    await montera();
    const k = knappar().find((b) => b.getAttribute('aria-label') === 'Notera här')!;
    expect(k).toBeDefined();
    expect(dock()!.contains(k)).toBe(true);
    expect(Number.parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(52);
  });

  it('sidokolumnen: Lager (ikon OCH ord) och Centrera, båda utanför dockan', async () => {
    await montera();
    const lager = knappar().find((b) => b.getAttribute('aria-label') === 'Kartlager')!;
    expect(lager.textContent).toContain('Lager');
    expect(dock()!.contains(lager)).toBe(false);
    const centrera = document.querySelector('[data-testid="centrera-knapp"]') as HTMLButtonElement;
    expect(centrera).not.toBeNull();
    expect(dock()!.contains(centrera)).toBe(false);
  });

  it('Centrera skickar DIN position till kartan, med ett nytt objekt vid varje tryck (annars körs inte kameraflytten igen)', async () => {
    await montera();
    const karta = () => document.querySelector('[data-testid="rundkarta"]')!;
    expect(karta().getAttribute('data-centrera')).toBe('null');
    await klick(document.querySelector('[data-testid="centrera-knapp"]'));
    expect(JSON.parse(karta().getAttribute('data-centrera')!)).toEqual({ lat: POSITION.lat, lng: POSITION.lng });
  });

  it('Centrera finns inte som knapp utan position (den är dold, inte en död knapp)', async () => {
    positionen = { status: 'saknas', position: null, skal: 'timeout', senasteNoggrannhet: null, forsokIgen: () => {} };
    await montera();
    // Utan position öppnar rundan som lista (startLage); kartan nås med "Karta".
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Visa kartan') ?? null);
    const c = document.querySelector('[data-testid="centrera-knapp"]') as HTMLButtonElement;
    expect(c.getAttribute('aria-hidden')).toBe('true');
  });

  it('kartan får padding (huvud uppe, docka nere), så en vald punkt inte hamnar bakom dockan', async () => {
    await montera();
    const p = JSON.parse(document.querySelector('[data-testid="rundkarta"]')!.getAttribute('data-padding')!);
    expect(p).toMatchObject({ top: expect.any(Number), bottom: expect.any(Number) });
  });

  it('listan finns INTE monterad bakom kartan (ingen andra kopia) — den kommer först när arket öppnas', async () => {
    await montera();
    expect(text()).not.toContain('av 3 klara');
    expect(ark()).toBeNull();
  });

  it('en avslutad runda är låst: ingen "Notera här" i dockan', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-19T12:00:00Z' } };
    await montera();
    // En avslutad runda öppnar listan; kartan nås med knappen "Karta".
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Visa kartan') ?? null);
    expect(dock()).not.toBeNull();
    expect(knappar().some((b) => b.getAttribute('aria-label') === 'Notera här')).toBe(false);
    expect(huvud()!.textContent).toContain('Avslutad');
  });
});

describe('Rundan-arket: listan som ark ovanpå kartan', () => {
  it('ett tryck på namnet i huvudet öppnar arket (vy "rundan") med listan, och kartan ligger kvar', async () => {
    await montera();
    await klick(oppnaRundan());
    const a = ark()!;
    expect(a).not.toBeNull();
    expect(a.getAttribute('data-vy')).toBe('rundan');
    expect(a.textContent).toContain('1 av 3 klara');
    expect(document.querySelector('[data-testid="rundkarta"]')).not.toBeNull();
  });

  it('arket har ett eget Stäng som lämnar kartan', async () => {
    await montera();
    await klick(oppnaRundan());
    await klick(ark()!.querySelector('[aria-label="Stäng rundan"]'));
    expect(ark()!.getAttribute('data-oppen')).toBe('0');
  });

  it('ett andra tryck på namnet i huvudet stänger arket (huvudet växlar: pilen pekar upp när arket är öppet)', async () => {
    await montera();
    await klick(oppnaRundan());
    expect(huvud()!.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    await klick(huvud()!.querySelector('button'));
    expect(ark()!.getAttribute('data-oppen')).toBe('0');
    expect(huvud()!.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('listraderna i arket är kompakta (positionen fryses vid öppningen) och ett tryck på en rad stänger arket med punkten i dockan', async () => {
    await montera();
    await klick(oppnaRundan());
    const rad = Array.from(ark()!.querySelectorAll('button')).find((b) => /Punkt p1/.test(b.textContent ?? ''));
    expect(rad, 'en rad för Punkt p1 i arket').toBeDefined();
    await klick(rad!);
    expect(ark()?.getAttribute('data-oppen') ?? '0').toBe('0');
    expect(document.querySelector('[data-testid="rundkarta"]')!.getAttribute('data-vald')).toBe('p1');
  });

  it('ett tryck på en punkt på kartan byter bara vilken punkt som visas — dockans svarsknappar är utanför kartans tryckyta', async () => {
    await montera();
    await klick(document.querySelector('[data-testid="karta-punkt-p3"]'));
    expect(document.querySelector('[data-testid="rundkarta"]')!.getAttribute('data-vald')).toBe('p3');
    const kartaEl = document.querySelector('[data-testid="rundkarta"]')!;
    expect(kartaEl.contains(dock())).toBe(false);
  });
});

describe('listläget (ingen punkt har en plats på kartan): sidan har ett eget huvud', () => {
  beforeEach(() => {
    vyn = { ...vyn, punkter: [punkt('p1', { geometri_snapshot: null }), punkt('p2', { geometri_snapshot: null })] };
    positionen = { status: 'saknas', position: null, skal: 'timeout', senasteNoggrannhet: null, forsokIgen: () => {} };
  });

  it('solid huvud (inte flytande) med pilen till listan — TopBar finns inte på sidan längre', async () => {
    await montera();
    expect(huvud()?.getAttribute('data-flytande')).toBe('0');
    expect(huvud()!.querySelector('a')!.getAttribute('href')).toBe('/egenkontroll');
    expect(huvud()!.textContent).toContain('Egenkontroll');
  });

  it('ingen docka, inget ark, ingen karta — och listan (en kopia) står på sidan', async () => {
    await montera();
    expect(dock()).toBeNull();
    expect(ark()).toBeNull();
    expect(document.querySelector('[data-testid="rundkarta"]')).toBeNull();
    expect(text()).toContain('0 av 2 klara');
  });

  it('listans huvud tar tillbaka toppfältets luft (annars en tom remsa överst): negativ marginal ur LAYOUT.topbar', async () => {
    await montera();
    const omslag = huvud()!.parentElement!;
    expect(omslag.style.marginTop).toContain('calc(-1 *');
  });
});

describe('övergångar utan att hookordningen går sönder', () => {
  it('karta → ark → stäng → ark igen → rad (till kartan): inga kast, ingen kvarglömd kopia av listan', async () => {
    await montera();
    await klick(oppnaRundan());
    await klick(ark()!.querySelector('[aria-label="Stäng rundan"]'));
    await klick(oppnaRundan());
    expect(ark()!.getAttribute('data-oppen')).toBe('1');
    await klick(Array.from(ark()!.querySelectorAll('button')).find((b) => /Punkt p1/.test(b.textContent ?? '')) ?? null);
    expect(document.querySelector('[data-testid="rundkarta"]')).not.toBeNull();
    // Arket glider ut (RORELSE.byte) och tas sedan bort ur DOM — listan finns inte kvar bakom kartan.
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(text()).not.toContain('av 3 klara');
    expect(ark()).toBeNull();
  });
});
