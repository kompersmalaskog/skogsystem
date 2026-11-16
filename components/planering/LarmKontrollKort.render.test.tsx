// @vitest-environment jsdom
// "Du är vid larmplatsen — kommer en ambulans hit?" Ja svarar direkt; Nej frågar varför och skickar.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import LarmKontrollKort from './LarmKontrollKort';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null; let ruta: HTMLElement | null = null;
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); });
async function montera(el: React.ReactElement) { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); await act(async () => { rot!.render(el); }); }

describe('LarmKontrollKort', () => {
  it('Ja, Nej med varför, och × för inte nu', async () => {
    const h: string[] = [];
    await montera(<LarmKontrollKort namn="Avlägg 01-4 · skbv gräskulla öst huset" top="0px" sparar={false} fel={false}
      onJa={() => h.push('ja')} onNej={(t) => h.push(`nej:${t}`)} onInteNu={() => h.push('inte-nu')} />);
    expect(q('larm-kontroll-kort')!.textContent).toContain('Du är vid larmplatsen · Avlägg 01-4 · skbv gräskulla öst huset');
    expect(q('larm-kontroll-kort')!.textContent).toContain('Kommer en ambulans hit?');
    act(() => { q('larm-kontroll-ja')!.click(); });
    act(() => { q('larm-kontroll-inte-nu')!.click(); });
    act(() => { q('larm-kontroll-nej')!.click(); });
    expect(q('larm-kontroll-kort')!.textContent).toContain('Varför inte?');
    const input = q('larm-kontroll-text') as HTMLInputElement;
    act(() => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; s.call(input, 'bommen är låst'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { q('larm-kontroll-skicka')!.click(); });
    expect(h).toEqual(['ja', 'inte-nu', 'nej:bommen är låst']);
  });
  it('fel visas i ord', async () => {
    await montera(<LarmKontrollKort namn={null} top="0px" sparar={false} fel onJa={() => {}} onNej={() => {}} onInteNu={() => {}} />);
    expect(q('larm-kontroll-fel')!.textContent).toMatch(/Kunde inte spara/);
  });
});
