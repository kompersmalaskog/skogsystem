// @vitest-environment jsdom
// En rad per väg i objektinfon: "Väg 538 · låg risk ✓" / "· ej riskbedömd" / "· hög risk". Tryck öppnar riskbedömningen för vägens ägare. Låg risk bor BARA här (inte på kartan).
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import VagRiskRader, { type VagRiskProps } from './VagRiskRader';
import { FARG } from '@/lib/design/tokens';
import type { VagRad } from '@/lib/vagRisk';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RADER: VagRad[] = [
  { nyckel: 'ref:538', agare: 'a', rubrik: 'Väg 538', risk: 'lag', status: 'låg risk ✓', farg: FARG.gron },
  { nyckel: 'ref:540', agare: 'b', rubrik: 'Väg 540', risk: 'obedomd', status: 'ej riskbedömd', farg: FARG.orange },
  { nyckel: 'ref:542', agare: 'c', rubrik: 'Väg 542', risk: 'hog', status: 'hög risk', farg: FARG.rod },
];
function visa(vagar: VagRiskProps | null | undefined) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  act(() => { createRoot(cont).render(<VagRiskRader vagar={vagar} />); });
  return cont;
}
const alla = (id: string) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const hexTillRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
beforeEach(() => { document.body.innerHTML = ''; });

describe('VagRiskRader — en rad per väg i objektinfon', () => {
  it('"Väg 538 · låg risk ✓", "· ej riskbedömd" och "· hög risk" — ordet bär betydelsen, färgen förstärker', () => {
    visa({ rader: RADER, onOppna: () => {} });
    expect(alla('vag-risk-rad').map((r) => r.textContent?.replace('route', ''))).toEqual(['Väg 538 · låg risk ✓', 'Väg 540 · ej riskbedömd', 'Väg 542 · hög risk']);
    expect(alla('vag-risk-status').map((e) => e.style.color)).toEqual([hexTillRgb(FARG.gron), hexTillRgb(FARG.orange), hexTillRgb(FARG.rod)]);
  });
  it('ett tryck på raden öppnar riskbedömningen för just den vägens ägare', () => {
    const onOppna = vi.fn();
    visa({ rader: RADER, onOppna });
    act(() => { alla('vag-risk-rad')[0].click(); });
    expect(onOppna).toHaveBeenCalledWith('a');
    act(() => { alla('vag-risk-rad')[2].click(); });
    expect(onOppna).toHaveBeenLastCalledWith('c');
  });
  it('ingen väg (eller inget angivet) = ingen ruta alls', () => {
    expect(visa(null).innerHTML).toBe('');
    expect(visa(undefined).innerHTML).toBe('');
    expect(visa({ rader: [], onOppna: () => {} }).innerHTML).toBe('');
  });
});
