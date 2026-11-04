import { describe, it, expect } from 'vitest';
import { INSTR_IDN, KATALOG, MAX_STEG, MIN_STEG, arAndrad, attLasa, instruktion, lage, lastTid, rensaSteg, svar, tolka, underlag, type Godkannande, type InstrId } from './saGorVi';

const nu = new Date('2026-11-04T10:00:00Z');
const godkand = (id: InstrId, steg: string[] | null = null, tid = '2026-11-01T10:00:00Z'): Godkannande =>
  ({ steg, godkandUnderlag: underlag(instruktion(id, { steg, godkandUnderlag: null, godkandTid: null })), godkandTid: tid });

describe('instruktionerna', () => {
  it('bara de jobb som har allvarliga risker, 3–5 korta steg var', () => {
    expect(INSTR_IDN).toHaveLength(8);
    for (const id of INSTR_IDN) {
      const k = KATALOG[id];
      expect(k.steg.length, id).toBeGreaterThanOrEqual(MIN_STEG);
      expect(k.steg.length, id).toBeLessThanOrEqual(MAX_STEG);
      for (const s of k.steg) expect(s.length, s).toBeLessThanOrEqual(110);
    }
  });
  it('admins steg går före appens; för få steg = appens', () => {
    expect(instruktion('ensam', { steg: ['a', 'b', 'c'], godkandUnderlag: null, godkandTid: null }).steg).toEqual(['a', 'b', 'c']);
    expect(instruktion('ensam', tolka({ steg: ['a', 'b'] })).steg).toEqual(KATALOG.ensam.steg);
    expect(arAndrad('ensam', { steg: ['a', 'b', 'c'], godkandUnderlag: null, godkandTid: null })).toBe(true);
    expect(arAndrad('ensam', { steg: [...KATALOG.ensam.steg], godkandUnderlag: null, godkandTid: null })).toBe(false);
  });
  it('rensa: tomma bort, högst fem, minst tre', () => {
    expect(rensaSteg(['  a ', '', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(rensaSteg(['a', 'b'])).toBeNull();
    expect(rensaSteg(['1', '2', '3', '4', '5', '6'])).toHaveLength(5);
  });
});

describe('godkännandet följer exakt stegen', () => {
  it('godkänd, ändrad efteråt, aldrig, och se över efter ett år', () => {
    expect(lage('trailer', godkand('trailer'), nu)).toBe('godkand');
    const g = godkand('trailer');
    expect(lage('trailer', { ...g, steg: ['x', 'y', 'z'] }, nu)).toBe('andrad');
    expect(lage('trailer', undefined, nu)).toBe('aldrig');
    expect(lage('trailer', godkand('trailer', null, '2025-10-01T10:00:00Z'), nu)).toBe('se_over');
  });
  it('ett kvitto gäller bara stegen det lästes på', () => {
    const i = instruktion('ensam', undefined);
    const kv = [{ medarbetareId: 'f', instruktion: 'ensam' as const, underlag: underlag(i), tid: '2026-11-02T08:00:00Z' }];
    expect(lastTid(kv, 'f', i)).toBe('2026-11-02T08:00:00Z');
    expect(lastTid(kv, 'f', instruktion('ensam', { steg: ['a', 'b', 'c'], godkandUnderlag: null, godkandTid: null }))).toBeNull();
    expect(lastTid(kv, 'annan', i)).toBeNull();
  });
});

describe('svaret', () => {
  it('admin: hur många som ska godkännas', () => {
    expect(svar(true, {}, [], 'a', nu)).toEqual({ text: '8 av 8 att godkänna', ton: 'orange' });
    const alla = Object.fromEntries(INSTR_IDN.map(id => [id, godkand(id)])) as Record<InstrId, Godkannande>;
    expect(svar(true, alla, [], 'a', nu)).toEqual({ text: 'Alla är godkända' });
  });
  it('föraren: bara godkända räknas', () => {
    expect(svar(false, {}, [], 'f', nu)).toEqual({ text: 'Instruktionerna är inte klara än' });
    const g = { ensam: godkand('ensam'), trailer: godkand('trailer') };
    expect(attLasa(g, [], 'f', nu)).toEqual(['trailer', 'ensam']);
    const kv = [{ medarbetareId: 'f', instruktion: 'ensam' as const, underlag: g.ensam.godkandUnderlag!, tid: '2026-11-02T08:00:00Z' }];
    expect(svar(false, g, kv, 'f', nu)).toEqual({ text: '1 att läsa', ton: 'orange' });
  });
});

describe('källorna', () => {
  it('länkar bara till https och gäller de rättade stegen', () => {
    for (const id of INSTR_IDN) { const k = KATALOG[id].kalla; if (k) expect(k.url).toMatch(/^https:\/\//); }
    expect(KATALOG.kraftledning.steg.join(' ')).toContain('20 m');
    expect(KATALOG.kraftledning.steg.join(' ')).toContain('10 m');
    expect(KATALOG.bargning.kalla?.text).toContain('Skogforsk');
  });
});
