// @vitest-environment jsdom
// Kemikalier renderas på riktigt: svaret, de som saknar blad först, EN knapp som öppnar bladet, admin lägger till och bockar av året.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let jag: { id: string; roll: 'admin' | 'forare' } = { id: 'm', roll: 'admin' };
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: jag, loading: false }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

let lista: any[] | null = [];
const tillagda: unknown[][] = [];
const lankar: string[] = [];
vi.mock('@/lib/arbetsmiljo/kemikalier', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/kemikalier')>()),
  hamtaKemikalier: async () => lista,
  laggTill: async (...a: unknown[]) => { tillagda.push(a.slice(1)); return null; },
  bladLank: async (_sb: unknown, s: string) => { lankar.push(s); return `https://signerad.example/${s}`; },
}));
const gjort: unknown[][] = [];
let gjorda: any[] = [];
vi.mock('@/lib/arbetsmiljo/arshjul', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/arshjul')>()),
  hamtaGjorda: async () => gjorda,
  markeraGjord: async (...a: unknown[]) => { gjort.push(a.slice(1)); return null; },
}));
import Kemikalier from './Kemikalier';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => {
  jag = { id: 'm', roll: 'admin' }; tillagda.length = 0; lankar.length = 0; gjort.length = 0; gjorda = [];
  lista = [
    { id: 'a', namn: 'Hydraulolja', varFinns: 'Giant', sdbSokvag: 'a/1.pdf', sdbTid: '2026-11-01T10:00:00Z' },
    { id: 'b', namn: 'Avfettning', varFinns: null, sdbSokvag: null, sdbTid: null },
  ];
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
});
afterEach(() => { act(() => root.unmount()); el.remove(); });
const vanta = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const klick = async (s: string) => { await act(async () => { q(s)!.click(); }); await vanta(); };
const skriv = async (etikett: string, v: string) => {
  const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent === etikett)!;
  const falt = document.getElementById(label.getAttribute('for')!) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(falt, v); falt.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Kemikalier', () => {
  it('svaret säger vad som saknas, och det som saknar blad står först', async () => {
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-testid="kem-svar"]')!.textContent).toBe('1 saknar säkerhetsblad');
    const rader = Array.from(document.querySelectorAll('[data-kem]')).map(e => e.getAttribute('data-kem'));
    expect(rader).toEqual(['b', 'a']);
    expect(q('[data-kem="b"]')!.textContent).toContain('Saknas');
    expect(q('[data-kem="b"]')!.textContent).toContain('Var den finns är inte ifyllt');
  });

  it('ett tryck på en produkt ger EN knapp som öppnar bladet', async () => {
    const w = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(w as never);
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem="a"]');
    await klick('[data-kem-oppna]');
    expect(lankar).toEqual(['a/1.pdf']);
    expect(w.location.href).toBe('https://signerad.example/a/1.pdf');
  });

  it('föraren ser listan och kan öppna bladet, men inte lägga till eller bocka av året', async () => {
    jag = { id: 'f', roll: 'forare' };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-kem-ny]')).toBeNull();
    expect(q('[data-kem-genomgang]')).toBeNull();
    await klick('[data-kem="b"]');
    expect(q('[data-kem-oppna]')).toBeNull();
    expect(document.body.textContent).toContain('Säg till arbetsledningen');
    expect(q('[data-kem-bort]')).toBeNull();
  });

  it('admin lägger till en produkt; Lägg till är grå tills den har ett namn', async () => {
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-ny]');
    expect((q('[data-kem-spara]') as HTMLButtonElement).disabled).toBe(true);
    await skriv('Vad heter den?', 'Kedjeolja');
    await skriv('Var finns den?', 'Verkstaden');
    await klick('[data-kem-spara]');
    expect(tillagda).toEqual([['Kedjeolja', 'Verkstaden', null]]);
  });

  it('årets genomgång bockar av årshjulets punkt Kemikalierna', async () => {
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-genomgang]');
    expect(gjort).toHaveLength(1);
    expect(gjort[0][1]).toBe('kemikalier');
  });

  it('läsfel säger det med Försök igen, aldrig en tom lista', async () => {
    lista = null;
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-testid="kem-svar"]')!.textContent).toBe('Kunde inte läsa kemikalierna');
    expect(document.body.textContent).toContain('Försök igen');
  });
});
