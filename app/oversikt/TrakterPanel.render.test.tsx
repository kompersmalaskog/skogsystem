// @vitest-environment jsdom
// Trakter-listan och menyn monterade på riktigt. Layouten (sidokolumn från 1100 px) mäts i Chromium. TRAKTER_HTML=<fil> skriver HTML:en.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { writeFileSync } from 'node:fs';
import { TrakterPanel, KartMeny, KartMenyKnapp } from './TrakterPanel';
import type { TrakterGrupper } from './trakterLista';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null; let el: HTMLDivElement;
const montera = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el); await act(async () => { rot!.render(n); }); };
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; });

const G: TrakterGrupper = {
  pagar: [{ id: 'b', namn: 'Bondeskog', under: 'Giant står här', underOrange: false, fynd: null }, { id: 'p', namn: 'Patrik Andersson Bjällerhult', under: 'H8E -26 står här', underOrange: false, fynd: 'Nyckelbiotop' }],
  planerade: [{ id: 'l', namn: 'Lidhem Britteberg', under: 'Giant · nästa', underOrange: false, fynd: 'Fossil åker' }, { id: 'e', namn: 'Edestad', under: 'Ingen maskin', underOrange: true, fynd: null }],
  oplanerade: [{ id: 'h', namn: 'Hönshylte gallring', under: null, underOrange: false, fynd: null }],
  antal: 5, utanMaskin: 1,
};

describe('Trakter', () => {
  it('tre grupper som i Planeringen; oplanerade hopfällda; tryck väljer trakten; ‹ Kartan stänger', async () => {
    const valda: string[] = []; let stangd = 0;
    await montera(<div style={{ position: 'relative', height: 900 }}><TrakterPanel grupper={G} valt="l" onValj={(id) => valda.push(id)} onStang={() => { stangd += 1; }} /></div>);
    if (process.env.TRAKTER_HTML) writeFileSync(process.env.TRAKTER_HTML, el.innerHTML);
    expect([...el.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Pågår · 2', 'Planerade · 2']);
    expect(el.textContent).toContain('Oplanerade · 1');
    expect(el.textContent).not.toContain('Hönshylte');
    expect(el.textContent).toContain('Fossil åker');
    await act(async () => { ([...el.querySelectorAll('[data-trakt-rad]')][2] as HTMLButtonElement).click(); });
    expect(valda).toEqual(['l']);
    await act(async () => { ([...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Oplanerade')) as HTMLButtonElement).click(); });
    expect(el.textContent).toContain('Hönshylte');
    await act(async () => { ([...el.querySelectorAll('button')].find((b) => b.textContent === '‹ Kartan') as HTMLButtonElement).click(); });
    expect(stangd).toBe(1);
  });
  it('menyn: en rad per lista; knappen har orange prick när något behöver dig', async () => {
    let vald = '';
    await montera(<><KartMenyKnapp onClick={() => {}} prick /><KartMeny onStang={() => {}} rader={[{ id: 't', text: 'Trakter · 5', under: '1 planerade utan maskin', underOrange: true, onClick: () => { vald = 't'; } }, { id: 'g', text: 'GROT · 33', onClick: () => {} }]} /></>);
    expect(el.querySelector('[data-testid=kartmeny]')?.getAttribute('aria-label')).toBe('Meny – något behöver dig');
    expect([...el.querySelectorAll('[role=menuitem]')].map((b) => b.textContent)).toEqual(['Trakter · 51 planerade utan maskin›', 'GROT · 33›']);
    await act(async () => { (el.querySelector('[role=menuitem]') as HTMLButtonElement).click(); });
    expect(vald).toBe('t');
  });
});
