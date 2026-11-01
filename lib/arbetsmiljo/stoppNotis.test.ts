import { describe, it, expect } from 'vitest';
import { byggStoppNotis, kortaText, stoppNotisText, type StoppNotisRad } from './stoppNotis';

const rad = (o: Partial<StoppNotisRad> = {}): StoppNotisRad => ({
  id: 'a-1', status: 'oppen', stopp: true, beskrivning: 'Tryck på nödstoppet med motorn igång. Stannade motorn?',
  maskin_namn: 'Giant', rapportor_namn: 'Stefan Nilsson', ...o,
});
const nu = Date.parse('2026-11-01T12:00:00Z');
const n = (o: Record<string, unknown> = {}) => ({ typ: 'am_stopp', payload: { atgard_id: 'a-1' }, skapad_at: '2026-11-01T11:58:00Z', ...o });

describe('stoppNotis', () => {
  it('skickar med maskin, fel och förnamn, och länkar till åtgärden', async () => {
    const u = await byggStoppNotis(n(), async () => ({ rad: rad() }), nu);
    expect(u).toEqual({ typ: 'skicka', meddelande: {
      title: 'Giant ska stå', body: 'Tryck på nödstoppet med motorn igång. Stannade motorn? · Stefan',
      url: '/atgarder?id=a-1', tag: 'am-stopp-a-1' } });
  });
  it('borta, åtgärdad eller inte stopp → skickas inte', async () => {
    expect((await byggStoppNotis(n(), async () => ({ rad: null }), nu)).typ).toBe('hoppa_over');
    expect(await byggStoppNotis(n(), async () => ({ rad: rad({ status: 'klar' }) }), nu)).toMatchObject({ typ: 'hoppa_over', orsak: expect.stringContaining('åtgärdad') });
    expect(await byggStoppNotis(n(), async () => ({ rad: rad({ stopp: false }) }), nu)).toMatchObject({ typ: 'hoppa_over' });
  });
  it('läsfel skjuter upp, aldrig "finns inte"', async () => {
    expect(await byggStoppNotis(n(), async () => ({ rad: null, fel: 'nät' }), nu)).toEqual({ typ: 'uppskjut' });
  });
  it('för gammal eller utan åtgärd → skickas inte', async () => {
    expect(await byggStoppNotis(n({ skapad_at: '2026-10-31T11:00:00Z' }), async () => ({ rad: rad() }), nu)).toMatchObject({ typ: 'hoppa_over', orsak: expect.stringContaining('gammal') });
    expect(await byggStoppNotis(n({ payload: {} }), async () => ({ rad: rad() }), nu)).toMatchObject({ typ: 'hoppa_over' });
  });
  it('utan maskinnamn och rapportör', () => {
    expect(stoppNotisText(rad({ maskin_namn: null, rapportor_namn: null }))).toEqual({ title: 'En maskin ska stå', body: 'Tryck på nödstoppet med motorn igång. Stannade motorn?' });
  });
  it('lång text kortas vid ordgräns', () => {
    const k = kortaText('ord '.repeat(40), 30);
    expect(k.length).toBeLessThanOrEqual(32);
    expect(k.endsWith(' …')).toBe(true);
  });
});
