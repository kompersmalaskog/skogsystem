import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  svar: { data: [{ id: 'r1' }] as any, error: null as any },
  kast: false,
  anrop: [] as { tabell: string; metod: string; arg: unknown[] }[],
}));

vi.mock('@/lib/supabase', () => {
  class Q {
    constructor(private t: string) {}
    private reg(metod: string, ...arg: unknown[]) { db.anrop.push({ tabell: this.t, metod, arg }); return this; }
    update(v: unknown) { return this.reg('update', v); }
    eq(k: string, v: unknown) { return this.reg('eq', k, v); }
    is(k: string, v: unknown) { return this.reg('is', k, v); }
    not(k: string, o: string, v: unknown) { return this.reg('not', k, o, v); }
    select(c: string) { this.reg('select', c); return this; }
    then(res: any, rej: any) {
      if (db.kast) return Promise.reject(new Error('nätverket')).then(res, rej);
      return Promise.resolve(db.svar).then(res, rej);
    }
  }
  return { supabase: { from: (t: string) => new Q(t) } };
});

import { andraFlytt, angraGodkannande, godkannFlytt } from './godkann';

const NU = new Date('2026-10-15T10:00:00Z');
const upd = () => db.anrop.find(a => a.metod === 'update')!.arg[0] as Record<string, unknown>;
const filter = () => db.anrop.filter(a => ['eq', 'is', 'not'].includes(a.metod)).map(a => `${a.metod}:${a.arg.join(',')}`);

beforeEach(() => { db.svar = { data: [{ id: 'r1' }], error: null }; db.kast = false; db.anrop = []; });

describe('godkannFlytt', () => {
  it('sätter godkand_tid och godkand_av på just den raden, och bara om den fortfarande väntar', async () => {
    expect(await godkannFlytt('r1', 'Martin Lindqvist', NU)).toEqual({ ok: true });
    expect(upd()).toEqual({ godkand_tid: '2026-10-15T10:00:00.000Z', godkand_av: 'Martin Lindqvist' });
    expect(filter()).toEqual(expect.arrayContaining(['eq:id,r1', 'eq:status,aktiv', 'is:godkand_tid,', 'is:fakturerad_tid,']));
    expect(db.anrop.at(-1)).toMatchObject({ metod: 'select', arg: ['id'] });   // raderna begärs tillbaka
  });

  it('NOLL rader (RLS-stopp eller redan hanterad) är ett fel, aldrig ett lyckat tryck', async () => {
    db.svar = { data: [], error: null };
    const s = await godkannFlytt('r1', 'M', NU);
    expect(s).toMatchObject({ ok: false, utdaterad: true });
  });

  it('läsfel och nätfel blir fel med text', async () => {
    db.svar = { data: null, error: { message: 'boom' } };
    expect(await godkannFlytt('r1', 'M', NU)).toEqual({ ok: false, fel: 'boom' });
    db.kast = true;
    expect(await godkannFlytt('r1', 'M', NU)).toEqual({ ok: false, fel: 'nätverket' });
  });
});

describe('angraGodkannande', () => {
  it('nollställer båda fälten, bara på en godkänd och ofakturerad rad', async () => {
    expect(await angraGodkannande('r1')).toEqual({ ok: true });
    expect(upd()).toEqual({ godkand_tid: null, godkand_av: null });
    expect(filter()).toEqual(expect.arrayContaining(['eq:id,r1', 'eq:status,aktiv', 'is:fakturerad_tid,', 'not:godkand_tid,is,']));
  });
});

describe('andraFlytt (rätta km/kund före fakturering)', () => {
  it('skickar BARA de fält som ändrats + vem, och rör bara en aktiv, ofakturerad rad — godkännandet lämnas ifred', async () => {
    expect(await andraFlytt('r1', { km: 46.5 }, 'Martin Lindqvist')).toEqual({ ok: true });
    expect(upd()).toEqual({ km: 46.5, redigerad_av: 'Martin Lindqvist' });
    expect(filter()).toEqual(expect.arrayContaining(['eq:id,r1', 'eq:status,aktiv', 'is:fakturerad_tid,']));
    expect(filter().some(f => f.includes('godkand_tid'))).toBe(false);   // ändringen är ett skäl att få rätta, inte att godkänna om
    expect(db.anrop.at(-1)).toMatchObject({ metod: 'select', arg: ['id'] });
  });

  it('klienten skriver ALDRIG originalen eller redigerad_tid — det är databasens uppgift', async () => {
    await andraFlytt('r1', { km: 40, kund: 'Vida' }, 'Martin');
    const nycklar = Object.keys(upd());
    expect(nycklar.sort()).toEqual(['km', 'kund', 'redigerad_av']);
    expect(nycklar.some(k => k.endsWith('_original') || k === 'redigerad_tid')).toBe(false);
  });

  it('kund trimmas och tomt blir NULL (saknas), inte en tom sträng', async () => {
    await andraFlytt('r1', { kund: '  Vida Skog ' }, 'M');
    expect(upd().kund).toBe('Vida Skog');
    db.anrop = [];
    await andraFlytt('r1', { kund: '   ' }, 'M');
    expect(upd().kund).toBeNull();
  });

  it('ogiltigt km (noll, negativt, NaN) och inget ändrat skickas aldrig', async () => {
    for (const km of [0, -3, NaN]) expect(await andraFlytt('r1', { km }, 'M')).toMatchObject({ ok: false });
    expect(await andraFlytt('r1', {}, 'M')).toMatchObject({ ok: false, fel: 'Inget är ändrat.' });
    expect(db.anrop).toEqual([]);
  });

  it('noll rader tillbaka = utdaterad (fel), databasens egna svar (fakturerad/struken) visas som de är', async () => {
    db.svar = { data: [], error: null };
    expect(await andraFlytt('r1', { km: 40 }, 'M')).toMatchObject({ ok: false, utdaterad: true });
    db.svar = { data: null, error: { message: 'Flytten är fakturerad och kan inte ändras' } };
    expect(await andraFlytt('r1', { km: 40 }, 'M')).toEqual({ ok: false, fel: 'Flytten är fakturerad och kan inte ändras' });
  });
});
