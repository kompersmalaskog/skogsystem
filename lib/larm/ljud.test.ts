import { describe, expect, it } from 'vitest';
import { LJUDSCHEMA, LJUD_SAMLA_MS, ljudBeslut, ljudLangd, spelaLarmLjud, type SenastLjud } from './ljud';

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

describe('ljudspärr: flera nya larm inom ~2 s ger ETT ljud', () => {
  it('första ljudet spelas alltid', () => {
    expect(ljudBeslut(null, 10_000, 'nara')).toEqual({ spela: true, senast: { tid: 10_000, ljud: 'nara' } });
  });
  it('ett nytt ljud 1 s senare tystas — och fönstret glider inte', () => {
    const f = ljudBeslut(null, 10_000, 'nara');
    const b = ljudBeslut(f.senast, 11_000, 'nara');
    expect(b.spela).toBe(false);
    expect(b.senast).toEqual({ tid: 10_000, ljud: 'nara' });
  });
  it('efter 2 s är det en ny sak igen', () => {
    const s: SenastLjud = { tid: 10_000, ljud: 'nara' };
    expect(ljudBeslut(s, 10_000 + LJUD_SAMLA_MS - 1, 'nara').spela).toBe(false);
    expect(ljudBeslut(s, 10_000 + LJUD_SAMLA_MS, 'nara').spela).toBe(true);
  });
  it('Röd inom 15 m tystas aldrig av ett vanligt ljud som kom just före', () => {
    const s: SenastLjud = { tid: 10_000, ljud: 'nara' };
    expect(ljudBeslut(s, 10_500, 'mycket_nara')).toEqual({ spela: true, senast: { tid: 10_500, ljud: 'mycket_nara' } });
  });
  it('men ett vanligt ljud tystas efter det tydliga', () => {
    expect(ljudBeslut({ tid: 10_000, ljud: 'mycket_nara' }, 10_500, 'nara').spela).toBe(false);
    expect(ljudBeslut({ tid: 10_000, ljud: 'mycket_nara' }, 10_500, 'mycket_nara').spela).toBe(false);
  });
});
