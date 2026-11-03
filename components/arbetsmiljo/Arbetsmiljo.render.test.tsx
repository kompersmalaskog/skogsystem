// @vitest-environment jsdom
// Arbetsmiljö-sidan renderas på riktigt: svaret överst, Om något händer, en rad per del med läget i ord, läsfel med Försök igen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let jag: Record<string, unknown> | null = null;
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { email: 'm@x.se' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => (jag ? { data: jag, error: null } : { data: null, error: { message: 'x' } }), maybeSingle: async () => ({ data: { maskin_typ: 'Forwarder' }, error: null }) }) }) }),
  },
}));
vi.mock('@/lib/maskinkoll/data', () => ({ hamtaMaskinkollVantar: async () => 1 }));
vi.mock('@/lib/arbetsmiljo/atgarder', () => ({ hamtaAtgardMarke: async () => ({ antal: 2, stopp: 0 }) }));
vi.mock('@/lib/arbetsmiljo/skyddsrond', async (orig) => ({ ...(await orig<typeof import('@/lib/arbetsmiljo/skyddsrond')>()), hamtaRonder: async () => [] }));
vi.mock('@/lib/arbetsmiljo/maskinRisk', async (orig) => {
  const o = await orig<typeof import('@/lib/arbetsmiljo/maskinRisk')>();
  return { ...o, hamtaBedomningar: async () => Object.fromEntries(o.MASKINTYPER.map(t => [t, { ...o.TOM, bort: [], egna: [] }])), hamtaKvitton: async () => [] };
});
vi.mock('@/lib/arbetsmiljo/introduktion', async (orig) => ({ ...(await orig<typeof import('@/lib/arbetsmiljo/introduktion')>()), hamtaKvitton: async () => new Map() }));
import Arbetsmiljo from './Arbetsmiljo';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => root.unmount()); el.remove(); });
const vanta = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;

describe('Arbetsmiljö', () => {
  it('admin: svaret räknar det som behöver dig, och varje del är en rad till sin vy', async () => {
    jag = { id: 'm', roll: 'admin', telefon: '1', anhorig_telefon: '2', maskin_id: null, skyddsombud: false };
    await act(async () => { root.render(<Arbetsmiljo />); }); await vanta();
    expect(q('[data-testid="am-svar"]')!.textContent).toBe('4 saker behöver dig');
    expect(q('[data-testid="am-nod"]')!.getAttribute('href')).toBe('/om-nagot-hander');
    const rader = Array.from(document.querySelectorAll('[data-am-rad]')).map(e => [e.getAttribute('data-am-rad'), e.getAttribute('href')]);
    expect(rader).toEqual([
      ['atgarder', '/atgarder'], ['skyddsrond', '/skyddsrond'], ['riskbedomning', '/riskbedomning'],
      ['maskinkoll', '/maskinkoll'], ['nagot-ar-fel', '/maskinkoll?fel=1'], ['introduktion', '/introduktion'],
    ]);
    expect(q('[data-am-rad="atgarder"]')!.textContent).toContain('2 att åtgärda');
    expect(q('[data-am-rad="riskbedomning"]')!.textContent).toContain('0 av 4 godkända');
  });

  it('förare: ser inte Åtgärder och Skyddsrond', async () => {
    jag = { id: 'f', roll: 'forare', telefon: '1', anhorig_telefon: null, maskin_id: 'A1', skyddsombud: false };
    await act(async () => { root.render(<Arbetsmiljo />); }); await vanta();
    expect(q('[data-am-rad="atgarder"]')).toBeNull();
    expect(q('[data-am-rad="skyddsrond"]')).toBeNull();
    expect(q('[data-am-rad="introduktion"]')!.textContent).toContain('0 av 5 klart');
  });

  it('läsfel: säger det och har Försök igen, aldrig "i ordning"', async () => {
    jag = null;
    await act(async () => { root.render(<Arbetsmiljo />); }); await vanta();
    expect(q('[data-testid="am-svar"]')!.textContent).toBe('Kunde inte läsa arbetsmiljön');
    expect(document.body.textContent).toContain('Försök igen');
  });
});
