import { describe, it, expect } from 'vitest';
import { byggGodkannNotis, godkannKoNyckel, godkannMeddelande, FLYTT_GODKANN } from './godkannNotis';
import { koaGodkannPaminnelse } from './godkannKo';

describe('Påminnelsen om flyttar som väntar på godkännande', () => {
  it('köas bara på måndagen från 07:00 svensk tid, en nyckel per måndag', () => {
    expect(godkannKoNyckel(new Date('2026-10-26T05:59:00Z'))).toBeNull();          // mån 06:59 svensk tid (vintertid)
    expect(godkannKoNyckel(new Date('2026-10-26T06:00:00Z'))).toBe('godkann:2026-10-26');   // mån 07:00 (vintertid)
    expect(godkannKoNyckel(new Date('2026-10-26T20:00:00Z'))).toBe('godkann:2026-10-26');
    expect(godkannKoNyckel(new Date('2026-10-27T08:00:00Z'))).toBeNull();          // tisdag
    expect(godkannKoNyckel(new Date('2026-10-19T05:00:00Z'))).toBe('godkann:2026-10-19');   // mån 07:00 sommartid
  });

  it('texten säger hur många, äldsta datum och hur många över 3 mil; trycket går till äldsta månaden', () => {
    const m = godkannMeddelande([
      { id: 'a', datum: '2026-10-06', km: 53 }, { id: 'b', datum: '2026-09-28', km: 10 }, { id: 'c', datum: '2026-10-12', km: 45.8 },
    ])!;
    expect(m.title).toBe('3 flyttar väntar på godkännande');
    expect(m.body).toBe('Äldsta från 28 sep · 2 över 3 mil. De kommer inte med på fakturan förrän du godkänt dem.');
    expect(m.url).toBe('/lastbil?flik=fakturering&per=2026-09');
    expect(godkannMeddelande([{ id: 'a', datum: '2026-10-06', km: 12 }])!.title).toBe('1 flytt väntar på godkännande');
    expect(godkannMeddelande([])).toBeNull();
  });

  it('vid utskick: allt godkänt → ingen push; läsfel → försök igen sen; köad för mer än ett dygn sedan → aldrig', async () => {
    const nu = Date.parse('2026-10-26T07:00:00Z');
    expect(await byggGodkannNotis({ skapad_at: '2026-10-26T06:00:00Z' }, async () => ({ rader: [] }), nu)).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — alla flyttar är redan godkända' });
    expect(await byggGodkannNotis({ skapad_at: '2026-10-26T06:00:00Z' }, async () => ({ rader: null, fel: 'nät' }), nu)).toEqual({ typ: 'uppskjut' });
    expect((await byggGodkannNotis({ skapad_at: '2026-10-24T06:00:00Z' }, async () => ({ rader: [{ id: 'a', datum: '2026-10-06', km: 53 }] }), nu)).typ).toBe('hoppa_over');
    const s = await byggGodkannNotis({ skapad_at: '2026-10-26T06:00:00Z' }, async () => ({ rader: [{ id: 'a', datum: '2026-10-06', km: 53 }] }), nu);
    expect(s.typ).toBe('skicka');
  });
});

describe('Kön: en rad per aktiv admin, bara när något väntar', () => {
  const fake = (underlag: any[], admins: any[]) => {
    const skrivet: any[] = [];
    const q = (tabell: string) => {
      const b: any = {
        select: () => b, eq: () => b, is: () => b, limit: () => Promise.resolve({ data: underlag, error: null }),
        upsert: (rader: any[]) => { skrivet.push(...rader); return { select: () => Promise.resolve({ data: rader, error: null }) }; },
        then: (res: any) => Promise.resolve({ data: tabell === 'medarbetare' ? admins : [], error: null }).then(res),
      };
      return b;
    };
    return { sb: { from: q } as any, skrivet };
  };

  it('måndag med två som väntar: en rad per aktiv admin med måndagens nyckel', async () => {
    const { sb, skrivet } = fake([{ id: 'a', datum: '2026-10-06', km: 53 }, { id: 'b', datum: '2026-10-12', km: 20 }], [{ id: 'm1', aktiv: true }, { id: 'm2', aktiv: false }]);
    const r = await koaGodkannPaminnelse(sb, new Date('2026-10-26T06:30:00Z'));
    expect(r).toMatchObject({ ok: true, vantar: 2, koade: 1 });
    expect(skrivet).toEqual([expect.objectContaining({ mottagare_id: 'm1', typ: FLYTT_GODKANN, dedup_nyckel: 'godkann:2026-10-26' })]);
  });

  it('inget väntar, eller inte måndag: ingenting köas', async () => {
    const a = fake([], [{ id: 'm1', aktiv: true }]);
    expect(await koaGodkannPaminnelse(a.sb, new Date('2026-10-26T06:30:00Z'))).toMatchObject({ ok: true, koade: 0 });
    expect(a.skrivet).toHaveLength(0);
    const b = fake([{ id: 'a', datum: '2026-10-06', km: 53 }], [{ id: 'm1', aktiv: true }]);
    expect(await koaGodkannPaminnelse(b.sb, new Date('2026-10-27T06:30:00Z'))).toMatchObject({ ok: true, koade: 0 });
    expect(b.skrivet).toHaveLength(0);
  });
});
