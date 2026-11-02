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
  from: () => ({ select: () => {
    const svar = Promise.resolve({ data: [{ maskin_id: 'G', visningsnamn: 'Giant', aktiv_till: null }], error: null });
    return Object.assign(svar, { eq: async () => ({ data: [], error: null }) });
  } }),
} }));

vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: { id: 'martin', namn: 'Martin', roll: 'admin' }, loading: false }) }));
const koade: { sokvag: string; namn: string }[] = [];
vi.mock('@/lib/maskinkoll/fotoKo', () => ({ laggMaskinkollFoto: async (_k: string, _d: string, sokvag: string, fil: File) => { koade.push({ sokvag, namn: fil.name }); } }));
vi.mock('@/lib/arbetsmiljo/atgarder', () => ({ fotoLank: async (_sb: unknown, sokvag: string) => `https://signerad/${sokvag}` }));
(URL as any).createObjectURL = () => 'blob:lokal';

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
    svara: async (_s: unknown, id: string, p: Punkt, svar: SvarTyp, b: string | null, foto: string | null = null) => {
      const r = ronder.find(x => x.id === id)!; r.svar = r.svar.filter(x => x.punkt !== p.id); r.svar.push({ punkt: p.id, svar, beskrivning: b, fotoUrl: foto }); return true;
    },
    avsluta: async (_s: unknown, id: string, d: string) => { if (avslutFel) return avslutFel; const r = ronder.find(x => x.id === id)!; r.klar = new Date().toISOString(); r.deltagare = d; return null; },
  };
});
let pdfBytes: Uint8Array | null = null;
vi.mock('@/app/helikopter/_components/PdfForhandsvisning', async () => {
  const { useEffect } = await import('react');
  return { default: ({ skapa, titel }: { skapa: () => Promise<Uint8Array>; titel: string }) => {
    useEffect(() => { skapa().then(b => { pdfBytes = b; }); }, [skapa]);
    return <div data-testid="pdf-panel">{titel}</div>;
  } };
});
import Skyddsrond from './Skyddsrond';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => { koade.length = 0; ronder = []; lasare = true; avslutFel = null; el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
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
    // Bilden är valfri: välj en, den visas, och sparas som en sökväg i egen mapp.
    const fil = new File(['x'], 'slackare.jpg', { type: 'image/jpeg' });
    const inp = q('[data-testid="sr-bild-fil"]') as HTMLInputElement;
    Object.defineProperty(inp, 'files', { value: [fil], configurable: true });
    await act(async () => { inp.dispatchEvent(new Event('change', { bubbles: true })); });
    expect((q('[data-testid="sr-bild"] img') as HTMLImageElement).src).toBe('blob:lokal');
    await act(async () => { q('[data-testid="sr-spara-brist"]')!.click(); }); await vanta();
    expect(koade).toHaveLength(1);
    expect(koade[0].sokvag).toMatch(/^martin\/skyddsrond\/ny-brand_slackare_G-\d+\.jpg$/);
    expect(ronder[0].svar.find(x => x.punkt === 'brand_slackare:G')!.fotoUrl).toBe(koade[0].sokvag);
    expect(q('[data-testid="sr-punkt-brand_slackare:G"]')!.textContent).toContain('Brist: En släckare saknas · Bild');
    // Öppnas bristen igen visas den sparade bilden (signerad länk); Ta bort bilden gör att den inte sparas.
    await act(async () => { q('[data-testid="sr-punkt-brand_slackare:G"]')!.click(); }); await vanta();
    expect((q('[data-testid="sr-bild"] img') as HTMLImageElement).src).toBe(`https://signerad/${koade[0].sokvag}`);
    await act(async () => { q('[data-testid="sr-bild-bort"]')!.click(); });
    expect(q('[data-testid="sr-bild-ta"]')).toBeTruthy();
    await act(async () => { q('[data-testid="sr-spara-brist"]')!.click(); }); await vanta();
    expect(ronder[0].svar.find(x => x.punkt === 'brand_slackare:G')!.fotoUrl).toBeNull();
    expect(koade).toHaveLength(1);
    await act(async () => { q('[data-testid="sr-punkt-sasong"]')!.click(); });
    await act(async () => { q('[data-testid="sr-svar-galler_inte"]')!.click(); }); await vanta();

    expect(q('[data-testid="sr-svar"]')!.textContent).toBe('3 av 3 klart');
    await act(async () => { q('[data-testid="sr-klar"]')!.click(); });
    expect((q('[data-testid="sr-avsluta"]') as HTMLButtonElement).disabled).toBe(true);
    await skriv('[data-testid="sr-ark"], input', 'Martin och Oskar');
    await act(async () => { q('[data-testid="sr-avsluta"]')!.click(); }); await vanta();
    expect(q('[data-testid="sr-svar"]')!.textContent).toMatch(/^Gjord .* · nästa senast /);
    expect(q('[data-testid^="sr-tidigare-"]')!.textContent).toContain('1 brist');

    // En klar rond går att dela som PDF; en pågående har ingen knapp.
    expect(q('[data-testid="sr-pdf"]')).toBeNull();
    await act(async () => { q('[data-testid^="sr-tidigare-"]')!.click(); });
    pdfBytes = null;
    await act(async () => { q('[data-testid="sr-pdf"]')!.click(); });
    for (let i = 0; i < 40 && !pdfBytes; i++) await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    expect(q('[data-testid="pdf-panel"]')!.textContent).toBe('Skyddsrond');
    expect(pdfBytes!.length).toBeGreaterThan(1000);
  });

  it('den som inte går ronden ser bara en rad', async () => {
    lasare = false;
    await act(async () => { root.render(<Skyddsrond />); }); await vanta();
    expect(q('[data-testid="sr-svar"]')!.textContent).toBe('Skyddsronden går arbetsledningen och skyddsombudet.');
    expect(q('[data-testid="sr-starta"]')).toBeNull();
  });
});
