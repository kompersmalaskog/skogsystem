// @vitest-environment jsdom
// RAMEN (PR 4) renderad för riktigt: kartan som hela vyn, huvudet, arket med dockan och brickorna. Kartan är utbytt mot en stubb.
//
// EN REGEL: TRYCK MARKERAR, RADEN SVARAR. Det som får gå sönder tyst:
//  - ett tryck på en BESVARAD bricka skriver ett svar (ett oavsiktligt tryck med handske ändrar då ett svar som redan står),
//  - ett tryck på en obesvarad bricka skriver något annat än Bra, eller inte markerar den,
//  - en knapp i raden skriver fel svar (Godkänt blir Bra),
//  - en avslutad runda går att svara på,
//  - kartan eller markeringen flyttar sig när man svarat (avsteg 3),
//  - stubbehandlingen eller en observation blir en bricka, eller räknas in i "N kvar",
//  - en runda utan koordinater får ingen karta eller inga brickor,
//  - hookordningen: nya hooks efter en tidig retur kraschar sidan (React #310).
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
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: () => hamtaRunda(),
    kompletteraRunda: async () => ({ tillagda: [] }),
    svaraPaPunkt: (id: string, s: string, d: string) => svaraPaPunkt(id, s, d),
    angraForstaSvaret: (id: string, d: string, s: string) => angraForstaSvaret(id, d, s),
    avslutaRunda: () => avslutaRunda(),
    hamtaFoton: async () => foton,
    hamtaProvytor: async () => [],
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

const kartObjekt = { lat: 56.05, lng: 14.05, vo_nummer: '1', kartbild_url: null, kartbild_bounds: [[56.0, 14.0], [56.1, 14.1]] };

beforeEach(() => {
  klockForskott = 0;
  const verkligNu = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => verkligNu() + klockForskott);
  localStorage.clear();
  foton = [];
  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();
  positionen = { status: 'ok', position: { lat: 56.0501, lng: 14.0502, noggrannhet: 6 }, skal: null, senasteNoggrannhet: 6, forsokIgen: () => {} };
  vyn = {
    objektNamn: 'Ravemåla', objektStatus: 'pagaende', kartObjekt, egenkontroll: RUNDA,
    punkter: [rad('p1', { ordning: 1 }), rad('p2', { ordning: 2, status: 'ok' }), ...utforande()],
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

describe('ramen: kartan är hela vyn, med huvud, ark och dock', () => {
  it('sidan monterar (hookordning): karta, huvud med namn och ETT tal, ark i dock-läget, brickor', async () => {
    await montera();
    expect(document.querySelector('[data-testid=karta]')).not.toBeNull();
    expect(huvud().textContent).toContain('Ravemåla');
    expect(ark().getAttribute('data-lage')).toBe('dock');
    expect(brickor()).toHaveLength(11);
  });

  it('huvudets tal är vad som återstår: planpunkter + utförande, aldrig observationer — och byter till "Avslutad" på en klar runda', async () => {
    // p1 obesvarad (1) + 11 utförande obesvarade = 12 kvar. p2 är besvarad. Observationerna delas bort vid källan och räknas aldrig.
    vyn = { ...vyn, observationer: [{ ...rad('o1', { ordning: 0, del: 'observation', kalla: 'observation', grupp: null, status: 'bra', avvikelse_typ: 'korspar', lat: 56.05, lng: 14.05 }) }] };
    await montera();
    expect(huvud().textContent).toContain('12 kvar');
    expect(huvud().textContent).not.toContain('13 kvar');
  });

  it('TIO brickor på gallring, ELVA på slutavverkning — och stubbehandlingen (mätning) är ingen bricka utan ligger i arket', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, objekt_typ: 'gallring' }, punkter: [rad('p1'), ...utforande('gallring'), rad('stubbe', { ordning: 40, del: 'matning', kalla: 'fast', grupp: null, punkt_typ: 'stubbehandling', rubrik: 'Stubbehandling', geometri_snapshot: null })] };
    await montera();
    expect(brickor()).toHaveLength(10);
    expect(brickor().map((b) => b.getAttribute('data-bricka-id'))).not.toContain('stubbe');
    // ...men den finns i arkets Mätningar (en mätning, inget betyg).
    expect(ark().textContent).toContain('Stubbehandling');
    expect(ark().textContent).toContain('Mät stubbehandling');
  });

  it('Notera här, Lager och Centrera ligger vid kartan; kommentaren i arket, inte som en knapp vid kartan', async () => {
    await montera();
    const notera = knappar().find((b) => b.textContent?.includes('Notera här'))!;
    expect(notera).toBeDefined();
    expect(Number.parseInt(notera.style.minHeight, 10)).toBeGreaterThanOrEqual(52);
    expect(knappar().some((b) => b.getAttribute('aria-label') === 'Kartlager')).toBe(true);
    expect(document.querySelector('[data-testid=centrera-knapp]')).not.toBeNull();
    expect(ark().contains(document.querySelector('[data-testid=kommentar-rad]'))).toBe(true);
  });

  it('greppet och huvudets namn växlar dock ↔ hel (inget mellanläge); innehållet under brickorna är inte nåbart i dock-läget', async () => {
    await montera();
    expect(document.querySelector('[data-testid=ark-innehall]')!.hasAttribute('inert')).toBe(true);
    await klick(document.querySelector('[data-testid=ark-grepp]')!);
    expect(ark().getAttribute('data-lage')).toBe('hel');
    expect(document.querySelector('[data-testid=ark-innehall]')!.hasAttribute('inert')).toBe(false);
    await klick(document.querySelector('[data-testid=ark-grepp]')!);
    expect(ark().getAttribute('data-lage')).toBe('dock');
    await klick(huvud().querySelector('button')!);
    expect(ark().getAttribute('data-lage')).toBe('hel');
    // Lägena är exakt två — ett värde "halv" får aldrig förekomma.
    expect(document.querySelector('[data-lage=halv]')).toBeNull();
  });
});

describe('TRYCK MARKERAR, RADEN SVARAR', () => {
  it('tryck på en OBESVARAD bricka: markeras OCH får Bra (utförande), med Ångra', async () => {
    await montera();
    expect(raden()).toBeNull();
    await klick(bricka('u3'));
    expect(svaraPaPunkt).toHaveBeenCalledTimes(1);
    expect(svaraPaPunkt).toHaveBeenCalledWith('u3', 'bra', 'utforande');
    expect(bricka('u3').getAttribute('aria-pressed')).toBe('true');
    expect(bricka('u3').getAttribute('data-status')).toBe('bra');
    // Raden visar vad som är markerat och bär svarsknapparna.
    expect(raden()!.textContent).toContain(vyn.punkter.find((p: any) => p.id === 'u3').rubrik);
    expect(document.querySelector('[data-testid=angra-kvitto]')).not.toBeNull();
  });

  it('varje bricka bär svaret i ORD och tecken: ✓ Bra, ~ Godkänt, ! Bättre, Kvar — färg bär aldrig ensam', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 0: { status: 'bra' }, 1: { status: 'godkant' }, 2: { status: 'battre' } })] };
    await montera();
    expect(bricka('u0').textContent).toContain('✓ Bra');
    expect(bricka('u1').textContent).toContain('~ Godkänt');
    expect(bricka('u2').textContent).toContain('! Bättre');
    expect(bricka('u3').textContent).toContain('Kvar');
    expect(bricka('u3').textContent).not.toContain('✓');
  });

  it('tryck på en BESVARAD bricka: markerar bara — SKRIVER ALDRIG ett svar, vilket svar som än står', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 0: { status: 'bra' }, 1: { status: 'godkant' }, 2: { status: 'battre' } })] };
    await montera();
    for (const id of ['u0', 'u1', 'u2']) {
      await klick(bricka(id));
      expect(bricka(id).getAttribute('aria-pressed')).toBe('true');
    }
    expect(svaraPaPunkt).not.toHaveBeenCalled();
    expect(angraForstaSvaret).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid=angra-kvitto]')).toBeNull();
  });

  it('en markerad bricka visar FYRA knappar: Bra, Godkänt, Bättre och Foto · Not — den nuvarande är intryckt', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 4: { status: 'godkant' } })] };
    await montera();
    await klick(bricka('u4'));
    const svar = Array.from(raden()!.querySelectorAll('button')).map((b) => b.getAttribute('data-svar'));
    expect(svar).toEqual(['bra', 'godkant', 'battre', 'foto-not']);
    expect(Array.from(raden()!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Bra', 'Godkänt', 'Bättre', 'Foto · Not']);
    expect(radKnapp('godkant')!.getAttribute('aria-pressed')).toBe('true');
    expect(radKnapp('bra')!.getAttribute('aria-pressed')).toBe('false');
    for (const k of Array.from(raden()!.querySelectorAll('button'))) expect(Number.parseInt((k as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(48);
  });

  it('RADEN ÄNDRAR SVARET: varje knapp skriver SITT eget svar mot den markerade punkten', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 5: { status: 'bra' } })] };
    await montera();
    await klick(bricka('u5'));
    await klick(radKnapp('godkant')!);
    expect(svaraPaPunkt).toHaveBeenLastCalledWith('u5', 'godkant', 'utforande');
    efterSkyddet();
    await klick(radKnapp('battre')!);
    expect(svaraPaPunkt).toHaveBeenLastCalledWith('u5', 'battre', 'utforande');
    efterSkyddet();
    await klick(radKnapp('bra')!);
    expect(svaraPaPunkt).toHaveBeenLastCalledWith('u5', 'bra', 'utforande');
    // ...och aldrig mot en annan punkt.
    for (const anrop of svaraPaPunkt.mock.calls) expect(anrop[0]).toBe('u5');
  });

  it('trycket på den fyllda knappen (samma svar igen) skriver ingenting nytt', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 5: { status: 'bra' } })] };
    await montera();
    await klick(bricka('u5'));
    await klick(radKnapp('bra')!);
    expect(svaraPaPunkt).not.toHaveBeenCalled();
  });

  it('Foto · Not öppnar punkten med foto och kommentar (arket "foto"), inte ett svar', async () => {
    await montera();
    await klick(bricka('u2'));
    svaraPaPunkt.mockClear();
    await klick(radKnapp('foto-not')!);
    const s = document.querySelector('[data-testid=avv-sheet]')!;
    expect(s.getAttribute('data-lage')).toBe('foto');
    expect(s.getAttribute('data-punkt')).toBe('u2');
    expect(svaraPaPunkt).not.toHaveBeenCalled();
  });

  it('ÅNGRA tar tillbaka ett svar som ett TRYCK skrev: punkten blir obesvarad igen', async () => {
    await montera();
    await klick(bricka('u1'));
    expect(bricka('u1').getAttribute('data-status')).toBe('bra');
    await klick(Array.from(document.querySelectorAll('[data-testid=angra-kvitto] button')).find((b) => b.textContent === 'Ångra')!);
    expect(angraForstaSvaret).toHaveBeenCalledWith('u1', 'utforande', 'bra');
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(bricka('u1').getAttribute('data-status')).toBe('');
    expect(document.querySelector('[data-testid=angra-kvitto]')).toBeNull();
  });

  it('Ångra försvinner när svaret hunnit ändras med raden — annars skulle det skriva över ett annat svar', async () => {
    await montera();
    await klick(bricka('u1'));
    expect(document.querySelector('[data-testid=angra-kvitto]')).not.toBeNull();
    efterSkyddet();
    await klick(radKnapp('godkant')!);
    expect(document.querySelector('[data-testid=angra-kvitto]')).toBeNull();
  });

  it('ett misslyckat svar lämnar brickan obesvarad, säger det, och ger ingen Ångra', async () => {
    svaraPaPunkt.mockRejectedValueOnce(new Error('Kunde inte spara svaret: nät'));
    await montera();
    await klick(bricka('u6'));
    expect(bricka('u6').getAttribute('data-status')).toBe('');
    expect(text()).toContain('Kunde inte spara svaret: nät');
    expect(document.querySelector('[data-testid=angra-kvitto]')).toBeNull();
  });
});

describe('DOCKVAKTEN: två tryck inom skyddstiden ger ETT svar, inte två (handske, kall skärm, tum som studsar)', () => {
  it('dubbeltryck på samma obesvarade bricka: ett svar', async () => {
    await montera();
    await klick(bricka('u3'));
    await klick(bricka('u3'));
    expect(svaraPaPunkt).toHaveBeenCalledTimes(1);
  });

  it('ett andra tryck på ANNAN bricka (där den första flyttat sig) skriver ingenting och markerar ingenting', async () => {
    await montera();
    await klick(bricka('u3'));
    await klick(bricka('u4'));
    expect(svaraPaPunkt).toHaveBeenCalledTimes(1);
    expect(svaraPaPunkt).toHaveBeenCalledWith('u3', 'bra', 'utforande');
    expect(bricka('u4').getAttribute('data-status')).toBe('');
    expect(bricka('u4').getAttribute('aria-pressed')).toBe('false');
    expect(bricka('u3').getAttribute('aria-pressed')).toBe('true');
  });

  it('ett sent tryck i RADEN direkt efter bricktrycket skriver inte över Bra', async () => {
    await montera();
    await klick(bricka('u3'));
    await klick(radKnapp('godkant')!);
    expect(svaraPaPunkt).toHaveBeenCalledTimes(1);
    expect(bricka('u3').getAttribute('data-status')).toBe('bra');
  });

  it('dubbeltryck på en radknapp: ett svar', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 5: { status: 'bra' } })] };
    await montera();
    await klick(bricka('u5'));
    await klick(radKnapp('battre')!);
    await klick(radKnapp('godkant')!);
    expect(svaraPaPunkt).toHaveBeenCalledTimes(1);
    expect(svaraPaPunkt).toHaveBeenCalledWith('u5', 'battre', 'utforande');
  });

  it('efter skyddstiden gäller nästa tryck igen — skyddet är en kort paus, ingen spärr', async () => {
    await montera();
    await klick(bricka('u3'));
    efterSkyddet();
    await klick(bricka('u4'));
    expect(svaraPaPunkt).toHaveBeenCalledTimes(2);
    expect(svaraPaPunkt).toHaveBeenLastCalledWith('u4', 'bra', 'utforande');
  });

  it('ett tryck som bara MARKERAR (besvarad bricka) startar inget skydd: man kan bläddra och sedan svara direkt', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 0: { status: 'bra' } })] };
    await montera();
    await klick(bricka('u0'));
    await klick(bricka('u1'));
    expect(svaraPaPunkt).toHaveBeenCalledTimes(1);
    expect(svaraPaPunkt).toHaveBeenCalledWith('u1', 'bra', 'utforande');
  });
});

describe('planpunkter: markeras på kartan, raden bär OK och Avvikelse', () => {
  it('tryck på en punkt på kartan markerar den (dockan framme), och raden har OK · Avvikelse · Foto · Not', async () => {
    await montera();
    await klick(document.querySelector('[data-testid=karta-punkt-p1]')!);
    expect(document.querySelector('[data-testid=karta]')!.getAttribute('data-vald')).toBe('p1');
    expect(Array.from(raden()!.querySelectorAll('button')).map((b) => b.getAttribute('data-svar'))).toEqual(['ok', 'avvikelse', 'foto-not']);
    expect(svaraPaPunkt).not.toHaveBeenCalled();   // en markering skriver aldrig
  });

  it('OK skriver ok; Avvikelse skrivs ALDRIG rakt av — det öppnar formuläret', async () => {
    await montera();
    await klick(document.querySelector('[data-testid=karta-punkt-p1]')!);
    await klick(radKnapp('avvikelse')!);
    expect(svaraPaPunkt).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid=avv-sheet]')!.getAttribute('data-lage')).toBe('avvikelse');
    await klick(radKnapp('ok')!);
    expect(svaraPaPunkt).toHaveBeenCalledWith('p1', 'ok', 'plan');
  });

  it('AVSTEG 3: att svara flyttar varken markeringen eller kartan — ingen "nästa punkt", ingen kameraflytt', async () => {
    vyn = { ...vyn, punkter: [rad('p1', { ordning: 1 }), rad('p3', { ordning: 3 }), ...utforande()] };
    await montera();
    await klick(document.querySelector('[data-testid=karta-punkt-p1]')!);
    await klick(radKnapp('ok')!);
    const karta = document.querySelector('[data-testid=karta]')!;
    expect(karta.getAttribute('data-vald')).toBe('p1');    // fortfarande p1, inte p3
    expect(karta.getAttribute('data-centrera')).toBe('');  // ingen centrering
    // Markeringen går heller inte vidare av sig själv när positionen finns: inget markerat från start.
    expect(document.querySelectorAll('[data-testid=bricka-rad]')).toHaveLength(1);
  });

  it('ingenting markeras av sig självt — inte ens när positionen finns', async () => {
    await montera();
    expect(document.querySelector('[data-testid=karta]')!.getAttribute('data-vald')).toBe('');
    expect(raden()).toBeNull();
  });
});

describe('en avslutad runda är helt läsbar och låst', () => {
  beforeEach(() => {
    vyn = {
      ...vyn,
      egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-17T12:00:00Z' },
      punkter: [rad('p1', { status: 'ok' }), ...utforande('slutavverkning', { 0: { status: 'bra', kommentar: 'Rishögarna ligger bra' }, 1: { status: null } })],
    };
  });

  it('tryck på brickor markerar men skriver ALDRIG — inte ens på en obesvarad', async () => {
    await montera();
    await klick(bricka('u1'));
    expect(svaraPaPunkt).not.toHaveBeenCalled();
    expect(bricka('u1').getAttribute('aria-pressed')).toBe('true');
    await klick(bricka('u0'));
    expect(svaraPaPunkt).not.toHaveBeenCalled();
  });

  it('raden visar svar och kommentar som text — utan en enda svarsknapp', async () => {
    await montera();
    await klick(bricka('u0'));
    expect(raden()!.getAttribute('data-last')).toBe('1');
    expect(raden()!.textContent).toContain('Rishögarna ligger bra');
    expect(raden()!.querySelectorAll('button')).toHaveLength(0);
    expect(huvud().textContent).toContain('Avslutad');
  });

  it('tryck på en bricka i en AVSLUTAD runda visar svar, kommentar OCH foto — läsbart, utan en enda knapp (inget PDF-krav för att läsa sina anteckningar)', async () => {
    foton = [fotoRad('f1', 'u0', 'runda-1/u0-1.jpg'), fotoRad('f2', 'u0', 'runda-1/u0-2.jpg')];
    await montera();
    await klick(bricka('u0'));
    const r = raden()!;
    expect(r.getAttribute('data-last')).toBe('1');
    expect(r.textContent).toContain('✓ Bra');
    expect(r.textContent).toContain('Rishögarna ligger bra');
    expect(Array.from(r.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['https://signerad/runda-1/u0-1.jpg', 'https://signerad/runda-1/u0-2.jpg']);
    expect(r.querySelectorAll('button')).toHaveLength(0);
    // ...och ligger i dockan (alltid framme), inte bara i hel.
    expect(r.closest('[data-testid=ark-innehall]')).toBeNull();
  });

  it('en planpunkt på kartan i en AVSLUTAD runda visar sin typ (text), kommentar och foto på samma sätt', async () => {
    vyn = { ...vyn, punkter: [rad('p1', { status: 'avvikelse', avvikelse_typ: 'korspar', kommentar: 'Djupa spår vid brynet', besvarad: '2026-10-17T08:00:00Z' }), ...utforande()] };
    foton = [fotoRad('f9', 'p1', 'runda-1/p1-1.jpg')];
    await montera();
    await klick(document.querySelector('[data-testid=karta-punkt-p1]')!);
    const r = raden()!;
    expect(r.textContent).toContain('Punkt p1');
    expect(r.textContent).toContain('Körspår');
    expect(r.textContent).toContain('Djupa spår vid brynet');
    expect(r.querySelector('img')!.getAttribute('src')).toBe('https://signerad/runda-1/p1-1.jpg');
    expect(r.querySelectorAll('button')).toHaveLength(0);
  });

  it('LÅNG anteckning (2000 tecken) och tre foton: raden har en MAXHÖJD och scrollar INOM sig — allt går att nå, rubrikraden står kvar, dockan växer inte med texten', async () => {
    const lang = Array.from({ length: 251 }, (_, i) => `Rad${String(i).padStart(3, '0')}x`).join(' ');
    expect(lang.length).toBeGreaterThanOrEqual(2000);
    vyn = { ...vyn, punkter: [rad('p1', { status: 'ok' }), ...utforande('slutavverkning', { 0: { status: 'bra', kommentar: lang } })] };
    foton = [fotoRad('f1', 'u0', 'runda-1/u0-1.jpg'), fotoRad('f2', 'u0', 'runda-1/u0-2.jpg'), fotoRad('f3', 'u0', 'runda-1/u0-3.jpg')];
    await montera();
    await klick(bricka('u0'));
    const r = raden()!;
    const inne = r.querySelector('[data-testid=bricka-rad-innehall]') as HTMLElement;
    expect(inne).not.toBeNull();
    // Maxhöjden och scrollen ligger på innehållet, inte på hela raden — och maxhöjden är konstanten, inte ett eget tal.
    expect(inne.style.maxHeight).toBe(`${RAD_MAX_DVH}dvh`);
    expect(inne.style.overflowY).toBe('auto');
    // ALLT finns i det som scrollar: hela texten (över 2000 tecken, från första till sista raden) och alla tre fotona.
    expect(inne.textContent).toContain(lang);
    expect(inne.textContent).toContain('Rad000x');
    expect(inne.textContent).toContain('Rad250x');
    expect(Array.from(inne.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([
      'https://signerad/runda-1/u0-1.jpg', 'https://signerad/runda-1/u0-2.jpg', 'https://signerad/runda-1/u0-3.jpg',
    ]);
    // Rubrikraden (namn + svar) ligger UTANFÖR det som scrollar, så man alltid ser vilken bricka det gäller.
    const rubrik = Array.from(r.children).find((c) => c.textContent?.includes('✓ Bra') && !inne.contains(c))!;
    expect(rubrik).toBeDefined();
    expect(inne.contains(rubrik)).toBe(false);
    // Ingen enda knapp, och inget annat i raden har en egen höjdgräns som skulle kapa texten.
    expect(r.querySelectorAll('button')).toHaveLength(0);
  });

  it('en KORT anteckning har samma behållare (maxhöjden bara begränsar — den lägger inte till tomrum)', async () => {
    await montera();
    await klick(bricka('u0'));
    const inne = raden()!.querySelector('[data-testid=bricka-rad-innehall]') as HTMLElement;
    expect(inne).not.toBeNull();
    expect(inne.textContent).toContain('Rishögarna ligger bra');
  });

  it('ingen hjälprad, ingen Notera här, ingen Ångra, ingen avslutsknapp', async () => {
    await montera();
    expect(text()).not.toContain('Tryck på en bricka = Bra');
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(false);
    expect(document.querySelector('[data-testid=avsluta-knapp]')).toBeNull();
  });
});

describe('RUNDA UTAN KOORDINATER: tom kartbakgrund, förklarande rad, brickorna fungerar', () => {
  beforeEach(() => {
    vyn = {
      objektNamn: 'Utan plats', objektStatus: 'pagaende', egenkontroll: RUNDA, observationer: [],
      kartObjekt: { lat: null, lng: null, vo_nummer: null, kartbild_url: null, kartbild_bounds: null },
      // Planpunkter utan geometri (inget att placera) + hela utförandet.
      punkter: [rad('p1', { geometri_snapshot: null }), ...utforande()],
    };
    positionen = { status: 'saknas', position: null, skal: 'ingen_gps', senasteNoggrannhet: null, forsokIgen: () => {} };
  });

  it('kartan visas ändå (tom bakgrund, inga markeringar: origo null) och förklaringen skickas till kartan — inte en lista i dess ställe', async () => {
    await montera();
    const karta = document.querySelector('[data-testid=karta]')!;
    expect(karta).not.toBeNull();
    expect(karta.getAttribute('data-origo')).toBe('null');
    expect(karta.getAttribute('data-origotext')!.length).toBeGreaterThan(10);
    expect(text()).not.toContain('Hämtar rundan');
    expect(huvud().textContent).toContain('Utan plats');
  });

  it('brickorna finns och fungerar: ett tryck ger Bra, raden svarar', async () => {
    await montera();
    expect(brickor()).toHaveLength(11);
    await klick(bricka('u0'));
    expect(svaraPaPunkt).toHaveBeenCalledWith('u0', 'bra', 'utforande');
    efterSkyddet();
    await klick(radKnapp('battre')!);
    expect(svaraPaPunkt).toHaveBeenLastCalledWith('u0', 'battre', 'utforande');
  });

  it('Centrera är dold utan position, men Notera här och Lager finns', async () => {
    await montera();
    expect(document.querySelector('[data-testid=centrera-knapp]')!.getAttribute('aria-hidden')).toBe('true');
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(true);
  });
});

describe('HEL-LÄGET: rundan, inte punkterna', () => {
  // Utförandepunkterna bor i dockan och planpunkterna på kartan. En punkt som också har en rad i hel går att namnge och markera på två ställen -
  // den gamla frågelistan tillbaka bakom ett drag. Hel innehåller rundan: namn och åtgärd, kommentaren, mätningarna, observationerna, avslutet.
  const innehall = () => document.querySelector('[data-testid=ark-innehall]') as HTMLElement;
  const oppnaHel = async () => { await klick(document.querySelector('[data-testid=ark-grepp]')!); };

  it('INGEN punkts namn och ingen svarsknapp renderas i hel — varken planpunkt eller utförandepunkt; brickorna finns bara i dockan', async () => {
    await montera();
    await oppnaHel();
    expect(ark().getAttribute('data-lage')).toBe('hel');
    const h = innehall();
    for (const p of vyn.punkter) expect(h.textContent, `hel nämner "${p.rubrik}"`).not.toContain(p.rubrik);
    expect(h.querySelector('[data-testid=plan-rad]')).toBeNull();
    expect(h.querySelector('[data-testid=bricka]')).toBeNull();
    expect(h.querySelector('[data-testid=bricka-rad]')).toBeNull();
    expect(h.querySelector('[data-svar]')).toBeNull();
    expect(h.querySelector('[data-testid=plan-utan-plats]')).toBeNull();
    expect(brickor()).toHaveLength(11);
    for (const b of brickor()) expect(h.contains(b)).toBe(false);
  });

  it('en markerad punkt har sin rad i DOCKAN, aldrig i hel', async () => {
    await montera();
    await klick(bricka('u2'));
    await oppnaHel();
    expect(raden()).not.toBeNull();
    expect(innehall().contains(raden())).toBe(false);
    expect(innehall().textContent).not.toContain(vyn.punkter.find((p: any) => p.id === 'u2').rubrik);
  });

  it('hel innehåller rundan: objektets namn och åtgärd, kommentaren och Avsluta rundan', async () => {
    await montera();
    await oppnaHel();
    const h = innehall();
    const rubrik = h.querySelector('[data-testid=rund-rubrik]')!;
    expect(rubrik.textContent).toContain('Ravemåla');
    expect(rubrik.textContent).toContain('Slutavverkning');
    expect(h.contains(document.querySelector('[data-testid=kommentar-rad]'))).toBe(true);
    expect(h.contains(document.querySelector('[data-testid=avsluta-knapp]'))).toBe(true);
  });

  it('åtgärden följer rundans typ: Gallring på en gallringsrunda', async () => {
    vyn = { ...vyn, egenkontroll: { ...RUNDA, objekt_typ: 'gallring' }, punkter: [rad('p1'), ...utforande('gallring')] };
    await montera();
    await oppnaHel();
    expect(innehall().querySelector('[data-testid=rund-rubrik]')!.textContent).toContain('Gallring');
  });

  it('en AVSLUTAD runda listar inte heller punkterna i hel (förut ett dokument per punkt) — bara rundan och rapporten', async () => {
    vyn = {
      ...vyn,
      egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-17T12:00:00Z' },
      punkter: [rad('p1', { status: 'ok' }), ...utforande('slutavverkning', { 0: { status: 'bra', kommentar: 'Rishögarna ligger bra' } })],
    };
    await montera();
    await oppnaHel();
    const h = innehall();
    for (const p of vyn.punkter) expect(h.textContent, `hel nämner "${p.rubrik}"`).not.toContain(p.rubrik);
    expect(h.textContent).not.toContain('Rishögarna ligger bra');
    expect(h.textContent).not.toContain('Utförandet');
    expect(h.textContent).toContain('Avslutad');
  });

  it('mätningarna (stubbehandling) ligger kvar i hel — de är inga brickor och har ingen annan väg in', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande(), rad('stubbe', { ordning: 40, del: 'matning', kalla: 'fast', grupp: null, punkt_typ: 'stubbehandling', rubrik: 'Stubbehandling', geometri_snapshot: null })] };
    await montera();
    await oppnaHel();
    expect(innehall().textContent).toContain('Mät stubbehandling');
  });
});

describe('HEL-LÄGET: planpunkter UTAN markering på kartan är det enda som får en rad (annars omöjliga att besvara)', () => {
  const innehall = () => document.querySelector('[data-testid=ark-innehall]') as HTMLElement;
  const utanPlats = () => ({
    objektNamn: 'Utan plats', objektStatus: 'pagaende', egenkontroll: RUNDA, observationer: [],
    kartObjekt: { lat: null, lng: null, vo_nummer: null, kartbild_url: null, kartbild_bounds: null },
    punkter: [rad('p1', { geometri_snapshot: null }), rad('p2', { ordning: 2, geometri_snapshot: null, status: 'ok' }), ...utforande()],
  });
  beforeEach(() => {
    positionen = { status: 'saknas', position: null, skal: 'ingen_gps', senasteNoggrannhet: null, forsokIgen: () => {} };
  });

  it('utan kartplacering listas planpunkterna under en egen rubrik, och ett tryck MARKERAR (raden i dockan svarar)', async () => {
    vyn = utanPlats();
    await montera();
    const block = innehall().querySelector('[data-testid=plan-utan-plats]')!;
    expect(block).not.toBeNull();
    expect(block.textContent).toContain('Punkter utan markering på kartan');
    // Ingen felton: ett objekt utan Vida-traktgräns är ingen felaktighet (Brokamåla 1:5 V), och rubriken ska inte låta som en.
    expect(block.textContent).not.toMatch(/saknar|fel|kan inte/i);
    expect(block.querySelectorAll('[data-testid=plan-rad]')).toHaveLength(2);
    expect(svaraPaPunkt).not.toHaveBeenCalled();
    await klick(block.querySelector('[data-testid=plan-rad]')!);
    expect(svaraPaPunkt).not.toHaveBeenCalled();
    expect(raden()!.textContent).toContain('Punkt p1');
    expect(radKnapp('ok')).not.toBeNull();
    expect(innehall().contains(raden())).toBe(false);
  });

  it('en punkt har EN väg in: finns den på kartan har den ingen rad, saknas den finns den bara i listan', async () => {
    await montera(); // standardrundan: båda planpunkterna har en plats
    expect(innehall().querySelector('[data-testid=plan-utan-plats]')).toBeNull();
    expect(document.querySelector('[data-testid=karta-punkt-p1]')).not.toBeNull();
    await act(async () => { root!.unmount(); });
    host?.remove();
    vyn = utanPlats();
    await montera();
    expect(innehall().querySelector('[data-testid=plan-utan-plats]')).not.toBeNull();
  });

  it('en avslutad runda har ingen sådan lista', async () => {
    vyn = { ...utanPlats(), egenkontroll: { ...RUNDA, status: 'klar', klar: '2026-10-17T12:00:00Z' } };
    await montera();
    expect(innehall().querySelector('[data-testid=plan-utan-plats]')).toBeNull();
  });
});

describe('arket dras i greppet: två lägen med riktig höjd (offsetHeight stubbad — jsdom har ingen layout)', () => {
  const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  beforeEach(() => {
    // Arket är 688 högt (max), dockan (greppet + raden + brickorna) 260 och innehållet långt (900): hel = max.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.getAttribute('data-testid') === 'rund-ark') return 688;
        if (this.getAttribute('data-testid') === 'ark-innehall-inre') return 900;
        if (this.parentElement?.getAttribute('data-testid') === 'rund-ark' && this === this.parentElement.firstElementChild) return 260;
        return 0;
      },
    });
  });
  afterEach(() => { if (orig) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', orig); });

  const peka = (typ: string, y: number) => new MouseEvent(typ, { bubbles: true, cancelable: true, clientY: y });
  const dra = async (fran: number, till: number) => {
    const g = document.querySelector('[data-testid=ark-grepp]')!;
    await act(async () => { g.dispatchEvent(peka('pointerdown', fran)); });
    await act(async () => { g.dispatchEvent(peka('pointermove', (fran + till) / 2)); g.dispatchEvent(peka('pointermove', till)); });
    // En riktig webbläsare skickar ett KLICK direkt efter pointerup på samma element (samma uppgift) — också efter ett drag. Arket ska inte
    // tolka det som ett tryck på greppet.
    await act(async () => { g.dispatchEvent(peka('pointerup', till)); (g as HTMLElement).click(); });
  };

  it('dra upp förbi mitten: hel (då göms sidoknapparna); dra ned igen: tillbaka till dock; ett kort drag uppåt lämnar dockan', async () => {
    await montera();
    expect(ark().getAttribute('data-lage')).toBe('dock');
    await dra(600, 500);                       // 100 px upp: närmast dock
    expect(ark().getAttribute('data-lage')).toBe('dock');
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(true);
    await dra(600, 300);                       // 300 px upp: närmast hel
    expect(ark().getAttribute('data-lage')).toBe('hel');
    // I hel ligger arket under huvudet: sidoknapparna skulle hamna ovanpå det och göms.
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(false);
    expect(knappar().some((b) => b.getAttribute('aria-label') === 'Kartlager')).toBe(false);
    // Brickorna finns kvar överst i arket i alla lägen.
    expect(brickor()).toHaveLength(11);
    await dra(100, 800);                       // långt ned: dock
    expect(ark().getAttribute('data-lage')).toBe('dock');
    expect(knappar().some((b) => /Notera här/.test(b.textContent ?? ''))).toBe(true);
  });

  it('ett kort drag (under tröskeln) lämnar arket kvar, och ett drag räknas inte som ett tryck på greppet', async () => {
    await montera();
    await dra(600, 580);                       // 20 px: under tröskeln
    expect(ark().getAttribute('data-lage')).toBe('dock');
    await dra(600, 300);
    expect(ark().getAttribute('data-lage')).toBe('hel');   // draget landade i hel — och klicket efter draget växlade INTE tillbaka
  });
});

describe('HEL FÖLJER SITT INNEHÅLL (offsetHeight stubbad — jsdom har ingen layout)', () => {
  const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  let innre = 300;
  beforeEach(() => {
    innre = 300;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.getAttribute('data-testid') === 'rund-ark') return 688;                       // max: skärmen 760 minus huvudet 72
        if (this.getAttribute('data-testid') === 'ark-innehall-inre') return innre;            // innehållets egen höjd
        if (this.parentElement?.getAttribute('data-testid') === 'rund-ark' && this === this.parentElement.firstElementChild) return 260;  // dockan
        return 0;
      },
    });
  });
  afterEach(() => { if (orig) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', orig); });

  const forskjutning = () => Number.parseInt((ark().style.transform.match(/translateY\((-?\d+)px\)/) ?? [])[1] ?? 'x', 10);
  const synligHojd = () => 688 - forskjutning();
  const oppnaHel = async () => { await klick(document.querySelector('[data-testid=ark-grepp]')!); };

  it('KORT innehåll: hel är dock + innehåll (560), inte hela skärmen — kartan syns ovanför; dockan är orörd (260)', async () => {
    await montera();
    expect(synligHojd()).toBe(260);
    await oppnaHel();
    expect(ark().getAttribute('data-lage')).toBe('hel');
    expect(synligHojd()).toBe(560);
  });

  it('LÅNGT innehåll: hel är max (688, skärmen minus huvudet) — aldrig högre', async () => {
    innre = 2000;
    await montera();
    await oppnaHel();
    expect(synligHojd()).toBe(688);
  });

  it('TOM runda: hel är minst dock + minimum (460) — inte en lucka', async () => {
    innre = 0;
    await montera();
    await oppnaHel();
    expect(synligHojd()).toBe(260 + 200);
  });

  it('SIDOKNAPPARNA är gömda i hel också när det finns karta ovanför (kort innehåll) och framme i dock — de kommer inte och går med innehållets längd', async () => {
    const sidoknappar = () => ({
      notera: knappar().some((b) => /Notera här/.test(b.textContent ?? '')),
      lager: knappar().some((b) => b.getAttribute('aria-label') === 'Kartlager'),
      centrera: document.querySelector('[data-testid=centrera-knapp]') !== null,
    });
    for (const hojd of [0, 300, 2000]) {
      innre = hojd;
      await montera();
      expect(sidoknappar(), `dock, innehåll ${hojd}`).toEqual({ notera: true, lager: true, centrera: true });
      await oppnaHel();
      expect(synligHojd() < 688 || hojd === 2000).toBe(true);     // kort innehåll: kartan syns ovanför — knapparna är ändå borta
      expect(sidoknappar(), `hel, innehåll ${hojd}`).toEqual({ notera: false, lager: false, centrera: false });
      await act(async () => { root!.unmount(); });
      host?.remove();
    }
  });

  it('dockan är densamma oavsett innehåll', async () => {
    for (const h of [0, 300, 2000]) {
      innre = h;
      await montera();
      expect(synligHojd()).toBe(260);
      await act(async () => { root!.unmount(); });
      host?.remove();
    }
  });

  it('kartans mätpunkt följer det som syns: överkanten av arket är dock respektive hel', async () => {
    await montera();
    const mal = () => Number.parseInt((document.querySelector('[data-testid=ark-mal]') as HTMLElement).style.bottom, 10) + 1;
    expect(mal()).toBe(260);
    await oppnaHel();
    expect(mal()).toBe(560);
  });

  it('innehållet i hel är inert i dock och nåbart i hel också när hel är lägre än max', async () => {
    await montera();
    expect(document.querySelector('[data-testid=ark-innehall]')!.hasAttribute('inert')).toBe(true);
    await oppnaHel();
    expect(document.querySelector('[data-testid=ark-innehall]')!.hasAttribute('inert')).toBe(false);
  });
});

describe('hjälpraden', () => {
  it('visas bara tills något är besvarat, och aldrig medan något är markerat', async () => {
    await montera();
    expect(text()).toContain('Tryck på en bricka ger Bra');
    await klick(bricka('u0'));
    expect(text()).not.toContain('Tryck på en bricka ger Bra');
  });

  it('syns inte alls när något redan är besvarat', async () => {
    vyn = { ...vyn, punkter: [rad('p1'), ...utforande('slutavverkning', { 0: { status: 'bra' } })] };
    await montera();
    expect(text()).not.toContain('Tryck på en bricka ger Bra');
  });
});

describe('AVSLUT: en bekräftelse som namnger konsekvensen', () => {
  /** Allt besvarat och inga provytor: rundan går att avsluta. */
  const allaSvarade = () => {
    vyn = { ...vyn, punkter: [rad('p1', { status: 'ok' }), rad('p2', { status: 'ok' }), ...utforande('slutavverkning', Object.fromEntries(utforandeKatalog('slutavverkning').map((_, i) => [i, { status: 'bra' }])))] };
  };
  const avslutaKnapp = () => document.querySelector('[data-testid=avsluta-knapp]') as HTMLButtonElement;
  const dialog = () => document.querySelector('[role=dialog][aria-label="Avsluta rundan"]');

  it('knappen avslutar INTE: den öppnar en bekräftelse som säger "Rundan låses och kan inte ändras."', async () => {
    allaSvarade();
    await montera();
    expect(avslutaKnapp().disabled).toBe(false);
    await klick(avslutaKnapp());
    expect(avslutaRunda).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Rundan låses och kan inte ändras.');
  });

  it('"Gå tillbaka" stänger bekräftelsen utan att avsluta; först bekräftelsen avslutar, en gång', async () => {
    allaSvarade();
    await montera();
    await klick(avslutaKnapp());
    await klick(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Gå tillbaka')!);
    expect(dialog()).toBeNull();
    expect(avslutaRunda).not.toHaveBeenCalled();
    await klick(avslutaKnapp());
    await klick(Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Avsluta rundan')!);
    expect(avslutaRunda).toHaveBeenCalledTimes(1);
  });

  it('knappen är låst medan något återstår — och bekräftelsen kan då inte ens öppnas', async () => {
    await montera();   // standardrundan har obesvarade punkter
    expect(avslutaKnapp().disabled).toBe(true);
    await klick(avslutaKnapp());
    expect(dialog()).toBeNull();
    expect(avslutaRunda).not.toHaveBeenCalled();
  });
});

describe('en runda som inte är startad', () => {
  it('inget ark och ingen karta: huvudet och en startknapp', async () => {
    vyn = { objektNamn: 'Ny', objektStatus: 'pagaende', kartObjekt, egenkontroll: null, punkter: [], observationer: [] };
    await montera();
    expect(document.querySelector('[data-testid=rund-ark]')).toBeNull();
    expect(document.querySelector('[data-testid=karta]')).toBeNull();
    expect(text()).toContain('Starta egenkontroll');
    expect(document.querySelector('[data-testid=kart-huvud]')!.textContent).toContain('Ny');
  });
});
