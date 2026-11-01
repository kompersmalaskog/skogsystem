// @vitest-environment jsdom
/**
 * Åtgärdslistan: stopp överst och säger det, raden öppnar arket, bara admin kan markera som åtgärdad (och först med text),
 * ?id= öppnar arket direkt, ett läsfel är ett fel med Försök igen.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Atgard } from '@/lib/arbetsmiljo/atgarder';

const h = vi.hoisted(() => ({ lista: [] as any[], las: true, far: true as boolean | null, stangda: [] as any[], hamtningar: 0 }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/arbetsmiljo/atgarder', async (orig) => {
  const riktig: any = await orig();
  return {
    ...riktig,
    hamtaAtgarder: async () => { h.hamtningar++; return h.las ? { ok: true, data: h.lista } : { ok: false, fel: riktig.LASFEL }; },
    farStanga: async () => h.far,
    fotoLank: async () => 'https://bild',
    stangAtgard: async (_sb: unknown, id: string, text: string) => { h.stangda.push({ id, text }); return null; },
  };
});

import Atgarder from './Atgarder';

const a = (o: Partial<Atgard>): Atgard => ({
  id: 'x', kalla: 'svar', maskinId: 'JD810E', maskinNamn: '810E', beskrivning: 'Fel', fotoUrl: null, deadline: '2026-12-31',
  status: 'oppen', stopp: false, vadGjordes: null, stangdTid: null, stangdAvNamn: null, skapad: '2026-10-31T10:00:00Z',
  rapportorNamn: 'Stefan Nilsson', ...o,
});

let rot: ReturnType<typeof createRoot> | null = null;
let el: HTMLDivElement | null = null;
const vanta = () => act(async () => { await new Promise(r => setTimeout(r, 350)); });
async function montera() { await act(async () => { rot = createRoot(el!); rot.render(<Atgarder />); }); await vanta(); }
const text = () => document.body.textContent ?? '';
const knapp = (t: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const tryck = async (b: Element | null | undefined) => { expect(b).toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); await vanta(); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  h.lista = []; h.las = true; h.far = true; h.stangda = []; h.hamtningar = 0;
  window.history.replaceState(null, '', '/atgarder');
  el = document.createElement('div'); document.body.appendChild(el);
});
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });

describe('Åtgärder', () => {
  it('tomt: 0 och säger vad som fyller listan', async () => {
    await montera();
    expect(text()).toContain('Inget att åtgärda');
    expect(text()).toContain('Svarar en förare Nej i maskinkollen');
  });

  it('stopp står överst och säger att maskinen ska stå', async () => {
    h.lista = [a({ id: 'o', maskinNamn: 'Wisent', beskrivning: 'Läcker olja' }), a({ id: 's', stopp: true, maskinNamn: 'Giant', beskrivning: 'Nödstoppet fungerar inte' })];
    await montera();
    expect(document.querySelector('[data-svar]')?.textContent).toBe('1 maskin ska stå');
    const grupper = Array.from(document.querySelectorAll('[data-grupp]')).map(g => g.getAttribute('data-grupp'));
    expect(grupper).toEqual(['stopp', 'oppna']);
    expect(document.querySelector('[data-grupp=stopp]')!.textContent).toContain('Giant');
    expect(document.querySelector('[data-grupp=stopp]')!.textContent).toContain('Stefan');
  });

  it('admin: raden öppnar arket, knappen är inaktiv tills text finns, sedan stängs och listan läses om', async () => {
    h.lista = [a({ id: 's', stopp: true, maskinNamn: 'Giant' })];
    await montera();
    await tryck(document.querySelector('[data-atgard=s]'));
    expect(text()).toContain('Maskinen ska stå tills det är lagat.');
    expect(window.location.search).toBe('?id=s');
    expect(knapp('Markera som åtgärdad')!.disabled).toBe(true);
    const ta = document.querySelector('textarea')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      set.call(ta, 'Bytte knappen'); ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(knapp('Markera som åtgärdad')!.disabled).toBe(false);
    const fore = h.hamtningar;
    await tryck(knapp('Markera som åtgärdad'));
    expect(h.stangda).toEqual([{ id: 's', text: 'Bytte knappen' }]);
    expect(h.hamtningar).toBe(fore + 1);
    expect(window.location.search).toBe('');
  });

  it('skyddsombud (inte admin): ingen knapp, säger vem som stänger', async () => {
    h.far = false;
    h.lista = [a({ id: 'o' })];
    await montera();
    await tryck(document.querySelector('[data-atgard=o]'));
    expect(knapp('Markera som åtgärdad')).toBeUndefined();
    expect(document.querySelector('textarea')).toBeNull();
    expect(text()).toContain('Arbetsledningen markerar åtgärden som klar.');
  });

  it('?id= öppnar arket direkt; åtgärdade är hopfällda och visar vad som gjordes', async () => {
    h.lista = [a({ id: 'k', status: 'klar', vadGjordes: 'Fyllde på lådan', stangdTid: '2026-10-31T12:00:00Z', stangdAvNamn: 'Martin Lindqvist' })];
    window.history.replaceState(null, '', '/atgarder?id=k');
    await montera();
    expect(document.querySelector('[data-gjort]')?.textContent).toContain('Fyllde på lådan');
    expect(document.querySelector('[data-gjort]')?.textContent).toContain('Martin');
    await tryck(knapp('Klar'));
    expect(document.querySelector('[data-grupp=klara] [data-atgard=k]')).toBeNull();
    await tryck(document.querySelector('[data-visa-klara]'));
    expect(document.querySelector('[data-grupp=klara] [data-atgard=k]')).toBeTruthy();
  });

  it('läsfel: ett fel med Försök igen, aldrig "Inget att åtgärda"', async () => {
    h.las = false;
    await montera();
    expect(text()).toContain('Kunde inte läsa åtgärderna just nu.');
    expect(text()).not.toContain('Inget att åtgärda');
    h.las = true;
    await tryck(knapp('Försök igen'));
    expect(text()).toContain('Inget att åtgärda');
  });
});
