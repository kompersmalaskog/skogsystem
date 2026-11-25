// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { byggVagSymbolElement, VAG_TRYCKYTA_PX, VAG_UTSEENDE } from './vagRisk';

describe('⚠/✓-symbolen (DOM-elementet bakom MapLibre-markören)', () => {
  it('tryckytan är minst 44 px även för den lilla ✓ — symbolen själv är barnet och tar inga tryck', () => {
    for (const risk of ['obedomd', 'lag', 'hog'] as const) {
      const el = byggVagSymbolElement({ risk, agare: 'a' }, () => {});
      expect(el.style.width).toBe(`${VAG_TRYCKYTA_PX}px`);
      expect(el.style.height).toBe(`${VAG_TRYCKYTA_PX}px`);
      expect(VAG_TRYCKYTA_PX).toBeGreaterThanOrEqual(44);
      const ikon = el.firstElementChild as HTMLElement;
      expect(ikon.style.pointerEvents).toBe('none');
      expect(ikon.style.width).toBe(`${VAG_UTSEENDE[risk].storlek}px`);
    }
  });
  it('tecknet och orden bär betydelsen, inte bara färgen: ⚠ orange = ej riskbedömd, ✓ grön = låg risk, ⚠ röd = hög risk', () => {
    const e = (risk: 'obedomd' | 'lag' | 'hog') => byggVagSymbolElement({ risk, agare: 'a' }, () => {});
    expect(e('obedomd').textContent).toBe('⚠');
    expect(e('obedomd').getAttribute('aria-label')).toMatch(/ej riskbedömd/);
    expect(e('lag').textContent).toBe('✓');
    expect(e('lag').getAttribute('aria-label')).toMatch(/låg risk/);
    expect(e('hog').textContent).toBe('⚠');
    expect(e('hog').getAttribute('aria-label')).toMatch(/hög risk/);
    expect(e('lag').dataset.risk).toBe('lag');
  });
  it('✓ är mindre än ⚠', () => {
    const sz = (risk: 'obedomd' | 'lag') => parseInt((byggVagSymbolElement({ risk, agare: 'a' }, () => {}).firstElementChild as HTMLElement).style.width, 10);
    expect(sz('lag')).toBeLessThan(sz('obedomd'));
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
