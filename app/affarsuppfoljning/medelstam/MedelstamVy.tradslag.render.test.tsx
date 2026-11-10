// @vitest-environment jsdom
// Gran · Tall på medelstamssidan: valet finns bara för slutavverkning och bara när trädslagen gick att läsa,
// och Gran räknar på granarna (granens volym, granarnas medelstam).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
import MedelstamVy from './MedelstamVy';
import type { Objekt } from '@/lib/medelstam/berakna';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
});

const obj = (id: string, ms: number, timmerAndel: number): Objekt => ({
  id, namn: id, typ: 'Slutavverkning', forsta: '2026-01-01', stammar: 400, volym: 400 * ms,
  timmer: 400 * ms * timmerAndel, kubb: 0, massa: 400 * ms * (1 - timmerAndel), medelstam: ms, rot20: null, stammar20: null, lov: 0,
});
const alla = [obj('a1', 0.5, 0.5), obj('a2', 0.5, 0.5), obj('a3', 0.5, 0.5)];
const tradslag = { gran: [obj('g1', 0.5, 0.6), obj('g2', 0.5, 0.6), obj('g3', 0.5, 0.6)], tall: [obj('t1', 0.5, 0.8), obj('t2', 0.5, 0.8)] };

async function vy(p: Record<string, unknown> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(MedelstamVy, { alla, tradslag, meta: {}, uppdaterad: null, rotLasbar: false, vy: 'huvud', gaTill: () => {}, start: { ms: '0,50' }, ...p } as any));
  });
  return host;
}
const flik = (h: HTMLElement, namn: string) => [...h.querySelectorAll('[role=tab]')].find(b => b.textContent === namn) as HTMLButtonElement | undefined;

describe('Gran · Tall på medelstamssidan', () => {
  it('Alla är förvalt och visar hela slutavverkningen', async () => {
    const h = await vy();
    expect(flik(h, 'Alla')?.getAttribute('aria-selected')).toBe('true');
    expect(h.textContent).toContain('av volymen blir timmer');
  });
  it('Gran räknar på granarna, Tall säger för få objekt', async () => {
    const h = await vy();
    await act(async () => { flik(h, 'Gran')!.click(); });
    expect(h.textContent).toContain('av granens volym blir timmer');
    expect(h.textContent).toContain('Medelstam gran');
    expect(h.textContent).toMatch(/60%/);
    await act(async () => { flik(h, 'Tall')!.click(); });
    expect(h.textContent).toContain('för få objekt här');
  });
  it('inget val när trädslagen inte gick att läsa', async () => {
    const h = await vy({ tradslag: null });
    expect(flik(h, 'Gran')).toBeUndefined();
  });
  it('inget val i gallring', async () => {
    const h = await vy({ start: { typ: 'Gallring', ms: '0,1' } });
    expect(flik(h, 'Gran')).toBeUndefined();
  });
});
