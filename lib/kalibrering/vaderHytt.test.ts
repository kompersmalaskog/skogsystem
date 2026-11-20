import { describe, expect, it } from 'vitest';
import { vaderKort } from './vaderHytt';
import { vaderLage } from './vaderOmslag';
import type { VaderSvar } from './vaderServer';

const TIM = 3_600_000;
const nu = Date.parse('2026-11-18T06:30:00Z'); // 07:30 svensk tid
const slut = Date.parse('2026-11-17T15:00:00Z');
const serie = (da: number, sedan: number) => Array.from({ length: 30 }, (_, i) => {
  const ms = nu - (29 - i) * TIM;
  return { ms, temp: ms < nu - 8 * TIM ? da : sedan };
});
const svar = (o: Partial<Extract<VaderSvar, { ok: true }>> = {}): VaderSvar => ({
  ok: true, lage: vaderLage({ obs: serie(3, -6), slutMs: slut, nuMs: nu }), station: 'Växjö A', slutMs: slut, kontrollMs: null, kontrollIdag: null,
  startMs: Date.parse('2026-11-18T06:00:00Z'), ...o,
});

describe('vädret i hytten', () => {
  it('omslag och startad nyss → kortet, med samma text som pushen och inga råd', () => {
    const k = vaderKort(svar(), nu, null);
    expect(k).toEqual({ titel: 'Vädret har slagit om', text: 'När maskinen slutade igår var det 3 °C, nu −6 °C – virket har frusit.', dag: '2026-11-18' });
    expect(k?.text).not.toMatch(/kontroll|mät|justera/i);
  });
  it('Sett idag → inget kort; Sett igår gäller inte idag', () => {
    expect(vaderKort(svar(), nu, '2026-11-18')).toBeNull();
    expect(vaderKort(svar(), nu, '2026-11-17')).not.toBeNull();
  });
  it('kontroll gjord sedan starten → inget kort', () => {
    expect(vaderKort(svar({ kontrollIdag: '07:10' }), nu, null)).toBeNull();
  });
  it('bara i morgonfönstret: inte före starten, inte mer än två timmar efter, inte utan start', () => {
    expect(vaderKort(svar({ startMs: nu + 60_000 }), nu, null)).toBeNull();
    expect(vaderKort(svar({ startMs: nu - 2 * TIM }), nu, null)).not.toBeNull();
    expect(vaderKort(svar({ startMs: nu - 2 * TIM - 60_000 }), nu, null)).toBeNull();
    expect(vaderKort(svar({ startMs: null }), nu, null)).toBeNull();
  });
  it('inget omslag, ingen förra arbetsdag eller läsfel → inget kort', () => {
    expect(vaderKort(svar({ lage: vaderLage({ obs: serie(-2, -3), slutMs: slut, nuMs: nu }) }), nu, null)).toBeNull();
    expect(vaderKort(svar({ slutMs: null }), nu, null)).toBeNull();
    expect(vaderKort({ ok: false, orsak: 'las' }, nu, null)).toBeNull();
    expect(vaderKort(null, nu, null)).toBeNull();
  });
});
