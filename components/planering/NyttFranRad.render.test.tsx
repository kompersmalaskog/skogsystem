// @vitest-environment jsdom
// Raden "Nytt från …": tonen (röd = fara, gul = Viktigt, annars neutral), hela raden är en knapp, ingen kvittering och inget ljud.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { NyttFranRad, NYTT_RAD_HOJD_PX } from './NyttFranRad';
import { FARG } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { document.body.innerHTML = ''; });

const visa = (ton: 'fara' | 'viktigt' | 'neutral', onTryck = () => {}) => {
  const c = document.createElement('div'); document.body.appendChild(c);
  act(() => { createRoot(c).render(<NyttFranRad text="Nytt från Martin: Varning – Torrträd, 120 m" ton={ton} antal={1} onTryck={onTryck} top="80px" />); });
  return document.querySelector('[data-testid="nytt-fran-rad"]') as HTMLButtonElement;
};

describe('NyttFranRad', () => {
  it('fara = röd, Viktigt = gul, annars neutral (kortets färg)', () => {
    expect(visa('fara').style.background).toBe(hex(FARG.rod));
    document.body.innerHTML = '';
    expect(visa('viktigt').style.background).toBe(hex(FARG.gul));
    document.body.innerHTML = '';
    expect(visa('neutral').style.background).toBe(hex(FARG.kort));
  });
  it('hela raden är en knapp med texten, fast höjd och ett tryck anropar onTryck', () => {
    const f = vi.fn(); const k = visa('neutral', f);
    expect(k.tagName).toBe('BUTTON');
    expect(k.textContent).toContain('Nytt från Martin: Varning – Torrträd, 120 m');
    expect(k.style.height).toBe(`${NYTT_RAD_HOJD_PX}px`);
    act(() => { k.click(); });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

/** jsdom skriver tillbaka färgerna som rgb(): jämför mot samma tolkning av tokenfärgen. */
function hex(h: string): string {
  const n = parseInt(h.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
