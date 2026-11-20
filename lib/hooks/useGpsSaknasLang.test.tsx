// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useGpsSaknasLang } from './useGpsSaknasLang';
import { GPS_SAKNAS_NOTIS_MS } from '../gpsSaknas';

// Minimal renderHook (testing-library finns inte i projektet): hooken körs i en komponent, resultatet läses ur `result.current`.
function renderHook<P>(hook: (p: P) => ReturnType<typeof useGpsSaknasLang>, opts: { initialProps: P }) {
  const result = { current: null as unknown as ReturnType<typeof useGpsSaknasLang> };
  const behallare = document.createElement('div'); document.body.appendChild(behallare);
  const rot = createRoot(behallare);
  function Prov({ p }: { p: P }) { result.current = hook(p); return null; }
  act(() => { rot.render(<Prov p={opts.initialProps} />); });
  return { result, rerender: (p: P) => act(() => { rot.render(<Prov p={p} />); }), avmontera: () => { act(() => rot.unmount()); behallare.remove(); } };
}
const rhB = <P,>(hook: (p: P) => ReturnType<typeof useGpsSaknasLang>, p: P) => renderHook(hook, { initialProps: p });
let aktuell: { avmontera: () => void } | null = null;

beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers(); });
afterEach(() => { aktuell?.avmontera(); aktuell = null; vi.useRealTimers(); });

describe('useGpsSaknasLang — 30 s utan giltig fix, utan polling', () => {
  it('ingen fix alls: saknas efter 30 s, inte före', () => {
    const { result, avmontera } = rhB<boolean>((a) => useGpsSaknasLang(a), true); aktuell = { avmontera };
    act(() => { vi.advanceTimersByTime(GPS_SAKNAS_NOTIS_MS - 1); });
    expect(result.current.saknas).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.saknas).toBe(true);
  });
  it('en fix var 5:e sekund håller det falskt hur länge som helst', () => {
    const { result, avmontera } = rhB<boolean>((a) => useGpsSaknasLang(a), true); aktuell = { avmontera };
    for (let i = 0; i < 40; i++) { act(() => { vi.advanceTimersByTime(5000); result.current.vidFix(); }); }
    expect(result.current.saknas).toBe(false);
  });
  it('fixarna tystnar: 30 s efter SISTA fixen; en ny fix nollar direkt', () => {
    const { result, avmontera } = rhB<boolean>((a) => useGpsSaknasLang(a), true); aktuell = { avmontera };
    act(() => { vi.advanceTimersByTime(20000); result.current.vidFix(); });
    act(() => { vi.advanceTimersByTime(29999); });
    expect(result.current.saknas).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.saknas).toBe(true);
    act(() => { result.current.vidFix(); });
    expect(result.current.saknas).toBe(false);
    act(() => { vi.advanceTimersByTime(GPS_SAKNAS_NOTIS_MS); });
    expect(result.current.saknas).toBe(true);
  });
  it('inaktiv (ingen maskin, testläge, brytaren av): aldrig sant, ingen timer kvar', () => {
    const { result, avmontera } = rhB<boolean>((a) => useGpsSaknasLang(a), false); aktuell = { avmontera };
    act(() => { vi.advanceTimersByTime(10 * 60000); result.current.vidFix(); });
    expect(result.current.saknas).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('blir inaktiv mitt i avbrottet: nollas och timern städas', () => {
    const { result, rerender, avmontera } = rhB<boolean>((a) => useGpsSaknasLang(a), true); aktuell = { avmontera };
    act(() => { vi.advanceTimersByTime(GPS_SAKNAS_NOTIS_MS); });
    expect(result.current.saknas).toBe(true);
    rerender(false);
    expect(result.current.saknas).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
