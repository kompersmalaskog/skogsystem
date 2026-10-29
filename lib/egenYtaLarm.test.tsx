// @vitest-environment jsdom
// "Larma inte" på en egen yta (lib/egenYtaLarm): ytan larmar inte och räknas inte i fällningscirkeln — allt annat som förut.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useKorvyLarm, type KorvyLarmIn, type KorvyLarmUt } from './hooks/useKorvyLarm';
import { bedomFallning, fallningKandidater } from './larm/fallning';
import { larmRegelText } from './larm/grupper';
import { kanStangaAvLarm, larmarInte, medLarmaInte } from './egenYtaLarm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const M = 1 / 111320;
const POS = { lat: 56.5, lon: 14.7 };
// "svg" x = lat, y = lon (som useKorvyLarm.test). En kvadrat 40 × 40 m runt maskinen.
const ruta = (extra: any = {}) => ({ id: 7, isZone: true, zoneType: 'protected', path: [[-20, -20], [-20, 20], [20, 20], [20, -20]].map(([n, e]) => ({ x: POS.lat + n * M, y: POS.lon + e * M / Math.cos(POS.lat * Math.PI / 180) })), ...extra });
const svgToLatLon = (x: number, y: number) => ({ lat: x, lon: y });

const db = { from: () => { const q: any = { select: () => q, eq: () => q, upsert: async () => ({ error: null }), then: (r: any, j: any) => Promise.resolve({ data: [], error: null }).then(r, j) }; return q; } };
let ut: KorvyLarmUt;
async function larm(markers: any[]) {
  const inp: KorvyLarmIn = { aktiv: true, pos: POS, markers, svgToLatLon, typNamn: () => 'Hänsyn', egna: new Set(), vida: null, objektId: 'o1', forare: { id: 'A', namn: 'Stefan' }, db: db as any, ljudCtx: () => null };
  function H() { ut = useKorvyLarm(inp); return null; }
  const c = document.createElement('div'); document.body.appendChild(c); const r = createRoot(c);
  await act(async () => { r.render(<H />); await new Promise((res) => setTimeout(res, 0)); });
  return ut;
}
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('"Larma inte" på en egen yta', () => {
  it('Hänsyn-yta larmar "kör inte här" som förut — med Larma inte inget kort', async () => {
    expect((await larm([ruta()])).kort).toMatchObject({ namn: expect.stringContaining('Hänsyn') });
    expect((await larm([ruta({ larmaInte: true })])).kort).toBeNull();
  });
  it('fällningscirkeln: ytan räknas inte när larmet är avstängt', () => {
    const b = (m: any) => bedomFallning(fallningKandidater({ pos: POS, markers: [m], svgToLatLon, vida: null }));
    expect(b(ruta()).grupp).toBe('natur');
    expect(b(ruta({ larmaInte: true })).grupp).toBeNull();
  });
  it('av = fältet tas bort (sparas som förut), på = true', () => {
    const m = ruta();
    expect(medLarmaInte(m, true).larmaInte).toBe(true);
    expect('larmaInte' in medLarmaInte(medLarmaInte(m, true), false)).toBe(false);
    expect(larmarInte({ isZone: true, larmaInte: 'ja' })).toBe(false);
    expect(larmarInte({ isZone: false, larmaInte: true })).toBe(false);
  });
  it('brytaren finns bara på ytor som larmar; kortet säger "Larmar inte"', () => {
    expect(kanStangaAvLarm(ruta())).toBe(true);
    expect(kanStangaAvLarm({ isZone: true, zoneType: 'gallring' })).toBe(false);
    expect(kanStangaAvLarm({ isLine: true, zoneType: 'protected' } as any)).toBe(false);
    expect(larmRegelText({ grupp: 'natur', forbjuden: true, avverkas: true })).toMatch(/^Larmar inte/);
  });
  it('sidan: brytaren i markeringskortet bara för planeraren i planeringsläget, och kortets larmregel läser fältet', () => {
    const page = readFileSync('app/planering/page.tsx', 'utf8');
    expect(page).toContain('{kanStangaAvLarm(marker) && objektListaVal && isAdminRiktig && (');
    expect(page).toContain('avverkas: larmarInte(marker) })}');
    expect(page).toContain('medLarmaInte(m, v)');
  });
});
