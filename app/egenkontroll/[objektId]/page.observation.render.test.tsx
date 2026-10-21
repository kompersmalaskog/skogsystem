// @vitest-environment jsdom
// Egenkontrollsidan renderad for riktigt med observationer: knappen "Notera här" pa kartan, arket,
// raknarna och dokumentet. Kartan (MapLibre) ar utbytt mot en stubb - dess lager och ikoner testas i
// lib/egenkontrollObservation.test.ts. Det har provar det SIDAN gor: kopplingen.
//
// Det som far ga sonder tyst:
//  - en observation raknas in i "N av M klara" eller i avvikelserna,
//  - "Notera här" saknas pa kartan - eller finns pa en avslutad runda (som ar last),
//  - trycket pa knappen tar inte positionen, eller oppnar ett ark utan den,
//  - observationerna blandas in bland planpunkterna i stallet for att ligga under en egen rubrik,
//  - en avslutad runda gar att andra,
//  - hookordningen: nya hooks ligger efter en tidig retur och sidan kraschar (React #310).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RUNDA = { id: 'runda-1', objekt_id: 'ob1', status: 'pagaende', startad: '2026-10-17T07:00:00Z', klar: null, vader: null, maskiner: null, objekt_typ: 'slutavverkning', utford_av: 'Martin' };

const punkt = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', ordning: 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
  markering_marker_id: null, punkt_typ: 'wet', rubrik: `Punkt ${id}`, antal_planerat: null,
  geometri_snapshot: { x: 0, y: 0 }, plan_kommentar: null, status: null, avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: null, ...over,
});

const observation = (id: string, over: Record<string, any> = {}) => ({
  ...punkt(id, {
    ordning: 0, del: 'observation', kalla: 'observation', grupp: null, rubrik: 'Observation', punkt_typ: null,
    geometri_snapshot: null, status: 'bra', avvikelse_typ: 'korspar', lat: 56.05, lng: 14.05,
    besvarad: '2026-10-17T09:00:00Z',
  }),
  ...over,
});

let vyn: any;
const hamtaRunda = vi.fn(async () => vyn);

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => ({}) }));   // vägavståndet hämtas från OSRM; ett test når aldrig nätet
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    // Ryggraden: kompletteringen vid oppning ar inte det som provas har - en deterministisk stubb, aldrig ett riktigt nat-anrop.
    kompletteraRunda: async () => ({ tillagda: [] }),
    hamtaFoton: async () => [{ id: 'f1', egenkontroll_id: 'runda-1', punkt_id: 'o1', provyta_id: null, sokvag: 'runda-1/o1-1.jpg', tackningsgrad: null, lat: null, lng: null, tagen: null, skapad: '2026-10-17T09:00:00Z' }],
    hamtaProvytor: async () => [],
    hamtaKontextmarkeringar: async () => [],
    // Vidas traktgräns: sidan frågar alltid (objektet har här kartbild_bounds, så svaret avgör inte origot). Ett RIKTIGT svar i stället för ett läsfel via den riktiga klienten.
    hamtaVidaGrans: async () => ({ typ: 'ok' as const, gran: [[56.0, 14.0], [56.1, 14.1]] }),
    // Avslutad runda: rapportens kartlager. Riktiga svar, aldrig anropet mot den riktiga klienten (ingen session i testet).
    hamtaStammoln: async () => ({ punkter: [{ lat: 56.05, lng: 14.05 }], antal: 1 }),
    hamtaHyttspar: async () => [],
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
  useLevandePosition: () => ({
    status: 'ok', position: { lat: 56.0501, lng: 14.0502, noggrannhet: 6 }, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {},
  }),
}));
// Kartan: en stubb som visar vad sidan gav den, och kan "trycka" pa en observation.
vi.mock('../RundKarta', () => ({
  default: (p: any) => createElement('div', { 'data-testid': 'karta', 'data-observationer': String(p.observationer.length), 'data-punkter': String(p.punkter.length) },
    p.observationer.map((o: any) => createElement('button', {
      key: o.id, 'data-testid': `karta-obs-${o.id}`, onClick: () => p.onValjObservation?.(o.id), disabled: !p.onValjObservation,
    }, `karta:${o.id}`))),
}));
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
  // hamtaRunda, foton och tillbehor ar asynkrona.
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

const text = () => document.body.textContent ?? '';
const knappar = () => Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
const knapp = (t: string | RegExp) => {
  const k = knappar().find((b) => (typeof t === 'string' ? b.textContent?.includes(t) : t.test(b.textContent ?? '')));
  if (!k) throw new Error(`Ingen knapp "${t}". Knappar: ${knappar().map((b) => b.textContent).join(' | ')}`);
  return k;
};
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
/** En sektionsrubrik (SectionHeader ritar en span). */
const rubrik = (t: string) => Array.from(document.querySelectorAll('span')).find((e) => e.textContent === t);

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };

beforeEach(() => {
  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();
  (window as any).confirm = vi.fn(() => true);
  (window as any).alert = vi.fn();
  vyn = {
    objektNamn: 'Ravemåla', objektStatus: 'avslutat', kartObjekt, egenkontroll: RUNDA,
    punkter: [punkt('p1'), punkt('p2', { status: 'ok' })],
    observationer: [observation('o1', { kommentar: 'Rishög som ligger perfekt' }), observation('o2', { status: 'avvikelse', avvikelse_typ: 'stubbhojd' })],
  };
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

describe('kartan: Notera här', () => {
  it('sidan monterar utan att kasta (hookordning) och visar kartan med knappen "Notera här"', async () => {
    await montera();
    expect(document.querySelector('[data-testid=karta]')).not.toBeNull();
    expect(knapp('Notera här')).toBeDefined();
  });

  it('knappen har en tryckyta pa minst 52 och ett neutralt namn', async () => {
    await montera();
    const k = knapp('Notera här');
    expect(Number.parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(52);
    expect(k.textContent).not.toMatch(/avvikelse/i);
    expect(k.getAttribute('aria-label')).toBe('Notera här');
  });

  it('kartan far observationerna SEPARAT fran punkterna', async () => {
    await montera();
    const karta = document.querySelector('[data-testid=karta]')!;
    expect(karta.getAttribute('data-observationer')).toBe('2');
    expect(karta.getAttribute('data-punkter')).toBe('2'); // bara planpunkterna
  });

  it('TRYCK: arket oppnas med positionen fran trycket som kvitto', async () => {
    await montera();
    await klick(knapp('Notera här'));
    const ark = document.querySelector('[role=dialog][aria-label="Notera här"]');
    expect(ark).not.toBeNull();
    expect(ark!.textContent).toContain('Position tagen · 56.0501, 14.0502 · ±6 m');
  });

  it('tryck pa en observation pa kartan oppnar den for andring', async () => {
    await montera();
    await klick(document.querySelector('[data-testid=karta-obs-o1]')!);
    const ark = document.querySelector('[role=dialog][aria-label="Observation"]');
    expect(ark).not.toBeNull();
    expect(ark!.textContent).toContain('Noterad här');
    expect((ark!.querySelector('input[aria-label=Kommentar]') as HTMLInputElement).value).toBe('Rishög som ligger perfekt');
    expect(ark!.textContent).toContain('Ta bort observationen');
  });
});

describe('raknarna: observationer ar tillagg, inte punkter', () => {
  it('"N kvar" (huvudet och avslutsknappen) raknar bara punkterna - tva observationer andrar inte talet', async () => {
    await montera();
    // En obesvarad punkt kvar. Hade observationerna raknats blev det 3.
    expect(document.querySelector('[data-testid=kart-huvud]')!.textContent).toContain('1 kvar');
    expect(text()).toContain('Avsluta rundan — 1 punkt kvar');
    expect(text()).not.toContain('3 kvar');
    expect(text()).not.toContain('3 punkter kvar');
  });

  it('en observation med tonen Avvikelse ger INGEN avvikelse i planens sammanfattning', async () => {
    await montera();
    // Planen har ingen avvikelse och inget "kan bli bättre"; observation o2 ar en avvikelse men hor inte hit.
    expect(text()).not.toMatch(/1 avvikelse/);
  });

  it('observationerna ligger under EGEN rubrik i listan, med antal, foto och kommentar', async () => {
    await montera();
    expect(rubrik('Observationer')).toBeDefined();
    expect(text()).toContain('2 observationer');
    expect(text()).toContain('Rishög som ligger perfekt');
    expect(document.querySelectorAll('img[src="https://signerad/runda-1/o1-1.jpg"]').length).toBe(1);
    // Fotot hor till o1; o2 ar en avvikelse utan foto och sager det.
    expect(text()).toContain('Fotot saknas.');
  });

  it('observationerna star inte bland nagra punkter - hel-laget har ingen punktlista, bara observationerna under sin egen rubrik', async () => {
    await montera();
    const observationer = rubrik('Observationer')!.parentElement!.parentElement!;
    expect(observationer.textContent).toContain('Rishög');
    expect(observationer.textContent).not.toContain('Punkt p1');
    expect(document.querySelector('[data-testid=plan-rad]')).toBeNull();
  });

  it('i avslutsdialogen star observationerna som egen rad, skild fran Punkter', async () => {
    vyn.punkter = [punkt('p1', { status: 'ok' }), punkt('p2', { status: 'ok' })];
    await montera();
    await klick(knapp(/^Avsluta rundan/));
    const dialog = document.querySelector('[role=dialog][aria-label="Avsluta rundan"]')!;
    expect(dialog.textContent).toMatch(/Punkter\s*2/);
    expect(dialog.textContent).toMatch(/Observationer\s*2/);
  });
});

describe('avslutad runda = last', () => {
  beforeEach(() => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-17T12:00:00Z' }, punkter: [punkt('p1', { status: 'ok' })] };
  });

  it('ingen "Notera här"-knapp - inte heller nar man gar till kartan ur dokumentet', async () => {
    await montera();
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(false);
    // Kartan är hela vyn också på en avslutad runda (dokumentet läses ovanpå den) — och där får knappen heller inte finnas.
    expect(document.querySelector('[data-testid=karta]')).not.toBeNull();
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(false);
  });

  it('observationerna visas i dokumentet men gar inte att oppna for andring', async () => {
    await montera();
    expect(text()).toContain('2 observationer');
    expect(knappar().some((b) => /Ändra observationen/.test(b.getAttribute('aria-label') ?? ''))).toBe(false);
    expect(text()).toContain('Rishög som ligger perfekt');
  });

  it('pa kartan gar en observation inte att trycka pa', async () => {
    await montera();
    const knappen = document.querySelector('[data-testid=karta-obs-o1]') as HTMLButtonElement | null;
    expect(knappen).not.toBeNull();
    expect(knappen!.disabled).toBe(true); // sidan ger inget onValjObservation nar rundan ar klar
  });
});

describe('en oppen runda: observationen oppnas ur listan', () => {
  it('ett tryck pa raden oppnar den for andring', async () => {
    await montera();
    await klick(knappar().find((b) => /Ändra observationen: Bra/.test(b.getAttribute('aria-label') ?? ''))!);
    expect(document.querySelector('[role=dialog][aria-label="Observation"]')).not.toBeNull();
  });
});
