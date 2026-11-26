// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { byggVagSymbolElement, VAG_TRYCKYTA_PX, VAG_UTSEENDE } from './vagRisk';

describe('⚠-symbolen (DOM-elementet bakom MapLibre-markören)', () => {
  it('tryckytan är minst 44 px — symbolen själv är barnet och tar inga tryck', () => {
    for (const risk of ['obedomd', 'hog'] as const) {
      const el = byggVagSymbolElement({ risk, agare: 'a' }, () => {});
      expect(el.style.width).toBe(`${VAG_TRYCKYTA_PX}px`);
      expect(el.style.height).toBe(`${VAG_TRYCKYTA_PX}px`);
      expect(VAG_TRYCKYTA_PX).toBeGreaterThanOrEqual(44);
      const ikon = el.firstElementChild as HTMLElement;
      expect(ikon.style.pointerEvents).toBe('none');
      expect(ikon.style.width).toBe(`${VAG_UTSEENDE[risk].storlek}px`);
    }
  });
  it('tecknet och orden bär betydelsen, inte bara färgen: ⚠ orange = ej riskbedömd, ⚠ röd = hög risk (låg risk har ingen symbol)', () => {
    const e = (risk: 'obedomd' | 'hog') => byggVagSymbolElement({ risk, agare: 'a' }, () => {});
    expect(e('obedomd').textContent).toBe('⚠');
    expect(e('obedomd').getAttribute('aria-label')).toMatch(/ej riskbedömd/);
    expect(e('hog').textContent).toBe('⚠');
    expect(e('hog').getAttribute('aria-label')).toMatch(/hög risk/);
    expect(e('hog').dataset.risk).toBe('hog');
    expect((e('obedomd').firstElementChild as HTMLElement).style.background).not.toBe((e('hog').firstElementChild as HTMLElement).style.background);
  });
  it('ett tryck ger vägens ägare till panelen och sväljs (kartan under får det inte)', () => {
    const tryck = vi.fn();
    const el = byggVagSymbolElement({ risk: 'hog', agare: 'vida-td:9772:0' }, tryck);
    const upp = vi.fn(); document.body.addEventListener('click', upp);
    document.body.appendChild(el);
    el.click();
    expect(tryck).toHaveBeenCalledWith('vida-td:9772:0');
    expect(upp).not.toHaveBeenCalled();
  });
});
