// @vitest-environment jsdom
// Förslaget vägsymboler → vägfärg (Martin 2026-10-28): komponenten nertill, hela vägen från Skälvikens riktiga markeringar till vad Godkänn tar bort.
import React, { act } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { VagFargForslag } from './VagFargForslag';
import fixtur from '@/lib/__fixtures__/skalviken_vagsymboler_2026-10-28.json';
import { foreslaVagFarg, tillampaVagForslag, type VagForslag, type VagMarkering } from '@/lib/vagSymbolFarg';
import type { LatLon } from '@/lib/larm/geo';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let behallare: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tryck = (id: string) => act(() => { q(id)!.click(); });
function montera(el: React.ReactElement) { behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare); act(() => { rot!.render(el); }); }

const { lat, lng, zoom } = fixtur.kamera;
const scale = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
const tillLL = (x: number, y: number): LatLon => ({ lat: lat + (-y * scale) / 111320, lon: lng + (x * scale) / (111320 * Math.cos((lat * Math.PI) / 180)) });
const markers = fixtur.markers as VagMarkering[];
const skalviken: VagForslag = foreslaVagFarg(markers, tillLL);

describe('VagFargForslag', () => {
  it('Skälviken: frågan, EN rad om det som inte rörs, Godkänn och Inte nu', () => {
    montera(<VagFargForslag forslag={skalviken} smal onGodkann={vi.fn()} onInteNu={vi.fn()} />);
    const list = q('vagfarg-forslag-list')!;
    expect(list.textContent).toContain('Ge 2 vägar färg från symbolerna?');
    expect(q('vagfarg-forslag-orort')!.textContent).toBe('Rörs inte: 1 väg med två färger.');
    expect(q('vagfarg-forslag-ja')!.textContent).toBe('Godkänn');
    expect(q('vagfarg-forslag-nej')!.textContent).toBe('Inte nu');
  });

  it('allt rörs: ingen rad om det som inte rörs', () => {
    const f: VagForslag = { vagar: [{ vagId: '1', farg: 'red', andras: true, symbolIdn: ['9'] }], symbolIdn: ['9'], orort: { utanVag: 0, krock: 0, annanFarg: 0, utanFarg: 0 } };
    montera(<VagFargForslag forslag={f} smal={false} onGodkann={vi.fn()} onInteNu={vi.fn()} />);
    expect(q('vagfarg-forslag-list')!.textContent).toContain('Ge vägen färg från symbolen?');
    expect(q('vagfarg-forslag-orort')).toBeNull();
  });

  it('Godkänn och Inte nu anropar var sin sak — och inget annat', () => {
    const onGodkann = vi.fn(), onInteNu = vi.fn();
    montera(<VagFargForslag forslag={skalviken} smal onGodkann={onGodkann} onInteNu={onInteNu} />);
    tryck('vagfarg-forslag-nej');
    expect(onInteNu).toHaveBeenCalledTimes(1);
    expect(onGodkann).not.toHaveBeenCalled();
    tryck('vagfarg-forslag-ja');
    expect(onGodkann).toHaveBeenCalledTimes(1);
  });

  it('Godkänn på Skälviken: basväg 5 blir röd, basväg 10 gul, exakt två symboler tas bort; basväg 3 och dess två symboler rörs inte', () => {
    const { andrade, bortIdn } = tillampaVagForslag(markers, skalviken);
    expect(andrade.map((m) => [m.nummer, m.farg])).toEqual([[5, 'red'], [10, 'yellow']]);
    expect(bortIdn).toEqual(['1791970014284', '1791975268869']);
    // basväg 3 (en röd och en gul symbol bredvid) och dess symboler finns kvar orörda
    expect(andrade.find((m) => m.nummer === 3)).toBeUndefined();
    expect(bortIdn).not.toContain('1791969005770');
    expect(bortIdn).not.toContain('1791969024123');
    // vägarna har kvar allt annat (path, nummer)
    const fore = markers.find((m) => m.nummer === 5)!;
    const efter = andrade.find((m) => m.nummer === 5)!;
    expect({ ...efter, farg: undefined }).toEqual({ ...fore, farg: undefined });
  });
});
