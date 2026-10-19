// @vitest-environment jsdom
// Utbildningssidorna MÅSTE ha toppfältet: där sitter hemknappen uppe till vänster.
// Den var avstängd (`pathname.startsWith('/utbildning') → null`) medan vyn hade en
// bottennavigation att gå via. När den togs bort 2026-10-19 satt man fast på sidan,
// och layouten lämnade ändå 56 px tom svart plats åt fältet som aldrig ritades.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

const h = vi.hoisted(() => ({ sokvag: '/utbildning' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.sokvag }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

import TopBar from './TopBar';

let container: HTMLDivElement;
let root: Root;

async function montera(sokvag: string) {
  h.sokvag = sokvag;
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<TopBar />);
  });
}

function hemlank() {
  return Array.from(container.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/');
}

function titel() {
  return container.querySelector('#topbar-title')?.textContent ?? '';
}

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
});

describe('Toppfältet på utbildningssidorna', () => {
  it('har en hemknapp uppe till vänster på startsidan', async () => {
    await montera('/utbildning');
    const hem = hemlank();
    expect(hem).toBeTruthy();
    expect(hem!.querySelector('img')?.getAttribute('alt')).toBe('Hem');
    expect(titel()).toBe('Utbildning');
  });

  it('har hemknapp och rätt titel på undersidorna — aldrig "Utbildning/katalog"', async () => {
    for (const [sokvag, forvantad] of [
      ['/utbildning/katalog', 'Katalog'],
      ['/utbildning/typ/abc-123', 'Utbildning'],
      ['/utbildning/person/abc-123', 'Utbildning'],
    ] as const) {
      await montera(sokvag);
      expect(hemlank(), sokvag).toBeTruthy();
      expect(titel(), sokvag).toBe(forvantad);
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });
});
