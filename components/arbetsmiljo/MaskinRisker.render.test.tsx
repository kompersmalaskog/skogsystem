// @vitest-environment jsdom
// Riskbedömning per maskintyp, renderad på riktigt: förare ser bara godkända typer och sin maskin först, läser och kvitterar;
// admin tar bort ett förslag och trycker Stämmer; läsfel är ett fel med Försök igen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Bedomning, Kvitto, MaskinTyp } from '@/lib/arbetsmiljo/maskinRisk';

let jag = { id: 'stefan', namn: 'Stefan Ek', roll: 'forare' as 'forare' | 'admin', maskin_id: 'A030353', partner_user_id: null };
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: jag, loading: false }) }));

const tabeller: Record<string, unknown[]> = {
  dim_maskin: [{ maskin_id: 'A030353', maskin_typ: 'Forwarder' }, { maskin_id: 'GIANT', maskin_typ: 'Harvester' }],
  medarbetare: [{ id: 'stefan', namn: 'Stefan Ek', roll: 'forare', aktiv: true, maskin_id: 'A030353', foretagsledare: false }],
};
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => ({ select: () => Promise.resolve({ data: tabeller[t] ?? [], error: null }) }) } }));

const tom = (): Bedomning => ({ bort: [], egna: [], godkandUnderlag: null, godkandTid: null, godkandAv: null });
let bed: Record<MaskinTyp, Bedomning>;
let kvitton: Kvitto[];
let lasOk = true;
const sparade: { typ: MaskinTyp; b: Bedomning; godkann: boolean }[] = [];
vi.mock('@/lib/arbetsmiljo/maskinRisk', async (orig) => {
  const o = await orig<typeof import('@/lib/arbetsmiljo/maskinRisk')>();
  return {
    ...o,
    hamtaBedomningar: async () => (lasOk ? JSON.parse(JSON.stringify(bed)) : null),
    hamtaKvitton: async () => [...kvitton],
    sparaListan: async (_s: unknown, typ: MaskinTyp, b: Bedomning) => { sparade.push({ typ, b, godkann: false }); bed[typ] = b; return true; },
    godkann: async (_s: unknown, typ: MaskinTyp, b: Bedomning) => {
      sparade.push({ typ, b, godkann: true });
      bed[typ] = { ...b, godkandUnderlag: o.underlag(o.lista(typ, b)), godkandTid: '2026-11-02T10:00:00Z', godkandAv: 'martin' };
      return true;
    },
    kvittera: async (_s: unknown, id: string, typ: MaskinTyp, u: string) => { kvitton.push({ medarbetareId: id, maskintyp: typ, underlag: u, tid: '2026-11-02T11:00:00Z' }); return true; },
  };
});
vi.mock('@/app/helikopter/_components/PdfForhandsvisning', () => ({ default: ({ titel }: { titel: string }) => <div data-testid="pdf-panel">{titel}</div> }));
import MaskinRisker from './MaskinRisker';
import { lista, underlag } from '@/lib/arbetsmiljo/maskinRisk';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => {
  bed = { skordare: tom(), skotare: tom(), lastbil: tom(), motorsag: tom() };
  bed.skotare = { ...bed.skotare, godkandUnderlag: underlag(lista('skotare', bed.skotare)), godkandTid: new Date().toISOString(), godkandAv: 'martin' };
  kvitton = []; lasOk = true; sparade.length = 0;
  jag = { ...jag, id: 'stefan', roll: 'forare' };
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
});
afterEach(() => { act(() => root.unmount()); el.remove(); document.body.innerHTML = ''; });
const vanta = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;

describe('Riskbedömning per maskintyp', () => {
  it('föraren ser bara godkända typer, läser sin maskin och kvitterar', async () => {
    await act(async () => { root.render(<MaskinRisker />); }); await vanta();
    expect(q('[data-testid="mr-svar"]')!.textContent).toBe('Läs riskerna för din maskin');
    expect(document.querySelectorAll('[data-testid^="mr-typ-"]')).toHaveLength(1);
    await act(async () => { q('[data-testid="mr-typ-skotare"]')!.click(); });
    expect(q('[data-testid="mr-risk-last"]')).toBeTruthy();
    expect(q('[data-testid^="mr-bort-"]')).toBeNull();
    expect(q('[data-testid="mr-pdf"]')).toBeNull();
    await act(async () => { q('[data-testid="mr-las"]')!.click(); }); await vanta();
    expect(q('[data-testid="mr-last"]')!.textContent).toContain('Läst');
    expect(q('[data-testid="mr-svar"]')!.textContent).toBe('Du har läst riskerna för din maskin ✓');
  });

  it('admin: gäller inte sparar, listan blir ändrad, Stämmer godkänner, och vem som läst står', async () => {
    jag = { ...jag, id: 'martin', roll: 'admin' };
    await act(async () => { root.render(<MaskinRisker />); }); await vanta();
    expect(q('[data-testid="mr-svar"]')!.textContent).toBe('3 av 4 att godkänna');
    await act(async () => { q('[data-testid="mr-pdf"]')!.click(); });
    expect(q('[data-testid="pdf-panel"]')!.textContent).toBe('Riskbedömning');
    await act(async () => { q('[data-testid="mr-typ-skotare"]')!.click(); });
    expect(q('[data-testid="mr-lasta"]')!.textContent).toBe('Stefan har inte läst');
    await act(async () => { q('[data-testid="mr-bort-brand"]')!.click(); }); await vanta();
    expect(sparade.at(-1)).toMatchObject({ typ: 'skotare', godkann: false });
    expect(q('[data-testid="mr-risk-brand"]')).toBeNull();
    expect(q('[data-testid="mr-lage"]')!.textContent).toBe('Ändrad – godkänn igen');
    await act(async () => { q('[data-testid="mr-stammer"]')!.click(); }); await vanta();
    expect(sparade.at(-1)).toMatchObject({ godkann: true });
    expect(q('[data-testid="mr-godkand"]')).toBeTruthy();
  });

  it('kan bedömningarna inte läsas är det ett fel, aldrig en tom lista', async () => {
    lasOk = false;
    await act(async () => { root.render(<MaskinRisker />); }); await vanta();
    expect(q('[data-testid="mr-svar"]')!.textContent).toBe('Kunde inte läsa riskbedömningen.');
    expect(q('[data-testid^="mr-typ-"]')).toBeNull();
  });
});
