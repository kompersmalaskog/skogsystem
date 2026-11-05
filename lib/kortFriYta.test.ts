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
  it('linje utanför trakten: trakten kommer med', () => {
    expect(kameraGranser([[15.02, 57.02], [15.03, 57.03]], trakt, 'linje')).toEqual([[15.0, 57.0], [15.03, 57.03]]);
  });
  it('ingen trakt eller ingen sak', () => {
    expect(kameraGranser([[1, 2], [3, 4]], null, 'zon')).toEqual([[1, 2], [3, 4]]);
    expect(kameraGranser(null, trakt, 'linje')).toBeNull();
  });
});
