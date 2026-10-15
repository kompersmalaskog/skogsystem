// @vitest-environment jsdom
// Ett foto som väntar på uppladdning visas direkt från enheten, med en liten "väntar på uppladdning"-ikon — och försvinner när det är uppe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const kon = vi.hoisted(() => ({ blob: null as Blob | null, lyssnare: new Set<() => void>() }));
vi.mock('@/lib/markeringFotoKo', () => ({
  lokaltMarkeringFoto: vi.fn(async () => kon.blob),
  prenumereraFotoKo: (fn: () => void) => { kon.lyssnare.add(fn); return () => { kon.lyssnare.delete(fn); }; },
}));
vi.mock('@/lib/markeringFoto', () => ({ signeraMarkeringFoto: vi.fn(async () => 'https://signerad.example/foto.jpg') }));

import MarkeringFoto from './MarkeringFoto';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null; let behallare: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const montera = async (el: React.ReactElement) => { behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare); await act(async () => { rot!.render(el); }); await flush(); };

beforeEach(() => { kon.blob = null; kon.lyssnare.clear(); (URL as any).createObjectURL = vi.fn(() => 'blob:lokalt-foto'); (URL as any).revokeObjectURL = vi.fn(); });
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; });

describe('MarkeringFoto: foto som väntar på uppladdning', () => {
  it('visas direkt från enheten, med väntar-ikonen, även utan photoPath', async () => {
    kon.blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    await montera(<MarkeringFoto lokal={{ objektId: 'o', markerId: 'm' }} />);
    expect(behallare!.querySelector('img')!.getAttribute('src')).toBe('blob:lokalt-foto');
    expect(behallare!.querySelector('[data-testid="foto-vantar"]')).not.toBeNull();
    expect(behallare!.querySelector('[data-testid="foto-vantar"]')!.getAttribute('aria-label')).toBe('Väntar på uppladdning');
  });

  it('ett omtag syns genast: det lokala fotot vinner över markeringens gamla photoPath', async () => {
    kon.blob = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    await montera(<MarkeringFoto lokal={{ objektId: 'o', markerId: 'm' }} photoPath="o/m.jpg" />);
    expect(behallare!.querySelector('img')!.getAttribute('src')).toBe('blob:lokalt-foto');
  });

  it('är fotot uppe (inget lokalt kvar) visas det från Storage och ikonen är borta', async () => {
    kon.blob = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    await montera(<MarkeringFoto lokal={{ objektId: 'o', markerId: 'm' }} photoPath="o/m.jpg" />);
    expect(behallare!.querySelector('[data-testid="foto-vantar"]')).not.toBeNull();
    kon.blob = null;                                   // kön har kvitterat: den lokala kopian är borta
    await act(async () => { kon.lyssnare.forEach((fn) => fn()); }); await flush();
    expect(behallare!.querySelector('[data-testid="foto-vantar"]')).toBeNull();
    expect(behallare!.querySelector('img')!.getAttribute('src')).toBe('https://signerad.example/foto.jpg');
  });

  it('utan lokalt foto: ingen ikon, som förut', async () => {
    await montera(<MarkeringFoto photoPath="o/m.jpg" />);
    expect(behallare!.querySelector('[data-testid="foto-vantar"]')).toBeNull();
  });
});
