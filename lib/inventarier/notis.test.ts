import { describe, expect, it } from 'vitest';
import { byggInventarieNotis, inventarieNotisText, type InventarieNotisRad } from './notis';

const NU = Date.parse('2026-10-21T12:00:00Z');
const rad = (extra: Partial<InventarieNotisRad> = {}): InventarieNotisRad => ({
  id: 'r1', antal: 5, min_antal: 6, bestalld_tid: null, artikel_namn: 'Sågkedja 3/8 .404', sitter_pa: null, enhet: 'st',
  plats_namn: 'Maskinhallen', ...extra,
});
const notis = (extra: Record<string, unknown> = {}) => ({
  typ: 'inventarie_under_min', payload: { rad_id: 'r1' }, skapad_at: '2026-10-21T11:59:00Z', ...extra,
});

describe('notisen "Börjar ta slut"', () => {
  it('texten säger vad, hur många, var och minnivån', () => {
    expect(inventarieNotisText(rad())).toBe('Sågkedja 3/8 .404: 5 kvar i Maskinhallen (min 6)');
    expect(inventarieNotisText(rad({ artikel_namn: 'Hydraulolja', enhet: 'dunk', antal: 1, min_antal: 3 })))
      .toBe('Hydraulolja: 1 dunk kvar i Maskinhallen (min 3)');
  });

  it('skickas när raden fortfarande är under min, och länken landar på raden', async () => {
    const u = await byggInventarieNotis(notis(), async () => ({ rad: rad() }), NU);
    expect(u).toEqual({
      typ: 'skicka',
      meddelande: { title: 'Börjar ta slut', body: 'Sågkedja 3/8 .404: 5 kvar i Maskinhallen (min 6)', url: '/inventarier?rad=r1', tag: 'inventarie-r1' },
    });
  });

  it('beställd, påfylld eller borttagen rad: ingen notis (den är inte längre sann)', async () => {
    expect((await byggInventarieNotis(notis(), async () => ({ rad: rad({ bestalld_tid: '2026-10-21T11:00:00Z' }) }), NU)).typ).toBe('hoppa_over');
    expect((await byggInventarieNotis(notis(), async () => ({ rad: rad({ antal: 11 }) }), NU)).typ).toBe('hoppa_over');
    expect((await byggInventarieNotis(notis(), async () => ({ rad: rad({ antal: 6 }) }), NU)).typ).toBe('hoppa_over');
    expect((await byggInventarieNotis(notis(), async () => ({ rad: null }), NU)).typ).toBe('hoppa_over');
  });

  it('ett läsfel skjuts upp — det är inte "finns inte"', async () => {
    expect(await byggInventarieNotis(notis(), async () => ({ rad: null, fel: 'timeout' }), NU)).toEqual({ typ: 'uppskjut' });
  });

  it('köad för mer än 24 timmar sedan hoppas över, och läses aldrig', async () => {
    let last = false;
    const u = await byggInventarieNotis(notis({ skapad_at: '2026-10-20T11:00:00Z' }), async () => { last = true; return { rad: rad() }; }, NU);
    expect(u.typ).toBe('hoppa_over');
    expect(last).toBe(false);
  });

  it('utan rad i notisen hoppas den över', async () => {
    expect((await byggInventarieNotis(notis({ payload: {} }), async () => ({ rad: rad() }), NU)).typ).toBe('hoppa_over');
  });
});
