// @vitest-environment jsdom
// Över tid › Frost: svaret i ord, tabellen grovlek × läge, ett läsfel som säger det (aldrig en tom tabell som ser ut som "ingen skillnad").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FrostRad, FrostResp } from '@/lib/kalibrering/frost';
import FrostVinkel from './FrostVinkel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const stammar = (grupp: FrostRad['grupp'], lage: FrostRad['lage'], n: number, mm: number): FrostRad[] =>
  Array.from({ length: n }, (_, i) => ({ stam: `${grupp}-${lage}-${i}`, grupp, lage, n: 1, summa: mm }));

let rot: Root | null = null, host: HTMLDivElement | null = null;
afterEach(() => { act(() => rot?.unmount()); host?.remove(); rot = null; host = null; vi.unstubAllGlobals(); });
async function montera(svar: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => svar })));
  host = document.createElement('div'); document.body.appendChild(host); rot = createRoot(host);
  await act(async () => { rot!.render(createElement(FrostVinkel, { maskin: 'PONS' })); });
  await act(async () => { await Promise.resolve(); });
  return host;
}

describe('Frost', () => {
  it('lika flytt i alla grovlekar → svaret säger att hela kurvan flyttat sig, tabellen visar talen', async () => {
    const resp: FrostResp = { ok: true, maskin_id: 'PONS', utanVader: 3, rader: [
      ...stammar('klen', 'varmt', 10, 0), ...stammar('klen', 'fruset', 10, 2),
      ...stammar('mellan', 'varmt', 10, 1), ...stammar('mellan', 'fruset', 10, 3),
    ] };
    const h = await montera(resp);
    expect(h.querySelector('[data-frost-svar]')!.textContent).toContain('hela kurvan har flyttat sig');
    expect(h.querySelector('[data-frost-cell="klen-fruset"]')!.textContent).toContain('+2,0 mm');
    expect(h.querySelector('[data-frost-cell="grov-varmt"]')!.textContent).toContain('–');
    expect(h.querySelector('[data-frost-kallt]')).toBeNull();
    expect(h.textContent).toContain('3 stammar har inget väder än');
    expect(h.textContent).not.toMatch(/justera|ändra kurvan|minska|öka/i);
  });
  it('läsfel → säger det med Försök igen', async () => {
    const h = await montera({ ok: false });
    expect(h.textContent).toContain('Frosten kunde inte läsas');
    expect(h.textContent).toContain('Försök igen');
  });
});
