import { describe, expect, it } from 'vitest';
import { LJUDSCHEMA, LJUD_FONSTER_MS, ljudLangd, skaSpelaLjud, spelaLarmLjud } from './ljud';

describe('larmljudet', () => {
  it('ETT ljud på 40 m: ett tvåtonsmärke, kortare än en sekund', () => {
    expect(LJUDSCHEMA.nara).toHaveLength(2);
    expect(ljudLangd('nara')).toBeLessThan(1);
  });
  it('tydligare ljud på 15 m: en enda ihållande ton, längre och starkare än det första, ingen pip-serie', () => {
    expect(LJUDSCHEMA.mycket_nara).toHaveLength(1);
    expect(ljudLangd('mycket_nara')).toBeGreaterThan(ljudLangd('nara'));
    expect(LJUDSCHEMA.mycket_nara[0].volym).toBeGreaterThan(LJUDSCHEMA.nara[0].volym);
    expect(LJUDSCHEMA.mycket_nara[0].tillFreq).toBeGreaterThan(LJUDSCHEMA.mycket_nara[0].freq);
  });
  it('inget upprepat pipande: inget schema har fler än två toner', () => {
    for (const l of ['nara', 'mycket_nara'] as const) expect(LJUDSCHEMA[l].length).toBeLessThanOrEqual(2);
  });
  it('spelar mot en AudioContext, och är ofarligt utan en', () => {
    expect(spelaLarmLjud(null, 'nara')).toBe(false);
    const osc: any[] = [];
    const ctx: any = {
      currentTime: 0, state: 'running', destination: {},
      createOscillator: () => { const o: any = { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; osc.push(o); return o; },
      createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    };
    expect(spelaLarmLjud(ctx, 'nara')).toBe(true);
    expect(osc).toHaveLength(2);
    osc.length = 0;
    expect(spelaLarmLjud(ctx, 'mycket_nara')).toBe(true);
    expect(osc).toHaveLength(1);
  });
});


describe('flera nya larm inom ~2 s ger bara ETT ljud', () => {
  it('första ljudet spelas; ett lika starkt inom fönstret tystas; efter fönstret spelas det igen', () => {
    expect(skaSpelaLjud('nara', 1000, null)).toBe(true);
    expect(skaSpelaLjud('nara', 1000 + LJUD_FONSTER_MS - 1, { tid: 1000, ljud: 'nara' })).toBe(false);
    expect(skaSpelaLjud('nara', 1000 + LJUD_FONSTER_MS, { tid: 1000, ljud: 'nara' })).toBe(true);
  });
  it('ett STARKARE ljud (Röd inom 15 m) får ersätta ett vanligt inom fönstret — det farligaste försvinner aldrig', () => {
    expect(skaSpelaLjud('mycket_nara', 1500, { tid: 1000, ljud: 'nara' })).toBe(true);
    expect(skaSpelaLjud('nara', 1500, { tid: 1000, ljud: 'mycket_nara' })).toBe(false);
  });
  it('inget ljud = inget att spela', () => expect(skaSpelaLjud(null, 5000, null)).toBe(false));
});
