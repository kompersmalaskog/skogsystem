import { describe, it, expect } from 'vitest';
import { deadlineText, fornamn, gruppera, narText, stangAtgard, svar, svenskDag, type Atgard } from './atgarder';

const a = (o: Partial<Atgard>): Atgard => ({
  id: 'x', kalla: 'svar', maskinId: 'JD810E', maskinNamn: '810E', beskrivning: 'Fel', fotoUrl: null, deadline: null,
  status: 'oppen', stopp: false, vadGjordes: null, stangdTid: null, stangdAvNamn: null, skapad: '2026-10-31T10:00:00Z',
  rapportorNamn: 'Stefan Nilsson', plats: null, ...o,
});

describe('gruppera', () => {
  it('stopp först (äldst först), sedan öppna efter deadline (utan datum sist), sist stängda (senast först)', () => {
    const g = gruppera([
      a({ id: 'o-utan', deadline: null }),
      a({ id: 'o-sen', deadline: '2026-11-08' }),
      a({ id: 'o-tidig', deadline: '2026-11-02' }),
      a({ id: 's-ny', stopp: true, skapad: '2026-11-01T09:00:00Z', deadline: '2026-11-01' }),
      a({ id: 's-gammal', stopp: true, skapad: '2026-10-30T09:00:00Z', deadline: '2026-10-30' }),
      a({ id: 'k-1', status: 'klar', stangdTid: '2026-10-31T08:00:00Z' }),
      a({ id: 'k-2', status: 'klar', stangdTid: '2026-11-01T08:00:00Z', stopp: true }),
    ]);
    expect(g.stopp.map(x => x.id)).toEqual(['s-gammal', 's-ny']);
    expect(g.oppna.map(x => x.id)).toEqual(['o-tidig', 'o-sen', 'o-utan']);
    expect(g.klara.map(x => x.id)).toEqual(['k-2', 'k-1']);
  });
});

describe('svar', () => {
  it('inget öppet', () => expect(svar(gruppera([a({ status: 'klar' })]))).toEqual({ tal: 0, rad: 'Inget att åtgärda' }));
  it('räknar maskiner som ska stå, inte stopp', () => {
    const g = gruppera([a({ id: '1', stopp: true }), a({ id: '2', stopp: true }), a({ id: '3' })]);
    expect(svar(g)).toEqual({ tal: 3, rad: '1 maskin ska stå' });
  });
  it('utan stopp', () => expect(svar(gruppera([a({})]))).toEqual({ tal: 1, rad: 'åtgärd att göra' }));
});

describe('deadlineText', () => {
  it('idag, i morgon, datum, sen', () => {
    expect(deadlineText('2026-11-01', '2026-11-01')).toEqual({ text: 'Idag', sen: false });
    expect(deadlineText('2026-11-02', '2026-11-01')).toEqual({ text: 'I morgon', sen: false });
    expect(deadlineText('2026-11-08', '2026-11-01')).toEqual({ text: '8 nov', sen: false });
    expect(deadlineText('2026-10-31', '2026-11-01')).toEqual({ text: 'Sen 1 dag', sen: true });
    expect(deadlineText('2026-10-29', '2026-11-01')).toEqual({ text: 'Sen 3 dagar', sen: true });
    expect(deadlineText(null, '2026-11-01')).toBeNull();
  });
});

describe('tid och namn', () => {
  it('svensk dag runt midnatt', () => expect(svenskDag(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01'));
  it('idag/igår/datum', () => {
    const nu = new Date('2026-11-01T12:00:00Z');
    expect(narText('2026-11-01T09:05:00Z', nu)).toBe('idag 10:05');
    expect(narText('2026-10-31T17:31:00Z', nu)).toBe('igår 18:31');
    expect(narText('2026-10-20T17:31:00Z', nu)).toBe('20 okt');
  });
  it('förnamn', () => { expect(fornamn('Stefan Nilsson')).toBe('Stefan'); expect(fornamn(null)).toBeNull(); expect(fornamn('  ')).toBeNull(); });
});

describe('stangAtgard', () => {
  const sb = (svarRader: unknown[] | null, fel: unknown = null) => {
    const anrop: any = {};
    const kedja: any = {
      update: (v: unknown) => { anrop.update = v; return kedja; },
      eq: (k: string, v: unknown) => { (anrop.eq ??= []).push([k, v]); return kedja; },
      select: async () => ({ data: svarRader, error: fel }),
    };
    return { klient: { from: (t: string) => { anrop.tabell = t; return kedja; } } as any, anrop };
  };
  it('tom text skickas aldrig', async () => {
    const { klient, anrop } = sb([{ status: 'klar' }]);
    expect(await stangAtgard(klient, 'id', '  ')).toBe('Skriv vad som gjordes.');
    expect(anrop.tabell).toBeUndefined();
  });
  it('bara en öppen åtgärd ändras', async () => {
    const { klient, anrop } = sb([{ status: 'klar' }]);
    expect(await stangAtgard(klient, 'id', ' Bytte knapp ')).toBeNull();
    expect(anrop.eq).toEqual([['id', 'id'], ['status', 'oppen']]);
    expect(anrop.update).toMatchObject({ status: 'klar', vad_gjordes: 'Bytte knapp' });
  });
  it('noll rader = redan stängd eller får inte', async () => {
    const { klient } = sb([]);
    expect(await stangAtgard(klient, 'id', 'x')).toContain('redan stängd');
  });
  it('fel = försök igen', async () => {
    const { klient } = sb(null, { message: 'x' });
    expect(await stangAtgard(klient, 'id', 'x')).toBe('Kunde inte spara. Försök igen.');
  });
});
