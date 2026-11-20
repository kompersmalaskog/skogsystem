// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VaderKortHytt from '@/components/planering/VaderKortHytt';
import { useVaderHytt } from './useVaderHytt';
import { vaderLage } from '@/lib/kalibrering/vaderOmslag';
import { VADER_SETT_NYCKEL } from '@/lib/kalibrering/vaderHytt';

const TIM = 3_600_000;
const nu = Date.parse('2026-11-18T06:30:00Z');
const slut = Date.parse('2026-11-17T15:00:00Z');
const obs = Array.from({ length: 30 }, (_, i) => { const ms = nu - (29 - i) * TIM; return { ms, temp: ms < nu - 8 * TIM ? 3 : -6 }; });
const svar = { ok: true, lage: vaderLage({ obs, slutMs: slut, nuMs: nu }), station: 'Växjö A', slutMs: slut, kontrollMs: null, kontrollIdag: null, startMs: nu - 30 * 60_000 };

function Sida({ aktiv = true, torr = false }: { aktiv?: boolean; torr?: boolean }) {
  const v = useVaderHytt({ aktiv, maskinId: 'PONS', torr });
  return v.kort ? <VaderKortHytt kort={v.kort} top="0px" onSett={v.sett} /> : <div data-testid="inget" />;
}

let root: Root | null = null;
let ruta: HTMLDivElement;
const render = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); root = createRoot(ruta); act(() => { root!.render(el); }); };
const cleanup = () => { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ''; };
const hitta = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const screen = { getByTestId: (id: string) => { const e = hitta(id); if (!e) throw new Error(`saknas: ${id}`); return e; }, queryByTestId: hitta };
const fireEvent = { click: (e: HTMLElement) => act(() => { e.click(); }) };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('vädret i hytten — kortet', () => {
  let anrop: string[];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(nu);
    localStorage.clear();
    anrop = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { anrop.push(String(url)); return { ok: true, json: async () => svar } as Response; }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('visar kortet med texten och försvinner på Sett, som sparas för dagen', async () => {
    render(<Sida />);
    await act(async () => {});
    expect(anrop[0]).toBe('/api/kalibrering/vader?maskin_id=PONS');
    expect(screen.getByTestId('vader-kort-rubrik').textContent).toBe('Vädret har slagit om');
    expect(screen.getByTestId('vader-kort-text').textContent).toContain('nu −6 °C – virket har frusit');
    fireEvent.click(screen.getByTestId('vader-kort-sett'));
    expect(screen.queryByTestId('vader-kort')).toBeNull();
    expect(JSON.parse(localStorage.getItem(VADER_SETT_NYCKEL)!)).toEqual({ PONS: '2026-11-18' });
    cleanup();
    render(<Sida />);
    await act(async () => {});
    expect(screen.queryByTestId('vader-kort')).toBeNull();
  });
  it('testläget sparar inget på enheten', async () => {
    render(<Sida torr />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('vader-kort-sett'));
    expect(localStorage.getItem(VADER_SETT_NYCKEL)).toBeNull();
  });
  it('inte aktiv (skotare, planeringen) → ingen läsning, inget kort', async () => {
    render(<Sida aktiv={false} />);
    await act(async () => {});
    expect(anrop).toHaveLength(0);
    expect(screen.getByTestId('inget')).toBeTruthy();
  });
  it('kortet försvinner när morgonfönstret tagit slut', async () => {
    render(<Sida />);
    await act(async () => {});
    expect(screen.getByTestId('vader-kort')).toBeTruthy();
    await act(async () => { vi.setSystemTime(nu + 2 * TIM); vi.advanceTimersByTime(60_000); });
    expect(screen.queryByTestId('vader-kort')).toBeNull();
  });
});
