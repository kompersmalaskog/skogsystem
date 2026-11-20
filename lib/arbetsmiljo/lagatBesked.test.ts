import { describe, it, expect } from 'vitest';
import {
  AM_LAGAT, LAGAT_FONSTER_MS, MINA_URL, byggLagatNotis, koaLagatBesked, lagatText, minaSammanfattning, ordnaMina,
  rapportTitel, rapportUnder, rapportor, type LagatRad, type MinRapport,
} from './lagatBesked';

const rad = (o: Partial<LagatRad> = {}): LagatRad => ({
  id: 'a1', status: 'klar', kalla: 'forare', beskrivning: 'Nödstoppet stannar inte motorn', vad_gjordes: 'Bytt brytare',
  maskin_namn: 'Giant', stangd_av_namn: 'Martin Lindqvist', ...o,
});
const n = (o: Record<string, unknown> = {}) => ({ typ: AM_LAGAT, payload: { atgard_id: 'a1' }, skapad_at: new Date().toISOString(), ...o });

describe('pushen "Lagat"', () => {
  it('säger vad, vad som gjordes och vem — och leder till listan', async () => {
    const u = await byggLagatNotis(n(), async () => ({ rad: rad() }));
    expect(u.typ).toBe('skicka');
    if (u.typ !== 'skicka') return;
    expect(u.meddelande.title).toBe('Lagat · Giant');
    expect(u.meddelande.body).toBe('Nödstoppet stannar inte motorn → Bytt brytare · Martin');
    expect(u.meddelande.url).toBe(MINA_URL);
  });

  it('ett tillbud "åtgärdas", det "lagas" inte; utan maskin säger den vad det gäller', () => {
    expect(lagatText(rad({ kalla: 'tillbud', maskin_namn: null })).title).toBe('Åtgärdat · det du rapporterade');
  });

  it('öppen igen, borta, saknar åtgärd, för gammal → ingenting; läsfel → uppskjuts', async () => {
    expect((await byggLagatNotis(n(), async () => ({ rad: rad({ status: 'oppen' }) }))).typ).toBe('hoppa_over');
    expect((await byggLagatNotis(n(), async () => ({ rad: null }))).typ).toBe('hoppa_over');
    expect((await byggLagatNotis(n({ payload: {} }), async () => ({ rad: rad() }))).typ).toBe('hoppa_over');
    expect((await byggLagatNotis(n({ skapad_at: '2020-01-01T00:00:00Z' }), async () => ({ rad: rad() }))).typ).toBe('hoppa_over');
    expect((await byggLagatNotis(n(), async () => ({ rad: null, fel: 'nät' }))).typ).toBe('uppskjut');
  });

  it('rapportören: den som skrev, annars föraren i maskinkollen', () => {
    expect(rapportor({ rapporterad_av: 'm1' })).toBe('m1');
    expect(rapportor({ rapporterad_av: null, svar: { koll: { medarbetare_id: 'm2' } } })).toBe('m2');
    expect(rapportor({ rapporterad_av: null, svar: [{ koll: [{ medarbetare_id: 'm3' }] }] })).toBe('m3');
    expect(rapportor({ rapporterad_av: null, svar: null })).toBeNull();
  });

  it('producenten: stängda senaste dygnet, inte admins egna, aldrig till den som själv stängde', async () => {
    const filter: string[] = []; let upsert: any[] = [];
    const data = [
      { id: 'a1', rapporterad_av: 'stefan', stangd_av: 'martin' },
      { id: 'a2', rapporterad_av: null, stangd_av: 'martin', svar: { koll: { medarbetare_id: 'oskar' } } },
      { id: 'a3', rapporterad_av: 'martin', stangd_av: 'martin' },
      { id: 'a4', rapporterad_av: null, stangd_av: 'martin', svar: null },
    ];
    const k: any = {
      select: () => k, neq: (c: string, v: unknown) => (filter.push(`${c}!=${v}`), k), gte: (c: string, v: string) => (filter.push(`${c}>=${v}`), k), limit: () => k,
      then: (f: any) => Promise.resolve({ data, error: null }).then(f),
    };
    const sb: any = { from: (t: string) => t === 'am_atgard' ? k : { upsert: (r: any[]) => (upsert = r, { select: async () => ({ data: r, error: null }) }) } };
    const nu = new Date('2026-11-03T12:00:00Z');
    const r = await koaLagatBesked(sb, nu);
    expect(r).toEqual({ ok: true, stangda: 4, koade: 2 });
    expect(filter).toContain('status!=oppen');
    expect(filter).toContain('kalla!=manuell');
    expect(filter).toContain(`stangd_tid>=${new Date(nu.getTime() - LAGAT_FONSTER_MS).toISOString()}`);
    expect(upsert).toEqual([
      { mottagare_id: 'stefan', typ: AM_LAGAT, payload: { atgard_id: 'a1' }, skickas_at: 'infinity', dedup_nyckel: 'lagat:a1' },
      { mottagare_id: 'oskar', typ: AM_LAGAT, payload: { atgard_id: 'a2' }, skickas_at: 'infinity', dedup_nyckel: 'lagat:a2' },
    ]);
  });

  it('producenten: läsfel är ett fel, ingenting köas', async () => {
    const k: any = { select: () => k, neq: () => k, gte: () => k, limit: () => k, then: (f: any) => Promise.resolve({ data: null, error: { message: 'nej' } }).then(f) };
    const r = await koaLagatBesked({ from: () => k } as any);
    expect(r.ok).toBe(false);
  });
});

const min = (o: Partial<MinRapport> = {}): MinRapport => ({
  id: 'a', kalla: 'forare', maskinNamn: 'Giant', beskrivning: 'Steget sitter löst', lagad: false, vadGjordes: null, stangdTid: null,
  skapad: '2026-10-31T10:00:00Z', ...o,
});

describe('listan "Det du rapporterat"', () => {
  it('raden säger läget i ord', () => {
    expect(rapportTitel(min())).toBe('Giant · Steget sitter löst');
    expect(rapportUnder(min())).toBe('Väntar på att lagas · rapporterad 31 okt');
    expect(rapportUnder(min({ lagad: true, stangdTid: '2026-11-03T09:00:00Z', vadGjordes: 'Nya skruvar' }))).toBe('Lagat 3 nov · Nya skruvar');
    expect(rapportUnder(min({ kalla: 'tillbud' }))).toBe('Väntar på åtgärd · rapporterad 31 okt');
  });

  it('sammanfattningen: väntar först, sedan klara', () => {
    expect(minaSammanfattning([min(), min({ lagad: true }), min({ lagad: true })])).toBe('1 väntar · 2 klara');
    expect(minaSammanfattning([min({ lagad: true })])).toBe('1 klar');
  });

  it('ordningen: det som väntat längst först, sedan senast klart', () => {
    const lista = [
      min({ id: 'k1', lagad: true, stangdTid: '2026-11-01T00:00:00Z' }),
      min({ id: 'v2', skapad: '2026-11-02T00:00:00Z' }),
      min({ id: 'k2', lagad: true, stangdTid: '2026-11-03T00:00:00Z' }),
      min({ id: 'v1', skapad: '2026-10-20T00:00:00Z' }),
    ];
    expect(ordnaMina(lista).map(r => r.id)).toEqual(['v1', 'v2', 'k2', 'k1']);
  });
});
