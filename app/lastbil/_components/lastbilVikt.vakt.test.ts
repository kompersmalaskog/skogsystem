import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LASS } from '@/lib/lastbil/lass/detektera';

// SQL-funktionen lastbil_vikt_manad och lassdetekteringen måste dela gräns för "lastad". Funktionen testas i riktig Postgres
// (supabase/tests/lastbil_vikt_manad.sql); här vaktas att gränsen i migrationen är LASS.LASTAD_KG och att behörigheten är som avsett.
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261020120000_lastbil_vikt_manad.sql'), 'utf8');

describe('lastbil_vikt_manad (migration 20261020120000)', () => {
  it('lastad-gränsen i SQL är samma som lassdetekteringens (LASS.LASTAD_KG)', () => {
    const grans = Array.from(SQL.matchAll(/vikt[01] >= (\d+)/g)).map(m => Number(m[1]));
    expect(grans).toEqual([LASS.LASTAD_KG, LASS.LASTAD_KG]);
    expect(Array.from(SQL.matchAll(/vikt[01] > 0 then/g))).toHaveLength(2);     // 0 = okänd vikt
  });
  it('security definer med fast search_path; inloggade får köra, anon och public inte', () => {
    expect(SQL).toMatch(/security definer/);
    expect(SQL).toMatch(/set search_path = public, pg_temp/);
    expect(SQL).toMatch(/revoke all on function public\.lastbil_vikt_manad\(integer\) from public;/);
    expect(SQL).toMatch(/revoke all on function public\.lastbil_vikt_manad\(integer\) from anon;/);
    expect(SQL).toMatch(/grant execute on function public\.lastbil_vikt_manad\(integer\) to authenticated;/);
  });
  it('månaden är svensk tid och segmentet börjar där (lag), mätaren ska ha ökat', () => {
    expect(SQL).toMatch(/at time zone 'Europe\/Stockholm'/);
    expect(SQL).toMatch(/d_m > 0 and fran_tid is not null/);
  });
  it('skriver ingenting (ingen insert/update/delete/drop)', () => {
    const utanKommentarer = SQL.replace(/--.*$/gm, '');
    expect(utanKommentarer).not.toMatch(/\b(insert|update|delete|drop|truncate|alter)\b/i);
  });
});
