// @vitest-environment jsdom
// Väder för skotarläget: hämtas för TRAKTENS position, och i testläget (/maskin?som=) visas morgonkortet aldrig av sig självt och förbrukar aldrig dagens kort —
// det provkörs med knappen i testbannern (provkorKort).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('@/lib/serverKlocka', () => ({ serverNu: () => Date.parse('2026-10-19T06:00:00Z') }));
vi.mock('@/lib/smhi-brandrisk', () => ({ fetchSmhiFwi: async () => ({ peakIdx: 4 }) }));

import { useSkotarVader, type SkotarVader } from './useSkotarVader';
import { MORGONKORT_NYCKEL } from '@/lib/skotarLass/vader';

/** SNOW1gv1-svar: `time`, platt `data`, nederbörd som mängd över intervallet som slutar vid `time`. */
const serie = () => {
  const timeSeries: any[] = [];
  let forra: string | null = null;
  for (const d of ['19', '20', '21', '22']) for (const h of ['06', '10', '16']) {
    const time = `2026-10-${d}T${h}:00:00Z`;
    timeSeries.push({ time, ...(forra ? { intervalParametersStartTime: forra } : {}), data: { air_temperature: 8, symbol_code: 3, precipitation_amount_mean: 0, wind_speed: 9999 } });
    forra = time;
  }
  return { createdTime: '2026-10-19T05:00:00Z', referenceTime: '2026-10-19T05:00:00Z', timeSeries };
};

let root: Root; let div: HTMLDivElement; let vy: SkotarVader; let urls: string[];
function Prov({ aktiv, pos, test }: { aktiv: boolean; pos: { lat: number; lon: number } | null; test: boolean }) { vy = useSkotarVader(aktiv, pos, test); return null; }
const visa = async (p: { aktiv?: boolean; pos?: { lat: number; lon: number } | null; test?: boolean }) => {
  await act(async () => { root.render(<Prov aktiv={p.aktiv ?? true} pos={p.pos === undefined ? { lat: 56.6, lon: 15.8 } : p.pos} test={p.test ?? false} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); urls = [];
  vi.stubGlobal('fetch', async (u: string) => { urls.push(String(u)); return { ok: true, json: async () => serie() } as any; });
  div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div);
});
afterEach(() => { act(() => root.unmount()); div.remove(); vi.unstubAllGlobals(); });

describe('useSkotarVader', () => {
  it('hämtar för positionen den får (traktens) och ger tre dagar', async () => {
    await visa({ pos: { lat: 57.1234, lon: 14.5678 } });
    expect(urls[0]).toContain('/category/snow1g/version/1/');
    expect(urls[0]).toContain('lon/14.5678/lat/57.1234');
    expect(urls.some((u) => u.includes('pmp3g'))).toBe(false);
    expect(vy.dagar).toHaveLength(3);
    expect(vy.dagar[0].symbol).toBe(3);
  });
  it('vanligt läge: riktigt morgonkort (brandrisk 4) visas och räknas som visat idag', async () => {
    await visa({});
    expect(vy.kort?.rader).toEqual(['Brandrisk 4 idag']);
    expect(localStorage.getItem(MORGONKORT_NYCKEL)).toBe('2026-10-19');
  });
  it('testläge: dagarna hämtas men inget kort visas av sig självt och inget förbrukas', async () => {
    await visa({ test: true });
    expect(vy.dagar).toHaveLength(3);
    expect(vy.kort).toBeNull();
    expect(localStorage.getItem(MORGONKORT_NYCKEL)).toBeNull();
  });
  it('testläge: provkorKort visar kortet med riktiga värden — och förbrukar fortfarande inget', async () => {
    await visa({ test: true });
    await act(async () => { vy.provkorKort(); });
    expect(vy.kort?.rader).toEqual(['Brandrisk 4 idag']);
    expect(localStorage.getItem(MORGONKORT_NYCKEL)).toBeNull();
    await act(async () => { vy.stangKort(); });
    expect(vy.kort).toBeNull();
  });
  it('utanför testläget gör provkorKort ingenting (förarna kan aldrig provköra)', async () => {
    await visa({});
    await act(async () => { vy.stangKort(); vy.provkorKort(); });
    expect(vy.kort).toBeNull();
  });
  it('ingen position → ingen hämtning, inga dagar', async () => {
    await visa({ pos: null });
    expect(urls).toHaveLength(0);
    expect(vy.dagar).toEqual([]);
  });
});
