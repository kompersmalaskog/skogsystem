// @vitest-environment jsdom
/** "Tillåt notiser"-kortet: syns en gång i maskinläget när Chrome inte frågat, frågar med ett tryck, och kommer aldrig tillbaka. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HyttNotisTillat from './HyttNotisTillat';

let rot: ReturnType<typeof createRoot>;
let ruta: HTMLDivElement;
let tillstand: NotificationPermission = 'default';
let frågor = 0;
let hanndelser = 0;

const montera = async (p: { aktiv?: boolean; dolj?: boolean } = {}) => {
  await act(async () => { rot.render(<HyttNotisTillat aktiv={p.aktiv ?? true} dolj={p.dolj ?? false} top="60px" />); });
};
const q = (id: string) => ruta.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); tillstand = 'default'; frågor = 0; hanndelser = 0;
  const N: any = function () { /* */ };
  Object.defineProperty(N, 'permission', { configurable: true, get: () => tillstand });
  N.requestPermission = async () => { frågor++; tillstand = 'granted'; return 'granted'; };
  (globalThis as any).Notification = N; (window as any).Notification = N;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  window.addEventListener('hytt-notiser-andrad', () => { hanndelser++; });
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
});
afterEach(() => { act(() => { rot.unmount(); }); ruta.remove(); });

describe('HyttNotisTillat', () => {
  it('visar frågan och en knapp första gången i maskinläget', async () => {
    await montera();
    expect(q('hytt-tillat-kort')!.textContent).toContain('Tillåt notiser så ser du besök och fara när Opti ligger framme');
    expect(q('hytt-tillat-knapp')!.textContent).toBe('Tillåt notiser');
  });

  it('ett tryck frågar Chrome, säger till att tillståndet ändrats (så prenumerationen anmäls på maskinen) och kortet försvinner', async () => {
    await montera();
    await act(async () => { q('hytt-tillat-knapp')!.click(); });
    expect(frågor).toBe(1);
    expect(hanndelser).toBeGreaterThan(0);
    expect(q('hytt-tillat-kort')).toBeNull();
  });

  it('sen aldrig mer: nästa start visar inget kort, även om föraren avvisade Chromes fråga och tillståndet fortfarande är "default"', async () => {
    await montera();
    tillstand = 'default';
    (globalThis as any).Notification.requestPermission = async () => { frågor++; return 'default'; };
    await act(async () => { q('hytt-tillat-knapp')!.click(); });
    act(() => { rot.unmount(); }); rot = createRoot(ruta);
    await montera();
    expect(q('hytt-tillat-kort')).toBeNull();
  });

  it('inget kort när notiserna redan är tillåtna, utanför maskinläget, eller medan ett larm/besök/lossningskort har platsen (det väntar)', async () => {
    tillstand = 'granted';
    await montera();
    expect(q('hytt-tillat-kort')).toBeNull();
    tillstand = 'default';
    await montera({ aktiv: false });
    expect(q('hytt-tillat-kort')).toBeNull();
    await montera({ aktiv: true, dolj: true });
    expect(q('hytt-tillat-kort')).toBeNull();
    await montera({ aktiv: true, dolj: false });
    expect(q('hytt-tillat-kort')).not.toBeNull();   // kortet väntade bara – det är inte förbrukat
  });
});
