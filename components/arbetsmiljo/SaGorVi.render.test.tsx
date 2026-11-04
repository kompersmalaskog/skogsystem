// @vitest-environment jsdom
// Så gör vi renderas på riktigt: föraren ser bara godkända och trycker "Jag har läst"; admin trycker Stämmer och ändrar stegen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let jag: { id: string; roll: 'admin' | 'forare' } = { id: 'f', roll: 'forare' };
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: jag, loading: false }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

let g: any = {};
let kvitton: any[] = [];
const kvitterade: unknown[][] = [];
const godkanda: unknown[][] = [];
const sparade: unknown[][] = [];
vi.mock('@/lib/arbetsmiljo/saGorVi', async (orig) => {
  const o = await orig<typeof import('@/lib/arbetsmiljo/saGorVi')>();
  return {
    ...o,
    hamta: async () => Object.fromEntries(o.INSTR_IDN.map(id => [id, g[id] ?? o.TOM])),
    hamtaKvitton: async () => kvitton,
    kvittera: async (...a: unknown[]) => { kvitterade.push(a.slice(1)); return true; },
    godkann: async (...a: unknown[]) => { godkanda.push(a.slice(1)); return true; },
    sparaSteg: async (...a: unknown[]) => { sparade.push(a.slice(1)); return true; },
  };
});
import SaGorVi from './SaGorVi';
import { instruktion, underlag } from '@/lib/arbetsmiljo/saGorVi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
const ok = (id: 'ensam' | 'trailer') => ({ steg: null, godkandUnderlag: underlag(instruktion(id, undefined)), godkandTid: new Date().toISOString() });
beforeEach(() => {
  jag = { id: 'f', roll: 'forare' }; g = { ensam: ok('ensam') }; kvitton = []; kvitterade.length = 0; godkanda.length = 0; sparade.length = 0;
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
});
afterEach(() => { act(() => root.unmount()); el.remove(); });
const vanta = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const klick = async (s: string) => { await act(async () => { q(s)!.click(); }); await vanta(); };

describe('Så gör vi', () => {
  it('föraren ser bara godkända, läser stegen och trycker Jag har läst', async () => {
    await act(async () => { root.render(<SaGorVi />); }); await vanta();
    expect(q('[data-testid="sgv-svar"]')!.textContent).toBe('1 att läsa');
    expect(document.querySelectorAll('[data-sgv]')).toHaveLength(1);
    await klick('[data-sgv="ensam"]');
    expect(q('[data-sgv-steg]')!.querySelectorAll('li')).toHaveLength(4);
    expect(q('[data-sgv-andra-knapp]')).toBeNull();
    await klick('[data-sgv-las]');
    expect(kvitterade).toHaveLength(1);
    expect(kvitterade[0][0]).toBe('f');
  });

  it('admin ser alla, trycker Stämmer och ändrar stegen (minst tre)', async () => {
    jag = { id: 'a', roll: 'admin' };
    await act(async () => { root.render(<SaGorVi />); }); await vanta();
    expect(q('[data-testid="sgv-svar"]')!.textContent).toBe('5 av 6 att godkänna');
    expect(document.querySelectorAll('[data-sgv]')).toHaveLength(6);
    await klick('[data-sgv="trailer"]');
    expect(q('[data-sgv-lage]')!.textContent).toBe('Inte godkänd');
    await klick('[data-sgv-stammer]');
    expect(godkanda).toHaveLength(1);
    await klick('[data-sgv="trailer"]');
    await klick('[data-sgv-andra-knapp]');
    const falt = Array.from(document.querySelectorAll('[data-sgv-andra] input')) as HTMLInputElement[];
    expect(falt).toHaveLength(5);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (const f of falt.slice(2)) await act(async () => { set.call(f, ''); f.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((q('[data-sgv-spara]') as HTMLButtonElement).disabled).toBe(true); // bara två steg kvar
    await act(async () => { set.call(falt[2], 'Ny rad'); falt[2].dispatchEvent(new Event('input', { bubbles: true })); });
    await klick('[data-sgv-spara]');
    expect(sparade[0][0]).toBe('trailer');
    expect((sparade[0][1] as string[])[2]).toBe('Ny rad');
  });
});
