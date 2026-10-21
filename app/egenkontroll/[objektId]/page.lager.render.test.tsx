// @vitest-environment jsdom
// LAGREN (PR 8a) renderade för riktigt: menyn med sina grupper och gråa rader, det sparade valet, och knappen "Visa hyttspåret" i Basväg-punktens
// sidokolumn. Kartan är utbytt mot en stubb som visar exakt vad sidan gav den; lagermenyn är den RIKTIGA komponenten.
//
// Det som får gå sönder tyst:
//  - standarden tänder något nytt (hyttspår, Vidas gräns, planens vägar) utan att någon bett om det,
//  - hyttsparet hämtas innan någon bett om det (ett helt objekts spår hämtas inte i onödan),
//  - en rad som inte går (Ulfsnäs: inget spår; Vällust: bara skotare; Vida saknas; origo ej betrott) ser trasig ut eller går att trycka på,
//  - menyn står på "av" medan lagret är på, eller tvärtom (knappen och menyn skriver olika värden),
//  - valet nollställs av ett svar, en ny markering eller ett arkläge (det ska hålla medan man går) eller överlever inte en omladdning,
//  - ett fel vid hämtning blir "inget spår", eller försöks aldrig om,
//  - dockan växer när Basväg-punkten markeras (inget tryckbart får flytta sig under fingret).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { utforandeKatalog } from '@/lib/egenkontroll';
import { LAGER_LAGRING, LAGER_STANDARD, LAGER_TEXT } from '@/lib/egenkontrollLager';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RUNDA = { id: 'runda-1', objekt_id: 'ob1', status: 'pagaende', startad: '2026-10-17T07:00:00Z', klar: null, vader: null, maskiner: null, objekt_typ: 'gallring', utford_av: 'Martin', kommentar: null };
const rad = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'runda-1', ordning: 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
  markering_marker_id: null, punkt_typ: 'wet', rubrik: `Punkt ${id}`, antal_planerat: null,
  geometri_snapshot: { x: 0, y: 0 }, plan_kommentar: null, status: null, avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: null, ...over,
});
const utforande = () => utforandeKatalog('gallring').map((m, i) => rad(`u${i}`, { ordning: 10 + i, del: 'utforande', kalla: 'fast', grupp: null, punkt_typ: m.slug, rubrik: m.rubrik, geometri_snapshot: null }));

let vyn: any;
const hamtaRunda = vi.fn(async () => vyn);
const hamtaHyttspar = vi.fn(async (_id: string): Promise<any[]> => []);
let vida: any = { typ: 'saknas' };
let kontext: any[] = [];
const SPAR_BEGGE = [
  { roll: 'skordare', linjer: [[{ lat: 56.05, lng: 14.05 }, { lat: 56.06, lng: 14.06 }]], dagar: 4 },
  { roll: 'skotare', linjer: [[{ lat: 56.05, lng: 14.05 }, { lat: 56.06, lng: 14.06 }]], dagar: 1 },
];
const RINGAR = [[[14.0, 56.0], [14.1, 56.0], [14.1, 56.1], [14.0, 56.0]]];

vi.mock('next/navigation', () => ({ useParams: () => ({ objektId: 'ob1' }) }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => ({}) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    kompletteraRunda: async () => ({ tillagda: [] }),
    svaraPaPunkt: async (id: string, status: string) => ({ ...vyn.punkter.find((p: any) => p.id === id), status }),
    angraForstaSvaret: async () => ({}),
    hamtaFoton: async () => [],
    hamtaProvytor: async () => [],
    hamtaNoteringar: async () => [],
    hamtaKontextmarkeringar: async () => kontext,
    hamtaVidaGrans: async () => vida,
    hamtaAvverkadeStammar: async () => [],
    hamtaStammoln: async () => ({ punkter: [], antal: 0 }),
    hamtaHyttspar: (id: string) => hamtaHyttspar(id),
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
vi.mock('../useMinPosition', () => ({ useLevandePosition: () => ({ status: 'ok', position: { lat: 56.0501, lng: 14.0502, noggrannhet: 6 }, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {} }) }));
vi.mock('../RundKarta', () => ({
  default: (p: any) => createElement('div', {
    'data-testid': 'karta', 'data-egna': JSON.stringify(p.egnaVarden), 'data-spar': JSON.stringify((p.spar ?? []).map((s: any) => s.roll)),
    'data-vida': String((p.vidaRingar ?? []).length), 'data-origo': p.origo ? '1' : '',
  }, p.punkter.filter((q: any) => q.del === 'plan').map((q: any) => createElement('button', { key: q.id, 'data-testid': `karta-punkt-${q.id}`, onClick: () => p.onValjPunkt?.(q.id) }, `karta:${q.id}`))),
}));
vi.mock('../AvvikelseSheet', () => ({ default: () => null }));
vi.mock('../Forutsattningar', () => ({ default: () => null }));
vi.mock('../GaTillYta', () => ({ default: () => null }));

import Sida from './page';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const montera = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Sida)); });
  await vantaTills(() => !!document.querySelector('[data-testid=karta]'));
};
const avmontera = async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null; host = null;
};
/** Vantar pa ett VILLKOR (aldrig ett fast antal tick). */
async function vantaTills(villkor: () => boolean, ms = 3000) {
  const slut = Date.now() + ms;
  while (!villkor() && Date.now() < slut) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(villkor()).toBe(true);
}
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const egna = () => JSON.parse(document.querySelector('[data-testid=karta]')!.getAttribute('data-egna')!) as Record<string, boolean>;
const sparRoller = () => JSON.parse(document.querySelector('[data-testid=karta]')!.getAttribute('data-spar')!) as string[];
const lagerKnapp = () => Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Kartlager') as HTMLButtonElement;
const oppnaMenyn = async () => { await klick(lagerKnapp()); await vantaTills(() => !!document.querySelector('[data-lager]')); };
const menyRad = (id: string) => document.querySelector(`[data-lager=${id}]`) as HTMLElement | null;
const menyPa = (id: string) => menyRad(id)!.getAttribute('aria-checked') === 'true';
const spColl = () => document.querySelector('[data-testid=spar-knapp]') as HTMLElement | null;
const markera = async (id: string) => { await klick(document.querySelector(`[data-testid=karta-punkt-${id}]`)!); };

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };
const BASVAG = rad('b1', { ordning: 2, punkt_typ: 'mainRoad', rubrik: 'Basväg 1', markering_marker_id: 'm1', geometri_snapshot: { path: [{ x: 0, y: 0 }, { x: 4, y: 4 }] } });

beforeEach(() => {
  localStorage.clear();
  hamtaHyttspar.mockReset();
  hamtaHyttspar.mockImplementation(async () => SPAR_BEGGE);
  vida = { typ: 'ok', gran: [[14, 56], [14.1, 56.1]], ringar: RINGAR };
  kontext = [
    { marker_id: 'm2', data: { lineType: 'sideRoadRed', path: [{ x: 0, y: 0 }, { x: 5, y: 5 }] } },
    { marker_id: 'm3', data: { lineType: 'mainRoad', path: [{ x: 1, y: 1 }, { x: 6, y: 6 }] } },
  ];
  vyn = {
    objektNamn: 'Ulfsnäs', objektStatus: 'pagaende', kartObjekt, egenkontroll: RUNDA,
    punkter: [rad('p1', { ordning: 1 }), BASVAG, ...utforande()],
    observationer: [],
  };
});
afterEach(async () => {
  await avmontera();
  vi.clearAllMocks();
});

describe('STANDARDEN lägger inget nytt på kartan, och inget hämtas i onödan', () => {
  it('kartan får bara punkter, provytor och observationer på; hyttsparet är inte hämtat; ingen knapp', async () => {
    await montera();
    expect(egna()).toEqual(LAGER_STANDARD);
    expect(egna()).toMatchObject({ ekPlanVagar: false, ekSparSkordare: false, ekSparSkotare: false, ekVidaGrans: false, ekStammar: false });
    expect(hamtaHyttspar).not.toHaveBeenCalled();
    expect(sparRoller()).toEqual([]);
    expect(spColl()).toBeNull();
    expect(document.querySelector('[data-testid=spar-knapp-ingen]')).toBeNull();
  });

  it('Vidas gräns når kartan som ringar när den läst dem (men ritas först när lagret är tänt - det avgör kartan)', async () => {
    await montera();
    await vantaTills(() => document.querySelector('[data-testid=karta]')!.getAttribute('data-vida') === '1');
  });
});

describe('MENYN: grupper, rader och gråa rader som säger varför', () => {
  it('öppnas hyttsparet hämtas EN gång; raderna står i två grupper, det rundan handlar om först', async () => {
    await montera();
    await oppnaMenyn();
    await vantaTills(() => /4 dagar/.test(menyRad('ekSparSkordare')!.textContent ?? ''));
    expect(hamtaHyttspar).toHaveBeenCalledTimes(1);
    expect(hamtaHyttspar).toHaveBeenCalledWith('ob1');
    const grupper = Array.from(document.querySelectorAll('[data-lager-grupp]')).map((g) => g.getAttribute('data-lager-grupp'));
    expect(grupper).toEqual(['Egenkontrollen', 'Plan och körning']);
    const ids = Array.from(document.querySelectorAll('[data-lager]')).map((r) => r.getAttribute('data-lager'));
    expect(ids).toEqual(['ekPunkter', 'ekProvytor', 'ekObservationer', 'ekNoteringar', 'ekPlanVagar', 'ekSparSkordare', 'ekSparSkotare', 'ekVidaGrans', 'ekStammar']);
    // Inget är avstängt på ett objekt som har allt; spår-raderna bär rollfärgen som en prick och rollen i ord.
    expect(document.querySelectorAll('[data-avstangd]')).toHaveLength(0);
    expect(menyRad('ekSparSkotare')!.textContent).toContain('Hyttspår · skotare');
    expect(menyRad('ekSparSkotare')!.querySelector('[data-lager-farg]')).not.toBeNull();
    expect(menyRad('ekPlanVagar')!.textContent).toContain('2 basvägar · 1 stickväg');
  });

  it('ULFSNÄS: inget hyttspår alls -> EN grå rad med meningen, avstängd, och ett tryck på den ändrar ingenting', async () => {
    hamtaHyttspar.mockImplementation(async () => []);
    await montera();
    await oppnaMenyn();
    await vantaTills(() => /Inget hyttspår för det här objektet/.test(menyRad('ekSparSkordare')?.textContent ?? ''));
    expect(menyRad('ekSparSkordare')!.getAttribute('data-avstangd')).toBe('1');
    expect(menyRad('ekSparSkordare')!.getAttribute('aria-disabled')).toBe('true');
    expect(menyRad('ekSparSkotare')).toBeNull();
    const fore = JSON.stringify(egna());
    await klick(menyRad('ekSparSkordare')!);
    expect(JSON.stringify(egna())).toBe(fore);
    expect(menyPa('ekSparSkordare')).toBe(false);
  });

  it('VÄLLUST: bara skotare -> skotarraden går att tända, skördarraden är grå och säger varför', async () => {
    hamtaHyttspar.mockImplementation(async () => [SPAR_BEGGE[1]]);
    await montera();
    await oppnaMenyn();
    await vantaTills(() => /1 dag/.test(menyRad('ekSparSkotare')?.textContent ?? ''));
    expect(menyRad('ekSparSkotare')!.getAttribute('data-avstangd')).toBeNull();
    expect(menyRad('ekSparSkordare')!.getAttribute('data-avstangd')).toBe('1');
    expect(menyRad('ekSparSkordare')!.textContent).toContain('Inget hyttspår från skördaren på det här objektet');
    await klick(menyRad('ekSparSkotare')!);
    expect(egna().ekSparSkotare).toBe(true);
    expect(menyPa('ekSparSkotare')).toBe(true);
    await vantaTills(() => sparRoller().length === 1);
    expect(sparRoller()).toEqual(['skotare']);
  });

  it('Vida saknar traktgräns: raden är grå med meningen; origot ej betrott: planens vägar säger EXAKT att basvägen inte går att placera säkert', async () => {
    vida = { typ: 'saknas' };
    vyn = { ...vyn, kartObjekt: { ...kartObjekt, kartbild_bounds: null } };   // inga bounds + ingen Vida-gräns att kontrollera mot -> origot betros inte
    await montera();
    await oppnaMenyn();
    expect(menyRad('ekVidaGrans')!.getAttribute('data-avstangd')).toBe('1');
    expect(menyRad('ekVidaGrans')!.textContent).toContain(LAGER_TEXT.vidaIngen);
    expect(document.querySelector('[data-testid=karta]')!.getAttribute('data-origo')).toBe('');
    expect(menyRad('ekPlanVagar')!.getAttribute('data-avstangd')).toBe('1');
    expect(menyRad('ekPlanVagar')!.textContent).toContain('Basvägen går inte att placera säkert på kartan');
  });

  it('en avstängd rad visar "av" även när det sparade valet säger ja - och valet ligger kvar', async () => {
    localStorage.setItem(LAGER_LAGRING, JSON.stringify({ ekSparSkordare: true, ekVidaGrans: true }));
    vida = { typ: 'saknas' };
    hamtaHyttspar.mockImplementation(async () => []);
    await montera();
    await oppnaMenyn();
    await vantaTills(() => /Inget hyttspår för det här objektet/.test(menyRad('ekSparSkordare')?.textContent ?? ''));
    expect(menyPa('ekSparSkordare')).toBe(false);
    expect(menyPa('ekVidaGrans')).toBe(false);
    expect(egna().ekVidaGrans).toBe(true);   // valet ligger kvar och gäller på ett objekt där lagret finns
  });
});

describe('FEL ÄR ETT FEL: spåret som inte gick att läsa, och ett nytt försök när menyn öppnas igen', () => {
  it('fel -> "Kunde inte läsas" (aldrig "inget spår"); menyn öppnas igen -> ett nytt försök som lyckas', async () => {
    hamtaHyttspar.mockRejectedValueOnce(new Error('nät'));
    await montera();
    await oppnaMenyn();
    await vantaTills(() => (menyRad('ekSparSkordare')?.textContent ?? '').includes(LAGER_TEXT.sparFel));
    expect(menyRad('ekSparSkordare')!.textContent).not.toContain('Inget hyttspår för det här objektet');
    expect(hamtaHyttspar).toHaveBeenCalledTimes(1);
    // Stäng och öppna igen.
    await klick(document.querySelector('[data-lager]')!.closest('[style*="position: fixed"]')!.querySelector('div')!.firstElementChild!);
    await vantaTills(() => !document.querySelector('[data-lager]'));
    await oppnaMenyn();
    await vantaTills(() => /4 dagar/.test(menyRad('ekSparSkordare')?.textContent ?? ''));
    expect(hamtaHyttspar).toHaveBeenCalledTimes(2);
  });
});

describe('VALET HÅLLER medan man går, och sparas per enhet', () => {
  it('tänd, svara på en bricka, markera en annan punkt, byt arkläge: valet ligger kvar och ingen annan rad ändras', async () => {
    await montera();
    await oppnaMenyn();
    await vantaTills(() => /4 dagar/.test(menyRad('ekSparSkordare')?.textContent ?? ''));
    await klick(menyRad('ekVidaGrans')!);
    await klick(menyRad('ekSparSkordare')!);
    const val = egna();
    expect(val).toMatchObject({ ekVidaGrans: true, ekSparSkordare: true, ekSparSkotare: false });
    await markera('p1');
    await klick(document.querySelector('[data-bricka-id=u3]')!);
    await klick(document.querySelector('[data-testid=ark-grepp]')!);
    await klick(document.querySelector('[data-testid=ark-grepp]')!);
    expect(egna()).toEqual(val);
    expect(JSON.parse(localStorage.getItem(LAGER_LAGRING)!)).toMatchObject({ ekVidaGrans: true, ekSparSkordare: true });
  });

  it('omladdning (ny montering): det sparade valet kommer tillbaka - och spåret hämtas för att det är tänt, utan att menyn öppnas', async () => {
    localStorage.setItem(LAGER_LAGRING, JSON.stringify({ ekSparSkotare: true, ekVidaGrans: true, ekPunkter: false }));
    await montera();
    await vantaTills(() => egna().ekSparSkotare === true);
    expect(egna()).toMatchObject({ ekSparSkotare: true, ekVidaGrans: true, ekPunkter: false });
    await vantaTills(() => hamtaHyttspar.mock.calls.length === 1);
    await vantaTills(() => sparRoller().includes('skotare'));
  });

  it('tomt eller trasigt minne: standarden, sidan fungerar', async () => {
    localStorage.setItem(LAGER_LAGRING, '{trasigt');
    await montera();
    expect(egna()).toEqual(LAGER_STANDARD);
  });
});

describe('KNAPPEN "Visa hyttspåret" (Basväg-punkten)', () => {
  it('syns BARA när en basväg är markerad - inte för en vanlig punkt, inte utan markering', async () => {
    await montera();
    expect(spColl()).toBeNull();
    await markera('p1');
    expect(spColl()).toBeNull();
    await markera('b1');
    await vantaTills(() => !!spColl());
    expect(spColl()!.textContent).toContain('Visa hyttspåret');
    await markera('p1');
    expect(spColl()).toBeNull();
  });

  it('markeringen hämtar spåret (så knappen vet om det finns något) men TÄNDER ingenting', async () => {
    await montera();
    await markera('b1');
    await vantaTills(() => hamtaHyttspar.mock.calls.length === 1);
    // Datan når kartan (så ett tänt lager kan ritas direkt), men lagret är SLÄCKT: det avgör egnaVarden, och de är oförändrade.
    await vantaTills(() => sparRoller().length === 2 && !!spColl());
    expect(egna()).toEqual(LAGER_STANDARD);
  });

  it('ETT tryck tänder spåret för de roller som finns + planens vägar; menyn står på "på" - och ett tryck till släcker allt igen', async () => {
    await montera();
    await markera('b1');
    await vantaTills(() => !!spColl() && /Visa/.test(spColl()!.textContent!));
    await klick(spColl()!.querySelector('button')!);
    expect(egna()).toMatchObject({ ekSparSkordare: true, ekSparSkotare: true, ekPlanVagar: true, ekPunkter: true });
    await vantaTills(() => sparRoller().length === 2);
    expect(spColl()!.textContent).toContain('Dölj hyttspåret');
    expect(spColl()!.getAttribute('data-lage')).toBe('dolj');
    // MENYN LJUGER INTE: samma värden.
    await oppnaMenyn();
    for (const id of ['ekSparSkordare', 'ekSparSkotare', 'ekPlanVagar']) expect(menyPa(id), id).toBe(true);
    expect(menyPa('ekVidaGrans')).toBe(false);
    // ... och ett tryck till på knappen släcker allt igen (menyn stängs först: den ligger över knappen).
    await klick(menyRad('ekSparSkotare')!);          // man släcker skotaren i menyn ...
    expect(egna().ekSparSkotare).toBe(false);
    expect(menyPa('ekSparSkotare')).toBe(false);
    expect(spColl()!.getAttribute('data-lage')).toBe('visa');   // ... och knappen följer: allt är inte längre på
  });

  it('Vällust: knappen tänder bara skotaren (skördaren har inget spår)', async () => {
    hamtaHyttspar.mockImplementation(async () => [SPAR_BEGGE[1]]);
    await montera();
    await markera('b1');
    await vantaTills(() => !!spColl() && sparRoller().length === 1);
    await klick(spColl()!.querySelector('button')!);
    expect(egna()).toMatchObject({ ekSparSkordare: false, ekSparSkotare: true, ekPlanVagar: true });
    expect(sparRoller()).toEqual(['skotare']);
  });

  it('Ulfsnäs: inget spår -> ingen knapp utan en dämpad rad som säger det, och trycket ändrar inget', async () => {
    hamtaHyttspar.mockImplementation(async () => []);
    await montera();
    await markera('b1');
    await vantaTills(() => !!document.querySelector('[data-testid=spar-knapp-ingen]'));
    expect(document.querySelector('[data-testid=spar-knapp-ingen]')!.textContent).toBe('Inget hyttspår');
    expect(spColl()).toBeNull();
    expect(egna()).toEqual(LAGER_STANDARD);
  });

  it('spåret kunde inte läsas: en dämpad rad, aldrig "inget hyttspår"', async () => {
    hamtaHyttspar.mockRejectedValue(new Error('nät'));
    await montera();
    await markera('b1');
    await vantaTills(() => !!document.querySelector('[data-testid=spar-knapp-ingen]'));
    expect(document.querySelector('[data-testid=spar-knapp-ingen]')!.textContent).toBe('Spåret kunde inte läsas');
  });

  it('DOCKAN VÄXER INTE: Basväg-punkten har samma rad och samma knappar som vilken punkt som helst (knappen bor vid kartan, inte i raden)', async () => {
    await montera();
    await markera('p1');
    const radP = document.querySelector('[data-testid=bricka-rad]')!;
    const knapparP = radP.querySelectorAll('button').length;
    await markera('b1');
    const radB = document.querySelector('[data-testid=bricka-rad]')!;
    expect(radB.querySelectorAll('button').length).toBe(knapparP);
    expect(radB.textContent).not.toContain('hyttspåret');
    expect(document.querySelector('[data-testid=ark-dock]')!.textContent).not.toContain('hyttspåret');
  });
});
