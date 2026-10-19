// @vitest-environment jsdom
// CentreraKnapp delas av körvyn, planeringsvyn och rundvyn. `bottom` är nytt (rundvyn lägger den ovanför dockan); standardvärdet är
// planeringens (rakt ovanför +-knappen) och får inte ändras av den nya propen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CentreraKnapp } from './CentreraKnapp';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera(props: Parameters<typeof CentreraKnapp>[0]) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(CentreraKnapp, props)); });
  return host.querySelector('[data-testid="centrera-knapp"]') as HTMLButtonElement;
}
afterEach(async () => { if (root) await act(async () => { root!.unmount(); }); host?.remove(); root = null; host = null; });

describe('CentreraKnapp bottom', () => {
  it('utan bottom: planeringens plats, 76 px ovanför hemindikatorn', async () => {
    const k = await montera({ synlig: true, onTryck: () => {} });
    // jsdom skriver om calc() — innehållet är det som räknas: hemindikatorn plus 76 px.
    expect(k.style.bottom).toContain('76px');
    expect(k.style.bottom).toContain('safe-area-inset-bottom');
  });

  it('med bottom: exakt det värdet (rundvyn)', async () => {
    const k = await montera({ synlig: true, onTryck: () => {}, bottom: '240px' });
    expect(k.style.bottom).toBe('240px');
  });

  it('trycket går bara igenom när knappen är synlig', async () => {
    const tryck = vi.fn();
    const k = await montera({ synlig: false, onTryck: tryck });
    await act(async () => { k.click(); });
    expect(tryck).not.toHaveBeenCalled();
  });
});
