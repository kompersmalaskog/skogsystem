// @vitest-environment jsdom
//
// Listans position (beslut Martin 2026-10-20): EN hämtning med lägre noggrannhet, aldrig en bevakning som ligger och går medan sidan är öppen.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POSITION_MAX_ALDER_MS, POSITION_TIDSGRANS_MS, useEnPosition, type EnPosition } from './useEnPosition';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const geo = vi.hoisted(() => ({
  getCurrentPosition: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  watchPosition: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let senast: EnPosition | null = null;

function Prov() { senast = useEnPosition(); return null; }
async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Prov)); });
}

beforeEach(() => {
  senast = null;
  geo.getCurrentPosition = vi.fn();
  geo.watchPosition = vi.fn();
  Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: geo.getCurrentPosition, watchPosition: geo.watchPosition, clearWatch: vi.fn() } });
});
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

describe('useEnPosition', () => {
  it('hämtar EN position med lägre noggrannhet och startar aldrig en bevakning', async () => {
    await montera();
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.watchPosition).not.toHaveBeenCalled();
    const alt = geo.getCurrentPosition.mock.calls[0][2];
    expect(alt).toEqual({ enableHighAccuracy: false, maximumAge: POSITION_MAX_ALDER_MS, timeout: POSITION_TIDSGRANS_MS });
  });

  it('svaret blir positionen — och en omrendering hämtar ingen ny', async () => {
    await montera();
    await act(async () => { geo.getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 56.4, longitude: 14.8 } }); });
    expect(senast).toEqual({ lat: 56.4, lng: 14.8 });
    await act(async () => { root!.render(createElement(Prov)); });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('nekad eller ingen fix → null, inget kastas', async () => {
    await montera();
    await act(async () => { geo.getCurrentPosition.mock.calls[0][1]({ code: 1 }); });
    expect(senast).toBeNull();
  });

  it('ett svar efter att sidan lämnats sätter inget', async () => {
    await montera();
    const svar = geo.getCurrentPosition.mock.calls[0][0];
    await act(async () => { root!.unmount(); });
    root = null;
    expect(() => svar({ coords: { latitude: 1, longitude: 1 } })).not.toThrow();
  });

  it('webbläsare utan geolocation → null', async () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: undefined });
    await montera();
    expect(senast).toBeNull();
  });
});

// Listan får aldrig dra in den levande, högnoggranna bevakningen (useLevandePosition bor kvar i rundvyn).
describe('listan använder inte bevakningen', () => {
  it('app/egenkontroll/page.tsx importerar varken useLevandePosition eller useMinPosition och anropar aldrig watchPosition', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/useLevandePosition|useMinPosition|watchPosition/);
    expect(src).toContain("from './useEnPosition'");
  });
});
