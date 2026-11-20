import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAS_STEG, STEG, behoverDigText, introLage, kvittera, lageText } from './introduktion';

const fylld = { telefon: '070-1', anhorig_telefon: '070-2' };
const alla = LAS_STEG.map((steg, i) => ({ steg, tid: `2026-11-0${i + 1}T08:00:00Z` }));

describe('introduktionen', () => {
  it('fem steg: uppgifterna först, sedan de fyra man läser', () => {
    expect(STEG.map(s => s.id)).toEqual(['uppgifter', ...LAS_STEG]);
  });

  it('uppgifterna är klara bara när både telefon och anhörig finns', () => {
    expect(introLage(fylld, []).klar.uppgifter).toBe(true);
    expect(introLage({ telefon: '070-1', anhorig_telefon: '  ' }, []).klar.uppgifter).toBeNull();
    expect(introLage({ telefon: null, anhorig_telefon: '070-2' }, []).klar.uppgifter).toBeNull();
  });

  it('klar = alla fem; dagen är när det SISTA steget lästes', () => {
    const l = introLage(fylld, alla);
    expect(l.antalKlara).toBe(5);
    expect(l.klarTid).toBe('2026-11-04T08:00:00Z');
    expect(lageText(l)).toBe('Klar 4 nov');
    expect(behoverDigText(l)).toBeNull();
  });

  it('ett steg kvar är inte klart, och raden på startsidan säger hur långt man kommit', () => {
    const l = introLage({ telefon: null, anhorig_telefon: null }, alla);
    expect(l.klarTid).toBeNull();
    expect(lageText(l)).toBe('4 av 5 klart');
    expect(behoverDigText(l)).toBe('Gör introduktionen · 4 av 5 klart');
    expect(behoverDigText(null)).toBeNull();
  });

  it('kvittera: redan läst (23505) räknas som lyckat, annat fel inte', async () => {
    const sb = (error: unknown) => ({ from: () => ({ insert: async () => ({ error }) }) }) as never;
    expect(await kvittera(sb(null), 'm', 'nod')).toBe(true);
    expect(await kvittera(sb({ code: '23505' }), 'm', 'nod')).toBe(true);
    expect(await kvittera(sb({ code: '42501' }), 'm', 'nod')).toBe(false);
  });

  it('databasens steg är exakt de fyra man läser (migrationens CHECK)', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261102144524_am_introduktion.sql'), 'utf8');
    const m = sql.match(/steg in \(([^)]+)\)/);
    expect(m![1].split(',').map(x => x.trim().replace(/'/g, ''))).toEqual(LAS_STEG);
  });
});
