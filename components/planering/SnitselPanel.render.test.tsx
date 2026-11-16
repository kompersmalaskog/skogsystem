// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SnitselPanel } from './SnitselPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null; let el: HTMLElement | null = null;
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; el = null; });
const rita = (n: React.ReactElement) => { el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el); act(() => rot!.render(n)); return el!; };
const q = (id: string) => el!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('SnitselPanel', () => {
  it('visar metrarna stort, vad man ska göra och GPS-läget', () => {
    rita(<SnitselPanel dist={19} target={20} tol={3} gpsNoggrannhetM={2.2} />);
    expect(q('snitsel-meter')!.textContent).toBe('19m');
    expect(q('snitsel-riktning')!.textContent).toBe('Inom mål');
    expect(q('snitsel-panel')!.dataset.ton).toBe('inom');
    expect(q('snitsel-gps')!.textContent).toBe('GPS ±2 m');
  });
  it('utanför målet säger hur långt, och utan väg står ett streck — aldrig 0', () => {
    rita(<SnitselPanel dist={12} target={20} tol={3} gpsNoggrannhetM={25} />);
    expect(q('snitsel-riktning')!.textContent).toBe('8 m till');
    expect(q('snitsel-panel')!.dataset.ton).toBe('utanfor');
    expect(q('snitsel-gps')!.textContent).toContain('Osäker position');
    act(() => rot!.render(<SnitselPanel dist={null} target={20} tol={3} gpsNoggrannhetM={null} />));
    expect(q('snitsel-meter')!.textContent).toBe('–m');
  });
  it('färgpillen och Byt sida ritas bara när sidan ger dem', () => {
    let n = 0;
    rita(<SnitselPanel dist={25} target={25} tol={3} gpsNoggrannhetM={3} />);
    expect(q('snitsel-byt-sida')).toBeNull();
    act(() => rot!.render(<SnitselPanel dist={25} target={25} tol={3} gpsNoggrannhetM={3} farg={<span data-testid="pill">Gul</span>} onBytSida={() => { n++; }} />));
    expect(q('pill')!.textContent).toBe('Gul');
    act(() => q('snitsel-byt-sida')!.click());
    expect(n).toBe(1);
  });
  it('panelen ligger överst på skärmen och säger sin höjd till sidan', () => {
    let h = -1;
    rita(<SnitselPanel dist={19} target={20} tol={3} gpsNoggrannhetM={2} onHojd={(x) => { h = x; }} />);
    expect(q('snitsel-panel')!.style.top).toBe('0px');
    expect(h).toBeGreaterThanOrEqual(0);
  });
});
