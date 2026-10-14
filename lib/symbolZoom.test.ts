import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SYMBOL_GOLV_ZOOM, SYMBOL_LAGER, SYMBOL_TAK_ZOOM, SYMBOL_TYPISK_TRAKT_M, SYMBOL_UNDANTAG, meterPerPx, symbolTroskel, tillampaSymbolZoom, traktStorlekM,
} from './symbolZoom';

const LAT = 56.4;
const kvadrat = (lat: number, lng: number, halvM: number, lager = 'L_TRAKTDEL') => {
  const dLat = halvM / 110540, dLng = halvM / (111320 * Math.cos((lat * Math.PI) / 180));
  return { properties: { _lager: lager }, geometry: { type: 'Polygon', coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]] } };
};

describe('traktStorlekM', () => {
  it('längsta sidan av traktgränsen (L_TRAKTDEL) i meter', () => {
    const m = traktStorlekM({ features: [kvadrat(LAT, 14.7, 200)] })!;
    expect(m).toBeGreaterThan(395); expect(m).toBeLessThan(405);
  });
  it('andra lager (fastighet, bestånd) räknas inte — bara traktgränsen', () => {
    const m = traktStorlekM({ features: [kvadrat(LAT, 14.7, 200), kvadrat(LAT, 14.7, 3000, 'L_FASTIGHET')] })!;
    expect(m).toBeLessThan(410);
  });
  it('ingen traktgräns / tomt → null (då gäller en typisk trakt)', () => {
    expect(traktStorlekM(null)).toBeNull();
    expect(traktStorlekM({ features: [] })).toBeNull();
    expect(traktStorlekM({ features: [kvadrat(LAT, 14.7, 200, 'L_FASTIGHET')] })).toBeNull();
  });
});

describe('symbolTroskel — symbolerna syns när HELA trakten fyller ungefär halva skärmen', () => {
  it('en typisk trakt (430 m): telefon 390 px → z 14,3; dator 800 px → z 15,3', () => {
    expect(SYMBOL_TYPISK_TRAKT_M).toBe(430);
    expect(symbolTroskel({ traktM: null, lat: LAT, kortsidaPx: 390 })).toBeCloseTo(14.26, 1);
    expect(symbolTroskel({ traktM: null, lat: LAT, kortsidaPx: 800 })).toBeCloseTo(15.26, 1);
  });

  it('DEFINITIONEN håller: vid tröskeln är trakten hälften av kortsidan i pixlar (meter/pixel ur MapLibres 512-px-värld)', () => {
    for (const [traktM, kort] of [[430, 390], [430, 800], [700, 390], [2961, 800]] as const) {
      const z = symbolTroskel({ traktM, lat: LAT, kortsidaPx: kort });
      if (z > SYMBOL_GOLV_ZOOM && z < SYMBOL_TAK_ZOOM) expect(traktM / meterPerPx(z, LAT)).toBeCloseTo(kort / 2, 0);
    }
  });

  it('större trakt → tröskeln lägre (symbolerna syns tidigare); mindre → högre', () => {
    const z = (m: number) => symbolTroskel({ traktM: m, lat: LAT, kortsidaPx: 390 });
    expect(z(2961)).toBeLessThan(z(684));
    expect(z(684)).toBeLessThan(z(284));
  });

  it('TAKET: aldrig över 15,5 — objektets öppningsvy (högst zoom 16) visar alltid symbolerna, även för en liten trakt', () => {
    expect(symbolTroskel({ traktM: 60, lat: LAT, kortsidaPx: 800 })).toBe(SYMBOL_TAK_ZOOM);
    expect(SYMBOL_TAK_ZOOM).toBeLessThan(16);
  });

  it('en realistisk trakt visas direkt i sin öppningsvy: fitBounds (padding 60) ligger över tröskeln på både telefon och dator', () => {
    for (const traktM of [284, 324, 407, 459, 533, 684]) {
      for (const [bredd, hojd] of [[390, 800], [1280, 800]]) {
        const fyller = Math.min(bredd, hojd) - 120;                                  // fitBounds fyller kortsidan minus padding
        const zFit = Math.min(16, Math.log2((meterPerPx(0, LAT) * fyller) / traktM));
        expect(zFit).toBeGreaterThanOrEqual(symbolTroskel({ traktM, lat: LAT, kortsidaPx: Math.min(bredd, hojd) }));
      }
    }
  });

  it('GOLVET: en jättetrakt klipper inte på en nivå där inget är läsbart ändå', () => {
    expect(symbolTroskel({ traktM: 20000, lat: LAT, kortsidaPx: 390 })).toBe(SYMBOL_GOLV_ZOOM);
  });
});

function fakeKarta(lager: Record<string, { minzoom?: number; maxzoom?: number }>) {
  const l: Record<string, any> = {};
  for (const [id, z] of Object.entries(lager)) l[id] = { id, minzoom: z.minzoom ?? 0, maxzoom: z.maxzoom ?? 24 };
  const k: any = {
    l, anrop: [] as any[],
    getLayer: (id: string) => l[id],
    setLayerZoomRange: vi.fn((id: string, min: number, max: number) => { l[id].minzoom = min; l[id].maxzoom = max; k.anrop.push([id, min, max]); }),
  };
  return k;
}

describe('tillampaSymbolZoom', () => {
  it('klipper bara symbollagren under tröskeln — inga linjer, ytor eller andra lager', () => {
    const k = fakeKarta({ 'markers-layer': {}, 'trakt-punkt-circle': {}, 'trakt-punkt-label': {}, 'trakt-gr-line': {}, 'zone-fill': {}, 'figur-etikett': {}, 'maskin-symbol': {} });
    const n = tillampaSymbolZoom(k, 14.5);
    expect(n).toBe(3);
    expect(k.l['markers-layer'].minzoom).toBe(14.5);
    expect(k.l['trakt-punkt-circle'].minzoom).toBe(14.5);
    expect(k.l['trakt-punkt-label'].minzoom).toBe(14.5);
    for (const id of ['trakt-gr-line', 'zone-fill', 'figur-etikett', 'maskin-symbol']) expect(k.l[id].minzoom).toBe(0);
  });

  it('återställer lagrens egna zoomintervall exakt (inte 0–24)', () => {
    const k = fakeKarta({ 'markers-layer': { minzoom: 9, maxzoom: 20 }, 'arrows-layer': {} });
    tillampaSymbolZoom(k, 14.5);
    expect(k.l['markers-layer']).toMatchObject({ minzoom: 14.5, maxzoom: 20 });
    tillampaSymbolZoom(k, null);
    expect(k.l['markers-layer']).toMatchObject({ minzoom: 9, maxzoom: 20 });
    expect(k.l['arrows-layer']).toMatchObject({ minzoom: 0, maxzoom: 24 });
  });

  it('ett lager som redan har högre minzoom än tröskeln behåller det', () => {
    const k = fakeKarta({ 'markers-layer': { minzoom: 16 } });
    tillampaSymbolZoom(k, 14.5);
    expect(k.l['markers-layer'].minzoom).toBe(16);
  });

  it('idempotent: samma tröskel igen sätter inget; ny tröskel (ny trakt/storlek) flyttar gränsen utan att tappa originalet', () => {
    const k = fakeKarta({ 'markers-layer': { minzoom: 9 } });
    tillampaSymbolZoom(k, 14.5);
    k.setLayerZoomRange.mockClear();
    expect(tillampaSymbolZoom(k, 14.5)).toBe(0);
    expect(k.setLayerZoomRange).not.toHaveBeenCalled();
    tillampaSymbolZoom(k, 12);
    expect(k.l['markers-layer'].minzoom).toBe(12);
    tillampaSymbolZoom(k, null);
    expect(k.l['markers-layer'].minzoom).toBe(9);
  });

  it('lager som skapas senare (ikonerna laddas först) tas vid nästa anrop', () => {
    const k = fakeKarta({ 'trakt-punkt-circle': {} });
    tillampaSymbolZoom(k, 14.5);
    k.l['markers-layer'] = { id: 'markers-layer', minzoom: 0, maxzoom: 24 };
    tillampaSymbolZoom(k, 14.5);
    expect(k.l['markers-layer'].minzoom).toBe(14.5);
  });

  it('återställning utan att något klippts rör ingenting (körvyn och /maskin: objektListaVal=false)', () => {
    const k = fakeKarta({ 'markers-layer': { minzoom: 9 }, 'arrows-layer': {} });
    expect(tillampaSymbolZoom(k, null)).toBe(0);
    expect(k.setLayerZoomRange).not.toHaveBeenCalled();
  });

  it('ett lager som saknas hoppas över utan fel', () => {
    expect(() => tillampaSymbolZoom(fakeKarta({}), 14.5)).not.toThrow();
  });
});

describe('källvakt: varje symbollager i planeringskartan är antingen klippt eller ett uttalat undantag', () => {
  const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const symbolIds = (() => {
    const ut = new Set<string>();
    const re = /type: 'symbol'/g; let m: RegExpExecArray | null;
    while ((m = re.exec(page))) {
      const ids = Array.from(page.slice(Math.max(0, m.index - 400), m.index).matchAll(/id: ['`"]([^'`"]+)['`"]/g)).map((x) => x[1]);
      if (ids.length) ut.add(ids[ids.length - 1]);
    }
    return ut;
  })();

  it('hittar de kända symbollagren (vakten läser verkligen sidan)', () => {
    for (const id of ['markers-layer', 'arrows-layer', 'trakt-punkt-circle', 'zone-label']) expect(symbolIds.has(id)).toBe(true);
  });
  it('inget symbollager saknas i SYMBOL_LAGER/SYMBOL_UNDANTAG — ett nytt lager måste få ett beslut här', () => {
    const okanda = Array.from(symbolIds).filter((id) => !SYMBOL_LAGER.includes(id) && !SYMBOL_UNDANTAG.includes(id));
    expect(okanda).toEqual([]);
  });
  it('varje id i SYMBOL_LAGER finns i sidan (ingen stavfel)', () => {
    for (const id of SYMBOL_LAGER) expect(page).toContain(`'${id}'`);
  });
  it('sidan klipper bara i planeringsvyn och återställer annars', () => {
    expect(page).toContain("if (!objektListaVal) { tillampaSymbolZoom(map, null); return; }");
    expect(page).toContain('tillampaSymbolZoom(map, symbolTroskel({ traktM: symbolTraktM, lat: map.getCenter().lat, kortsidaPx: kort }));');
  });
});
