// @vitest-environment jsdom
// Rubriken i meny-arket renderad på riktigt: alla sju kategorier visar sin rubrik (ingen tom titel).
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import MenyRubrik from './MenyRubrik';
import { MENY_KATEGORIER } from '@/lib/menyRubrik';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
const visa = (subMenu: string | null, kategori: string | null) => {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  act(() => { rot!.render(<MenyRubrik subMenu={subMenu} activeCategory={kategori} />); });
  return behallare.querySelector('[data-testid="meny-rubrik"]')!.textContent;
};
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });

describe('MenyRubrik', () => {
  for (const c of MENY_KATEGORIER) {
    it(`${c.id}: rubriken "${c.name}" visas`, () => {
      expect(visa(null, c.id)).toBe(c.name);
    });
  }
  it('utan kategori står "Meny", i undermenyn dess ord', () => {
    expect(visa(null, null)).toBe('Meny');
    act(() => { rot!.unmount(); }); behallare!.remove();
    expect(visa('gps-lines', 'lines')).toBe('Spåra med GPS');
  });
});
