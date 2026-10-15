// @vitest-environment jsdom
// Rita linje och Spåra med GPS: den RIKTIGA listan renderad. En Basväg-rad först, ingen Stickväg, färgvalet fälls ut under Basväg med senast valda
// förvald, och övriga linjetyper startar direkt. Sidans handlers är efterbildade (samma anrop som startaBasvagRita / startaBasvagSpara).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { LinjeTypLista, type LinjeTyp } from './LinjeTypLista';
import { BASVAG_SENASTE_FARG_NYCKEL, lasSenasteBasvagFarg, sparaSenasteBasvagFarg, type BasvagFarg } from '@/lib/basvag';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// samma urval som sidens ritaLinjeTyper: lineTypes utan traktgräns, stickväg och backväg (i sidans ordning)
const TYPER: LinjeTyp[] = [
  { id: 'mainRoad', name: 'Basväg', color: '#0a84ff', color2: '#fbbf24', striped: true },
  { id: 'nature', name: 'Naturvård', color: '#30d158', color2: '#ff453a', striped: true },
  { id: 'ditch', name: 'Dike', color: '#38bdf8', color2: '#fff', striped: true },
  { id: 'trail', name: 'Stig/Led', color: '#fff', dashed: true },
  { id: 'stonewall', name: 'Stenmur', color: '#8a8884', dashed: true },
];

let rot: Root | null = null; let el: HTMLElement | null = null;
const lager = new Map<string, string>();
beforeEach(() => {
  lager.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => lager.get(k) ?? null, setItem: (k: string, v: string) => { lager.set(k, v); } };
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); el?.remove(); rot = null; delete (globalThis as any).localStorage; });

function visa(handlers: { start: (f: BasvagFarg) => void; val: (id: string) => void }, steg = 'rita') {
  function Sida() {
    const [oppen, setOppen] = useState(false);
    const [val, setVal] = useState<BasvagFarg>('red');
    return (
      <LinjeTypLista steg={steg} typer={TYPER} basvagOppen={oppen} basvagVal={val} onBasvagVal={setVal}
        onTryckBasvag={() => { if (oppen) { setOppen(false); return; } setVal(lasSenasteBasvagFarg()); setOppen(true); }}
        onStartaBasvag={() => { sparaSenasteBasvagFarg(val); handlers.start(val); setOppen(false); }}
        startText={steg === 'rita' ? 'Börja rita' : 'Börja spåra'} onVal={(t) => handlers.val(t.id)} />
    );
  }
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
  return act(async () => { rot!.render(<Sida />); });
}
const q = (s: string) => el!.querySelector(s) as HTMLElement | null;
const klicka = (s: string) => act(async () => { q(s)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const rader = () => Array.from(el!.querySelectorAll('[data-testid^="linje-rad-"]')).map((r) => r.textContent);

describe('Rita linje / Spåra med GPS: EN Basväg-rad', () => {
  it('Basväg står först, EN gång (inte tre), och ingen Stickväg finns i listan', async () => {
    await visa({ start: vi.fn(), val: vi.fn() });
    expect(rader()).toEqual(['Basväg', 'Naturvård', 'Dike', 'Stig/Led', 'Stenmur']);
    expect(el!.textContent).not.toMatch(/Stickväg|Basväg röd|Basväg gul|Basväg blå/);
    expect(q('[data-testid="basvag-farg-val"]')).toBeNull();   // färgvalet syns först när man trycker på Basväg
  });

  it('tryck på Basväg → färgvalet fälls ut med röd förvald första gången; vald färg kommer ihåg till nästa gång', async () => {
    const start = vi.fn();
    await visa({ start, val: vi.fn() });
    await klicka('[data-testid="linje-rad-mainRoad"]');
    expect(q('[data-testid="basvag-farg-val"]')).not.toBeNull();
    expect(Array.from(el!.querySelectorAll('[data-testid^="basvag-farg-"][aria-pressed]')).map((b) => [b.textContent, b.getAttribute('aria-pressed')]))
      .toEqual([['röd', 'true'], ['gul', 'false'], ['blå', 'false']]);
    await klicka('[data-testid="basvag-farg-blue"]');
    await klicka('[data-testid="basvag-steg-rita-starta"]');
    expect(start).toHaveBeenCalledWith('blue');
    expect(lager.get(BASVAG_SENASTE_FARG_NYCKEL)).toBe('blue');
    // nästa gång: blå är förvald
    await klicka('[data-testid="linje-rad-mainRoad"]');
    expect(q('[data-testid="basvag-farg-blue"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-testid="basvag-farg-red"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('ett nytt tryck på Basväg fäller ihop färgvalet; en annan linjetyp startar direkt utan färgval', async () => {
    const val = vi.fn(); const start = vi.fn();
    await visa({ start, val });
    await klicka('[data-testid="linje-rad-mainRoad"]');
    await klicka('[data-testid="linje-rad-mainRoad"]');
    expect(q('[data-testid="basvag-farg-val"]')).toBeNull();
    await klicka('[data-testid="linje-rad-nature"]');
    expect(val).toHaveBeenCalledWith('nature');
    expect(start).not.toHaveBeenCalled();
    expect(q('[data-testid="basvag-farg-val"]')).toBeNull();
  });

  it('Spåra med GPS: samma lista, knappen heter "Börja spåra"', async () => {
    await visa({ start: vi.fn(), val: vi.fn() }, 'spara');
    await klicka('[data-testid="linje-rad-mainRoad"]');
    expect(q('[data-testid="basvag-steg-spara-starta"]')!.textContent).toBe('Börja spåra');
  });
});
