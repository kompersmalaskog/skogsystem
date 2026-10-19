// @vitest-environment jsdom
// Rundans kommentar renderad for riktigt: knappen pa kartan, arket, utkastet som overlever, textfaltet i avslutsdialogen
// (sparas FORE avslutet) och rapportraderna pa en avslutad runda. Kartan ar utbytt mot en stubb.
//
// Det som far ga sonder tyst:
//  - kommentaren gar bara att skriva i avslutsvyn (da blir den tom - man skriver vid stenmuren, inte i bilen hem),
//  - text som inte hunnit sparas forsvinner nar arket stangs eller sidan laddas om,
//  - rundan avslutas trots att kommentaren inte sparades (efteraat gar den inte att andra),
//  - en klar runda gar att kommentera, eller rapportraderna saknas pa den,
//  - hookordningen: nya hooks efter en tidig retur kraschar sidan (React #310).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RUNDA = { id: 'runda-1', objekt_id: 'ob1', status: 'pagaende', startad: '2026-10-17T07:00:00Z', klar: null, vader: null, maskiner: null, objekt_typ: 'slutavverkning', utford_av: 'Martin', kommentar: null };

const punkt = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', ordning: 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
  markering_marker_id: null, punkt_typ: 'wet', rubrik: `Punkt ${id}`, antal_planerat: null,
  geometri_snapshot: { x: 0, y: 0 }, plan_kommentar: null, status: 'ok', avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: '2026-10-17T08:00:00Z', ...over,
});

let vyn: any;
const hamtaRunda = vi.fn(async () => vyn);
const sparaRundKommentar = vi.fn(async (_id: string, text: string | null) => ({ ...RUNDA, kommentar: text }));
const avslutaRunda = vi.fn(async () => ({ ...RUNDA, status: 'klar' }));
// Kartlagren till rapporten: hamtas bara for en AVSLUTAD runda.
let stammoln: () => Promise<{ punkter: { lat: number; lng: number }[]; antal: number | null }> = async () => ({ punkter: [{ lat: 56.05, lng: 14.05 }], antal: 1 });
const hamtaStammoln = vi.fn((_vo: string) => stammoln());
const hamtaHyttspar = vi.fn(async (_objektId: string) => [] as any[]);

let sistaIndata: any = null;
vi.mock('@/lib/egenkontrollRapportIndata', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontrollRapportIndata')>();
  return { ...verklig, byggRapportIndata: (a: any) => { sistaIndata = a; return verklig.byggRapportIndata(a); } };
});
vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    sparaRundKommentar: (id: string, t: string | null) => sparaRundKommentar(id, t),
    avslutaRunda: () => avslutaRunda(),
    hamtaStammoln: (vo: string) => hamtaStammoln(vo),
    hamtaHyttspar: (id: string) => hamtaHyttspar(id),
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
vi.mock('../TillbakaTillListan', () => ({ default: () => null }));
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
const knapp = (t: string | RegExp) => {
  const k = knappar().find((b) => (typeof t === 'string' ? b.textContent?.includes(t) : t.test(b.textContent ?? '')));
  if (!k) throw new Error(`Ingen knapp "${t}". Knappar: ${knappar().map((b) => b.textContent).join(' | ')}`);
  return k;
};
const harKnapp = (t: string | RegExp) => knappar().some((b) => (typeof t === 'string' ? b.textContent?.includes(t) : t.test(b.textContent ?? '')));
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const skriv = async (el: HTMLTextAreaElement, varde: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(el, varde);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const ark = () => document.querySelector('[role=dialog][aria-label="Kommentar om rundan"]');
const tillListan = async () => { if (harKnapp('Lista')) await klick(knapp('Lista')); };

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };

beforeEach(() => {
  localStorage.clear();
  stammoln = async () => ({ punkter: [{ lat: 56.05, lng: 14.05 }], antal: 1 });
  sistaIndata = null;
  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();
  vyn = { objektNamn: 'Ravemåla', objektStatus: 'pagaende', kartObjekt, egenkontroll: RUNDA, punkter: [punkt('p1'), punkt('p2', { status: null, besvarad: null })], observationer: [] };
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

describe('under hela rundan: knappen pa kartan och arket', () => {
  it('sidan monterar (hookordning) och kartan har knappen "Kommentar"', async () => {
    await montera();
    expect(document.querySelector('[data-testid=karta]')).not.toBeNull();
    expect(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!.textContent).toContain('Kommentar');
  });

  it('knappen har en tryckyta pa minst 44', async () => {
    await montera();
    const k = knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!;
    expect(Number.parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  it('tryck oppnar arket; Spara ar INAKTIV tills nagot skrivits; Spara skriver texten mot RUNDAN och stanger', async () => {
    await montera();
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!);
    expect(ark()).not.toBeNull();
    const faltet = ark()!.querySelector('textarea') as HTMLTextAreaElement;
    const spara = Array.from(ark()!.querySelectorAll('button')).find((b) => b.textContent === 'Spara') as HTMLButtonElement;
    expect(spara.disabled).toBe(true);
    await skriv(faltet, 'Basväg över stenmuren på två platser.');
    expect(spara.disabled).toBe(false);
    await klick(spara);
    expect(sparaRundKommentar).toHaveBeenCalledWith('runda-1', 'Basväg över stenmuren på två platser.');
    expect(ark()).toBeNull();
    // Sparat = inget utkast kvar: annars ateruppstar texten som ett "utkast" nasta gang sidan laddas.
    expect(localStorage.getItem('egenkontroll_kommentar_utkast_runda-1')).toBeNull();
  });

  it('TEXTEN FORSVINNER INTE: stangs arket utan att spara ligger den kvar nar det oppnas igen, och i lokalt lager', async () => {
    await montera();
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!);
    await skriv(ark()!.querySelector('textarea') as HTMLTextAreaElement, 'Skrivet vid stenmuren');
    await klick(Array.from(ark()!.querySelectorAll('button')).find((b) => b.textContent === 'Avbryt')!);
    expect(ark()).toBeNull();
    expect(localStorage.getItem('egenkontroll_kommentar_utkast_runda-1')).toBe('Skrivet vid stenmuren');
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!);
    expect((ark()!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Skrivet vid stenmuren');
  });

  it('OMLADDNING: ett lokalt utkast tas tillbaka nar sidan laddas, och knappen sager att en kommentar finns', async () => {
    localStorage.setItem('egenkontroll_kommentar_utkast_runda-1', 'Utkast fran innan appen laddades om');
    await montera();
    expect(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!.textContent).toContain('Kommentar skriven');
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!);
    expect((ark()!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Utkast fran innan appen laddades om');
  });

  it('ett utkast som redan ar identiskt med det sparade ar inget utkast och rensas', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, kommentar: 'Sparad text' } };
    localStorage.setItem('egenkontroll_kommentar_utkast_runda-1', 'Sparad text');
    await montera();
    expect(localStorage.getItem('egenkontroll_kommentar_utkast_runda-1')).toBeNull();
  });

  it('ett sparfel stanger inte arket: texten ligger kvar och felet star i arket', async () => {
    sparaRundKommentar.mockRejectedValueOnce(new Error('Kunde inte spara kommentaren: nat'));
    await montera();
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')!);
    await skriv(ark()!.querySelector('textarea') as HTMLTextAreaElement, 'Text som inte nadde fram');
    await klick(Array.from(ark()!.querySelectorAll('button')).find((b) => b.textContent === 'Spara')!);
    expect(ark()).not.toBeNull();
    expect(ark()!.textContent).toContain('Kunde inte spara kommentaren: nat');
    expect(ark()!.textContent).toContain('Inget är förlorat');
    expect((ark()!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Text som inte nadde fram');
  });

  it('listan visar den sparade texten pa en rad som oppnar arket', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, kommentar: 'Bra avverkning' } };
    await montera();
    await tillListan();
    expect(text()).toContain('KOMMENTAR OM RUNDAN');
    expect(text()).toContain('Bra avverkning');
  });
});

describe('avslutsdialogen: samma falt, sparas FORE avslutet', () => {
  beforeEach(() => {
    vyn = { ...vyn, punkter: [punkt('p1'), punkt('p2')] };
  });

  const oppnaDialog = async () => {
    await tillListan();
    await klick(knapp(/^Avsluta rundan/));
    return document.querySelector('[role=dialog][aria-label="Avsluta rundan"]')!;
  };

  it('textfaltet visar det som redan star och gar att fylla pa', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, kommentar: 'Det som redan stod' } };
    await montera();
    const dialog = await oppnaDialog();
    const faltet = dialog.querySelector('textarea[aria-label="Kommentar till rapporten"]') as HTMLTextAreaElement;
    expect(faltet.value).toBe('Det som redan stod');
    await skriv(faltet, 'Det som redan stod\nOch lite till');
    expect(faltet.value).toBe('Det som redan stod\nOch lite till');
  });

  it('en andrad kommentar sparas FORE avslutaRunda', async () => {
    const ordning: string[] = [];
    sparaRundKommentar.mockImplementation(async (_i, t) => { ordning.push('kommentar'); return { ...RUNDA, kommentar: t } as any; });
    avslutaRunda.mockImplementation(async () => { ordning.push('avslut'); return { ...RUNDA, status: 'klar' } as any; });
    await montera();
    const dialog = await oppnaDialog();
    await skriv(dialog.querySelector('textarea') as HTMLTextAreaElement, 'Sista ordet');
    await klick(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Avsluta rundan')!);
    expect(ordning).toEqual(['kommentar', 'avslut']);
    expect(sparaRundKommentar).toHaveBeenCalledWith('runda-1', 'Sista ordet');
  });

  it('GAR KOMMENTAREN INTE ATT SPARA AVSLUTAS INTE RUNDAN - efteraat gar den inte att andra', async () => {
    sparaRundKommentar.mockRejectedValueOnce(new Error('Kunde inte spara kommentaren: nat'));
    await montera();
    const dialog = await oppnaDialog();
    await skriv(dialog.querySelector('textarea') as HTMLTextAreaElement, 'Text');
    await klick(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Avsluta rundan')!);
    expect(avslutaRunda).not.toHaveBeenCalled();
    expect(text()).toContain('Rundan är inte avslutad');
    expect(localStorage.getItem('egenkontroll_kommentar_utkast_runda-1')).toBe('Text');
  });

  it('ingen andring i kommentaren: ingen onodig skrivning, rundan avslutas', async () => {
    await montera();
    const dialog = await oppnaDialog();
    await klick(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Avsluta rundan')!);
    expect(sparaRundKommentar).not.toHaveBeenCalled();
    expect(avslutaRunda).toHaveBeenCalledTimes(1);
  });
});

describe('avslutad runda = last, med rapportraderna', () => {
  beforeEach(() => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-17T12:00:00Z', kommentar: 'Slutord om rundan' }, punkter: [punkt('p1')] };
  });

  it('ingen kommentarsknapp pa kartan och ingen oppningsbar rad i listan - men texten syns', async () => {
    await montera();
    expect(harKnapp('Kommentar')).toBe(false);
    // En avslutad runda oppnar listan, men kartan gar att visa. Dar far knappen heller inte finnas.
    await klick(knappar().find((b) => b.getAttribute('aria-label') === 'Visa kartan')!);
    expect(document.querySelector('[data-testid=karta]')).not.toBeNull();
    expect(knappar().some((b) => b.getAttribute('aria-label') === 'Kommentar om rundan')).toBe(false);
    await tillListan();
    expect(text()).toContain('Slutord om rundan');
    const rad = knappar().find((b) => b.textContent?.includes('KOMMENTAR OM RUNDAN'))!;
    expect(rad.disabled).toBe(true);
  });

  it('rapportraderna "Rapport" och "Bilaga" finns pa en avslutad runda - och inte pa en oppen', async () => {
    await montera();
    expect(text()).toContain('Rapport till Vida');
    expect(harKnapp(/^.*Rapport.*A4/)).toBe(true);
    expect(harKnapp(/Bilaga/)).toBe(true);
  });

  it('KARTLAGREN HAMTAS BARA FOR EN AVSLUTAD RUNDA - stammolnet kan vara over 12 000 punkter', async () => {
    await montera();
    expect(hamtaStammoln).toHaveBeenCalledWith('1');
    expect(hamtaHyttspar).toHaveBeenCalledWith('ob1');
    vi.clearAllMocks();
    vyn = { ...vyn, egenkontroll: RUNDA };
    if (root) await act(async () => { root!.unmount(); });
    host?.remove();
    await montera();
    expect(hamtaStammoln).not.toHaveBeenCalled();
    expect(hamtaHyttspar).not.toHaveBeenCalled();
  });

  it('rapportraderna dyker upp NAR kartlagren ar hamtade - dessforinnan star "Forbereder rapporten", aldrig en halvfardig rapport', async () => {
    let slappStammoln!: () => void;
    stammoln = () => new Promise((res) => { slappStammoln = () => res({ punkter: [], antal: null }); });
    await montera();
    expect(text()).toContain('Förbereder rapporten');
    expect(text()).not.toContain('Rapport till Vida');
    await act(async () => { slappStammoln(); await new Promise((r) => setTimeout(r, 10)); });
    expect(text()).not.toContain('Förbereder rapporten');
    expect(text()).toContain('Rapport till Vida');
  });

  it('gar stammolnet INTE att lasa kommer rapporten anda - och sager det (ett fel ar inte "inga stammar")', async () => {
    stammoln = async () => { throw new Error('nat'); };
    await montera();
    expect(text()).toContain('Rapport till Vida');
    expect(sistaIndata.stammar).toBeNull();          // ett FEL, aldrig en tom lista ("inga stammar hittades")
    expect(sistaIndata.antalStammar).toBeNull();
  });

  it('gar hyttsparet INTE att lasa ar det null (sags pa kartan) - inte [] ("inget spar finns"), och ett fel pa det ena tar inte det andra', async () => {
    hamtaHyttspar.mockRejectedValueOnce(new Error('nat'));
    await montera();
    expect(sistaIndata.hyttspar).toBeNull();
    expect(sistaIndata.stammar).toHaveLength(1);
  });

  it('kartlagren och faktan nar rapporten: stammarna, filens antal, hyttsparet, objektets areal', async () => {
    stammoln = async () => ({ punkter: [{ lat: 56.05, lng: 14.05 }, { lat: 56.051, lng: 14.051 }], antal: 3 });
    vyn = { ...vyn, kartObjekt: { ...kartObjekt, areal: 4.8 } };
    await montera();
    expect(sistaIndata.stammar).toHaveLength(2);
    expect(sistaIndata.antalStammar).toBe(3);
    expect(sistaIndata.hyttspar).toEqual([]);
    expect(sistaIndata.areal).toBe(4.8);
  });

  it('en oppen runda har inga rapportrader', async () => {
    vyn = { ...vyn, egenkontroll: RUNDA };
    await montera();
    await tillListan();
    expect(text()).not.toContain('Rapport till Vida');
  });
});
