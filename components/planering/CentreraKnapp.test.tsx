// @vitest-environment jsdom
// CentreraKnapp delas av körvyn, planeringsvyn och rundvyn. `bottom` är nytt (rundvyn lägger den ovanför dockan); standardvärdet är
// planeringens (rakt ovanför +-knappen) och får inte ändras av den nya propen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CentreraKnapp, CentreraZoomVal } from './CentreraKnapp';
import { ZOOM_HALL_MS } from '../../lib/korvyZoom';

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

// === HÅLL IN CENTRERA → "Spara den här zoomen" (körvyn, 2026-11-23) ===
const pek = (el: Element, typ: string, x = 100, y = 100) => el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: x, clientY: y }));

describe('CentreraKnapp: håll in (körvyn)', () => {
  it('håller man in ZOOM_HALL_MS (0,6 s) kommer valet — och fingerlyftet centrerar INTE', async () => {
    vi.useFakeTimers();
    try {
      const tryck = vi.fn(), hall = vi.fn();
      const k = await montera({ synlig: true, onTryck: tryck, onHall: hall });
      await act(async () => { pek(k, 'pointerdown'); });
      await act(async () => { vi.advanceTimersByTime(ZOOM_HALL_MS - 1); });
      expect(hall).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(2); });
      expect(hall).toHaveBeenCalledTimes(1);
      await act(async () => { pek(k, 'pointerup'); k.click(); });   // fingerlyftet kommer som ett klick
      expect(tryck).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('ett kort tryck centrerar som förut och ger inget val', async () => {
    vi.useFakeTimers();
    try {
      const tryck = vi.fn(), hall = vi.fn();
      const k = await montera({ synlig: true, onTryck: tryck, onHall: hall });
      await act(async () => { pek(k, 'pointerdown'); vi.advanceTimersByTime(200); pek(k, 'pointerup'); k.click(); });
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(tryck).toHaveBeenCalledTimes(1);
      expect(hall).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('rör sig fingret mer än 10 px är det inget håll', async () => {
    vi.useFakeTimers();
    try {
      const hall = vi.fn();
      const k = await montera({ synlig: true, onTryck: () => {}, onHall: hall });
      await act(async () => { pek(k, 'pointerdown', 100, 100); pek(k, 'pointermove', 100, 130); vi.advanceTimersByTime(2000); });
      expect(hall).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('släpps eller lämnas knappen före tiden är det inget håll', async () => {
    vi.useFakeTimers();
    try {
      const hall = vi.fn();
      const k = await montera({ synlig: true, onTryck: () => {}, onHall: hall });
      await act(async () => { pek(k, 'pointerdown'); vi.advanceTimersByTime(300); pek(k, 'pointerout'); vi.advanceTimersByTime(2000); });
      expect(hall).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('en dold knapp ger inget val', async () => {
    vi.useFakeTimers();
    try {
      const hall = vi.fn();
      const k = await montera({ synlig: false, onTryck: () => {}, onHall: hall });
      await act(async () => { pek(k, 'pointerdown'); vi.advanceTimersByTime(2000); });
      expect(hall).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('utan onHall (planeringsvyn) är knappen ett vanligt tryck: ingen håll-logik, klicket sväljs aldrig', async () => {
    vi.useFakeTimers();
    try {
      const tryck = vi.fn();
      const k = await montera({ synlig: true, onTryck: tryck });
      await act(async () => { pek(k, 'pointerdown'); vi.advanceTimersByTime(2000); pek(k, 'pointerup'); k.click(); });
      expect(tryck).toHaveBeenCalledTimes(1);
      expect(k.style.touchAction).toBe('');   // ingen håll-styling heller
    } finally { vi.useRealTimers(); }
  });

  it('håll → nytt tryck efteråt centrerar (slukKlick gäller bara det första klicket)', async () => {
    vi.useFakeTimers();
    try {
      const tryck = vi.fn(), hall = vi.fn();
      const k = await montera({ synlig: true, onTryck: tryck, onHall: hall });
      await act(async () => { pek(k, 'pointerdown'); vi.advanceTimersByTime(ZOOM_HALL_MS + 5); pek(k, 'pointerup'); k.click(); });
      await act(async () => { pek(k, 'pointerdown'); vi.advanceTimersByTime(100); pek(k, 'pointerup'); k.click(); });
      expect(hall).toHaveBeenCalledTimes(1);
      expect(tryck).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('CentreraZoomVal', () => {
  async function monteraVal(p: { onSpara: () => void; onStang: () => void }) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root!.render(createElement(CentreraZoomVal, p)); });
    return host;
  }

  it('EN knapp, "Spara den här zoomen": trycket sparar', async () => {
    const spara = vi.fn(), stang = vi.fn();
    const h = await monteraVal({ onSpara: spara, onStang: stang });
    const knappar = h.querySelectorAll('button');
    expect(knappar.length).toBe(1);
    expect(knappar[0].textContent).toBe('Spara den här zoomen');
    await act(async () => { (h.querySelector('[data-testid="centrera-zoomval-spara"]') as HTMLElement).click(); });
    expect(spara).toHaveBeenCalledTimes(1);
    expect(stang).not.toHaveBeenCalled();
  });

  it('tryck utanför stänger — och ingenting sparas', async () => {
    const spara = vi.fn(), stang = vi.fn();
    const h = await monteraVal({ onSpara: spara, onStang: stang });
    const bak = h.querySelector('[data-testid="centrera-zoomval-bakgrund"]') as HTMLElement;
    await act(async () => { pek(bak, 'pointerdown'); bak.click(); });   // ett riktigt tryck: pekare ned på bakgrunden, sedan klick
    expect(stang).toHaveBeenCalledTimes(1);
    expect(spara).not.toHaveBeenCalled();
  });

  it('klicket som webbläsaren skapar när fingret lyfts efter hållet (utan pekare ned på bakgrunden) stänger INTE valet', async () => {
    const spara = vi.fn(), stang = vi.fn();
    const h = await monteraVal({ onSpara: spara, onStang: stang });
    await act(async () => { (h.querySelector('[data-testid="centrera-zoomval-bakgrund"]') as HTMLElement).click(); });
    expect(stang).not.toHaveBeenCalled();
    expect(h.querySelector('[data-testid="centrera-zoomval"]')).not.toBeNull();
  });

  it('ett tryck utanför stänger bara en gång per tryck (nästa klick utan nytt tryck gör inget)', async () => {
    const stang = vi.fn();
    const h = await monteraVal({ onSpara: () => {}, onStang: stang });
    const bak = h.querySelector('[data-testid="centrera-zoomval-bakgrund"]') as HTMLElement;
    await act(async () => { pek(bak, 'pointerdown'); bak.click(); bak.click(); });
    expect(stang).toHaveBeenCalledTimes(1);
  });

  it('ingen annan text eller hjälptext: bara knappens ord', async () => {
    const h = await monteraVal({ onSpara: () => {}, onStang: () => {} });
    expect(h.textContent).toBe('Spara den här zoomen');
  });

  it('valet ligger över bakgrunden som fångar trycken (så ett tryck utanför aldrig når kartan)', async () => {
    const h = await monteraVal({ onSpara: () => {}, onStang: () => {} });
    const bak = h.querySelector('[data-testid="centrera-zoomval-bakgrund"]') as HTMLElement;
    const val = h.querySelector('[data-testid="centrera-zoomval"]') as HTMLElement;
    expect(Number(val.style.zIndex)).toBeGreaterThan(Number(bak.style.zIndex));
    expect(bak.style.position).toBe('fixed');
  });
});
