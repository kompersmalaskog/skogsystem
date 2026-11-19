// @vitest-environment jsdom
// Hem-knappen = tillbaka till appens meny (Martin 2026-11-19). På en maskindator med vald maskin skulle startvakten annars skicka `/` rakt
// till kartan; trycket sätter därför samma sessionsflagga som "Till appen", så vakten lämnar menyn ifred.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

vi.mock('next/navigation', () => ({ usePathname: () => '/arbetsrapport' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

import TopBar from './TopBar';
import { MENY_VALD_NYCKEL, startbeslutGaller } from '@/lib/appStart';

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<TopBar />); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('Hem-knappen', () => {
  it('sätter menyflaggan så startvakten inte studsar till kartan', () => {
    const a = Array.from(container.querySelectorAll('a')).find((x) => x.getAttribute('href') === '/')!;
    expect(sessionStorage.getItem(MENY_VALD_NYCKEL)).toBeNull();
    act(() => { a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(sessionStorage.getItem(MENY_VALD_NYCKEL)).toBe('1');
    // och med flaggan satt gäller inget startbeslut på "/"
    expect(startbeslutGaller({ pathname: '/', menyParam: false, menyValdISessionen: true, appStartSettRedan: true })).toBe(false);
  });
  it('på en maskindator (vald maskin) går hem till maskinlådan över kartan, inte till helsidan', () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { value: { ...orig, assign }, writable: true, configurable: true });
    const a = Array.from(container.querySelectorAll('a')).find((x) => x.getAttribute('href') === '/')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { a.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith('/planering?maskinmeny=1');
    Object.defineProperty(window, 'location', { value: orig, writable: true, configurable: true });
    localStorage.clear();
  });
  it('admin som testar som en maskin (/maskin?som=) går hem till maskinlådan i testläget', () => {
    sessionStorage.setItem('maskin_som_session_v1', 'A130743');
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { value: { ...orig, assign }, writable: true, configurable: true });
    const a = Array.from(container.querySelectorAll('a')).find((x) => x.getAttribute('href') === '/')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { a.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith('/maskin?som=A130743&maskinmeny=1');
    Object.defineProperty(window, 'location', { value: orig, writable: true, configurable: true });
  });
});
