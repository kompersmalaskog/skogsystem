// @vitest-environment jsdom
// "Vad betyder kartan": riktig DOM-rendering. Bara det som finns på trakten, grupperat, symbol + namn + en mening; "Visa alla symboler" längst ner.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));

import VadBetyderKartan from './VadBetyderKartan';
import { SYMBOL_FORKLARING } from '@/lib/symboler';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let el: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });

function visa(markeringar: any[], vida: any[] = []) {
  el = document.createElement('div'); document.body.appendChild(el);
  rot = createRoot(el);
  const spion = { tillbaka: 0, stang: 0 };
  act(() => { rot!.render(<VadBetyderKartan objektNamn="Skälviken" markeringar={markeringar} vida={vida} onTillbaka={() => { spion.tillbaka++; }} onStang={() => { spion.stang++; }} />); });
  return spion;
}
const q = (id: string) => el!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const alla = (pre: string) => Array.from(el!.querySelectorAll<HTMLElement>(`[data-testid^="${pre}"]`));

describe('VadBetyderKartan', () => {
  it('visar bara det som finns, grupperat, med bild (samma form som kartan), namn och EN mening', () => {
    visa([{ isMarker: true, type: 'warning' }, { isMarker: true, type: 'warning' }, { isMarker: true, type: 'highstump' }, { isZone: true, zoneType: 'protected' }]);
    expect(alla('teckenforklaring-grupp-').map((g) => g.dataset.testid)).toEqual(['teckenforklaring-grupp-fara', 'teckenforklaring-grupp-natur']);
    const varning = q('teckenforklaring-rad-symbol:warning')!;
    expect(varning.textContent).toContain('Varning');
    expect(varning.textContent).toContain(SYMBOL_FORKLARING.warning);
    expect(varning.querySelector('svg')!.getAttribute('data-form')).toBe('triangel');
    expect(q('teckenforklaring-rad-symbol:highstump')!.querySelector('svg')!.getAttribute('data-form')).toBe('cirkel');
    expect(alla('teckenforklaring-rad-')).toHaveLength(3);   // Varning (en rad), Högstubbe, Hänsyn
    expect(q('teckenforklaring-rad-symbol:landing')).toBeNull();
  });
  it('en yta man inte får köra in i får snedstreckad bild; en heldragen yta gör det inte', () => {
    visa([{ isZone: true, zoneType: 'protected' }, { isZone: true, zoneType: 'wet' }], ['nyckelbiotop']);
    expect(q('teckenforklaring-rad-yta:protected')!.querySelector('[data-bild]')!.getAttribute('data-bild')).toBe('yta-snedstreck');
    expect(q('teckenforklaring-rad-yta:wet')!.querySelector('[data-bild]')!.getAttribute('data-bild')).toBe('yta');
    expect(q('teckenforklaring-rad-vida:nyckelbiotop')!.querySelector('[data-bild]')!.getAttribute('data-bild')).toBe('yta-snedstreck');
    expect(q('teckenforklaring-rad-yta:protected')!.querySelector<HTMLElement>('[data-bild]')!.style.border).toContain('3px solid');
  });
  it('tom trakt säger det; "Visa alla symboler" fäller ut allt (och byter tillbaka)', () => {
    visa([]);
    expect(q('teckenforklaring-tom')).not.toBeNull();
    const knapp = q('teckenforklaring-visa-alla')!;
    expect(knapp.textContent).toBe('Visa alla symboler');
    act(() => { knapp.click(); });
    expect(q('teckenforklaring-tom')).toBeNull();
    expect(q('teckenforklaring-rad-symbol:gate')).not.toBeNull();
    expect(q('teckenforklaring-rad-symbol:huntingtower')).not.toBeNull();
    expect(q('teckenforklaring-rad-symbol:culturemonument')!.textContent).toContain('Kulturlämning');
    expect(knapp.textContent).toBe('Visa bara det som finns här');
    act(() => { knapp.click(); });
    expect(q('teckenforklaring-tom')).not.toBeNull();
  });
  it('‹ tillbaka och × är kopplade', () => {
    const spion = visa([{ isMarker: true, type: 'gate' }]);
    act(() => { q('info-tillbaka')!.click(); });
    act(() => { q('info-stang')!.click(); });
    expect(spion).toEqual({ tillbaka: 1, stang: 1 });
  });
  it('BARA TVÅ former: triangel för Röd, cirkel för allt annat — även Lila (Att göra)', () => {
    visa([{ isMarker: true, type: 'warning' }, { isMarker: true, type: 'manualfelling' }, { isMarker: true, type: 'landing' }]);
    const form = (typ: string) => q(`teckenforklaring-rad-symbol:${typ}`)!.querySelector('svg')!.getAttribute('data-form');
    expect([form('warning'), form('manualfelling'), form('landing')]).toEqual(['triangel', 'cirkel', 'cirkel']);
  });
  it('Stenmur står under Kultur (brun) med kraftig mörk kant på provet', () => {
    visa([{ isLine: true, lineType: 'stonewall' }]);
    expect(alla('teckenforklaring-grupp-').map((g) => g.dataset.testid)).toEqual(['teckenforklaring-grupp-kultur']);
    expect(q('teckenforklaring-rad-linje:stonewall')!.querySelector('[data-bild="linje"]')!.getAttribute('data-kant')).toBe('stark');
  });
  it('Vidas Kraftledning visas som en LEDNING: röd linje med mörk kant, stolpar och farosymbolen (triangel med blixt)', () => {
    visa([], ['kraftledning']);
    const bild = q('teckenforklaring-rad-vida:kraftledning')!.querySelector<HTMLElement>('[data-bild="linje"]')!;
    expect(bild.getAttribute('data-ledning')).toBe('ja');
    expect(bild.querySelectorAll('[data-stolpe]').length).toBeGreaterThanOrEqual(2);
    const symbol = bild.querySelector('[data-farosymbol] svg')!;
    expect(symbol.getAttribute('data-form')).toBe('triangel');
    expect(symbol.getAttribute('data-symbol')).toBe('powerline');
    expect(bild.innerHTML).not.toContain('dashed');   // ingen streckad variant kvar
  });
});
