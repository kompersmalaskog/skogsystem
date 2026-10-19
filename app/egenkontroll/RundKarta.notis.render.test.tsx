// @vitest-environment jsdom
// Notisen när origot saknas ("Planeringens markeringar kan inte placeras…"). Under kartan i en flexyta (gå-vyn, som förut) — eller, med
// kartPadding (rundvyns flytande huvud och docka), som ett kort UNDER huvudet ovanpå kartan. En yta under kartan hade hamnat bakom dockan.
// MapLibre laddas inte i jsdom; det här provar bara vad komponenten ritar.
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import RundKarta from './RundKarta';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function montera(extra: Record<string, unknown>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(RundKarta as any, {
      objekt: { lat: 56.4, lng: 15.0, kartbild_url: null, kartbild_bounds: null },
      origo: null, origoText: 'Vidas traktgräns saknas för objektet.', punkter: [], kontext: [], provytor: [], valdPunktId: null, hojd: '100%', ...extra,
    }));
  });
}
afterEach(async () => { if (root) await act(async () => { root!.unmount(); }); host?.remove(); root = null; host = null; });

describe('RundKarta: notisen när origot saknas', () => {
  it('utan kartPadding (gå-vyn): en vanlig rad under kartan, som förut', async () => {
    await montera({});
    const n = document.querySelector('[data-testid="karta-notis"]') as HTMLElement;
    expect(n.textContent).toContain('Vidas traktgräns saknas för objektet.');
    expect(n.style.position).not.toBe('absolute');
    expect(n.parentElement!.style.position).not.toBe('absolute');
  });

  it('med kartPadding (rundvyn): ett kort ovanpå kartan, under huvudet (kartPadding.top + 8)', async () => {
    await montera({ kartPadding: { top: 64, bottom: 200 } });
    const n = document.querySelector('[data-testid="karta-notis"]') as HTMLElement;
    expect(n.textContent).toContain('Vidas traktgräns saknas för objektet.');
    const behallare = n.parentElement as HTMLElement;
    expect(behallare.style.position).toBe('absolute');
    expect(behallare.style.top).toBe('72px');
    expect(n.style.background).not.toMatch(/rgba|transparent/);
  });

  it('har origot beslutats finns ingen notis', async () => {
    await montera({ origo: { lat: 56.4, lng: 15.0, zoom: 16 } });
    expect(document.querySelector('[data-testid="karta-notis"]')).toBeNull();
  });
});
