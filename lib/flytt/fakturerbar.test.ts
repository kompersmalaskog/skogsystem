import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tabell from './__fixtures__/fakturerbar_tabell.json';
import { beraknaFakturerbar, underlagKonsekvens, type UnderlagLage } from './fakturerbar';

const migration = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261015170000_ratta_flytt.sql'), 'utf8');

describe('fakturerbar-regeln: EN testtabell för TS och SQL', () => {
  it.each(tabell.map(r => [r.typ, r.km, r.forvantat] as const))('%s, %s km → %s', (typ, km, forvantat) => {
    expect(beraknaFakturerbar(typ, km)).toBe(forvantat);
  });

  it('migrationens kvitto kör EXAKT samma tabell mot fakturerbar_for() (annars kan de två glida isär)', () => {
    const sql = migration.replace(/\s+/g, ' ');
    for (const r of tabell) {
      const km = r.km === null ? 'null::numeric' : `${r.km}::numeric`;
      expect(sql, JSON.stringify(r)).toMatch(new RegExp(`\\('${r.typ}', ${km.replace(/\./g, '\\.')}, ${r.forvantat}\\)`));
    }
    // ...och SQL-funktionen innehåller samma tre regler och samma gräns som TS.
    expect(sql).toMatch(/when 'produktion' then coalesce\(p_km, 0\) >= 30/);
    expect(sql).toMatch(/when 'kunduppdrag' then true/);
  });
});

describe('underlagKonsekvens — samma fall som ratta_flytt (provade i Postgres)', () => {
  const U = (o: Partial<UnderlagLage> = {}): UnderlagLage => ({ status: 'aktiv', godkand: false, fakturerad: false, strukenAvRattning: false, strykAnledning: null, ...o });

  it('inte fakturerbar → inte fakturerbar: inget ändras', () => {
    expect(underlagKonsekvens({ km: 10 }, 'service', null, true)).toMatchObject({ atgard: 'ingen', blockerar: false });
  });
  it('inte fakturerbar → fakturerbar: underlag skapas under Att godkänna', () => {
    expect(underlagKonsekvens({ km: 10 }, 'kunduppdrag', null, false)).toMatchObject({ atgard: 'skapas', blockerar: false });
    expect(underlagKonsekvens({ km: 53 }, 'produktion', null, false)).toMatchObject({ atgard: 'skapas' });
    expect(underlagKonsekvens({ km: 20 }, 'produktion', null, false)).toMatchObject({ atgard: 'ingen' });   // 20 km produktion är aldrig fakturerbart
  });
  it('fakturerbar → inte fakturerbar med ogodkänt underlag: underlaget stryks märkt', () => {
    const k = underlagKonsekvens({ km: 53 }, 'service', U(), false);
    expect(k).toMatchObject({ atgard: 'stryks', blockerar: false });
    expect(k.text).toContain('stryks');
  });
  it('...och tillbaka: återställs bara om den HÄR rättningen strök underlaget — annars vägras det', () => {
    expect(underlagKonsekvens({ km: 53 }, 'produktion', U({ status: 'struken', strukenAvRattning: true }), false)).toMatchObject({ atgard: 'aterstalls', blockerar: false });
    const v = underlagKonsekvens({ km: 53 }, 'produktion', U({ status: 'struken', strykAnledning: 'dubblett' }), false);
    expect(v).toMatchObject({ atgard: 'vagras', blockerar: true });
    expect(v.text).toContain('(dubblett)');
  });
  it('fakturerbar → fakturerbar: underlagets kopior följer med, eller inget alls', () => {
    expect(underlagKonsekvens({ km: 53 }, 'produktion', U(), true)).toMatchObject({ atgard: 'foljer' });
    expect(underlagKonsekvens({ km: 53 }, 'produktion', U(), false)).toMatchObject({ atgard: 'ingen' });
  });
  it('godkänd och fakturerad är LÅST, och blockerar', () => {
    expect(underlagKonsekvens({ km: 53 }, 'service', U({ godkand: true }), true)).toMatchObject({ atgard: 'last', blockerar: true });
    expect(underlagKonsekvens({ km: 53 }, 'service', U({ godkand: true, fakturerad: true }), true).text).toContain('fakturerad');
  });
});
