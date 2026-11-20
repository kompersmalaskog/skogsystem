// @vitest-environment jsdom
// Egenkontrollen har ingen flikrad, så hemknappen i toppfältet är listans ENDA väg ut (rundvyn går ut via pilen i KartHuvud till listan).
// Därför måste den klara appens minimiyta: träffytan är 44 px, medan den synliga rutan förblir 36 px med vänsterkant 12 px.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { TRAFFYTA } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ sokvag: '/egenkontroll' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.sokvag }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

import TopBar from './TopBar';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function montera(sokvag: string) {
  h.sokvag = sokvag;
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container!); root.render(<TopBar />); });
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null; container = null; document.body.removeAttribute('data-hide-home');
});
const hemlank = () => Array.from(container!.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/') as HTMLAnchorElement | undefined;

describe('TopBar i egenkontrollen', () => {
  it('listan (/egenkontroll) har toppfältet med titeln och en hemlänk till /', async () => {
    await montera('/egenkontroll');
    expect(container!.querySelector('#topbar-title')?.textContent).toBe('Egenkontroll');
    expect(hemlank()).toBeTruthy();
  });

  it('rundvyn (/egenkontroll/<objekt>) har inget toppfält — KartHuvud är dess enda huvud', async () => {
    await montera('/egenkontroll/abc-123');
    expect(container!.querySelector('header')).toBeNull();
    expect(hemlank()).toBeUndefined();
  });

  it('hemknappens träffyta är minst appens minimiyta, och den synliga rutan är oförändrad (36 px, vänsterkant 12 px)', async () => {
    await montera('/egenkontroll');
    const a = hemlank()!;
    expect(TRAFFYTA.min).toBe(44);
    expect(parseFloat(a.style.width)).toBeGreaterThanOrEqual(TRAFFYTA.min);
    expect(parseFloat(a.style.height)).toBeGreaterThanOrEqual(TRAFFYTA.min);
    const ruta = a.querySelector('span') as HTMLElement;
    expect(ruta.style.width).toBe('36px');
    expect(ruta.style.height).toBe('36px');
    // Rutan ligger centrerad i träffytan: länkens vänsterkant + (träffyta − ruta)/2 = 12 px som förut.
    expect(parseFloat(a.style.left) + (parseFloat(a.style.width) - 36) / 2).toBe(12);
    expect(ruta.querySelector('img')?.getAttribute('alt')).toBe('Hem');
  });

  it('en vy som döljer hemknappen (body[data-hide-home]) fungerar som förut', async () => {
    document.body.setAttribute('data-hide-home', '');
    await montera('/egenkontroll');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(hemlank()).toBeUndefined();
  });
});
