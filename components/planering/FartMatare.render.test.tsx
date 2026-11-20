// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FartMatare } from './FartMatare';
import { taAllt } from '@/lib/fart/fartLogg';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null; let el: HTMLElement | null = null;
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; el = null; });
const vanta = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('FartMatare', () => {
  it('mäter ett lagerbyte: säger vad som byttes och tre rader när kartan är klar', async () => {
    let klar: (() => void) | null = null;
    const karta = { once: (_: string, f: () => void) => { klar = f; }, off: () => {} };
    const rita = (lager: Record<string, boolean>) => act(() => { rot!.render(<FartMatare visa karta={() => karta} bakgrund="satellite" lager={lager} namn={(id) => (id === 'sks_markfuktighet' ? 'Markfuktighet' : id)} />); });
    el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
    rita({});
    expect(el.querySelector('[data-testid="fart-rad"]')).toBeNull();
    expect(el.textContent).toContain('Byt bakgrund eller tänd ett lager');
    rita({ sks_markfuktighet: true });
    expect(el.querySelector('[data-testid="fart-mater"]')!.textContent).toContain('Markfuktighet på');
    await vanta(80);
    expect(klar).not.toBeNull();
    act(() => klar!());
    const rad = el.querySelector('[data-testid="fart-rad"]')!;
    expect(rad.textContent).toContain('Markfuktighet på');
    expect(rad.textContent).toMatch(/Sidan: /);
    expect(rad.textContent).toMatch(/Rutorna: .*inga hämtades/);
    expect(rad.textContent).toMatch(/Ritningen: långsammaste bildruta/);
    expect(el.querySelector('[data-testid="fart-mater"]')).toBeNull();
  });
  it('Stäng av tar bort mätaren och det sparade valet', () => {
    localStorage.setItem('fart_matare_v1', '1');
    el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
    act(() => { rot!.render(<FartMatare visa karta={() => null} bakgrund="a" lager={{}} namn={(x) => x} />); });
    act(() => { (el!.querySelector('[data-testid="fart-stang"]') as HTMLElement).click(); });
    expect(el.querySelector('[data-testid="fart-matare"]')).toBeNull();
    expect(localStorage.getItem('fart_matare_v1')).toBeNull();
  });
  it('utan visa syns INGENTING på skärmen — men mätningen går ändå till loggen', async () => {
    taAllt();
    let klar: (() => void) | null = null;
    const karta = { once: (_: string, f: () => void) => { klar = f; }, off: () => {} };
    const rita = (lager: Record<string, boolean>) => act(() => { rot!.render(<FartMatare visa={false} karta={() => karta} bakgrund="satellite" lager={lager} namn={() => 'Markfuktighet'} />); });
    el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
    rita({}); rita({ sks_markfuktighet: true });
    expect(el.innerHTML).toBe('');
    await vanta(80);
    await vanta(600);   // kartan "hämtar" i över en halv sekund
    act(() => klar!());
    expect(el.innerHTML).toBe('');
    const rader = taAllt();
    expect(rader).toHaveLength(1);
    expect(rader[0].slag).toBe('karta');
    expect(rader[0].namn).toBe('Markfuktighet på');
    expect(rader[0].ms).toBeGreaterThanOrEqual(500);
  });
});
