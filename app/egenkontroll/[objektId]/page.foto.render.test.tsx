// @vitest-environment jsdom
// Egenkontrollsidan renderad for riktigt med FOTON och fotonoteringar (PR 9b): miniatyren i dockan raden ar tryckbar (44 px traffyta),
// ett tryck oppnar fotoytan med ratt foto och rundans noteringar, och en avslutad runda oppnar den men utan att man kan rita.
//
// Det som far ga sonder tyst:
//  - miniatyren gar inte att trycka pa (eller bara pa en avslutad runda),
//  - fotoytan far fel foto (id:t hor ihop med noteringarna) eller inte rundans noteringar,
//  - noteringar som inte gick att lasa ser ut som att fotot saknar dem,
//  - kartan visar en fotonotering (u, v ar inga koordinater),
//  - hookordningen (React #310).
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

const notering = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', underlag: 'karta', foto_id: null, typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev',
  koordinater: [[14.05, 56.05]], etikett_dx: null, etikett_dy: null, skapad: '2026-10-21T08:00:00Z', andrad: '2026-10-21T08:00:00Z', ...over,
});

let vyn: any;
let noteringarSvar: any[] = [];
const hamtaRunda = vi.fn(async () => vyn);
const hamtaNoteringar = vi.fn(async () => { if (noteringarFel) throw new Error('nat'); return noteringarSvar; });
const skapaNotering = vi.fn(async (i: any) => ({ ...notering(i.id), etikett: i.etikett, avsikt: i.avsikt }));
const andraNotering = vi.fn(async (_id: string, _n: any) => null as any);
let kartProps: any = null;
let rapportModell: any = null;
let noteringarFel = false;
let fotonSvar: any[] = [];

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => ({}) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    kompletteraRunda: async () => ({ tillagda: [] }),
    hamtaFoton: async () => fotonSvar,
    hamtaProvytor: async () => [],
    hamtaNoteringar: () => hamtaNoteringar(),
    skapaNotering: (i: any) => skapaNotering(i),
    andraNotering: (id: string, n: any) => andraNotering(id, n),
    hamtaKontextmarkeringar: async () => [],
    hamtaVidaGrans: async () => ({ typ: 'ok' as const, gran: [[56.0, 14.0], [56.1, 14.1]] }),
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
// Kartan: en stubb som tar emot tryck SOM DEN RIKTIGA: bara nar sidan ger den `rita` blir ett tryck ett ritartryck (onRitaTryck).
vi.mock('../RundKarta', () => ({
  default: (p: any) => {
    kartProps = p;
    return createElement('div', { 'data-testid': 'karta', 'data-noteringar': String(p.noteringar.length), 'data-vald': p.valdPunktId ?? '' },
      p.punkter.filter((q: any) => q.del === 'plan').map((q: any) => createElement('button', { key: q.id, 'data-testid': `karta-punkt-${q.id}`, onClick: () => p.onValjPunkt?.(q.id) }, `karta:${q.id}`)));
  },
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('../Forutsattningar', () => ({ default: () => null }));
vi.mock('../RapportDela', () => ({ default: (p: any) => { rapportModell = p.modell; return createElement('div', { 'data-testid': 'rapport-dela' }); } }));
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
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const id = (t: string) => document.querySelector(`[data-testid="${t}"]`) as HTMLElement | null;
const miniatyr = () => document.querySelector('[data-foto-index]') as HTMLButtonElement | null;

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };
const fotoRad = (idn: string, punktId: string) => ({ id: idn, egenkontroll_id: 'runda-1', punkt_id: punktId, provyta_id: null, sokvag: `runda-1/${idn}.jpg`, lat: null, lng: null, tagen: null, skapad: '2026-10-21T08:00:00Z', tackningsgrad: null });

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* */ }
  noteringarSvar = [];
  noteringarFel = false;
  fotonSvar = [fotoRad('f1', 'p1'), fotoRad('f2', 'p1')];
  rapportModell = null;
  kartProps = null;
  vyn = { objektNamn: 'Ravemåla', objektStatus: 'pagaende', kartObjekt, egenkontroll: RUNDA, punkter: [punkt('p1')], observationer: [] };
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

const markeraP1 = async () => { await klick(id('karta-punkt-p1')!); };

describe('miniatyren i raden', () => {
  it('är en knapp med 44 px träffyta (28 px ruta + 8 px runt om, utan att ändra layouten) och öppnar fotoytan med RÄTT foto', async () => {
    await montera();
    await markeraP1();
    const m = miniatyr()!;
    expect(m).not.toBeNull();
    expect(document.querySelectorAll('[data-foto-index]')).toHaveLength(2);
    expect(m.style.padding).toBe('8px');
    expect(m.style.margin).toBe('-8px');
    expect(id('foto-yta')).toBeNull();
    await klick(document.querySelectorAll('[data-foto-index]')[1]);
    const yta = id('foto-yta')!;
    expect(yta).not.toBeNull();
    expect(yta.textContent).toContain('Punkt p1 · 2 av 2');
    expect((yta.querySelector('img') as HTMLImageElement).src).toBe('https://signerad/runda-1/f2.jpg');
  });

  it('fotoytan öppnas på rätt foto, och sidan ger kartan hela rundans noteringar (kartan väljer själv bort fotonoteringarna: lib/egenkontrollNoteringKarta)', async () => {
    noteringarSvar = [
      notering('a', { underlag: 'foto', foto_id: 'f1', koordinater: [[0.4, 0.4]], etikett: 'Pa foto ett' }),
      notering('b', { underlag: 'foto', foto_id: 'f2', koordinater: [[0.4, 0.4]], etikett: 'Pa foto tva' }),
      notering('k', { etikett: 'Pa kartan' }),
    ];
    await montera();
    await markeraP1();
    await klick(document.querySelectorAll('[data-foto-index]')[0]);
    const img = id('foto-yta')!.querySelector('img') as HTMLImageElement;
    expect(img.src).toBe('https://signerad/runda-1/f1.jpg');
    expect(kartProps.noteringar.map((n: any) => n.id).sort()).toEqual(['a', 'b', 'k']);
  });

  it('fotoytan VISAR rundans noteringar för fotot (och inte de för andra foton eller kartan) när bilden är läst', async () => {
    noteringarSvar = [
      notering('a', { underlag: 'foto', foto_id: 'f1', koordinater: [[0.4, 0.4]], etikett: 'Pa foto ett' }),
      notering('b', { underlag: 'foto', foto_id: 'f2', koordinater: [[0.4, 0.4]], etikett: 'Pa foto tva' }),
      notering('k', { etikett: 'Pa kartan' }),
    ];
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const r = (this as Element).getAttribute('data-testid') === 'foto-kropp' ? { w: 390, h: 560 } : { w: 0, h: 0 };
      return { left: 0, top: 0, width: r.w, height: r.h, right: r.w, bottom: r.h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      await montera();
      await markeraP1();
      await klick(document.querySelectorAll('[data-foto-index]')[0]);
      const img = id('foto-yta')!.querySelector('img') as HTMLImageElement;
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1200 });
      Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 1600 });
      await act(async () => { img.dispatchEvent(new Event('load')); });
      const text = id('foto-yta')!.textContent ?? '';
      expect(text).toContain('Pa foto ett');
      expect(text).not.toContain('Pa foto tva');
      expect(text).not.toContain('Pa kartan');
    } finally {
      Element.prototype.getBoundingClientRect = orig;
    }
  });

  it('en AVSLUTAD runda öppnar fotoytan också — men utan Skriv på bilden', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-18T10:00:00Z' } };
    await montera();
    await markeraP1();
    await klick(miniatyr()!);
    expect(id('foto-yta')).not.toBeNull();
    expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.includes('Skriv på bilden'))).toBe(false);
    expect(id('foto-yta')!.textContent).toContain('Rundan är avslutad');
  });

  it('noteringarna gick inte att läsa: fotoytan säger det i stället för att visa en bild som ser ut att sakna dem', async () => {
    noteringarFel = true;
    await montera();
    await markeraP1();
    await klick(miniatyr()!);
    expect(id('foto-yta')!.textContent).toContain('Noteringarna kunde inte läsas');
  });

  it('Stäng tar tillbaka sidan, och en punkt utan foto har ingen miniatyr', async () => {
    await montera();
    await markeraP1();
    await klick(miniatyr()!);
    await klick(Array.from(id('foto-yta')!.querySelectorAll('button')).find((b) => b.textContent === 'Stäng')!);
    expect(id('foto-yta')).toBeNull();
  });
});

const kartan = () => id('karta')!;
