import { describe, expect, it } from 'vitest';
import { friYtaPadding } from './kortFriYta';

const kartan = { left: 0, top: 0, right: 1280, bottom: 800 };

describe('friYtaPadding — platsen syns bredvid kortet, inte bakom det', () => {
  it('bred skärm, kortet i mitten: den största sidan vinner', () => {
    const kort = { left: 360, top: 150, right: 920, bottom: 800 };
    const p = friYtaPadding(kartan, kort, 24, 80);
    expect(p.left).toBe(920 + 24);          // höger om kortet (360 px fri, lika med vänster → första)
    expect(p.right).toBe(24);
  });
  it('kortet till vänster: platsen hamnar till höger', () => {
    const p = friYtaPadding(kartan, { left: 0, top: 100, right: 560, bottom: 800 }, 24, 80);
    expect(p.left).toBe(584);
  });
  it('telefon, kortet i full bredd: platsen ovanför kortet', () => {
    const tel = { left: 0, top: 0, right: 390, bottom: 844 };
    const p = friYtaPadding(tel, { left: 0, top: 420, right: 390, bottom: 844 }, 24, 80);
    expect(p.bottom).toBe(844 - 420 + 24);
    expect(p.left).toBe(24);
  });
  it('inget kort eller kortet utanför kartan: vanlig luft', () => {
    expect(friYtaPadding(kartan, null, 24, 80)).toEqual({ top: 104, bottom: 24, left: 24, right: 24 });
    expect(friYtaPadding(kartan, { left: 2000, top: 0, right: 2400, bottom: 800 }, 24, 80).bottom).toBe(24);
  });
  it('ingen bit räcker: hellre ovanför kortet än bakom det', () => {
    const p = friYtaPadding(kartan, { left: 0, top: 120, right: 1280, bottom: 800 }, 24, 80);
    expect(p.bottom).toBeGreaterThan(600);
  });
});

describe('kameraGranser — linjer och ytor visas med trakten runt sig', async () => {
  const { kameraGranser } = await import('./kortFriYta');
  const trakt: [[number, number], [number, number]] = [[15.0, 57.0], [15.01, 57.01]];
  it('symbol: bara symbolen', () => {
    expect(kameraGranser([[15.02, 57.02], [15.02, 57.02]], trakt, 'symbol')).toEqual([[15.02, 57.02], [15.02, 57.02]]);
  });
  it('lång linje ut genom skogen: bara delen nära trakten tas med — kameran drar inte ut flera kilometer', () => {
    // från traktens kant (15.01, 57.005) och 3 km österut
    const punkter = [{ lng: 15.01, lat: 57.005 }, { lng: 15.012, lat: 57.005 }, { lng: 15.06, lat: 57.005 }];
    const g = kameraGranser([[15.01, 57.005], [15.06, 57.005]], trakt, 'linje', punkter)!;
    expect(g[1][0]).toBeCloseTo(15.012, 6);   // 15.06 (3 km bort) är inte med
    expect(g[0]).toEqual([15.0, 57.0]);
  });
  it('linje helt långt bort: bara den närmaste punkten', () => {
    const punkter = [{ lng: 15.05, lat: 57.005 }, { lng: 15.08, lat: 57.005 }];
    const g = kameraGranser([[15.05, 57.005], [15.08, 57.005]], trakt, 'linje', punkter)!;
    expect(g[1][0]).toBeCloseTo(15.05, 6);
  });
  it('ingen trakt eller ingen sak', () => {
    expect(kameraGranser([[1, 2], [3, 4]], null, 'zon')).toEqual([[1, 2], [3, 4]]);
    expect(kameraGranser(null, trakt, 'linje')).toBeNull();
  });
});

describe('listaPunkt — en fast plats, aldrig en ruta (Bondeskogs basväg går en kilometer norrut)', async () => {
  const { listaPunkt } = await import('./kortFriYta');
  const trakt: [[number, number], [number, number]] = [[15.0, 57.0], [15.01, 57.01]];
  it('symbol: dess plats', () => {
    expect(listaPunkt({ lat: 57.005, lng: 15.005 }, trakt)).toEqual({ lat: 57.005, lng: 15.005 });
  });
  it('kort linje i trakten: mitten', () => {
    const p = listaPunkt({ lat: null, lng: null, geometri: [{ lat: 57.002, lng: 15.002 }, { lat: 57.004, lng: 15.002 }] }, trakt)!;
    expect(p.lat).toBeCloseTo(57.003, 4);
  });
  it('lång väg ut ur trakten: punkten där den når trakten, inte mitten en halv kilometer bort', () => {
    const vag = [{ lat: 57.009, lng: 15.005 }, { lat: 57.02, lng: 15.005 }, { lat: 57.02, lng: 15.005 }].map((q, i) => (i === 2 ? { lat: 57.019, lng: 15.005 } : q));
    const p = listaPunkt({ lat: null, lng: null, geometri: vag }, trakt)!;
    expect(p.lat).toBeCloseTo(57.009, 5);
  });
  it('ingen plats: null', () => {
    expect(listaPunkt({ lat: null, lng: null }, trakt)).toBeNull();
  });
});

describe('larmplatsen på kartan har vägen tillbaka till listan (Martin 2026-11-05)', () => {
  it('Hela trakten sätter larmPaKartan och listen "‹ Lista" öppnar listan igen', async () => {
    const { readFileSync } = await import('node:fs');
    const s = readFileSync('app/planering/page.tsx', 'utf8');
    expect(s).toMatch(/onVisa: \(\) => \{ stang\(\); larmFlyTill\(\); setLarmPaKartan\(true\); \}/);
    expect(s).toMatch(/testid="larm-list"[\s\S]{0,400}etikett: 'Lista', onClick: \(\) => \{ setLarmPaKartan\(false\); setInfoStartVy\('oversikt'\); setTraktOversiktOpen\(true\); \}/);
  });
});
