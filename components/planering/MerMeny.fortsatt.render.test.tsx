// @vitest-environment jsdom
// "Inte klar – fortsätt" i Mer: bara när sidan skickar raden (objektet avslutat av appen), med appens skäl under.
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import MerMeny from './MerMeny';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function rendera(fortsatt: any) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const rot = createRoot(el);
  act(() => { rot.render(<MerMeny objektNamn="Mölleryd" grupper={[]} planerare={null} avsluta={null} fortsatt={fortsatt} onTillbaka={() => {}} onStang={() => {}} />); });
  return { el, rot };
}

describe('Mer › Inte klar – fortsätt', () => {
  it('visas med appens skäl och anropar onTryck', () => {
    const onTryck = vi.fn();
    const { el, rot } = rendera({ skal: 'Klar 26 okt', onTryck });
    const knapp = el.querySelector<HTMLElement>('[data-testid="mer-fortsatt"]')!;
    expect(el.textContent).toContain('Avslutad av appen');
    expect(knapp.textContent).toContain('Inte klar – fortsätt');
    expect(knapp.textContent).toContain('Klar 26 okt');
    act(() => { knapp.click(); });
    expect(onTryck).toHaveBeenCalledTimes(1);
    act(() => rot.unmount());
  });
  it('utan rad (manuellt avslutat eller ej planerare) syns inget', () => {
    const { el, rot } = rendera(null);
    expect(el.querySelector('[data-testid="mer-grupp-fortsatt"]')).toBeNull();
    act(() => rot.unmount());
  });
  it('fel visas i stället för skälet, och knappen gör inget medan det sparas', () => {
    const onTryck = vi.fn();
    const { el, rot } = rendera({ skal: 'Klar 26 okt', onTryck, sparar: true, fel: null });
    const knapp = el.querySelector<HTMLElement>('[data-testid="mer-fortsatt"]')!;
    expect(knapp.textContent).toContain('Sparar');
    act(() => { knapp.click(); });
    expect(onTryck).not.toHaveBeenCalled();
    act(() => rot.unmount());
    const b = rendera({ skal: 'Klar 26 okt', onTryck, fel: 'Kunde inte spara – försök igen' });
    expect(b.el.textContent).toContain('Kunde inte spara');
    act(() => b.rot.unmount());
  });
});
