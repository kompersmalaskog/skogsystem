// @vitest-environment jsdom
// Över tid (2026-11-25): tre flikar — Kurvor, Per grovlek, Greppet. Det som kan smyga tillbaka: en femte flik, "Träffprocent nu, per grovlek"
// (det som gäller NU står på Läget), Frost som egen flik, eller tidssteget som försvinner på en flik.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DiagKlass, DiagnosResp } from '@/lib/kalibrering/typer';

vi.mock('./TidsDiagram', () => ({ default: () => createElement('div', { 'data-stub': 'diagram' }), MARKOR_FARG: { atgard: '#fff', reparation: '#fff' } }));
vi.mock('./StabilitetTabell', () => ({ default: () => createElement('div', { 'data-stub': 'stabilitet' }) }));
vi.mock('./GrovlekVinkel', () => ({ default: () => createElement('div', { 'data-stub': 'grovlek' }) }));
vi.mock('./FrostVinkel', () => ({ default: () => createElement('div', { 'data-stub': 'frost' }) }));
vi.mock('./GreppVinkel', () => ({ default: () => createElement('div', { 'data-stub': 'grepp' }) }));
vi.mock('./AtgarderSektion', () => ({ default: () => null }));
vi.mock('./Rubrik', () => ({ default: () => null }));

import OverTidFlik from './OverTidFlik';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const klass = (k: string): DiagKlass => ({
  klass: k, min: 0, max: 0, n: 200, traffPct: 80, standardavv: 3.5, plateauShare: null, plateauN: 0, plateauMonthly: [],
  systMonthly: [{ manad: '2026-10', systematik: 0.5, n: 50 }],
  traffMonthly: [{ manad: '2026-09', traffPct: 78, n: 40 }, { manad: '2026-10', traffPct: 82, n: 50 }],
  spridMonthly: [{ manad: '2026-09', n: 40, sum: 20, sumsq: 500 }, { manad: '2026-10', n: 50, sum: 25, sumsq: 600 }],
});
const DIAG: DiagnosResp = { ok: true, maskin_id: 'M', profil: 'VIDA', golvDia: 75, fonster: { fran: '2026-07-23', till: '2026-10-21', dagar: 90 }, klasser: [klass('<150'), klass('300+')], plateauMonthly: [], markorer: [] };

const d = { diagnosData: DIAG, diagnosFel: null, bedomning: null, effektiv: 'M', laddaGrovlek: vi.fn(), laddaGrepp: vi.fn(), forsokIgen: vi.fn() } as any;
const vy = (tidMatt: string) => ({ tidMatt, setTidMatt: vi.fn(), lagetSteg: 'manad', setLagetSteg: vi.fn() }) as any;

let rot: Root | null = null, host: HTMLDivElement | null = null;
const montera = (tidMatt: string) => { host = document.createElement('div'); document.body.appendChild(host); rot = createRoot(host); act(() => rot!.render(createElement(OverTidFlik, { d, v: vy(tidMatt), ark: {} as any }))); return host; };
afterEach(() => { act(() => rot?.unmount()); host?.remove(); rot = null; host = null; });
const flikar = (h: HTMLElement) => Array.from(h.querySelectorAll('[role=tab]')).map(t => t.textContent);

describe('Över tid — tre flikar', () => {
  it('flikarna är Kurvor, Per grovlek och Greppet, och tidssteget står på alla tre', () => {
    for (const f of ['kurvor', 'grovlek', 'grepp']) {
      const h = montera(f);
      expect(flikar(h)).toEqual(['Kurvor', 'Per grovlek', 'Greppet', 'Månad', 'Kvartal', 'År']);
      act(() => rot?.unmount()); host?.remove();
    }
  });

  it('Kurvor: träffkurvan och spridningen på samma sida — ingen "Träffprocent nu, per grovlek"', () => {
    const h = montera('kurvor');
    const rubriker = Array.from(h.querySelectorAll('section[aria-label]')).map(s => s.getAttribute('aria-label'));
    expect(rubriker).toContain('Träffprocent per grovlek');
    expect(rubriker).toContain('Flaxar den?');
    expect(h.textContent).not.toContain('Träffprocent nu');
    expect(h.querySelectorAll('[data-stub=diagram]').length).toBe(2);
  });

  it('Per grovlek: rutnätet och under det frosten', () => {
    const h = montera('grovlek');
    const stubbar = Array.from(h.querySelectorAll('[data-stub]')).map(s => s.getAttribute('data-stub'));
    expect(stubbar).toEqual(['grovlek', 'frost']);
  });
});
