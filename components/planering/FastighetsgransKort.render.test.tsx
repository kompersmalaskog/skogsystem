// @vitest-environment jsdom
// Fällningskortet för fastighetsgränsen: "Fastighetsgräns 18 m" + "Fäll inte åt det hållet". Tyst och utan knapp (som fällningscirkeln själv): inget att trycka, inget att kvittera.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach } from 'vitest';
import { FastighetsgransKortVy } from './FastighetsgransKort';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });
const montera = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); act(() => { rot!.render(el); }); };
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

describe('FastighetsgransKortVy', () => {
  it('rubriken har avståndet i hela meter och raden säger vad man ska göra', () => {
    montera(<FastighetsgransKortVy fall={{ avstandM: 18 }} top="60px" />);
    expect(q('fastighetsgrans-rubrik').textContent).toBe('Fastighetsgräns 18 m');
    expect(q('fastighetsgrans-kort').textContent).toContain('Fäll inte åt det hållet');
  });
  it('inga knappar och ingen länk: kortet är tyst och försvinner av sig självt när man är >30 m bort', () => {
    montera(<FastighetsgransKortVy fall={{ avstandM: 7 }} top="60px" />);
    expect(ruta!.querySelectorAll('button, a, input').length).toBe(0);
    expect(q('fastighetsgrans-rubrik').textContent).toBe('Fastighetsgräns 7 m');
  });
  it('kortet ligger där sidan säger (top) så det kan viker för larmkortet', () => {
    montera(<FastighetsgransKortVy fall={{ avstandM: 18 }} top="calc(env(safe-area-inset-top, 0px) + 100px)" />);
    expect((q('fastighetsgrans-kort').parentElement as HTMLElement).style.top).toContain('100px');
  });
});
