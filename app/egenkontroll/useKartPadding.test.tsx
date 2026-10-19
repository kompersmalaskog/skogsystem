// @vitest-environment jsdom
// Måttet som kartans padding och sidokolumnen bygger på: huvudets underkant, avståndet från dockans överkant till skärmens nederkant och
// dockans egen höjd. Mäts ur elementens rektanglar (safe-area ingår), inte antas.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useKartPadding, type KartPadding } from './useKartPadding';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let senaste: KartPadding | null = null;

function Prov({ aktiv, huvud, dock }: { aktiv: boolean; huvud: Partial<DOMRect>; dock: Partial<DOMRect> | null }) {
  const h = useRef<HTMLElement | null>(null);
  const d = useRef<HTMLDivElement | null>(null);
  senaste = useKartPadding(h, d, aktiv);
  return createElement('div', null,
    createElement('header', { ref: (el: HTMLElement | null) => { h.current = el; if (el) el.getBoundingClientRect = () => huvud as DOMRect; } }),
    dock && createElement('div', { ref: (el: HTMLDivElement | null) => { d.current = el; if (el) el.getBoundingClientRect = () => dock as DOMRect; } }));
}

async function montera(props: Parameters<typeof Prov>[0]) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Prov, props)); });
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null; senaste = null;
});

describe('useKartPadding', () => {
  it('top = huvudets underkant, bottom = skärmens höjd minus dockans överkant, dockHojd = dockans höjd', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    await montera({ aktiv: true, huvud: { bottom: 104 }, dock: { top: 560, height: 212 } });
    expect(senaste).toEqual({ top: 104, bottom: 240, dockHojd: 212 });
  });

  it('inte aktiv (kartan syns inte) mäter ingenting', async () => {
    await montera({ aktiv: false, huvud: { bottom: 104 }, dock: { top: 560, height: 212 } });
    expect(senaste).toEqual({ top: 0, bottom: 0, dockHojd: 0 });
  });

  it('en dock utan höjd (ännu inte ritad) ger ingen bottom-padding', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    await montera({ aktiv: true, huvud: { bottom: 64 }, dock: { top: 800, height: 0 } });
    expect(senaste).toEqual({ top: 64, bottom: 0, dockHojd: 0 });
  });

  it('en ändrad fönsterhöjd (vriden telefon) mäts om', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    await montera({ aktiv: true, huvud: { bottom: 104 }, dock: { top: 560, height: 212 } });
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(senaste!.bottom).toBe(400 - 560 < 0 ? 0 : 400 - 560);
  });
});
