// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { YtaSparLista } from './YtaSparLista';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('YtaSparLista', () => {
  it('en rad per yta och sist Nytt område; ett tryck startar rätt sak', () => {
    const onYta = vi.fn(); const onOmrade = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    act(() => { root.render(<YtaSparLista ytor={[{ id: 'wet', name: 'Blött', color: '#00f' }, { id: 'ungskog', name: 'Fäll inte ut här', color: '#0f0' }]} omradeFarg="#f00" onYta={onYta} onOmrade={onOmrade} />); });
    const rader = Array.from(div.querySelectorAll('[data-testid^="yta-spar-"]')).map((e) => (e as HTMLElement).getAttribute('data-testid'));
    expect(rader).toEqual(['yta-spar-lista', 'yta-spar-wet', 'yta-spar-ungskog', 'yta-spar-omrade']);
    act(() => { (div.querySelector('[data-testid="yta-spar-ungskog"]') as HTMLElement).click(); });
    expect(onYta).toHaveBeenCalledWith('ungskog');
    act(() => { (div.querySelector('[data-testid="yta-spar-omrade"]') as HTMLElement).click(); });
    expect(onOmrade).toHaveBeenCalledTimes(1);
    expect(div.textContent).toContain('Nytt område (traktgräns)');
    act(() => root.unmount());
  });
});
