// @vitest-environment jsdom
// Introduktionen renderas på riktigt: läget i ord överst, fem rader, ett tryck öppnar arket med "Jag har läst",
// sparningen läses om, ett sparfel säger det, och läsfel är ett fel med Försök igen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const kvitton: { steg: string; tid: string }[] = [];
let lasOk = true; let sparOk = true;
vi.mock('@/lib/arbetsmiljo/introduktion', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/introduktion')>()),
  hamtaKvitton: async () => (lasOk ? new Map([['stefan', [...kvitton]]]) : null),
  kvittera: async (_sb: unknown, _id: string, steg: string) => { if (!sparOk) return false; kvitton.push({ steg, tid: '2026-11-03T08:00:00Z' }); return true; },
}));
import Introduktion from './Introduktion';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root; let el: HTMLDivElement;
beforeEach(() => {
  kvitton.length = 0; lasOk = true; sparOk = true;
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, json: async () => ({
    ok: true, egenId: 'stefan', skyddsombud: { namn: 'Oskar Nilsson', telefon: '070-3' },
    personal: [{ id: 'stefan', telefon: '070-1', anhorig_telefon: null }],
  }) }));
});
afterEach(() => { act(() => root.unmount()); el.remove(); });

const vanta = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;

describe('Introduktion', () => {
  it('svaret först, fem rader, ingen klar från början när anhörig saknas', async () => {
    await act(async () => { root.render(<Introduktion />); }); await vanta();
    expect(q('[data-testid="intro-svar"]')!.textContent).toBe('0 av 5 klart · Det här ska du veta innan du kör');
    expect(document.querySelectorAll('[data-testid^="intro-steg-"]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-testid^="intro-klar-"]')).toHaveLength(0);
  });

  it('Jag har läst sparar, stänger arket och räknar upp', async () => {
    await act(async () => { root.render(<Introduktion />); }); await vanta();
    await act(async () => { q('[data-testid="intro-steg-nod"]')!.click(); });
    expect(q('[data-testid="intro-ark"]')!.textContent).toContain('fungerar utan täckning');
    await act(async () => { q('[data-testid="intro-las"]')!.click(); }); await vanta();
    expect(q('[data-testid="intro-ark"]')).toBeNull();
    expect(q('[data-testid="intro-klar-nod"]')).toBeTruthy();
    expect(q('[data-testid="intro-svar"]')!.textContent).toContain('1 av 5 klart');
  });

  it('skyddsombudet står med namn och Ring; ett sparfel säger det och arket står kvar', async () => {
    sparOk = false;
    await act(async () => { root.render(<Introduktion />); }); await vanta();
    await act(async () => { q('[data-testid="intro-steg-skyddsombud"]')!.click(); });
    expect(q('[data-testid="intro-skyddsombud"]')!.textContent).toContain('Oskar Nilsson');
    await act(async () => { q('[data-testid="intro-las"]')!.click(); }); await vanta();
    expect(q('[data-testid="intro-fel"]')).toBeTruthy();
    expect(q('[data-testid="intro-ark"]')).toBeTruthy();
  });

  it('kan kvittona inte läsas är det ett fel, aldrig "0 av 5"', async () => {
    lasOk = false;
    await act(async () => { root.render(<Introduktion />); }); await vanta();
    expect(q('[data-testid="intro-svar"]')!.textContent).toBe('Kunde inte läsa introduktionen.');
    expect(q('[data-testid^="intro-steg-"]')).toBeNull();
  });
});
