// @vitest-environment jsdom
// Apteringsvyn: senast hämtade lista visas direkt, ny data byts in tyst,
// fel säger vad man gör (Försök igen) och objekt som räknas står med namn.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let sökObjekt: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === 'objekt' ? sökObjekt : null) }),
}));

import FordelningPage from './page';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const kort = (key: string, namn: string, extra: Record<string, unknown> = {}) => ({
  objectKey: key, objektNamn: namn, status: 'completed', lastFileAt: null, dagarSedanFil: 3,
  lage: 1, gradePct: 88.2, volymM3: 120, mening: null, headline: null, trend: null, ...extra,
});

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
beforeEach(() => { sökObjekt = null; localStorage.clear(); });
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; vi.unstubAllGlobals(); });

async function montera() {
  behallare = document.createElement('div'); document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await act(async () => { rot!.render(<FordelningPage />); });
}
const text = () => behallare!.textContent ?? '';
const svar = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
async function vantaTills(villkor: () => boolean) {
  for (let i = 0; i < 50 && !villkor(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(villkor()).toBe(true);
}

describe('Apteringsvyn', () => {
  it('visar senast hämtade lista direkt medan servern svarar', async () => {
    localStorage.setItem('fordelning_lista_v1', JSON.stringify({ objekt: [kort('a', 'Hålabäck au 2025')], vantar: [] }));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // servern svarar aldrig
    await montera();
    expect(text()).toContain('Hålabäck au 2025');
    expect(text()).not.toContain('Hämtar apteringen');
  });

  it('fel utan sparad lista: säger det och har Försök igen, som hämtar igen', async () => {
    const f = vi.fn()
      .mockReturnValueOnce(svar({ error: 'statement timeout' }, 500))
      .mockReturnValueOnce(svar({ objekt: [kort('a', 'Jätsbygd au 2026')], vantar: [], attRakna: 0 }));
    vi.stubGlobal('fetch', f);
    await montera();
    await vantaTills(() => text().includes('Kunde inte läsa apteringen'));
    const igen = Array.from(behallare!.querySelectorAll('button')).find((b) => b.textContent === 'Försök igen')!;
    await act(async () => { igen.click(); });
    await vantaTills(() => text().includes('Jätsbygd au 2026'));
  });

  it('ny fil: kortet står kvar med uppdateras, omräkningen körs och listan byts in', async () => {
    const f = vi.fn((url: string) => {
      if (url === '/api/fordelning/berakna') return svar({ raknade: 1, kvar: 0, fel: [] });
      return f.mock.calls.filter(([u]) => u === '/api/fordelning').length === 1
        ? svar({ objekt: [kort('a', 'Räveboda AU 2026', { uppdateras: true })], vantar: [{ objectKey: 'b', objektNamn: 'Toftåsa gallring 2026', status: 'completed' }], attRakna: 2 })
        : svar({ objekt: [kort('a', 'Räveboda AU 2026', { gradePct: 91, uppdateras: false }), kort('b', 'Toftåsa gallring 2026')], vantar: [], attRakna: 0 });
    });
    vi.stubGlobal('fetch', f);
    await montera();
    await vantaTills(() => text().includes('91 %'));
    expect(f).toHaveBeenCalledWith('/api/fordelning/berakna', { method: 'POST' });
    expect(text()).toContain('Toftåsa gallring 2026');
    expect(text()).not.toContain('uppdateras…');
    expect(text()).not.toContain('Räknas…');
    // Sparad på enheten till nästa öppning
    expect(localStorage.getItem('fordelning_lista_v1')).toContain('"gradePct":91');
  });
});
