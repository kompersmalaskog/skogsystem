// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GodkandKvitto, { KVITTO_MS } from './GodkandKvitto';

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
});
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; vi.useRealTimers(); });

const montera = (onAngra = vi.fn(), onKlar = vi.fn()) => {
  rot = createRoot(behallare!);
  act(() => { rot!.render(<GodkandKvitto text="Godkänd · Giant" onAngra={onAngra} onKlar={onKlar} />); });
  return { onAngra, onKlar };
};

describe('GodkandKvitto', () => {
  it('visar texten och Ångra, och Ångra anropar onAngra', () => {
    const { onAngra } = montera();
    expect(document.querySelector('[data-kvitto]')!.textContent).toContain('Godkänd · Giant');
    act(() => { (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Ångra') as HTMLElement).click(); });
    expect(onAngra).toHaveBeenCalledTimes(1);
  });

  it(`står i ${KVITTO_MS / 1000} s och försvinner sedan av sig självt (onKlar)`, () => {
    const { onKlar } = montera();
    act(() => { vi.advanceTimersByTime(KVITTO_MS - 1); });
    expect(onKlar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2); });
    expect(onKlar).toHaveBeenCalledTimes(1);
  });
});
