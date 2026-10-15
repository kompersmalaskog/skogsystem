import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tabell from './__fixtures__/fakturerbar_tabell.json';
import { beraknaFakturerbar } from './fakturerbar';

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
