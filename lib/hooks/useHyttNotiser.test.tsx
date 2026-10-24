// @vitest-environment jsdom
/**
 * Hooken som visar notiserna i hytten. Notisvisandet (lib/hytt/notisVisa) är mockat; fönstrets läge styrs genom visibilityState + hasFocus. Reglerna själva (vad som ger notis)
 * bevisas i lib/hytt/notiser.test.ts — här bevisas kopplingen: fönstret → notis, framme → stängt, av → passivt, klockan → påminnelsen.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const visa = vi.fn(async (_n: any) => true);
const stang = vi.fn(async (_t?: readonly string[]) => undefined);
vi.mock('@/lib/hytt/notisVisa', () => ({ visaHyttNotis: (n: any) => visa(n), stangHyttNotiser: (t?: readonly string[]) => stang(t) }));

import { NOTIS_TICK_MS, useHyttNotiser, useHyttNotiserPa, type HyttNotiserIn } from './useHyttNotiser';

const NU0 = Date.parse('2026-10-24T10:00:00Z');
const LEDNING = { id: 'm1', namn: 'El-ledning', typ: 'powerline', avstandM: 12, text: null };
const BESOK = { id: 'b1', namn: 'Anna', besokstid: new Date(NU0 + 30 * 60000).toISOString() };
const OMRADE = { nyckel: 'hansyn:4', namn: 'Hänsynsyta 4', instruktioner: [{ text: 'Lämna kantzonen', hash: 'h1' }], fler: 0 };
const BAS: HyttNotiserIn = { aktiv: true, roll: 'skordare', trakt: 'Skälviken', maskinId: 'R64428', test: false, fara: [], besok: [], omrade: null };

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let synlig = 'visible';
let fokus = true;

function Prov({ i }: { i: HyttNotiserIn }) { useHyttNotiser(i); return null; }
const flush = async () => { for (let k = 0; k < 8; k++) await act(async () => { await Promise.resolve(); }); };
const rendera = async (i: HyttNotiserIn) => { rot ??= createRoot(behallare!); await act(async () => { rot!.render(<Prov i={i} />); }); await flush(); };
const bytLage = async (s: 'visible' | 'hidden', f: boolean, bara?: 'visibilitychange' | 'focus' | 'blur') => {
  synlig = s; fokus = f;
  await act(async () => {
    if (!bara || bara === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
    if (!bara || bara === 'focus' || bara === 'blur') window.dispatchEvent(new Event(f ? 'focus' : 'blur'));
  });
  await flush();
};
const titlar = () => visa.mock.calls.map((c) => c[0].titel as string);

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  visa.mockClear(); stang.mockClear();
  synlig = 'visible'; fokus = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => synlig });
  document.hasFocus = () => fokus;
  behallare = document.createElement('div'); document.body.appendChild(behallare);
  window.history.replaceState({}, '', '/planering?objekt=abc');
});
afterEach(() => { act(() => { rot?.unmount(); }); rot = null; behallare?.remove(); vi.useRealTimers(); localStorage.clear(); });

describe('useHyttNotiser — fönstret styr', () => {
  it('appen framme (synlig + vald): ingen notis för fara, besök eller område', async () => {
    await rendera({ ...BAS, fara: [LEDNING], besok: [BESOK], omrade: OMRADE });
    expect(visa).not.toHaveBeenCalled();
  });

  it('byter föraren till ett annat program (blur) medan faran är nära → notisen kommer, med rätt text och sidans adress', async () => {
    await rendera({ ...BAS, fara: [LEDNING] });
    await bytLage('visible', false);
    expect(titlar()).toEqual(['El-ledning 12 m']);
    expect(visa.mock.calls[0][0].text).toBe('Fäll inte mot ledningen');
    expect(visa.mock.calls[0][0].data.url).toBe('/planering?objekt=abc');
  });

  it('varje händelse räcker ensam: bara blur (ett annat program valt) / bara visibilitychange (minimerat)', async () => {
    await rendera({ ...BAS, fara: [LEDNING] });
    synlig = 'visible'; fokus = false;
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    await flush();
    expect(visa).toHaveBeenCalledTimes(1);

    visa.mockClear(); act(() => { rot!.unmount(); }); rot = null;
    synlig = 'visible'; fokus = true;
    await rendera({ ...BAS, fara: [LEDNING] });
    expect(visa).not.toHaveBeenCalled();
    synlig = 'hidden'; fokus = true;   // minimerat men fönstret "har fokus": bara synligheten säger att det är borta
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(visa).toHaveBeenCalledTimes(1);
  });

  it('minimerat/täckt (hidden) räknas som borta; tillbaka till appen stänger allt som ligger uppe', async () => {
    await rendera({ ...BAS, besok: [BESOK] });
    await bytLage('hidden', false);
    expect(titlar()).toHaveLength(1);
    expect(titlar()[0]).toMatch(/^Besök: Anna/);
    stang.mockClear();
    await bytLage('visible', true);
    expect(stang).toHaveBeenCalledTimes(1);
    expect(stang.mock.calls[0][0]).toBeUndefined();   // alla notiser från hytten
  });

  it('flera samtidigt: område, besök, fara i den ordningen (fara hamnar överst i Windows)', async () => {
    await rendera({ ...BAS, fara: [LEDNING], besok: [BESOK], omrade: OMRADE });
    await bytLage('visible', false);
    expect(visa.mock.calls.map((c) => c[0].typ)).toEqual(['omrade', 'besok', 'fara']);
  });

  it('samma fara igen medan man är kvar nära ger ingen ny notis', async () => {
    await rendera({ ...BAS, fara: [LEDNING] });
    await bytLage('visible', false);
    await rendera({ ...BAS, fara: [{ ...LEDNING, avstandM: 7 }] });
    expect(visa).toHaveBeenCalledTimes(1);
  });

  it('kvitterat besök försvinner ur listan → notisen stängs med sin tag', async () => {
    await rendera({ ...BAS, besok: [BESOK] });
    await bytLage('visible', false);
    stang.mockClear();
    await rendera({ ...BAS, besok: [] });
    expect(stang).toHaveBeenCalledWith(['besok-b1']);
  });
});

describe('useHyttNotiser — av och påminnelse', () => {
  it('aktiv=false (brytaren av): gör ingenting, hur fönstret än ser ut — också när appen redan är borta från start', async () => {
    synlig = 'hidden'; fokus = false;
    await rendera({ ...BAS, aktiv: false, fara: [LEDNING], besok: [BESOK], omrade: OMRADE });
    await bytLage('hidden', false);
    expect(visa).not.toHaveBeenCalled();
    expect(stang).not.toHaveBeenCalled();
  });

  it('slås brytaren av medan notiser ligger uppe stängs de', async () => {
    await rendera({ ...BAS, fara: [LEDNING] });
    await bytLage('visible', false);
    stang.mockClear();
    await rendera({ ...BAS, aktiv: false, fara: [LEDNING] });
    expect(stang).toHaveBeenCalledTimes(1);
  });

  it(`påminnelsen: klockan tickar var ${NOTIS_TICK_MS / 1000}:e s medan appen är borta och ett besök väntar; efter 5 min kommer EN ny notis med ljud`, async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NU0);
    await rendera({ ...BAS, besok: [BESOK] });
    await bytLage('visible', false);
    expect(visa).toHaveBeenCalledTimes(1);
    for (let s = 0; s < 4 * 60; s += NOTIS_TICK_MS / 1000) { await act(async () => { vi.advanceTimersByTime(NOTIS_TICK_MS); }); await flush(); }
    expect(visa).toHaveBeenCalledTimes(1);
    for (let s = 0; s < 90; s += NOTIS_TICK_MS / 1000) { await act(async () => { vi.advanceTimersByTime(NOTIS_TICK_MS); }); await flush(); }
    expect(visa).toHaveBeenCalledTimes(2);
    expect(visa.mock.calls[1][0]).toMatchObject({ renotify: true, tag: 'besok-b1' });
    for (let s = 0; s < 600; s += NOTIS_TICK_MS / 1000) { await act(async () => { vi.advanceTimersByTime(NOTIS_TICK_MS); }); await flush(); }
    expect(visa).toHaveBeenCalledTimes(2);   // bara EN påminnelse
  });

  it('en notis som inte kan visas (Chrome säger nej) fäller ingenting', async () => {
    visa.mockRejectedValueOnce(new Error('nej'));
    await rendera({ ...BAS, fara: [LEDNING] });
    await bytLage('visible', false);
    expect(visa).toHaveBeenCalled();
  });
});

describe('useHyttNotiserPa — enhetsbrytaren', () => {
  function Brytare({ ut }: { ut: { v: boolean } }) { ut.v = useHyttNotiserPa(); return null; }
  it('AV från början, PÅ när den sparats och händelsen kommit, och följer med tillbaka', async () => {
    const ut = { v: true };
    rot ??= createRoot(behallare!);
    await act(async () => { rot!.render(<Brytare ut={ut} />); });
    expect(ut.v).toBe(false);
    await act(async () => { localStorage.setItem('hytt_notiser_v1', 'pa'); window.dispatchEvent(new Event('hytt-notiser-andrad')); });
    expect(ut.v).toBe(true);
    await act(async () => { localStorage.setItem('hytt_notiser_v1', 'av'); window.dispatchEvent(new Event('hytt-notiser-andrad')); });
    expect(ut.v).toBe(false);
  });
});
