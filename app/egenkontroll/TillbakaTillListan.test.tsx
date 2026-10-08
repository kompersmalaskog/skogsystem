// @vitest-environment jsdom
// Bakåtpilen från rundan till /egenkontroll. Det som får gå sönder tyst:
//  - pilen leder någon annanstans än listan (eller har två vägar tillbaka),
//  - träffytan krymper under 44 (handske, skakande maskin),
//  - hemknappen ligger kvar bredvid pilen (body[data-hide-home] sätts inte) eller
//    blir kvar dold när man lämnat rundan (cleanup saknas),
//  - behållaren i toppfältet sväljer tryck som hör till TopBar,
//  - pilen hamnar ovanför formulären (z 1100) så man kan gå ur mitt i en mätning.
// Placeringen (mittlinje mot titeln, safe-area) kan jsdom inte räkna - den provas i riktig
// webbläsare mot TopBar, se PR-texten.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TillbakaTillListan, { EGENKONTROLL_LISTA } from './TillbakaTillListan';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function montera(): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(TillbakaTillListan)); });
  return host;
}

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
  document.body.removeAttribute('data-hide-home');
});

describe('TillbakaTillListan', () => {
  it('är EN länk till egenkontroll-listan, med en etikett som säger vart den leder', async () => {
    const h = await montera();
    const lankar = h.querySelectorAll('a');
    expect(lankar.length).toBe(1);
    expect(EGENKONTROLL_LISTA).toBe('/egenkontroll');
    expect(lankar[0].getAttribute('href')).toBe('/egenkontroll');
    expect(lankar[0].getAttribute('aria-label')).toBe('Tillbaka till egenkontroll');
  });

  it('har träffyta på minst 44 x 44', async () => {
    const h = await montera();
    const a = h.querySelector('a') as HTMLAnchorElement;
    expect(parseInt(a.style.width, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(a.style.height, 10)).toBeGreaterThanOrEqual(44);
  });

  it('ERSÄTTER hemknappen: body[data-hide-home] sätts när den monteras, tas bort när man lämnar', async () => {
    expect(document.body.hasAttribute('data-hide-home')).toBe(false);
    await montera();
    expect(document.body.hasAttribute('data-hide-home')).toBe(true);
    await act(async () => { root!.unmount(); });
    root = null;
    expect(document.body.hasAttribute('data-hide-home')).toBe(false);
  });

  it('behållaren i toppfältet tar inga tryck - bara pilen gör det', async () => {
    const h = await montera();
    const behallare = h.firstElementChild as HTMLElement;
    const a = h.querySelector('a') as HTMLAnchorElement;
    expect(behallare.style.position).toBe('fixed');
    expect(behallare.style.pointerEvents).toBe('none');
    expect(a.style.pointerEvents).toBe('auto');
  });

  it('ligger över toppfältet (1000) men under formulär och dialoger (1100)', async () => {
    const h = await montera();
    const z = Number((h.firstElementChild as HTMLElement).style.zIndex);
    expect(z).toBeGreaterThan(1000);
    expect(z).toBeLessThan(1100);
  });
});
