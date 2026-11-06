// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HogKort, mestText, m3Text, HOG_GRUPP_FARG, tagenEtikett } from './HogKort';
import type React from 'react';
import { SORTIMENTFARG } from '@/lib/design/tokens';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null; let el: HTMLDivElement | null = null;
function render(n: React.ReactNode) { el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el); act(() => rot!.render(n)); }
const screen = {
  getByTestId: (id: string) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) throw new Error(id); return e as HTMLElement; },
  queryByTestId: (id: string) => document.querySelector(`[data-testid="${id}"]`),
};
const fireEvent = { click: (e: HTMLElement) => act(() => { e.click(); }) };
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; });

const K = (s: () => void, t: () => void, k: () => void) => [
  { etikett: 'Stäng', testid: 'hog-kort-stang', onClick: s },
  { etikett: 'Tagen', testid: 'hog-kort-tagen', onClick: t },
  { etikett: 'Ligger kvar', testid: 'hog-kort-kvar', onClick: k },
] as [any, any, any];
const n = () => {};
const grupper = [
  { grupp: 'massa' as const, namn: 'Massaved', m3: 4.5 },
  { grupp: 'timmer' as const, namn: 'Timmer', m3: 2.1 },
  { grupp: 'energi' as const, namn: 'Energi', m3: 1.2 },
];

describe('HogKort (design A)', () => {
  it('visar titel, "Mest …", en rad per sortiment och en stapel', () => {
    render(<HogKort titel="7,8 m³ kvar här" grupper={grupper} smal knappar={K(n, n, n)} />);
    expect(screen.getByTestId('hog-kort-titel').textContent).toBe('7,8 m³ kvar här');
    expect(screen.getByTestId('hog-kort-mest').textContent).toBe('Mest massaved');
    expect(screen.getByTestId('hog-kort-rad-massa').textContent).toContain('4,5 m³');
    expect(screen.getByTestId('hog-kort-rad-timmer').textContent).toContain('Timmer');
    expect(screen.getByTestId('hog-kort-stapel').children.length).toBe(3);
  });

  it('utan grupper bara titeln och knapparna', () => {
    render(<HogKort titel="3,0 m³ timmer kvar här" smal={false} knappar={K(n, n, n)} />);
    expect(screen.queryByTestId('hog-kort-stapel')).toBeNull();
    expect(screen.queryByTestId('hog-kort-mest')).toBeNull();
  });

  it('tre knappar gör var sin sak', () => {
    const s = vi.fn(), t = vi.fn(), k = vi.fn();
    render(<HogKort titel="x" grupper={grupper} smal knappar={K(s, t, k)} />);
    fireEvent.click(screen.getByTestId('hog-kort-stang'));
    fireEvent.click(screen.getByTestId('hog-kort-tagen'));
    fireEvent.click(screen.getByTestId('hog-kort-kvar'));
    expect([s, t, k].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('ett sortiment ger ingen "Mest"-rad; färgerna är sortimentfärgerna', () => {
    expect(mestText([grupper[0]])).toBeNull();
    expect(m3Text(4.25)).toBe('4,3');
    expect(HOG_GRUPP_FARG.timmer).toBe(SORTIMENTFARG.timmer);
    expect(HOG_GRUPP_FARG.energi).toBe(SORTIMENTFARG.ovrigt);
  });

  it('områdeskortet: rader med ett sortiment går att bocka i, Övrigt inte; den vita knappen säger vad som markeras', () => {
    const valda = new Set<'timmer' | 'kubb' | 'massa' | 'energi' | 'ovrigt'>(['massa']);
    const onVal = vi.fn();
    const g = [...grupper, { grupp: 'ovrigt' as const, namn: 'Övrigt', m3: 1 }];
    render(<HogKort testid="hog-omrade-kort" titel="9 m³ kvar i området" grupper={g} val={{ valda, onVal }} smal knappar={K(n, n, n)} />);
    expect(screen.getByTestId('hog-omrade-kort-rad-massa').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('hog-omrade-kort-rad-timmer').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('hog-omrade-kort-rad-ovrigt').tagName).toBe('DIV');
    fireEvent.click(screen.getByTestId('hog-omrade-kort-rad-timmer'));
    expect(onVal).toHaveBeenCalledWith('timmer');
  });

  it('tagenEtikett: Allt / ett / två / tre sortiment', () => {
    expect(tagenEtikett([])).toBe('Allt är taget');
    expect(tagenEtikett([grupper[1]])).toBe('Timmer är taget');
    expect(tagenEtikett([grupper[1], grupper[0]])).toBe('Timmer och massaved är taget');
    expect(tagenEtikett([grupper[1], grupper[0], grupper[2]])).toBe('Timmer, massaved och energi är taget');
  });
});

describe('HogKort — knappraden', () => {
  it('kort vit knapp (Tagen) ligger mitt i raden; lång (Allt är taget) får en egen rad överst', () => {
    const k = (etikett: string) => [
      { etikett: 'Stäng', testid: 'a', onClick: n }, { etikett, testid: 'b', onClick: n }, { etikett: 'Rita nytt', testid: 'c', onClick: n },
    ] as [any, any, any];
    render(<HogKort titel="x" smal knappar={k('Tagen')} />);
    expect(screen.getByTestId('b').parentElement!.children.length).toBe(3);
    act(() => rot!.unmount()); el!.remove();
    render(<HogKort titel="x" smal knappar={k('Allt är taget')} />);
    expect(screen.getByTestId('b').parentElement!.children.length).toBe(1);
  });
});
