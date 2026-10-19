// @vitest-environment jsdom
// KartHuvud och KartKnapp: det som får gå sönder tyst — träffytor under 44, en andra väg tillbaka, ett huvud som är genomskinligt
// (rött i solljus är brunt), eller en knapp som bara har en ikon.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import KartHuvud, { KARTHUVUD_HOJD, underKartHuvud } from './KartHuvud';
import KartKnapp from './KartKnapp';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  return host;
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
});

describe('KartHuvud', () => {
  it('är EN länk tillbaka med etikett, och pilens träffyta är minst 44 x 44', async () => {
    const h = await montera(createElement(KartHuvud, { tillbakaHref: '/egenkontroll', tillbakaEtikett: 'Tillbaka till egenkontroll', titel: 'Åbogen' }));
    const lankar = h.querySelectorAll('a');
    expect(lankar.length).toBe(1);
    expect(lankar[0].getAttribute('href')).toBe('/egenkontroll');
    expect(lankar[0].getAttribute('aria-label')).toBe('Tillbaka till egenkontroll');
    expect(parseInt((lankar[0] as HTMLElement).style.width, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt((lankar[0] as HTMLElement).style.height, 10)).toBeGreaterThanOrEqual(44);
  });

  it('flytande = TÄCKT kort (inget genomskinligt glas), absolut över kartan, under arken (z < 650)', async () => {
    const h = await montera(createElement(KartHuvud, { tillbakaHref: '/x', tillbakaEtikett: 'Tillbaka', titel: 'Åbogen', flytande: true }));
    const el = h.querySelector('header') as HTMLElement;
    expect(el.style.position).toBe('absolute');
    expect(el.style.background).not.toMatch(/rgba|transparent/);
    expect(el.style.backdropFilter ?? '').toBe('');
    // Inga ramar på kort (beslut Martin 2026-10-19): kortet bär sin form med bakgrunden.
    expect(el.style.border).toBe('');
    expect(Number(el.style.zIndex)).toBeLessThan(650);
    expect(el.getAttribute('data-flytande')).toBe('1');
  });

  it('solid (sida) = sticky överst med svart bakgrund', async () => {
    const h = await montera(createElement(KartHuvud, { tillbakaHref: '/x', tillbakaEtikett: 'Tillbaka', titel: 'Egenkontroll' }));
    const el = h.querySelector('header') as HTMLElement;
    expect(el.style.position).toBe('sticky');
    expect(el.style.top).toBe('0px');
    expect(el.getAttribute('data-flytande')).toBe('0');
  });

  it('med onTryck är titeln en knapp (hela radens höjd) som säger om arket är öppet; utan är den ren text', async () => {
    const tryck = vi.fn();
    const h = await montera(createElement(KartHuvud, { tillbakaHref: '/x', tillbakaEtikett: 'T', titel: 'Åbogen', meta: '5 kvar', onTryck: tryck, tryckEtikett: 'Öppna rundan', oppen: false }));
    const k = h.querySelector('button')!;
    expect(k.getAttribute('aria-label')).toBe('Öppna rundan');
    expect(k.getAttribute('aria-expanded')).toBe('false');
    expect(k.style.height).toBe('100%');
    expect(k.textContent).toContain('Åbogen');
    expect(k.textContent).toContain('5 kvar');
    await act(async () => { k.click(); });
    expect(tryck).toHaveBeenCalledTimes(1);
  });

  it('utan onTryck finns ingen knapp i huvudet', async () => {
    const h = await montera(createElement(KartHuvud, { tillbakaHref: '/x', tillbakaEtikett: 'T', titel: 'Egenkontroll' }));
    expect(h.querySelector('button')).toBeNull();
  });

  it('underKartHuvud() räknar med huvudets mått och systemfältet — aldrig ett naket tal', () => {
    expect(underKartHuvud()).toContain('env(safe-area-inset-top)');
    expect(underKartHuvud()).toContain(`${KARTHUVUD_HOJD}px`);
    expect(underKartHuvud(8)).toContain('+ 8px');
  });
});

describe('KartKnapp', () => {
  it('ikon OCH ord, minst 48 hög, täckt bakgrund', async () => {
    const tryck = vi.fn();
    const h = await montera(createElement(KartKnapp, { ikon: 'layers', etikett: 'Lager', ariaLabel: 'Kartlager', onClick: tryck }));
    const k = h.querySelector('button') as HTMLButtonElement;
    expect(k.textContent).toContain('layers');   // ikonens namn är texten i Material Symbols
    expect(k.textContent).toContain('Lager');
    expect(k.getAttribute('aria-label')).toBe('Kartlager');
    expect(parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(48);
    expect(k.style.background).not.toMatch(/rgba|transparent/);
    expect(k.style.borderStyle).toBe('none');
    await act(async () => { k.click(); });
    expect(tryck).toHaveBeenCalledTimes(1);
  });
});
