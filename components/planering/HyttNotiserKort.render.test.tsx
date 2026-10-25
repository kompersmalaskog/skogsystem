// @vitest-environment jsdom
/**
 * Kortet "Notiser i hytten" i Inställningar (STEG 1): rapporten, testnotisen och brytaren.
 * Notification, service worker och matchMedia är fejkade; klockan är falsk så att nedräkningen går att köra.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HyttNotiserKort, { TEST_FORDROJNING_S } from './HyttNotiserKort';

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let sw: EventTarget & { getRegistration?: any; ready?: any; register?: any };
const visa = vi.fn(async () => undefined);
const stangd = vi.fn();
let behorighet: NotificationPermission = 'granted';
let installerad = true;
let swIgang = true;
let tillstandEfterBe: NotificationPermission = 'granted';

const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const montera = async () => { rot = createRoot(behallare!); await act(async () => { rot!.render(<HyttNotiserKort />); }); await flush(); };
const q = (id: string) => behallare!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tryck = async (el: HTMLElement | null) => { expect(el).not.toBeNull(); await act(async () => { el!.click(); }); await flush(); };
const tick = async (s: number) => { for (let i = 0; i < s; i++) { await act(async () => { vi.advanceTimersByTime(1000); }); await flush(); } };
const meddelande = async (data: unknown) => { await act(async () => { sw.dispatchEvent(new MessageEvent('message', { data })); }); await flush(); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  localStorage.clear(); visa.mockClear(); stangd.mockClear();
  behorighet = 'granted'; installerad = true; swIgang = true; tillstandEfterBe = 'granted';
  const reg = { active: {}, showNotification: visa, getNotifications: async () => [{ tag: 'hytt-test', data: { hytt: true }, close: stangd }] };
  sw = Object.assign(new EventTarget(), { getRegistration: async () => (swIgang ? reg : undefined), ready: Promise.resolve(reg), register: async () => reg });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  const N: any = function () { /* */ };
  Object.defineProperty(N, 'permission', { configurable: true, get: () => behorighet });   // Object.assign skulle frysa getter-värdet
  N.requestPermission = async () => { behorighet = tillstandEfterBe; return behorighet; };
  (globalThis as any).Notification = N;
  (window as any).Notification = (globalThis as any).Notification;
  window.matchMedia = ((q: string) => ({ matches: installerad && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as any;
  behallare = document.createElement('div'); document.body.appendChild(behallare);
});
afterEach(() => { act(() => { rot?.unmount(); }); rot = null; behallare?.remove(); vi.useRealTimers(); });

describe('Notiser i hytten — rapporten', () => {
  it('allt klart: "Redo för testnotis" och alla fyra som appen ser är Ok', async () => {
    await montera();
    expect(behallare!.textContent).toContain('Redo för testnotis');
    for (const id of ['stod', 'installerad', 'tillstand', 'sw']) expect(q(`hytt-rapport-${id}`)!.dataset.status).toBe('ok');
    expect(q('hytt-rapport-chrome-bakgrund')!.dataset.status).toBe('kolla');
    expect(q('hytt-rapport-fokus')!.dataset.status).toBe('kolla');
  });

  it('inte installerad och inte tillåtet: räknar och stänger av testknappen', async () => {
    installerad = false; behorighet = 'default';
    await montera();
    expect(behallare!.textContent).toContain('2 saker att fixa');
    expect((q('hytt-skicka-test') as HTMLButtonElement).disabled).toBe(true);
    expect(q('hytt-tillat')).not.toBeNull();
  });

  it('Tillåt notiser ber om tillstånd och läser om rapporten', async () => {
    behorighet = 'default'; tillstandEfterBe = 'granted';
    await montera();
    await tryck(q('hytt-tillat'));
    expect(q('hytt-rapport-tillstand')!.dataset.status).toBe('ok');
    expect(q('hytt-tillat')).toBeNull();
  });

  it('blockerade notiser: ingen Tillåt-knapp (Chrome frågar inte igen), raden säger var man ändrar', async () => {
    behorighet = 'denied';
    await montera();
    expect(q('hytt-tillat')).toBeNull();
    expect(q('hytt-rapport-tillstand')!.textContent).toContain('lås-symbolen');
  });
});

describe('Notiser i hytten — testnotisen', () => {
  it(`skickas efter ${TEST_FORDROJNING_S} s, inte direkt, och resultatet sparas`, async () => {
    await montera();
    await tryck(q('hytt-skicka-test'));
    expect(visa).not.toHaveBeenCalled();
    expect(q('hytt-skicka-test')!.textContent).toContain(`${TEST_FORDROJNING_S} s`);
    await tick(TEST_FORDROJNING_S - 1);
    expect(visa).not.toHaveBeenCalled();
    await tick(1);
    expect(visa).toHaveBeenCalledTimes(1);
    const [titel, valj] = visa.mock.calls[0] as unknown as [string, any];
    expect(titel).toBe('Testnotis från appen');
    expect(valj.requireInteraction).toBe(true);
    expect(valj.actions.map((a: any) => a.action)).toEqual(['uppfattat', 'visa']);
    expect(q('hytt-test-resultat')!.textContent).toContain('Uppfattat ej tryckt än');
  });

  it('Uppfattat från notisen (meddelande från workern) visas och låser upp brytaren', async () => {
    await montera();
    await tryck(q('hytt-skicka-test')); await tick(TEST_FORDROJNING_S);
    expect((q('hytt-brytare') as HTMLButtonElement).disabled).toBe(true);
    await meddelande({ typ: 'hytt-uppfattat', test: true, tid: Date.now() });
    expect(q('hytt-test-resultat')!.textContent).toMatch(/Uppfattat tryckt/);
    expect((q('hytt-brytare') as HTMLButtonElement).disabled).toBe(false);
  });

  it('ett Uppfattat som inte gäller testnotisen räknas inte', async () => {
    await montera();
    await tryck(q('hytt-skicka-test')); await tick(TEST_FORDROJNING_S);
    await meddelande({ typ: 'hytt-uppfattat', besokId: 'b-1', tid: Date.now() });
    expect(q('hytt-test-resultat')!.textContent).toContain('Uppfattat ej tryckt än');
  });

  it('Öppna kartan på testnotisen registreras', async () => {
    await montera();
    await tryck(q('hytt-skicka-test')); await tick(TEST_FORDROJNING_S);
    await meddelande({ typ: 'hytt-testnotis-oppnad', tid: Date.now() });
    expect(q('hytt-test-resultat')!.textContent).toContain('Öppna kartan tryckt');
  });

  it('Chrome tog inte emot notisen: det sägs, ingen resultatrad skrivs', async () => {
    visa.mockRejectedValueOnce(new Error('nej'));
    await montera();
    await tryck(q('hytt-skicka-test')); await tick(TEST_FORDROJNING_S);
    expect(behallare!.textContent).toContain('Notisen kunde inte visas');
    expect(q('hytt-test-resultat')).toBeNull();
  });

  it('Stäng testnotisen stänger bara hyttens egen notis', async () => {
    await montera();
    await tryck(q('hytt-skicka-test')); await tick(TEST_FORDROJNING_S);
    const knapp = Array.from(behallare!.querySelectorAll('button')).find((b) => b.textContent === 'Stäng testnotisen') as HTMLElement;
    await tryck(knapp);
    expect(stangd).toHaveBeenCalledTimes(1);
  });
});

describe('Notiser i hytten — brytaren', () => {
  it('är AV från början och går inte att slå på utan ett lyckat test', async () => {
    await montera();
    expect(q('hytt-brytare')!.getAttribute('aria-checked')).toBe('false');
    await tryck(q('hytt-brytare'));
    expect(localStorage.getItem('hytt_notiser_v1')).toBeNull();
  });

  it('efter lyckat test: på/av sparas per enhet och överlever omladdning', async () => {
    localStorage.setItem('hytt_notis_test_v1', JSON.stringify({ skickad: 1, uppfattat: 2 }));
    await montera();
    await tryck(q('hytt-brytare'));
    expect(localStorage.getItem('hytt_notiser_v1')).toBe('pa');
    act(() => { rot!.unmount(); }); behallare!.innerHTML = '';
    await montera();
    expect(q('hytt-brytare')!.getAttribute('aria-checked')).toBe('true');
    await tryck(q('hytt-brytare'));
    expect(localStorage.getItem('hytt_notiser_v1')).toBe('av');
  });

  it('en brytare som redan är på kan alltid stängas av, även om testresultatet rensats', async () => {
    localStorage.setItem('hytt_notiser_v1', 'pa');
    await montera();
    expect((q('hytt-brytare') as HTMLButtonElement).disabled).toBe(false);
    await tryck(q('hytt-brytare'));
    expect(localStorage.getItem('hytt_notiser_v1')).toBe('av');
  });
});
