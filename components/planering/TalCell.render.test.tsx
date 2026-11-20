// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import { TalCell } from './KlarSteg';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 2026-11-02: ett tomt G15-fält räknas som förslaget (20,5). Förut hoppade fältet tillbaka till 20,5 när man suddade, så 20,5 → 19 slutade som "2".
function Rigg() {
  const [manuell, setManuell] = useState('');
  const varde = manuell.trim() === '' ? '20.5' : manuell;   // som sidan: tomt = förslaget
  return <TalCell id="t" aktiv onAktiv={() => {}} onKlart={() => {}} varde={varde} onChange={setManuell} label="G15" tom="Skriv"><span /></TalCell>;
}
const skriv = (el: HTMLInputElement, v: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('TalCell: det man skriver står kvar', () => {
  it('sudda hela 20,5 och skriv 19', () => {
    const d = document.createElement('div');
    act(() => { createRoot(d).render(<Rigg />); });
    const f = d.querySelector('input') as HTMLInputElement;
    expect(f.value).toBe('20,5');
    for (const v of ['20,', '20', '2', '']) skriv(f, v);
    expect(f.value).toBe('');
    skriv(f, '1'); skriv(f, '19');
    expect(f.value).toBe('19');
  });
});
