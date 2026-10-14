import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { FLYG_MAX_ZOOM, FLYG_MS, FLYG_PADDING, FLYG_PITCH, flygEasing, flygTillObjekt, objektStartKamera, traktGrans } from './objektFlyg';
import { meterPerPx, symbolTroskel, traktStorlekM } from './symbolZoom';

const LAT = 56.4;
const yta = (lat: number, lng: number, halvLatM: number, halvLngM: number, lager = 'L_TRAKTDEL') => {
  const dLat = halvLatM / 110540, dLng = halvLngM / (111320 * Math.cos((lat * Math.PI) / 180));
  return { properties: { _lager: lager }, geometry: { type: 'Polygon', coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]] } };
};

describe('traktGrans — bara traktgränsen, aldrig alla features', () => {
  it('omsluter L_TRAKTDEL-ytorna', () => {
    const g = traktGrans({ features: [yta(LAT, 14.7, 150, 215)] })!;
    expect(g[0][0]).toBeLessThan(14.7); expect(g[1][0]).toBeGreaterThan(14.7);
    expect(g[0][1]).toBeLessThan(LAT); expect(g[1][1]).toBeGreaterThan(LAT);
  });
  it('REGRESSIONEN (Bågskyttebanan): en stor/avlägsen fastighetsyta i leveransen styr inte gränsen', () => {
    const med = traktGrans({ features: [yta(LAT, 14.7, 150, 215), yta(LAT + 0.4, 14.3, 20000, 20000, 'L_FASTIGHET')] })!;
    const utan = traktGrans({ features: [yta(LAT, 14.7, 150, 215)] })!;
    expect(med).toEqual(utan);
  });
  it('flera traktdelar → en gräns runt alla; saknas traktgräns (eller geometri) → null', () => {
    const g = traktGrans({ features: [yta(LAT, 14.70, 100, 100), yta(LAT, 14.72, 100, 100)] })!;
    expect(g[1][0] - g[0][0]).toBeGreaterThan(0.02);
    expect(traktGrans({ features: [yta(LAT, 14.7, 100, 100, 'L_FASTIGHET')] })).toBeNull();
    expect(traktGrans({ features: [] })).toBeNull();
    expect(traktGrans(null)).toBeNull();
  });
});

describe('objektStartKamera — samma nivå som när objektet öppnas från början', () => {
  it('koordinat → zoom 16; kartbildens mitt → zoom 15; ingenting → null', () => {
    expect(objektStartKamera({ lat: 56.4, lng: 14.7 })).toEqual({ lat: 56.4, lng: 14.7, zoom: 16 });
    expect(objektStartKamera({ lat: 56.4, lng: 14.7, kartbild_bounds: [[56.0, 14.0], [56.2, 14.2]] })).toEqual({ lat: 56.1, lng: 14.1, zoom: 15 });
    expect(objektStartKamera({})).toBeNull();
    expect(objektStartKamera(null)).toBeNull();
  });
  it('sidans centrering är DENNA regel (inte en egen kopia)', () => {
    const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('=> objektStartKamera(obj);');
  });
});

describe('svepet', () => {
  it('mjukt och utan studs: ease-out som landar på 1 och aldrig går över; ca 1 s', () => {
    expect(FLYG_MS).toBe(1000);
    expect(flygEasing(0)).toBe(0);
    expect(flygEasing(1)).toBe(1);
    let forra = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) { const v = flygEasing(t); expect(v).toBeGreaterThanOrEqual(forra); expect(v).toBeLessThanOrEqual(1); forra = v; }
    expect(flygEasing(-1)).toBe(0);
    expect(flygEasing(2)).toBe(1);
  });

  it('med traktgräns: fitBounds runt gränsen, marginal, lutning som objektets vanliga öppningsvy', () => {
    const map = { fitBounds: vi.fn(), easeTo: vi.fn() };
    const gran: [[number, number], [number, number]] = [[14.7, 56.4], [14.71, 56.41]];
    expect(flygTillObjekt(map, { gran, start: { lat: 1, lng: 1, zoom: 16 } })).toBe('trakt');
    expect(map.easeTo).not.toHaveBeenCalled();
    const [g, opt] = map.fitBounds.mock.calls[0];
    expect(g).toEqual(gran);
    expect(opt).toMatchObject({ padding: FLYG_PADDING, duration: FLYG_MS, maxZoom: FLYG_MAX_ZOOM, pitch: FLYG_PITCH, bearing: 0, easing: flygEasing });
    expect(FLYG_PADDING.top).toBeGreaterThan(0); expect(FLYG_PADDING.left).toBeGreaterThan(0);
  });

  it('utan traktgräns: in på objektets koordinat på ÖPPNINGSNIVÅN (16, eller 15 för kartbild) — samma mjuka svep', () => {
    const map = { fitBounds: vi.fn(), easeTo: vi.fn() };
    expect(flygTillObjekt(map, { gran: null, start: objektStartKamera({ lat: 56.4, lng: 14.7 }) })).toBe('punkt');
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.easeTo.mock.calls[0][0]).toMatchObject({ center: [14.7, 56.4], zoom: 16, pitch: FLYG_PITCH, duration: FLYG_MS, easing: flygEasing });
  });

  it('varken gräns eller koordinat: kameran rörs inte; en karta som inte är redo ger inget fel', () => {
    const map = { fitBounds: vi.fn(), easeTo: vi.fn() };
    expect(flygTillObjekt(map, { gran: null, start: null })).toBeNull();
    expect(map.fitBounds).not.toHaveBeenCalled(); expect(map.easeTo).not.toHaveBeenCalled();
    expect(flygTillObjekt({ fitBounds: () => { throw new Error('inte redo'); } }, { gran: [[0, 0], [1, 1]], start: null })).toBeNull();
  });
});

describe('markeringarna ska synas när svepet är klart (inte vara kvar dolda av zoomtröskeln)', () => {
  // Svepets slutzoom (platt fitBounds med FLYG_PADDING) mot symbolklippets tröskel för samma trakt och skärm.
  const fitZoom = (traktM: number, bredd: number, hojd: number) => {
    const tillgangligB = bredd - FLYG_PADDING.left - FLYG_PADDING.right, tillgangligH = hojd - FLYG_PADDING.top - FLYG_PADDING.bottom;
    // värsta fallet: trakten är lika lång åt båda håll, så den snävare dimensionen avgör
    const px = Math.min(tillgangligB, tillgangligH);
    return Math.min(FLYG_MAX_ZOOM, Math.log2((meterPerPx(0, LAT) * px) / traktM));
  };
  it('för tiny till jättetrakter, på telefon och dator, ligger slutzoomen över tröskeln', () => {
    for (const traktM of [60, 120, 284, 430, 684, 1500, 2961, 8000]) {
      for (const [b, h] of [[390, 800], [820, 1180], [1280, 800]]) {
        expect(fitZoom(traktM, b, h)).toBeGreaterThan(symbolTroskel({ traktM, lat: LAT, kortsidaPx: Math.min(b, h) }));
      }
    }
  });
  it('tröskeln räknas ur SAMMA gräns som svepet fyller (L_TRAKTDEL)', () => {
    const fc = { features: [yta(LAT, 14.7, 150, 215), yta(LAT, 14.7, 20000, 20000, 'L_FASTIGHET')] };
    expect(traktStorlekM(fc)).toBeGreaterThan(400); expect(traktStorlekM(fc)).toBeLessThan(450);
    expect(traktGrans(fc)![1][0] - traktGrans(fc)![0][0]).toBeLessThan(0.01);
  });
});
