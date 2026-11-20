// @vitest-environment jsdom
// Farligt avfall renderas på riktigt: svaret, Lämnat avfall → var och vad → mottagaren skriver namn och under → kvittot.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let jag: { id: string; roll: 'admin' | 'forare'; namn: string } = { id: 'm1', roll: 'forare', namn: 'Stefan Karlsson' };
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: jag, loading: false }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/markeringFoto', () => ({ komprimeraMarkeringFoto: async (f: File) => f }));
vi.mock('@/app/helikopter/_components/PdfForhandsvisning', () => ({ default: ({ titel }: { titel: string }) => <div data-testid="pdf-panel">{titel}</div> }));
vi.mock('./Underskrift', () => ({
  default: ({ onAndrad }: { onAndrad: (p: string | null) => void }) => <button type="button" data-test-skriv onClick={() => onAndrad('data:image/png;base64,AAAA')}>skriv</button>,
}));

let lamningar: any[] | null = [];
let ko: any[] = [];
let kvarEfterSkick = 0;
vi.mock('@/lib/arbetsmiljo/avfall', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/avfall')>()),
  hamtaLamningar: async () => lamningar,
  hamtaMottagare: async () => [{ id: 'lbc', namn: 'LBC Ryd' }, { id: 'hs', namn: 'Hydroscand' }],
  bildLank: async () => null,
}));
vi.mock('@/lib/arbetsmiljo/avfallKo', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/avfallKo')>()),
  laggIKo: (p: unknown) => { ko.push(p); return true; },
  skickaKo: async () => { if (kvarEfterSkick === 0) ko = []; return kvarEfterSkick; },
  vantande: () => ko.map((p: any) => ({ ...p, lamnadTid: p.skapad, underskriftSokvag: '', foljesedelSokvag: null, vantar: true })),
}));
import Avfall from './Avfall';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => {
  jag = { id: 'm1', roll: 'forare', namn: 'Stefan Karlsson' }; ko = []; kvarEfterSkick = 0;
  lamningar = [{ id: 'g', mottagareNamn: 'LBC Ryd', poster: [{ typ: 'slang', antal: 1 }], kg: 2, kvitteradNamn: 'Kalle', underskriftSokvag: 'x', foljesedelSokvag: null, lamnadTid: '2026-10-03T08:00:00Z', lamnadAvNamn: 'Oskar' }];
  try { localStorage.clear(); } catch { /* */ }
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
});
afterEach(() => { act(() => root.unmount()); el.remove(); });
const vanta = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const klick = async (s: string) => { await act(async () => { q(s)!.click(); }); await vanta(); };
const knapp = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text || b.getAttribute('aria-label') === text) as HTMLButtonElement;
const skriv = async (etikett: string, v: string) => {
  const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent === etikett)!;
  const falt = document.getElementById(label.getAttribute('for')!) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(falt, v); falt.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Farligt avfall', () => {
  it('svaret säger när och var senast', async () => {
    await act(async () => { root.render(<Avfall />); }); await vanta();
    expect(q('[data-testid="avfall-svar"]')!.textContent).toBe('Senast lämnat 3 okt');
    expect(q('[data-avfall-rad="g"]')!.textContent).toContain('Kvitterat');
    expect(q('[data-avfall-mottagare]')).toBeNull(); // bara admin
  });

  it('hela flödet: var och vad, sedan kvitterar mottagaren på telefonen', async () => {
    await act(async () => { root.render(<Avfall />); }); await vanta();
    await klick('[data-avfall-ny]');
    const lamnat = q('[data-avfall-lamnat]') as HTMLButtonElement;
    expect(lamnat.disabled).toBe(true); // inget valt
    expect(knapp('LBC Ryd').getAttribute('aria-selected')).toBe('true'); // förvalt
    await act(async () => { knapp('Hydraulslangar: en till').click(); knapp('Hydraulslangar: en till').click(); });
    await klick('[data-testid="avfall-trasor"]');
    expect(q('[data-testid="avfall-kg"]')!.textContent).toContain('Ca 7 kg');
    await klick('[data-avfall-lamnat]');

    expect(q('[data-avfall-kvittera]')!.textContent).toContain('Ge telefonen till LBC Ryd');
    const mottaget = q('[data-avfall-mottaget]') as HTMLButtonElement;
    expect(mottaget.disabled).toBe(true);
    await skriv('Ditt namn', 'Kalle Andersson');
    expect((q('[data-avfall-mottaget]') as HTMLButtonElement).disabled).toBe(true); // utan underskrift
    await klick('[data-test-skriv]');
    await klick('[data-avfall-mottaget]');

    expect(q('[data-avfall-klart]')!.textContent).toContain('LBC Ryd har tagit emot det');
    expect(q('[data-avfall-klart-not]')!.textContent).toContain('sparas i tre år');
    expect(localStorage.getItem('avfall_mottagare_v1')).toBe('lbc');
  });

  it('det som skickas är det mottagaren såg', async () => {
    kvarEfterSkick = 1;
    await act(async () => { root.render(<Avfall />); }); await vanta();
    await klick('[data-avfall-ny]');
    await act(async () => { knapp('Hydroscand').click(); knapp('Tomma oljedunkar: en till').click(); });
    await klick('[data-avfall-lamnat]');
    await skriv('Ditt namn', 'Eva');
    await klick('[data-test-skriv]');
    await klick('[data-avfall-mottaget]');
    expect(ko).toHaveLength(1);
    expect(ko[0]).toMatchObject({ medarbetareId: 'm1', mottagareId: 'hs', mottagareNamn: 'Hydroscand', poster: [{ typ: 'dunkar', antal: 1 }], kg: 1, kvitteradNamn: 'Eva', underskrift: 'data:image/png;base64,AAAA' });
    // Utan täckning säger kvittot det.
    expect(q('[data-avfall-klart-not]')!.textContent).toContain('Sparad i telefonen');
  });

  it('Stämmer inte tar tillbaka till formuläret med valen kvar', async () => {
    await act(async () => { root.render(<Avfall />); }); await vanta();
    await klick('[data-avfall-ny]');
    await act(async () => { knapp('Hydraulslangar: en till').click(); });
    await klick('[data-avfall-lamnat]');
    await klick('[data-avfall-stammer-inte]');
    expect(q('[data-testid="avfall-slang"]')!.textContent).toBe('1');
  });

  it('admin ser mottagarna och årets lista med PDF', async () => {
    jag = { id: 'm1', roll: 'admin', namn: 'Martin Lindqvist' };
    lamningar = [{ ...lamningar![0], lamnadTid: new Date().toISOString() }];
    await act(async () => { root.render(<Avfall />); }); await vanta();
    expect(q('[data-avfall-mottagare]')!.textContent).toContain('LBC Ryd, Hydroscand');
    await klick('[data-avfall-arslista]');
    expect(q('[data-testid="avfall-ar-svar"]')!.textContent).toBe('1 lämning');
    await klick('[data-avfall-pdf]');
    expect(q('[data-testid="pdf-panel"]')).not.toBeNull();
  });
});
