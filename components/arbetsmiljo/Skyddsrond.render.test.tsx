// @vitest-environment jsdom
// Skyddsronden renderad på riktigt: starta, svara Bra och Brist (text krävs), Klar först när allt är besvarat och med deltagare.
// Den som inte är admin eller skyddsombud ser bara en rad.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Punkt, Rond, SvarTyp } from '@/lib/arbetsmiljo/skyddsrond';

let lasare = true;
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: async () => ({ data: lasare, error: null }),
  from: () => ({ select: async () => ({ data: [{ maskin_id: 'G', visningsnamn: 'Giant', aktiv_till: null }], error: null }) }),
} }));

let ronder: Rond[] = [];
let avslutFel: string | null = null;
vi.mock('@/lib/arbetsmiljo/skyddsrond', async (orig) => {
  const o = await orig<typeof import('@/lib/arbetsmiljo/skyddsrond')>();
  const kort: Punkt[] = o.byggPunkter([{ id: 'G', namn: 'Giant' }]).slice(0, 3);
  return {
    ...o,
    byggPunkter: () => kort,
    hamtaRonder: async () => JSON.parse(JSON.stringify(ronder)),
    startaRond: async (_s: unknown, punkter: Punkt[]) => { ronder.unshift({ id: 'ny', punkter, deltagare: null, startad: new Date().toISOString(), klar: null, svar: [] }); return 'ny'; },
    svara: async (_s: unknown, id: string, p: Punkt, svar: SvarTyp, b: string | null) => {
      const r = ronder.find(x => x.id === id)!; r.svar = r.svar.filter(x => x.punkt !== p.id); r.svar.push({ punkt: p.id, svar, beskrivning: b }); return true;
    },
    avsluta: async (_s: unknown, id: string, d: string) => { if (avslutFel) return avslutFel; const r = ronder.find(x => x.id === id)!; r.klar = new Date().toISOString(); r.deltagare = d; return null; },
  };
});
import Skyddsrond from './Skyddsrond';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => { ronder = []; lasare = true; avslutFel = null; el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => root.unmount()); el.remove(); document.body.innerHTML = ''; });
const vanta = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const skriv = async (s: string, v: string) => {
  const e = q(s) as HTMLTextAreaElement | HTMLInputElement;
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Skyddsrond', () => {
  it('hela ronden: starta, Bra, Brist med text, Gäller inte, Klar med deltagare', async () => {
    await act(async () => { root.render(<Skyddsrond />); }); await vanta();
    expect(q('[data-testid="sr-svar"]')!.textContent).toBe('Ingen skyddsrond gjord än');
    await act(async () => { q('[data-testid="sr-starta"]')!.click(); }); await vanta();
    expect(q('[data-testid="sr-svar"]')!.textContent).toBe('0 av 3 klart');
    expect((q('[data-testid="sr-klar"]') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { q('[data-testid="sr-punkt-brand_protokoll:G"]')!.click(); });
    await act(async () => { q('[data-testid="sr-svar-ok"]')!.click(); }); await vanta();
    await act(async () => { q('[data-testid="sr-punkt-brand_slackare:G"]')!.click(); });
    await act(async () => { q('[data-testid="sr-svar-brist"]')!.click(); });
    expect((q('[data-testid="sr-spara-brist"]') as HTMLButtonElement).disabled).toBe(true);
    await skriv('[data-testid="sr-brist-text"]', 'En släckare saknas');
    await act(async () => { q('[data-testid="sr-spara-brist"]')!.click(); }); await vanta();
    expect(q('[data-testid="sr-punkt-brand_slackare:G"]')!.textContent).toContain('Brist: En släckare saknas');
    await act(async () => { q('[data-testid="sr-punkt-sasong"]')!.click(); });
    await act(async () => { q('[data-testid="sr-svar-galler_inte"]')!.click(); }); await vanta();

    expect(q('[data-testid="sr-svar"]')!.textContent).toBe('3 av 3 klart');
    await act(async () => { q('[data-testid="sr-klar"]')!.click(); });
    expect((q('[data-testid="sr-avsluta"]') as HTMLButtonElement).disabled).toBe(true);
    await skriv('[data-testid="sr-ark"], input', 'Martin och Oskar');
    await act(async () => { q('[data-testid="sr-avsluta"]')!.click(); }); await vanta();
    expect(q('[data-testid="sr-svar"]')!.textContent).toMatch(/^Gjord .* · nästa senast /);
    expect(q('[data-testid^="sr-tidigare-"]')!.textContent).toContain('1 brist');
  });

  it('den som inte går ronden ser bara en rad', async () => {
    lasare = false;
    await act(async () => { root.render(<Skyddsrond />); }); await vanta();
    expect(q('[data-testid="sr-svar"]')!.textContent).toBe('Skyddsronden går arbetsledningen och skyddsombudet.');
    expect(q('[data-testid="sr-starta"]')).toBeNull();
  });
});
