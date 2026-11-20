import { describe, it, expect } from 'vitest';
import { AM_ANMAL, ANMAL_EFTER_MS, byggAnmalNotis, koaAnmalPaminnelse, type AnmalRad } from './anmalNotis';
import { ejAnmald } from './tillbud';

const rad = (o: Partial<AnmalRad> = {}): AnmalRad => ({ tillbud_id: 't1', atgard_id: 'a1', typ: 'olycka', anmald: false, beskrivning: 'Trädet föll åt fel håll', maskin_namn: 'Giant', ...o });
const n = (o: Record<string, unknown> = {}) => ({ typ: AM_ANMAL, payload: { tillbud_id: 't1' }, skapad_at: new Date().toISOString(), ...o });

describe('påminnelsen om anmälan', () => {
  it('en olycka som inte är anmäld → frågan, med länk till åtgärden', async () => {
    const u = await byggAnmalNotis(n(), async () => ({ rad: rad() }));
    expect(u.typ).toBe('skicka');
    if (u.typ !== 'skicka') return;
    expect(u.meddelande.title).toBe('Är olyckan anmäld?');
    expect(u.meddelande.body).toContain('Olycka · Giant');
    expect(u.meddelande.body).toContain('Arbetsmiljöverket');
    expect(u.meddelande.url).toBe('/atgarder?id=a1');
  });

  it('anmäld, borta, inget tillbud, för gammal → ingenting; läsfel → uppskjuts', async () => {
    expect((await byggAnmalNotis(n(), async () => ({ rad: rad({ anmald: true }) }))).typ).toBe('hoppa_over');
    expect((await byggAnmalNotis(n(), async () => ({ rad: null }))).typ).toBe('hoppa_over');
    expect((await byggAnmalNotis(n(), async () => ({ rad: rad({ typ: 'tillbud' }) }))).typ).toBe('hoppa_over');
    expect((await byggAnmalNotis(n({ skapad_at: '2020-01-01T00:00:00Z' }), async () => ({ rad: rad() }))).typ).toBe('hoppa_over');
    expect((await byggAnmalNotis(n(), async () => ({ rad: null, fel: 'nät' }))).typ).toBe('uppskjut');
  });

  it('producenten: bara olyckor, ej anmälda, 2 h–7 dygn; en rad per aktiv admin, aldrig före skickas_at infinity', async () => {
    const filter: string[] = []; let upsert: any[] = [];
    const kedja = (data: unknown) => {
      const k: any = { select: () => k, eq: (c: string, v: unknown) => (filter.push(`${c}=${v}`), k), is: (c: string, v: unknown) => (filter.push(`${c} is ${v}`), k),
        lte: (c: string, v: string) => (filter.push(`${c}<=${v}`), k), gte: (c: string, v: string) => (filter.push(`${c}>=${v}`), k), limit: () => k,
        then: (f: any) => Promise.resolve({ data, error: null }).then(f) };
      return k;
    };
    const sb: any = { from: (t: string) => t === 'am_tillbud' ? kedja([{ id: 't1' }])
      : t === 'medarbetare' ? kedja([{ id: 'm1', aktiv: true }, { id: 'm2', aktiv: false }])
      : { upsert: (r: any[]) => (upsert = r, { select: async () => ({ data: r, error: null }) }) } };
    const nu = new Date('2026-11-02T12:00:00Z');
    const r = await koaAnmalPaminnelse(sb, nu);
    expect(r).toEqual({ ok: true, olyckor: 1, koade: 1 });
    expect(filter).toContain('typ=olycka');
    expect(filter).toContain('anmald_tid is null');
    expect(filter).toContain(`skapad<=${new Date(nu.getTime() - ANMAL_EFTER_MS).toISOString()}`);
    expect(upsert).toEqual([{ mottagare_id: 'm1', typ: AM_ANMAL, payload: { tillbud_id: 't1' }, skickas_at: 'infinity', dedup_nyckel: 'anmal:t1' }]);
  });

  it('raden i åtgärdslistan: bara en olycka utan anmälan säger "Inte anmäld"', () => {
    expect(ejAnmald({ tillbudId: 't', typ: 'olycka', anmaldTid: null, anmaldAvNamn: null })).toBe(true);
    expect(ejAnmald({ tillbudId: 't', typ: 'olycka', anmaldTid: '2026-11-02', anmaldAvNamn: null })).toBe(false);
    expect(ejAnmald({ tillbudId: 't', typ: 'tillbud', anmaldTid: null, anmaldAvNamn: null })).toBe(false);
    expect(ejAnmald(null)).toBe(false);
  });
});
