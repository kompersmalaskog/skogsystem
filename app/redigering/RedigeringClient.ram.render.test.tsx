// @vitest-environment jsdom
// Objektets ark (2026-10-24): huvudet har tillbaka och stäng med 44 px tryckyta, och undersidorna har ingen "Klar"-fot
// (allt sparas direkt). Hela sidan monteras mot en databas i minnet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const RADER: Record<string, any[]> = {
  dim_objekt: [{ objekt_id: '11166477', vo_nummer: '11166477', object_name: 'Mölleryd', huvudtyp: 'Slutavverkning', avtalsform: 'Rp', bolag: 'Vida', skogsagare: 'Karl', exkludera: false, maskin_id: 'PONS20SDJAA270231', start_date: '2026-10-01', end_date: '2026-10-21' }],
};

vi.mock('@/lib/supabase', () => {
  const svar = (t: string) => ({ data: RADER[t] ?? [], error: null, count: (RADER[t] ?? []).length });
  const kedja = (t: string): any => {
    const k: any = new Proxy(function () {}, {
      get: (_m, p) => {
        if (p === 'then') return (r: any, f: any) => Promise.resolve(svar(t)).then(r, f);
        if (p === 'single' || p === 'maybeSingle') return () => Promise.resolve({ data: (RADER[t] ?? [])[0] ?? null, error: null });
        return () => k;
      },
      apply: () => k,
    });
    return k;
  };
  return {
    supabase: {
      from: (t: string) => kedja(t),
      rpc: () => kedja('rpc'),
      auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    },
  };
});
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, replace() {} }) }));

import ObjektRedigering from './RedigeringClient';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove(); document.body.innerHTML = ''; });
const vanta = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const klick = async (n: Element | null) => { expect(n).not.toBeNull(); await act(async () => { (n as HTMLElement).click(); }); await vanta(); };

describe('objektets ark', () => {
  it('öppnas från listan, har stäng med 44 px tryckyta, och undersidan har tillbaka men ingen Klar-fot', async () => {
    el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => { root!.render(<ObjektRedigering />); });
    await vanta(12);
    const rad = Array.from(document.querySelectorAll('button, a, [role="button"]')).find(b => b.textContent?.includes('Mölleryd'));
    await klick(rad ?? null);
    const stang = document.querySelector('[data-ark-stang]') as HTMLElement;
    expect(stang).not.toBeNull();
    expect(stang.style.width).toBe('44px');
    expect(stang.style.height).toBe('44px');
    expect(document.querySelector('[data-ark-tillbaka]')).toBeNull();

    const filer = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim().startsWith('Filer'));
    await klick(filer ?? null);
    expect(document.querySelector('[data-ark-tillbaka]')).not.toBeNull();
    expect(Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Klar')).toBe(false);
    expect(document.querySelector('[data-ark-spara]')).toBeNull();

    await klick(document.querySelector('[data-ark-tillbaka]'));
    expect(document.querySelector('[data-ark-tillbaka]')).toBeNull();
  });
});
