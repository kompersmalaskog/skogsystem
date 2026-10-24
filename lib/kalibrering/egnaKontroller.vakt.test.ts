import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * En kontroll är en HQC-fil med minst en EGEN stock. En fil vars stockar alla redan låg i en tidigare ackumulerande fil är en
 * omexport (efter rensningen på fysisk identitet 59 av 333) — raden finns kvar i fakt_kalibrering, men Kontroller och kalendern
 * läser kontrollerna ur kalibrering_kontroller() (migration 20261024180041), aldrig ur tabellen.
 *
 * Läsare som INTE listar kontroller (de börjar i stockarna och slår bara upp trädslag/objekt per filnamn) får fortsätta läsa tabellen.
 */
const ROT = join(__dirname, '../..');
const FUNKTION = /rpc\(\s*['"]kalibrering_kontroller['"]\s*\)/;
const TABELL = /from\(\s*['"]fakt_kalibrering['"]\s*\)/;

/** Listar eller räknar kontroller för vyn: ska gå genom funktionen. */
const LISTAR = ['lib/hooks/useKalibreringData.ts', 'app/api/kalibrering/kalender/route.ts'];
/** Slår bara upp trädslag/objekt/aktuell fil per filnamn — får läsa tabellen. */
const UPPSLAG = new Set([
  'app/api/kalibrering/tradslag/route.ts',
  'app/api/kalibrering/grovlek/route.ts',
  'app/api/kalibrering/objekt/route.ts',
  'app/api/kalibrering/kontroll/route.ts',
]);

function filer(dir: string, ut: string[] = []): string[] {
  for (const namn of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'docs', 'supabase', 'scripts'].includes(namn)) continue;
    const full = join(dir, namn);
    if (statSync(full).isDirectory()) filer(full, ut);
    else if (/\.(ts|tsx)$/.test(namn) && !/\.test\.tsx?$/.test(namn)) ut.push(full);
  }
  return ut;
}
const las = (f: string) => readFileSync(join(ROT, f), 'utf8');

describe('Kontroller och kalendern läser bara kontroller med en egen stock', () => {
  it.each(LISTAR)('%s läser kalibrering_kontroller() och inte fakt_kalibrering direkt', (f) => {
    const src = las(f);
    expect(src).toMatch(FUNKTION);
    expect(src).not.toMatch(TABELL);
  });

  it('ingen annan källfil läser fakt_kalibrering utan att vara ett uppslag per filnamn', () => {
    const traffar = ['app', 'components', 'lib']
      .flatMap((d) => filer(join(ROT, d)))
      .map((f) => relative(ROT, f).replace(/\\/g, '/'))
      .filter((f) => !UPPSLAG.has(f))
      .filter((f) => TABELL.test(las(f)));
    expect(traffar).toEqual([]);
  });

  it('funktionen kräver en stock med samma filnamn OCH samma maskin, och följer tabellens kolumner', () => {
    const namn = readdirSync(join(ROT, 'supabase/migrations')).find((n) => n.endsWith('kalibrering_kontroller_funktion.sql'));
    expect(namn).toBeTruthy();
    const sql = readFileSync(join(ROT, 'supabase/migrations', namn!), 'utf8').replace(/--[^\n]*/g, '');
    const kompakt = sql.replace(/\s+/g, ' ');
    expect(kompakt).toContain('RETURNS SETOF fakt_kalibrering');
    expect(kompakt).toContain('WHERE EXISTS');
    expect(kompakt).toContain('s.filnamn = k.filnamn');
    expect(kompakt).toContain('s.maskin_id = k.maskin_id');
    expect(kompakt).not.toMatch(/DELETE|DROP|UPDATE/i); // raden raderas aldrig, bara döljs
  });
});
