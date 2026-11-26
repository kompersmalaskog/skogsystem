// @vitest-environment jsdom
// Hooken sidan använder för körvyns grundzoom: rätt värde DIREKT när maskinen blir känd, ref som följer senaste värdet, spara gäller även efter omstart.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useKorvyGrundzoom } from './useKorvyGrundzoom';
import { KORVY_BASE_ZOOM, sparaGrundzoom } from '../korvyZoom';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Ut = ReturnType<typeof useKorvyGrundzoom>;
let roots: Root[] = [];

function montera(maskin: string | null) {
  const el = document.createElement('div');
  const root = createRoot(el); roots.push(root);
  const h = { ut: null as unknown as Ut, renderingar: [] as number[], maskin };
  function Harness({ maskin }: { maskin: string | null }) {
    const u = useKorvyGrundzoom(maskin);
    h.ut = u; h.renderingar.push(u.grundzoom);
    return null;
  }
  const rita = () => act(() => { root.render(<Harness maskin={h.maskin} />); });
  rita();
  return { h, byt: (m: string | null) => { h.maskin = m; rita(); } };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { for (const r of roots) act(() => r.unmount()); roots = []; });

describe('useKorvyGrundzoom', () => {
  it('utan sparad zoom: standard (17,5)', () => {
    const { h } = montera('R64428');
    expect(h.ut.grundzoom).toBe(KORVY_BASE_ZOOM);
    expect(h.ut.grundzoomRef.current).toBe(KORVY_BASE_ZOOM);
  });

  it('spara → värdet och refen uppdateras direkt, och en ny instans (omstart / nästa dag) får samma', () => {
    const { h } = montera('R64428');
    let sparat: number | null = null;
    act(() => { sparat = h.ut.spara(16.4); });
    expect(sparat).toBe(16.4);
    expect(h.ut.grundzoom).toBe(16.4);
    expect(h.ut.grundzoomRef.current).toBe(16.4);
    expect(montera('R64428').h.ut.grundzoom).toBe(16.4);
  });

  it('refen är redan uppdaterad INNAN omritningen (kamerans timers läser den)', () => {
    const { h } = montera('R64428');
    const ref = h.ut.grundzoomRef;
    act(() => { h.ut.spara(16.9); });
    expect(ref.current).toBe(16.9);
  });

  it('refen har det nya värdet DIREKT efter spara, i samma händelse och före omritningen (sidans Spara läser den innan React hunnit rita om)', () => {
    const { h } = montera('R64428');
    let direkt: number | null = null;
    act(() => { h.ut.spara(16.9); direkt = h.ut.grundzoomRef.current; });   // ingen omritning har skett ännu när `direkt` läses
    expect(direkt).toBe(16.9);
  });

  it('maskinen blir känd först efter första renderingen: rätt zoom i första renderingen efter bytet (ingen mellanrendering med standard)', () => {
    sparaGrundzoom('R64428', 16.2);
    const { h, byt } = montera(null);
    expect(h.ut.grundzoom).toBe(KORVY_BASE_ZOOM);
    h.renderingar.length = 0;
    byt('R64428');
    expect(h.renderingar.length).toBeGreaterThan(0);
    for (const z of h.renderingar) expect(z).toBe(16.2);
    expect(h.ut.grundzoomRef.current).toBe(16.2);
  });

  it('en annan maskin ser sin egen zoom, aldrig den förras', () => {
    const { h, byt } = montera('R64428');
    act(() => { h.ut.spara(16.4); });
    byt('PONS20SDJAA270231');
    expect(h.ut.grundzoom).toBe(KORVY_BASE_ZOOM);
    byt('R64428');
    expect(h.ut.grundzoom).toBe(16.4);
  });

  it('en zoom som inte går att spara (icke-tal) ändrar ingenting', () => {
    const { h } = montera('R64428');
    let sparat: number | null = 1;
    act(() => { sparat = h.ut.spara(NaN); });
    expect(sparat).toBeNull();
    expect(h.ut.grundzoom).toBe(KORVY_BASE_ZOOM);
    expect(localStorage.length).toBe(0);
  });
});
