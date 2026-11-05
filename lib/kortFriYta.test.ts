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
