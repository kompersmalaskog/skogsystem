import { describe, it, expect } from 'vitest';
import { byggKemikalieNotis, kemikalieNotisText, type KemikalieNotisRad } from './kemikalieNotis';

const rad: KemikalieNotisRad = { id: 'k1', namn: 'Biohyd 46', var_finns: 'Giant', aktiv: true, har_blad: false, tillagd_av_namn: 'Stefan Larsson' };
const n = { typ: 'am_kemikalie', payload: { kemikalie_id: 'k1' }, skapad_at: '2026-11-03T10:00:00Z' };
const nu = Date.parse('2026-11-03T10:05:00Z');

describe('pushen "Säkerhetsblad saknas"', () => {
  it('säger vad, vem och var, och länkar till produkten', async () => {
    const u = await byggKemikalieNotis(n, async () => ({ rad }), nu);
    expect(u).toEqual({ typ: 'skicka', meddelande: {
      title: 'Säkerhetsblad saknas · Biohyd 46', body: 'Stefan la till den · Giant. Be säljaren om bladet.', url: '/kemikalier?id=k1', tag: 'am-kemikalie-k1',
    } });
  });
  it('utan namn och plats', () => {
    expect(kemikalieNotisText({ ...rad, var_finns: null, tillagd_av_namn: null }).body).toBe('Tillagd i appen. Be säljaren om bladet.');
  });
  it('bladet redan uppladdat eller produkten borta → ingen push', async () => {
    expect((await byggKemikalieNotis(n, async () => ({ rad: { ...rad, har_blad: true } }), nu)).typ).toBe('hoppa_over');
    expect((await byggKemikalieNotis(n, async () => ({ rad: { ...rad, aktiv: false } }), nu)).typ).toBe('hoppa_over');
    expect((await byggKemikalieNotis(n, async () => ({ rad: null }), nu)).typ).toBe('hoppa_over');
  });
  it('läsfel skjuts upp, gammal hoppas över', async () => {
    expect((await byggKemikalieNotis(n, async () => ({ rad: null, fel: 'x' }), nu)).typ).toBe('uppskjut');
    expect((await byggKemikalieNotis(n, async () => ({ rad }), nu + 25 * 3600_000)).typ).toBe('hoppa_over');
  });
});
