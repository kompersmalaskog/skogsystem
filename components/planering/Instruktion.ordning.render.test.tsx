// @vitest-environment jsdom
// KOMBINATIONEN: ett kort åt gången vid avlägget. Ordning: lossningskortet > larm > instruktion > avläggsraden (målbilden).
// Riktiga komponenter och SAMMA ordningsfunktioner som sidan (lib/instruktioner/ordning): hooken useInstruktioner, InstruktionKortVy och AvlaggForstaLasset.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstruktioner } from '@/lib/hooks/useInstruktioner';
import { avlaggsradLedig, instruktionBlockerad } from '@/lib/instruktioner/ordning';
import { nollstallSett } from '@/lib/instruktioner/sett';
import { InstruktionKortVy } from './InstruktionKort';
import { AvlaggForstaLasset } from '@/components/malbild/AvlaggForstaLasset';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const VIDA = { features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [15.0, 57.0] }, properties: { _lager: 'L_TILLAGGSPUNKTER', _typ: 'punkt', EXTRA_LABE: '01-1', FLBESKR: 'Virkesavlägg', ATGARD: 'skbv s skärsjön' } }] };
// Vidas ATGARD på ett avlägg är ett namn och ger aldrig kort — instruktionen är en egen kommentar på avlägget.
const KOMMENTAR = { id: 'k1', objekt_id: 'o1', yta_nyckel: 'punkt:01-1', text: 'Lägg max 3 högar\nGå vägslingan', skapad_av: 'm1', namn: 'Martin', skapad_at: '2026-10-20T10:00:00Z', andrad_at: '2026-10-20T10:00:00Z', vantar: false };
const AVL = [{ id: 'vida:01-1', nummer: '01-1', kalla: 'vida' as const, lat: 57.0, lng: 15.0 }];
const m = (meter: number) => ({ lat: 57.0 + meter / 111_320, lon: 15.0 });
const db: any = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }), upsert: async () => ({ error: null }) }) };

interface P { pos: { lat: number; lon: number }; larm: boolean; lossning: boolean }
function Harness({ pos, larm, lossning }: P) {
  const inst = useInstruktioner({
    aktiv: true, pos, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol', vida: VIDA, kommentarer: [KOMMENTAR], objektId: 'o1', forare: { id: 'f1' }, db,
    blockerad: instruktionBlockerad({ larmVisas: larm, lossningVisas: lossning }),
  });
  return (
    <>
      {larm && <div data-testid="larm-kort" />}
      {lossning && <div data-testid="lossningskort" />}
      {inst.kort && <InstruktionKortVy kort={inst.kort} top="10px" onSett={inst.settKort} />}
      <AvlaggForstaLasset
        objektId="o1" kortVisas={lossning} forstaLasset position={pos} avlagg={AVL}
        ledigt={avlaggsradLedig({ ledigtUtanInstruktion: !lossning, instruktionVantar: inst.vantar })}
      />
    </>
  );
}

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const visa = async (p: P) => {
  await act(async () => { rot!.render(<Harness {...p} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { vi.advanceTimersByTime(2100); });   // avläggsradens zonräkning går på ett 2-sekundersintervall
};
const kort = () => q('instruktion-kort') != null;
const rad = () => q('avlagg-forsta-lasset') != null;
const ensam = () => [kort(), rad(), q('lossningskort') != null, q('larm-kort') != null].filter(Boolean).length;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
  nollstallSett(); localStorage.clear();
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
});
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; vi.useRealTimers(); });

describe('ett kort åt gången vid avlägget', () => {
  it('45 m bort (inne i avläggsradens zon, utanför instruktionens): bara avläggsraden', async () => {
    await visa({ pos: m(45), larm: false, lossning: false });
    expect(kort()).toBe(false);
    expect(rad()).toBe(true);
  });

  it('inne vid avlägget: instruktionen visas och avläggsraden väntar — aldrig båda', async () => {
    await visa({ pos: m(45), larm: false, lossning: false });
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
    expect(rad()).toBe(false);
    expect(ensam()).toBe(1);
  });

  it('Sett på instruktionen släpper fram avläggsraden', async () => {
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
    await act(async () => { q('instruktion-sett')!.click(); });
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(kort()).toBe(false);
    expect(rad()).toBe(true);
  });

  it('lossningskortet vinner: instruktionen döljs, avläggsraden också, och instruktionen kommer tillbaka när lossningen är klar', async () => {
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
    await visa({ pos: m(10), larm: false, lossning: true });
    expect(q('lossningskort')).not.toBeNull();
    expect(kort()).toBe(false);
    expect(rad()).toBe(false);
    expect(ensam()).toBe(1);
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
    expect(rad()).toBe(false);
  });

  it('instruktionen väntar tills lossningskortet är borta även om den aldrig hunnit visas', async () => {
    await visa({ pos: m(10), larm: false, lossning: true });
    expect(kort()).toBe(false);
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
  });

  it('larm går före instruktionen: kortet väntar, avläggsraden väntar bakom instruktionen, och instruktionen kommer när larmet är borta', async () => {
    await visa({ pos: m(10), larm: true, lossning: false });
    expect(q('larm-kort')).not.toBeNull();
    expect(kort()).toBe(false);
    expect(rad()).toBe(false);
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
    expect(rad()).toBe(false);
  });

  it('larm och lossning samtidigt: instruktionen väntar på båda', async () => {
    await visa({ pos: m(10), larm: true, lossning: true });
    expect(kort()).toBe(false);
    await visa({ pos: m(10), larm: false, lossning: true });
    expect(kort()).toBe(false);
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
  });

  it('full kedja: larm → instruktion → Sett → avläggsrad, alltid högst ett av instruktionen/avläggsraden', async () => {
    const steg: P[] = [
      { pos: m(45), larm: false, lossning: false },
      { pos: m(10), larm: true, lossning: false },
      { pos: m(10), larm: false, lossning: false },
    ];
    for (const p of steg) {
      await visa(p);
      expect(Number(kort()) + Number(rad())).toBeLessThanOrEqual(1);
    }
    expect(kort()).toBe(true);
    await act(async () => { q('instruktion-sett')!.click(); });
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(kort()).toBe(false);
    expect(rad()).toBe(true);
  });

  it('har lossningskortet visats på trakten är målbilden förbrukad (#871): efter Sett kommer instruktionen men inte avläggsraden', async () => {
    await visa({ pos: m(10), larm: false, lossning: true });
    await visa({ pos: m(10), larm: false, lossning: false });
    expect(kort()).toBe(true);
    await act(async () => { q('instruktion-sett')!.click(); });
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(kort()).toBe(false);
    expect(rad()).toBe(false);
  });
});
