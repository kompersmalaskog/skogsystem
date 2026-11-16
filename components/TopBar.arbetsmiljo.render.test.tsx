// @vitest-environment jsdom
// Arbetsmiljöns delar har "‹ Arbetsmiljö" uppe till vänster i stället för hemknappen,
// så man kan gå mellan delarna utan att börja om från startsidan (Martin 2026-11-05).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

const h = vi.hoisted(() => ({ sokvag: '/sa-gor-vi' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.sokvag }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

import TopBar, { ARBETSMILJO_DELAR } from './TopBar';

let container: HTMLDivElement;
let root: Root;

async function montera(sokvag: string) {
  h.sokvag = sokvag;
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<TopBar />); });
}
const lankar = () => Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
});

describe('Toppfältet i arbetsmiljöns delar', () => {
  it('Så gör vi, Kemikalier, Riskbedömning m.fl. har ‹ Arbetsmiljö, inte hem', async () => {
    for (const s of ['/sa-gor-vi', '/kemikalier', '/riskbedomning', '/skyddsrond', '/farligt-avfall', '/atgarder', '/maskinkoll', '/introduktion']) {
      await montera(s);
      expect(lankar(), s).toEqual(['/arbetsmiljo']);
      expect(container.textContent).toContain('Arbetsmiljö');
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });

  it('Om något händer och Arbetsmiljö själv har hemknappen', async () => {
    for (const s of ['/om-nagot-hander', '/arbetsmiljo']) {
      await montera(s);
      expect(lankar(), s).toEqual(['/']);
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });

  it('listan kommer ur vyregistret och innehåller Så gör vi men inte Om något händer', () => {
    expect(ARBETSMILJO_DELAR.has('/sa-gor-vi')).toBe(true);
    expect(ARBETSMILJO_DELAR.has('/om-nagot-hander')).toBe(false);
    expect(ARBETSMILJO_DELAR.has('/arbetsmiljo')).toBe(false);
  });
});
