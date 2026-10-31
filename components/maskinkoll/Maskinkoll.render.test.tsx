// @vitest-environment jsdom
/**
 * Maskinkollen: montera den riktiga vyn med datalagret mockat. Det som ska hålla: godkännandet först, en fråga per skärm,
 * Ja sparar frågans text (snapshot) och går vidare, Nej kräver en bild, och "inte dags" säger när nästa koll är.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MaskinkollLage } from '@/lib/maskinkoll/data';

const h = vi.hoisted(() => ({
  lage: null as any,
  sparade: [] as any[],
  godkanda: 0,
  foton: [] as any[],
  avslutade: [] as string[],
  rapporter: [] as any[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/maskinkoll/fotoKo', () => ({ laggMaskinkollFoto: async (...a: any[]) => { h.foton.push(a); } }));
vi.mock('@/lib/maskinkoll/data', () => ({
  hamtaLage: async () => ({ ok: true, data: h.lage }),
  godkann: async () => { h.godkanda++; return null; },
  startaKoll: async () => ({ ok: true, data: 'koll-1' }),
  sparaSvar: async (_sb: unknown, koll: string, fraga: any, svar: any) => { h.sparade.push({ koll, fraga_text: fraga.text, ...svar }); return null; },
  avsluta: async (_sb: unknown, id: string) => { h.avslutade.push(id); return { ok: true, data: '2026-10-31T16:00:00Z' }; },
  rapporteraFel: async (_sb: unknown, rad: any) => { h.rapporter.push(rad); return null; },
}));

import Maskinkoll from './Maskinkoll';

const fraga = (kod: string, text: string, ordning: number, ex: { stopp?: boolean; foto_vid_ja?: boolean; hjalptext?: string } = {}) =>
  ({ id: kod, kod, text, hjalptext: ex.hjalptext ?? null, maskin_typ: null, foto_url: null, ordning, stopp: !!ex.stopp, foto_vid_ja: !!ex.foto_vid_ja });

function lage(over: Partial<MaskinkollLage> = {}): MaskinkollLage {
  return {
    medarbetareId: 'med-1',
    maskin: { id: 'A030353', namn: 'Wisent', typ: 'Forwarder' },
    fragor: [fraga('G1', 'Fungerar nödstoppen?', 10), fraga('G4', 'Är slangarna torra?', 40)],
    godkand: true,
    pagaende: null,
    senasteKlar: null,
    dags: true,
    ...over,
  };
}

let rot: ReturnType<typeof createRoot> | null = null;
let el: HTMLDivElement | null = null;

async function montera() {
  await act(async () => { rot = createRoot(el!); rot.render(<Maskinkoll />); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
}
const knapp = (text: string) => Array.from(el!.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
async function valjFil(fil: File) {
  const input = el!.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [fil], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
}
const nyBild = () => new File(['x'], 'foto.jpg', { type: 'image/jpeg', lastModified: Date.now() });
const tryck = async (b: HTMLElement | undefined) => { expect(b).toBeTruthy(); await act(async () => { b!.click(); }); await act(async () => { await new Promise(r => setTimeout(r, 400)); }); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  h.lage = lage(); h.sparade = []; h.godkanda = 0; h.foton = []; h.avslutade = []; h.rapporter = [];
  window.history.replaceState(null, '', '/maskinkoll');
  el = document.createElement('div'); document.body.appendChild(el);
  (URL as any).createObjectURL = () => 'blob:bild';
});
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });

describe('Maskinkollen', () => {
  it('första gången: godkännandet före första frågan', async () => {
    h.lage = lage({ godkand: false });
    await montera();
    expect(el!.textContent).toContain('Du kollar din maskin en gång i månaden');
    await tryck(knapp('Jag gör maskinkollen på Wisent'));
    expect(h.godkanda).toBe(1);
    expect(el!.textContent).toContain('Fungerar nödstoppen?');
  });

  it('en fråga per skärm; Ja sparar frågans text och går vidare', async () => {
    await montera();
    expect(el!.textContent).toContain('1 av 2');
    expect(el!.textContent).not.toContain('Är slangarna torra?');
    await tryck(knapp('Ja'));
    expect(h.sparade).toEqual([{ koll: 'koll-1', fraga_text: 'Fungerar nödstoppen?', ok: true, foto_url: null, kommentar: null }]);
    expect(el!.textContent).toContain('2 av 2');
    expect(el!.textContent).toContain('Är slangarna torra?');
  });

  it('Nej: Nästa är inaktiv tills bilden är tagen, sedan sparas Nej med fotots sökväg', async () => {
    await montera();
    await tryck(knapp('Nej'));
    expect(el!.textContent).toContain('Ta en bild på felet');
    const nasta = knapp('Nästa fråga')!;
    expect(nasta.disabled).toBe(true);
    await valjFil(nyBild());
    expect(knapp('Nästa fråga')!.disabled).toBe(false);
    await tryck(knapp('Nästa fråga'));
    expect(h.foton).toHaveLength(1);
    expect(h.sparade[0].ok).toBe(false);
    expect(String(h.sparade[0].foto_url).startsWith('med-1/koll-1/G1-')).toBe(true);
    expect(el!.textContent).toContain('2 av 2');
  });

  it('inte dags: säger när nästa koll är, och går att göra ändå', async () => {
    h.lage = lage({ dags: false, senasteKlar: '2026-10-12T10:00:00Z' });
    await montera();
    expect(el!.textContent).toContain('Maskinkollen är gjord');
    expect(el!.textContent).toContain('Nästa maskinkoll 12 november');
    await tryck(knapp('Gör en koll ändå'));
    expect(el!.textContent).toContain('Fungerar nödstoppen?');
  });

  it('ingen maskin: säger vad som behövs, aldrig en tom koll', async () => {
    h.lage = null;
    await montera();
    expect(el!.textContent).toContain('Ingen maskin kopplad');
    expect(knapp('Ja')).toBeUndefined();
  });

  it('stoppfråga: Nej säger att maskinen ska stå, och klar-skärmen säger det också', async () => {
    h.lage = lage({ fragor: [fraga('N2', 'Tryck på nödstoppet. Stannade motorn?', 1, { stopp: true })] });
    await montera();
    await tryck(knapp('Nej'));
    expect(el!.textContent).toContain('Kör inte maskinen förrän det är lagat');
    await valjFil(nyBild());
    await tryck(knapp('Klar'));
    expect(h.avslutade).toEqual(['koll-1']);
    expect(el!.textContent).toContain('Maskinen ska stå');
    expect(el!.textContent).not.toContain('Nästa maskinkoll');
  });

  it('foto vid Ja: Ja öppnar kameran och sparar Ja med bildens sökväg', async () => {
    h.lage = lage({ fragor: [fraga('N4', 'Står visaren på grönt på alla brandsläckare?', 1, { foto_vid_ja: true, hjalptext: 'Ta en bild på mätarna.' })] });
    await montera();
    await tryck(knapp('Ja'));
    expect(h.sparade).toHaveLength(0);
    expect(el!.textContent).toContain('Ta en bild på mätarna.');
    expect(el!.querySelector('#am-kommentar')).toBeNull();
    expect(knapp('Klar')!.disabled).toBe(true);
    await valjFil(nyBild());
    await tryck(knapp('Klar'));
    expect(h.sparade[0].ok).toBe(true);
    expect(String(h.sparade[0].foto_url).startsWith('med-1/koll-1/N4-')).toBe(true);
    expect(el!.textContent).toContain('Klart');
  });

  it('en gammal bild ur galleriet tas inte emot', async () => {
    await montera();
    await tryck(knapp('Nej'));
    await valjFil(new File(['x'], 'gammal.jpg', { type: 'image/jpeg', lastModified: Date.now() - 60 * 60_000 }));
    expect(el!.textContent).toContain('Bilden är tagen tidigare');
    expect(knapp('Nästa fråga')!.disabled).toBe(true);
  });

  it('sista Ja avslutar kollen direkt — inget kontrollfoto', async () => {
    await montera();
    await tryck(knapp('Ja'));
    await tryck(knapp('Ja'));
    expect(h.avslutade).toEqual(['koll-1']);
    expect(el!.textContent).toContain('Klart');
    expect(el!.textContent).not.toContain('Fota');
  });

  it('Något är fel (?fel=1): bild krävs, sedan blir det en åtgärd för maskinen', async () => {
    window.history.replaceState(null, '', '/maskinkoll?fel=1');
    h.lage = lage({ godkand: false });
    await montera();
    expect(el!.textContent).toContain('Något är fel');
    expect(knapp('Skicka')!.disabled).toBe(true);
    await valjFil(nyBild());
    const cb = el!.querySelector('[role=checkbox]') as HTMLButtonElement;
    await tryck(cb);
    expect(el!.textContent).toContain('Kör inte maskinen');
    await tryck(knapp('Skicka'));
    expect(h.rapporter).toHaveLength(1);
    expect(h.rapporter[0]).toMatchObject({ medarbetareId: 'med-1', maskinId: 'A030353', stopp: true });
    expect(String(h.rapporter[0].fotoUrl).startsWith('med-1/fel/')).toBe(true);
    expect(el!.textContent).toContain('Skickat');
  });
});
