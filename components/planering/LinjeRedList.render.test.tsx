// @vitest-environment jsdom
// REDIGERA LINJER-listen: EN list med Rita · Sudda · Förläng · Koppla ihop, Ångra och ✓ Klar — inget mer. (Mått på riktig skärm: lib/linjeRedigering.hytt.test.ts.)
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinjeRedList, LINJERED_TIPS, LINJERED_VAL } from './LinjeRedList';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

function visa(el: React.ReactElement) {
  if (!ruta) { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); }
  act(() => { rot!.render(el); });
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
const klicka = (id: string) => act(() => { q(id).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const grund = { onVal: vi.fn(), onAngra: vi.fn(), onKlar: vi.fn(), kanAngra: true, smal: true };

describe('LinjeRedList', () => {
  it('har exakt de fyra lägena i den ordningen, Ångra och Klar — inget mer', () => {
    visa(<LinjeRedList {...grund} lage="sudda" />);
    expect(LINJERED_VAL.map((v) => v.etikett)).toEqual(['Rita', 'Sudda', 'Förläng', 'Koppla ihop']);
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Rita', 'Sudda', 'Förläng', 'Koppla ihop', '↩ Ångra', '✓ Klar']);
  });
  it('visar en mening om vad nästa drag gör, och markerar valt läge', () => {
    visa(<LinjeRedList {...grund} lage="koppla" />);
    expect(q('linjered-tips').textContent).toBe(LINJERED_TIPS.koppla);
    expect(q('linjered-koppla').getAttribute('aria-pressed')).toBe('true');
    expect(q('linjered-sudda').getAttribute('aria-pressed')).toBe('false');
  });
  it('knapparna anropar rätt sak; Ångra är avstängd när det inte finns något att ångra', () => {
    const onVal = vi.fn(), onAngra = vi.fn(), onKlar = vi.fn();
    visa(<LinjeRedList {...grund} onVal={onVal} onAngra={onAngra} onKlar={onKlar} lage="sudda" />);
    klicka('linjered-forlang'); expect(onVal).toHaveBeenCalledWith('forlang');
    klicka('linjered-rita'); expect(onVal).toHaveBeenCalledWith('rita');
    klicka('linjered-angra'); expect(onAngra).toHaveBeenCalledTimes(1);
    klicka('linjered-klar'); expect(onKlar).toHaveBeenCalledTimes(1);
    visa(<LinjeRedList {...grund} onAngra={onAngra} kanAngra={false} lage="sudda" />);
    expect(q('linjered-angra').disabled).toBe(true);
  });
});
