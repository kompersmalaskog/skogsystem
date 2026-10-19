// @vitest-environment jsdom
// InfoRam med vy "rundan" (Rundan-arket i egenkontrollens rundvy): på telefon öppnas det på HALV höjd (som kortet), inte på full
// (som "Om trakten"/"Mer"). Ramen vet inget om innehållet — värdet finns bara för detta.
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import InfoRam, { type InfoVy } from './InfoRam';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function montera(vy: InfoVy, bredd: number) {
  Object.defineProperty(window, 'innerWidth', { value: bredd, configurable: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(InfoRam, { oppen: true, vy, ariaLabel: 'Rundan', onStang: () => {}, children: () => createElement('div', null, 'innehåll') })); });
  return document.querySelector('[data-testid="objekt-info"]') as HTMLElement;
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
});

describe('InfoRam vy "rundan"', () => {
  it('telefon (< 900 px): ett ark på HALV höjd, som kortet', async () => {
    const a = await montera('rundan', 390);
    expect(a.getAttribute('data-lage')).toBe('ark');
    expect(a.getAttribute('data-vy')).toBe('rundan');
    expect(a.getAttribute('data-detent')).toBe('halv');
  });

  it('jämförelse: "om" (Om trakten) öppnas på full höjd — så testet ovan skiljer vyerna åt', async () => {
    const a = await montera('om', 390);
    expect(a.getAttribute('data-detent')).toBe('hel');
  });

  it('dator (≥ 900 px): en panel från höger, ingen halv höjd', async () => {
    const a = await montera('rundan', 1280);
    expect(a.getAttribute('data-lage')).toBe('panel');
    expect(a.getAttribute('data-detent')).toBeNull();
  });
});
