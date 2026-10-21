// @vitest-environment jsdom
// useFallning: bara skördaren. Skotarläget (aktiv = false) och en saknad position ger alltid neutral cirkel, oavsett vad som ligger nära.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach } from 'vitest';
import { useFallning, type UseFallningIn } from './useFallning';
import { NEUTRAL, type FallningUtfall } from '../larm/fallning';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const POS = { lat: 56.2276, lon: 14.686 };
const svgToLatLon = (x: number, y: number) => ({ lat: y, lon: x });
const markers = [{ id: 'k1', isMarker: true, type: 'powerline', x: POS.lon, y: POS.lat + 10 / 111320 }];

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

function kor(inp: Partial<UseFallningIn>): FallningUtfall {
  let ut: FallningUtfall = NEUTRAL;
  function Probe() { ut = useFallning({ aktiv: true, pos: POS, markers, svgToLatLon, vida: null, ...inp }); return null; }
  ruta = document.createElement('div'); document.body.appendChild(ruta);
  rot = createRoot(ruta);
  act(() => { rot!.render(<Probe />); });
  return ut;
}

describe('useFallning', () => {
  it('skördaren med El-ledning 10 m bort: Röd', () => {
    const u = kor({});
    expect(u.grupp).toBe('fara');
  });
  it('skotarläget (aktiv = false): alltid neutral, även med El-ledning 10 m bort', () => {
    expect(kor({ aktiv: false })).toBe(NEUTRAL);
  });
  it('ingen position: neutral', () => {
    expect(kor({ pos: null })).toBe(NEUTRAL);
  });
});
