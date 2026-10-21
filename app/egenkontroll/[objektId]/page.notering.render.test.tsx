// @vitest-environment jsdom
// Egenkontrollsidan renderad for riktigt med NOTERINGAR (PR 9a): knappen Rita, raden nertill, formularet, och att det som ritats
// sparas EXAKT som tryckt. Kartan (MapLibre) ar en stubb som tar emot tryck pa samma satt som den riktiga (bara nar sidan ger den `rita`);
// lagren och bilderna provas i lib/egenkontrollNoteringKarta.test.ts, databasen i lib/egenkontrollNotering.db.test.ts och lokalt i
// supabase/tests/egenkontroll_notering_lokal.
//
// Det som far ga sonder tyst:
//  - Rita saknas, eller finns pa en avslutad runda (som ar last),
//  - ett tryck pa kartan medan man ritar markerar en punkt i stallet for att bli en punkt i ritningen,
//  - en dubbelhandelse (touch + emulerad mus) blir tva horn,
//  - ✓ gar att trycka med for fa punkter, eller ↩ tar fel punkt,
//  - formularet sparar nagot annat an det som ritats, eller en tom text,
//  - Avbryt i formularet kastar bort en linje man dragit,
//  - en tom text pa en befintlig notering blir ett felmeddelande i stallet for en borttagning,
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

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => ({}) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    kompletteraRunda: async () => ({ tillagda: [] }),
    hamtaFoton: async () => [],
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
    const tryck = (lng: number, lat: number, tid: number, x: number, y: number) => () => { if (p.rita) p.onRitaTryck?.([lng, lat], tid, { x, y }); };
    return createElement('div', { 'data-testid': 'karta', 'data-rita': p.rita ? p.rita.verktyg : '', 'data-ritpunkter': String(p.rita?.tryck.length ?? ''), 'data-noteringar': String(p.noteringar.length) },
      createElement('button', { 'data-testid': 'tryck-1', onClick: tryck(14.05, 56.05, 1000, 100, 100) }, 't1'),
      createElement('button', { 'data-testid': 'tryck-1-igen', onClick: tryck(14.05, 56.05, 1100, 101, 100) }, 't1b'),
      createElement('button', { 'data-testid': 'tryck-2', onClick: tryck(14.06, 56.06, 5000, 200, 200) }, 't2'),
      createElement('button', { 'data-testid': 'tryck-3', onClick: tryck(14.07, 56.05, 9000, 300, 100) }, 't3'),
      p.noteringar.map((n: any) => createElement('button', {
        key: n.id, 'data-testid': `karta-not-${n.id}`, onClick: () => p.onValjNotering?.(n.id), disabled: !p.onValjNotering,
      }, `karta:${n.id}`)));
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

const knappar = () => Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
const hittaKnapp = (t: string | RegExp) => knappar().find((b) => (typeof t === 'string' ? b.textContent?.includes(t) : t.test(b.textContent ?? '')));
const knapp = (t: string | RegExp) => {
  const k = hittaKnapp(t);
  if (!k) throw new Error(`Ingen knapp "${t}". Knappar: ${knappar().map((b) => b.textContent || b.getAttribute('aria-label')).join(' | ')}`);
  return k;
};
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const id = (t: string) => document.querySelector(`[data-testid="${t}"]`) as HTMLElement;
const ritaRad = () => document.querySelector('[data-testid=rita-rad]');
const kartan = () => id('karta');
const skriv = async (el: HTMLTextAreaElement, text: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const textfalt = () => document.querySelector('textarea[aria-label="Text på kartan"]') as HTMLTextAreaElement;

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* */ }
  noteringarSvar = [];
  noteringarFel = false;
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

describe('Rita-knappen', () => {
  it('finns bredvid Notera här pa en pagaende runda, och sidan monterar utan att kasta (hookordning)', async () => {
    await montera();
    expect(hittaKnapp('Rita')).toBeDefined();
    expect(hittaKnapp('Notera här')).toBeDefined();
    expect(ritaRad()).toBeNull();
  });

  it('saknas pa en AVSLUTAD runda (last), och noteringarna gar da inte att trycka pa', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-18T10:00:00Z' } };
    noteringarSvar = [notering('n1')];
    await montera();
    expect(hittaKnapp('Rita')).toBeUndefined();
    expect(hittaKnapp('Notera här')).toBeUndefined();
    expect(kartProps.onValjNotering).toBeUndefined();
    expect(kartan().getAttribute('data-noteringar')).toBe('1');   // men de SYNS
  });

  it('ett tryck ersatter Notera här och Lager med EN rad: Punkt · Linje · Pil · ×', async () => {
    await montera();
    await klick(knapp('Rita'));
    expect(ritaRad()).not.toBeNull();
    expect(hittaKnapp('Notera här')).toBeUndefined();
    expect(hittaKnapp('Lager')).toBeUndefined();
    for (const v of ['Punkt', 'Linje', 'Pil']) expect(hittaKnapp(v)).toBeDefined();
    expect(document.querySelector('[aria-label="Avbryt ritandet"]')).not.toBeNull();
  });

  it('× ar tillbaka till vanliga knappar och inget har sparats', async () => {
    await montera();
    await klick(knapp('Rita'));
    await klick(document.querySelector('[aria-label="Avbryt ritandet"]')!);
    expect(ritaRad()).toBeNull();
    expect(hittaKnapp('Rita')).toBeDefined();
    expect(skapaNotering).not.toHaveBeenCalled();
  });

  it('är Noteringar släckt i Lager tänds det av Rita — annars ser man inte det man ritar', async () => {
    window.localStorage.setItem('egenkontroll_lager_v1', JSON.stringify({ ekNoteringar: false }));
    await montera();
    expect(kartProps.egnaVarden.ekNoteringar).toBe(false);
    await klick(knapp('Rita'));
    expect(kartProps.egnaVarden.ekNoteringar).toBe(true);
  });
});

describe('Punkt', () => {
  it('ett tryck pa kartan oppnar formularet; Klar är grå tills det star nagot; sparas EXAKT dar man tryckte', async () => {
    await montera();
    await klick(knapp('Rita'));
    await klick(knapp('Punkt'));
    expect(kartan().getAttribute('data-rita')).toBe('punkt');
    await klick(id('tryck-1'));
    expect(textfalt()).not.toBeNull();
    expect(knapp('Klar').disabled).toBe(true);
    await skriv(textfalt(), '  Stenmur  ');
    expect(knapp('Klar').disabled).toBe(false);
    await klick(knapp('Klar'));
    expect(skapaNotering).toHaveBeenCalledTimes(1);
    expect(skapaNotering.mock.calls[0][0]).toMatchObject({
      egenkontrollId: 'runda-1', verktyg: 'punkt', avsikt: 'blev', koordinater: [[14.05, 56.05]],
    });
    expect(skapaNotering.mock.calls[0][0].etikett.trim()).toBe('Stenmur');
    // klart: formularet borta, vanliga knappar tillbaka, och noteringarna lasta om
    expect(textfalt()).toBeNull();
    expect(ritaRad()).toBeNull();
    expect(hamtaNoteringar.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('"Så här skulle det gjorts" sparas som avsikt skulle; förvald är "Så här blev det"', async () => {
    await montera();
    await klick(knapp('Rita'));
    await klick(knapp('Punkt'));
    await klick(id('tryck-1'));
    expect(knapp('Så här blev det').getAttribute('aria-pressed')).toBe('true');
    expect(id('notering-skulle-info')).toBeNull();                                  // blev: ingenting att varna för
    await klick(knapp('Så här skulle det gjorts'));
    expect(knapp('Så här skulle det gjorts').getAttribute('aria-pressed')).toBe('true');
    expect(id('notering-skulle-info')?.textContent).toBe('Följer inte med i rapporten till Vida.');   // skulle: besiktaren får veta det innan hen skriver
    await skriv(textfalt(), 'Infart');
    await klick(knapp('Klar'));
    expect(skapaNotering.mock.calls[0][0].avsikt).toBe('skulle');
  });

  it('ett tryck medan man INTE ritar markerar som vanligt (ingen ritpunkt, inget formular)', async () => {
    await montera();
    await klick(id('tryck-1'));
    expect(textfalt()).toBeNull();
  });
});

describe('Linje och Pil', () => {
  async function tillLinje(verktyg: 'Linje' | 'Pil') {
    await montera();
    await klick(knapp('Rita'));
    await klick(knapp(verktyg));
  }
  const klarKnapp = () => document.querySelector('[aria-label="Klar med linjen"]') as HTMLButtonElement;
  const angraKnapp = () => document.querySelector('[aria-label="Ångra senaste punkten"]') as HTMLButtonElement;

  it('✓ är avstängd tills det finns två punkter, och raden räknar punkterna', async () => {
    await tillLinje('Linje');
    expect(ritaRad()!.textContent).toContain('Linje: tryck där den ska börja');
    await klick(id('tryck-1'));
    expect(ritaRad()!.textContent).toContain('Linje: tryck där den ska sluta');
    expect(klarKnapp().disabled).toBe(true);
    await klick(id('tryck-2'));
    expect(klarKnapp().disabled).toBe(false);
    await klick(id('tryck-3'));
    expect(ritaRad()!.textContent).toContain('Linje · 3 punkter');
    expect(kartan().getAttribute('data-ritpunkter')).toBe('3');
  });

  it('en dubbelhändelse (samma plats inom 4 px och 0,8 s) är SAMMA tryck, aldrig två hörn', async () => {
    await tillLinje('Linje');
    await klick(id('tryck-1'));
    await klick(id('tryck-1-igen'));
    expect(kartan().getAttribute('data-ritpunkter')).toBe('1');
  });

  it('↩ tar bort SENASTE punkten', async () => {
    await tillLinje('Linje');
    await klick(id('tryck-1'));
    await klick(id('tryck-2'));
    await klick(id('tryck-3'));
    await klick(angraKnapp());
    expect(kartan().getAttribute('data-ritpunkter')).toBe('2');
    await klick(klarKnapp());
    await skriv(textfalt(), 'Basvägen skulle gått här');
    await klick(knapp('Klar'));
    // 1 och 2 kvar — inte 1 och 3
    expect(skapaNotering.mock.calls[0][0].koordinater).toEqual([[14.05, 56.05], [14.06, 56.06]]);
    expect(skapaNotering.mock.calls[0][0].verktyg).toBe('linje');
  });

  it('en pil sparas som verktyget pil, med punkterna exakt som tryckta', async () => {
    await tillLinje('Pil');
    await klick(id('tryck-1'));
    await klick(id('tryck-3'));
    await klick(klarKnapp());
    await skriv(textfalt(), 'Hit');
    await klick(knapp('Klar'));
    expect(skapaNotering.mock.calls[0][0]).toMatchObject({ verktyg: 'pil', koordinater: [[14.05, 56.05], [14.07, 56.05]] });
  });

  it('AVBRYT i formularet kastar inte bort linjen: ritningen ligger kvar att slutföra eller ångra', async () => {
    await tillLinje('Linje');
    await klick(id('tryck-1'));
    await klick(id('tryck-2'));
    await klick(klarKnapp());
    expect(textfalt()).not.toBeNull();
    await klick(knapp('Avbryt'));
    expect(textfalt()).toBeNull();
    expect(kartan().getAttribute('data-ritpunkter')).toBe('2');
    expect(skapaNotering).not.toHaveBeenCalled();
    await klick(klarKnapp());                       // och går att slutföra igen
    expect(textfalt()).not.toBeNull();
  });
});

describe('formularet sparar inte nagot halvt', () => {
  it('ett sparfel stanger inte formularet, texten ligger kvar, och Försök igen skriver SAMMA rad (samma id)', async () => {
    skapaNotering.mockRejectedValueOnce(new Error('Nätet föll bort'));
    await montera();
    await klick(knapp('Rita'));
    await klick(knapp('Punkt'));
    await klick(id('tryck-1'));
    await skriv(textfalt(), 'Stenmur');
    await klick(knapp('Klar'));
    expect(document.body.textContent).toContain('Nätet föll bort');
    expect(textfalt().value).toBe('Stenmur');
    await klick(knapp('Klar'));
    expect(skapaNotering).toHaveBeenCalledTimes(2);
    expect(skapaNotering.mock.calls[1][0].id).toBe(skapaNotering.mock.calls[0][0].id);
    expect(textfalt()).toBeNull();
  });
});

describe('att ändra en notering', () => {
  beforeEach(() => { noteringarSvar = [notering('n1', { etikett: 'Stenmur' })]; });

  it('tryck pa en notering oppnar den med sin text och avsikt; Klar är grå tills nagot ändrats', async () => {
    await montera();
    await klick(id('karta-not-n1'));
    expect(textfalt().value).toBe('Stenmur');
    expect(knapp('Så här blev det').getAttribute('aria-pressed')).toBe('true');
    expect(knapp('Klar').disabled).toBe(true);
    await skriv(textfalt(), 'Stenmur, 3 m bred');
    expect(knapp('Klar').disabled).toBe(false);
    await klick(knapp('Klar'));
    expect(andraNotering).toHaveBeenCalledWith('n1', { etikett: 'Stenmur, 3 m bred', avsikt: 'blev' });
  });

  it('TOM TEXT: knappen heter "Ta bort" och går till andraNotering med tom text (som gör en DELETE) — inget felmeddelande', async () => {
    await montera();
    await klick(id('karta-not-n1'));
    await skriv(textfalt(), '');
    expect(hittaKnapp('Klar')).toBeUndefined();
    const ta = knapp('Ta bort');
    expect(ta.disabled).toBe(false);
    await klick(ta);
    expect(andraNotering).toHaveBeenCalledTimes(1);
    expect(andraNotering.mock.calls[0][0]).toBe('n1');
    expect(andraNotering.mock.calls[0][1].etikett).toBe('');
    expect(skapaNotering).not.toHaveBeenCalled();
    expect(textfalt()).toBeNull();
  });

  it('under ett pågående ritande öppnas ingen notering av ett tryck', async () => {
    await montera();
    await klick(knapp('Rita'));
    expect(kartProps.onValjNotering).toBeUndefined();
  });
});

describe('ett lasfel pa noteringarna ar ett FEL, aldrig "inga noteringar"', () => {
  it('sidan sager det, och rapporten (avslutad runda) sager det under kartan i stallet for att utelamna noteringarna tyst', async () => {
    noteringarFel = true;
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-18T10:00:00Z' } };
    await montera();
    expect(document.body.textContent).toContain('Noteringarna kunde inte läsas');
    expect(rapportModell).not.toBeNull();
    expect(rapportModell.karta.anmarkningar).toContain('Noteringarna kunde inte läsas.');
  });

  it('lasta noteringar kommer med i rapporten, och ingen anmarkning sags', async () => {
    noteringarSvar = [notering('n1', { etikett: 'Stenmur' })];
    vyn = { ...vyn, egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-18T10:00:00Z' } };
    await montera();
    expect(rapportModell.karta.noteringar.map((n: any) => n.etikett)).toEqual(['Stenmur']);
    expect(rapportModell.karta.anmarkningar).not.toContain('Noteringarna kunde inte läsas.');
  });
});
