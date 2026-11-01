// @vitest-environment jsdom
/** Maskinkollen på startsidan: "Behöver dig" säger till när det är dags — och säger ingenting när den inte går att läsa. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Startsida from './Startsida';

let rot: ReturnType<typeof createRoot> | null = null;
let el: HTMLDivElement | null = null;

beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; el = document.createElement('div'); document.body.appendChild(el); });
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });

async function montera(marken: Record<string, number | null>) {
  await act(async () => { rot = createRoot(el!); rot.render(<Startsida roll="forare" marken={marken} />); });
}

describe('Startsida — maskinkoll', () => {
  it('dags: en rad under Behöver dig som leder till /maskinkoll', async () => {
    await montera({ maskinkoll: 1 });
    const lank = Array.from(el!.querySelectorAll('a')).find(a => a.getAttribute('href') === '/maskinkoll' && a.textContent?.includes('Dags för maskinkoll'));
    expect(lank).toBeTruthy();
  });

  it('inte dags (0) eller okänt (null): ingen rad', async () => {
    await montera({ maskinkoll: 0 });
    expect(el!.textContent).not.toContain('Dags för maskinkoll');
    act(() => { rot?.unmount(); }); rot = null;
    await montera({ maskinkoll: null });
    expect(el!.textContent).not.toContain('Dags för maskinkoll');
  });
});
