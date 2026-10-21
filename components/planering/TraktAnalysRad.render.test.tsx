// @vitest-environment jsdom
// Traktanalysen på EN rad: "✓ Traktanalys: inget hittat · 7 kontroller ›". Träffar visas utfällda; ett tryck på raden fäller ut alla kontroller.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { TraktAnalysRad, analysSammanfattning, type Kontroll } from './TraktAnalysRad';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const NAMN = ['Vatten', 'Reservat', 'Natura 2000', 'Fornlämning', 'Nyckelbiotop', 'Biotopskydd', 'Skog & historia'];
const sju = (over: Record<number, Partial<Kontroll>> = {}): Kontroll[] => NAMN.map((label, i) => ({ type: 't' + i, label, lage: 'ingen' as const, traffar: [], ...(over[i] ?? {}) }));
function visa(status: 'laddar' | 'fel' | 'klar', kontroller: Kontroll[]) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  act(() => { root.render(<TraktAnalysRad status={status} kontroller={kontroller} />); });
}
const t = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const klick = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
beforeEach(() => { document.body.innerHTML = ''; });

describe('Traktanalys på en rad', () => {
  it('inget hittat: EN rad "✓ Traktanalys: inget hittat · 7 kontroller" och inga kontroller under; ≥ 44 px', () => {
    visa('klar', sju());
    const rad = t('traktanalys-rad')!;
    expect(rad.textContent).toContain('✓');
    expect(rad.textContent).toContain('Traktanalys: inget hittat · 7 kontroller');
    expect(rad.style.minHeight).toBe('44px');
    expect(t('traktanalys-kontroller')).toBeNull();
  });
  it('ett tryck på raden fäller ut alla sju; ett till fäller in', () => {
    visa('klar', sju());
    klick(t('traktanalys-rad'));
    expect(document.querySelectorAll('[data-testid="traktanalys-kontroll"]')).toHaveLength(7);
    expect(t('traktanalys-rad')!.getAttribute('aria-expanded')).toBe('true');
    klick(t('traktanalys-rad'));
    expect(t('traktanalys-kontroller')).toBeNull();
  });
  it('träffar visas utfällda direkt (bara de), raden säger antalet; ett tryck visar alla sju', () => {
    visa('klar', sju({ 3: { lage: 'traff', traffar: [{ name: 'Husgrund', details: 'RAÄ 12' }, { name: 'Röse' }] }, 4: { lage: 'traff', traffar: [{ name: 'Källkant' }] } }));
    expect(t('traktanalys-rad')!.textContent).toContain('Traktanalys: 3 träffar · 7 kontroller');
    const syns = Array.from(document.querySelectorAll('[data-testid="traktanalys-kontroll"]'));
    expect(syns.map((e) => e.getAttribute('data-lage'))).toEqual(['traff', 'traff']);
    expect(t('traktanalys-kontroller')!.textContent).toContain('Husgrund');
    klick(t('traktanalys-rad'));
    expect(document.querySelectorAll('[data-testid="traktanalys-kontroll"]')).toHaveLength(7);
  });
  it('en kontroll som inte gick att köra är ALDRIG "inget hittat": raden är orange och kontrollen visas utfälld', () => {
    visa('klar', sju({ 1: { lage: 'osaker' } }));
    expect(t('traktanalys-rad')!.textContent).not.toContain('inget hittat');
    expect(t('traktanalys-rad')!.textContent).toContain('1 kontroll kunde inte köras');
    expect(t('traktanalys-kontroller')!.textContent).toContain('Kunde inte kontrollera');
  });
  it('laddar och fel är egna tillstånd — aldrig "inget hittat"', () => {
    visa('laddar', []);
    expect(t('traktanalys-rad')!.textContent).toBe('Traktanalys: analyserar…');
    document.body.innerHTML = '';
    visa('fel', []);
    expect(t('traktanalys-rad')!.textContent).toContain('kunde inte köras');
  });
  it('sammanfattningen är ren: noll träffar/osäkra → dam, träff → röd, osäker → orange', () => {
    expect(analysSammanfattning(sju()).farg).toBe('dam');
    expect(analysSammanfattning(sju({ 0: { lage: 'traff', traffar: [{ name: 'x' }] } })).farg).toBe('rod');
    expect(analysSammanfattning(sju({ 0: { lage: 'osaker' } })).farg).toBe('orange');
  });
});
