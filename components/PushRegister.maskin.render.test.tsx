// @vitest-environment jsdom
/**
 * PushRegister anmäler enhetens prenumeration PÅ MASKINEN när enheten är en maskindator (enhet_maskin_id), och utan maskin på förarens telefon.
 * Frågan om notistillstånd ställs inte här på en maskin (kortet "Tillåt notiser" gör det med ett riktigt tryck) – men en telefon frågar som förut.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { email: 'daniel@example.se' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'daniel-id' } }) }) }) }),
  },
}));
vi.mock('@/lib/push/vapid', () => ({ vapidPublikSomBytes: () => new Uint8Array([1]) }));

import PushRegister from './PushRegister';

const SUB = { endpoint: 'https://push/e1', toJSON: () => ({ endpoint: 'https://push/e1', keys: {} }) };
let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
const render = (el: React.ReactElement) => { behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare); act(() => { rot!.render(el); }); return { unmount: () => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; } }; };
const cleanup = () => { try { act(() => { rot?.unmount(); }); } catch { /* */ } behallare?.remove(); rot = null; };
let anrop: { body: any }[] = [];
let tillstand: NotificationPermission = 'granted';
let begart = 0;
let harPrenumeration = false;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  anrop = []; begart = 0; tillstand = 'granted'; harPrenumeration = false;
  localStorage.clear();
  const reg = { pushManager: { getSubscription: async () => (harPrenumeration ? SUB : null), subscribe: async () => SUB } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => reg, ready: Promise.resolve(reg) } });
  (window as any).PushManager = function () {};
  (globalThis as any).Notification = { get permission() { return tillstand; }, requestPermission: async () => { begart++; tillstand = 'granted'; return 'granted'; } };
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { anrop.push({ body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ ok: true }) }; }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const tick = async (ms = 3100) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('PushRegister — maskin eller person', () => {
  it('maskindator (enhet_maskin_id): prenumerationen anmäls med maskinen', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    render(<PushRegister />);
    await tick();
    expect(anrop).toHaveLength(1);
    expect(anrop[0].body).toMatchObject({ medarbetare_id: 'daniel-id', maskin_id: 'A130743' });
  });

  it("förarens telefon: maskin_id är null (hyttnotiserna går aldrig dit)", async () => {
    render(<PushRegister />);
    await tick();
    expect(anrop[0].body.maskin_id).toBeNull();
  });

  it('enheten blir maskin medan appen är öppen → anmäler sig direkt på nytt, utan omladdning', async () => {
    harPrenumeration = true;
    render(<PushRegister />);
    await tick();
    expect(anrop[0].body.maskin_id).toBeNull();
    const { sattEnhetMaskin } = await import('@/lib/enhetMaskin');
    await act(async () => { sattEnhetMaskin('A130743'); await vi.advanceTimersByTimeAsync(10); });
    expect(anrop[anrop.length - 1].body.maskin_id).toBe('A130743');
    await act(async () => { sattEnhetMaskin(null); await vi.advanceTimersByTimeAsync(10); });
    expect(anrop[anrop.length - 1].body.maskin_id).toBeNull();
  });

  it('maskindator utan tillstånd: ingen automatisk fråga här (kortet frågar med ett tryck); telefonen frågar som förut', async () => {
    tillstand = 'default';
    localStorage.setItem('enhet_maskin_id', 'A130743');
    const { unmount } = render(<PushRegister />);
    await tick();
    expect(begart).toBe(0);
    expect(anrop).toHaveLength(0);
    unmount();
    localStorage.clear();
    render(<PushRegister />);
    await tick();
    expect(begart).toBe(1);
    expect(anrop).toHaveLength(1);
  });

  it('svaret på kortet (hytt-notiser-andrad) anmäler prenumerationen på maskinen', async () => {
    tillstand = 'default';
    localStorage.setItem('enhet_maskin_id', 'A130743');
    render(<PushRegister />);
    await tick();
    expect(anrop).toHaveLength(0);
    tillstand = 'granted';
    await act(async () => { window.dispatchEvent(new Event('hytt-notiser-andrad')); await vi.advanceTimersByTimeAsync(10); });
    expect(anrop).toHaveLength(1);
    expect(anrop[0].body.maskin_id).toBe('A130743');
  });
});
