// @vitest-environment jsdom
// Vidas linjer: bara admin får dölja/ta tillbaka. Icke-admin: ingenting ändras, inget skrivs (varken till servern eller enhetens kopia) och det sägs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DOLT_EJ_SPARAT, VIDA_BARA_PLANERARE, useLinjeRedigering } from './useLinjeRedigering';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const GEO = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { _typ: 'linje', _nyckel: 'linje:a', FLBESKR: 'Basväg' }, geometry: { type: 'LineString', coordinates: [[15, 56], [15.002, 56]] } }] };

function fakeDb(skrivFel = false) {
  const anrop: string[] = [];
  const db = {
    from: (_t: string) => ({
      select: () => ({ eq: async () => ({ data: [{ nyckel: 'linje:a', intervall: [[10, 30]] }], error: null }) }),
      upsert: async () => { anrop.push('upsert'); return { error: skrivFel ? { code: '42501' } : null }; },
      delete: () => ({ eq: () => ({ eq: async () => { anrop.push('delete'); return { error: skrivFel ? { code: '42501' } : null }; } }) }),
    }),
  };
  return { db, anrop };
}

async function kor(arAdmin: boolean, skrivFel = false) {
  const { db, anrop } = fakeDb(skrivFel);
  let ut: ReturnType<typeof useLinjeRedigering>;
  const markersRef = { current: [] as any[] };
  function Test() {
    ut = useLinjeRedigering({
      map: null, klar: false, markers: [], markersRef, setMarkers: () => {}, deleteMarker: () => {},
      svgToLatLon: () => ({ lat: 0, lon: 0 }), latLonToSvg: () => ({ x: 0, y: 0 }), visibleLines: {}, traktGeo: GEO,
      objektId: 'o1', arAdmin, db, mergeChecked: { current: new Set() },
    });
    return null;
  }
  const ruta = document.createElement('div');
  const rot = createRoot(ruta);
  await act(async () => { rot.render(<Test />); });
  await act(async () => { await Promise.resolve(); });
  return { get: () => ut!, anrop, stang: () => act(() => rot.unmount()) };
}

describe('Redigera linjer — Vidas linjer är bara för planeraren', () => {
  beforeEach(() => { (globalThis as any).localStorage = (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; })(); });

  it('icke-admin: "Visa Vidas original" ändrar inget, skriver inget och säger varför', async () => {
    const k = await kor(false);
    expect(k.get().dolt['linje:a']).toEqual([[10, 30]]);
    await act(async () => { k.get().visaVidaOriginal('linje:a'); });
    expect(k.get().dolt['linje:a']).toEqual([[10, 30]]);
    expect(k.get().meddelande).toBe(VIDA_BARA_PLANERARE);
    expect(k.anrop).toEqual([]);
    expect(k.get().kanAngra).toBe(false);
    expect(localStorage.getItem('linje_dolt_v1:o1')).toBe(JSON.stringify({ 'linje:a': [[10, 30]] }));   // enhetens kopia är serverns, inte ett eget val
    k.stang();
  });
  it('admin: ändringen går till servern och gäller', async () => {
    const k = await kor(true);
    await act(async () => { k.get().visaVidaOriginal('linje:a'); });
    expect(k.get().dolt['linje:a']).toBeUndefined();
    expect(k.anrop).toEqual(['delete']);
    expect(k.get().meddelande).toBeNull();
    k.stang();
  });
  it('admin: faller servern tas ändringen tillbaka och det sägs — aldrig bara på enheten', async () => {
    const k = await kor(true, true);
    await act(async () => { k.get().visaVidaOriginal('linje:a'); });
    await act(async () => { await Promise.resolve(); });
    expect(k.get().dolt['linje:a']).toEqual([[10, 30]]);
    expect(k.get().meddelande).toBe(DOLT_EJ_SPARAT);
    expect(k.get().kanAngra).toBe(false);
    expect(localStorage.getItem('linje_dolt_v1:o1')).toBe(JSON.stringify({ 'linje:a': [[10, 30]] }));
    k.stang();
  });
});
