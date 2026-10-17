// @vitest-environment jsdom
// NedfaldList — "arket som en list nertill": den delade listen för Klar med trakten? (avlägg) och Om trakten (valt på kartan). Tillbaka är ALLTID första knappen.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { NedfaldList, tillbakaKnapp } from './NedfaldList';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function montera(el: React.ReactElement) {
  behallare = document.createElement('div'); document.body.appendChild(behallare);
  rot = createRoot(behallare); act(() => { rot!.render(el); });
}

describe('NedfaldList', () => {
  it('texten, och "‹ <etikett>" som första knapp; tryck på tillbaka gör det som skickats in', () => {
    let tillbaka = 0;
    montera(<NedfaldList testid="lista" smal text="Basväg · 329 m" tillbaka={{ etikett: 'Lista', onClick: () => { tillbaka += 1; }, testid: 'lista-tillbaka' }} />);
    expect(q('lista')!.textContent).toContain('Basväg · 329 m');
    const knappar = Array.from(q('lista')!.querySelectorAll('button'));
    expect(knappar[0].textContent).toBe('‹ Lista');
    expect(knappar[0].getAttribute('data-testid')).toBe('lista-tillbaka');
    act(() => { knappar[0].click(); });
    expect(tillbaka).toBe(1);
  });
  it('fler knappar (t.ex. × som släpper valet) kommer efter tillbaka', () => {
    let slapp = 0;
    montera(<NedfaldList testid="lista" smal={false} text="Tryck där avlägget ska ligga" tillbaka={{ etikett: 'Skälviken', onClick: () => {}, testid: 't' }}
      extra={[{ etikett: '×', onClick: () => { slapp += 1; }, testid: 'x', aria: 'Avbryt' }]} />);
    const knappar = Array.from(q('lista')!.querySelectorAll('button'));
    expect(knappar.map((b) => b.textContent)).toEqual(['‹ Skälviken', '×']);
    act(() => { knappar[1].click(); });
    expect(slapp).toBe(1);
  });
  it('tillbakaKnapp lägger aldrig två pilar', () => {
    expect(tillbakaKnapp('‹ Lista', () => {}, 't').etikett).toBe('‹ Lista');
    expect(tillbakaKnapp('Lista', () => {}, 't').etikett).toBe('‹ Lista');
  });
});
