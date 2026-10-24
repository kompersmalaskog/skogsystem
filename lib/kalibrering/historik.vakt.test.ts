import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Justeringskolumnerna i fakt_kalibrering_historik får bara läsas på ETT ställe (lib/kalibrering/historik.ts), så att en
 * omkalibrering efter reparation (R64428:s 56) aldrig visas som "+56 mm". Typen (typer.ts) och testerna får nämna dem.
 */
const ROT = join(__dirname, '../..');
const KOLUMNER = /\b(dia_justering_mm|langd_justering_mm|langd_justering_rot_mm)\b/;
const TILLATNA = new Set([
  'lib/kalibrering/historik.ts',
  'lib/kalibrering/historik.test.ts',
  'lib/kalibrering/historik.vakt.test.ts',
  'lib/kalibrering/typer.ts',
]);

function filer(dir: string, ut: string[] = []): string[] {
  for (const namn of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'docs', 'supabase', 'scripts'].includes(namn)) continue;
    const full = join(dir, namn);
    if (statSync(full).isDirectory()) filer(full, ut);
    else if (/\.(ts|tsx)$/.test(namn)) ut.push(full);
  }
  return ut;
}

describe('justeringskolumnerna läses bara via lib/kalibrering/historik', () => {
  it('ingen annan källfil nämner dem', () => {
    const traffar = ['app', 'components', 'lib']
      .flatMap((d) => filer(join(ROT, d)))
      .map((f) => relative(ROT, f).replace(/\\/g, '/'))
      .filter((f) => !TILLATNA.has(f))
      .filter((f) => KOLUMNER.test(readFileSync(join(ROT, f), 'utf8')));
    expect(traffar).toEqual([]);
  });

  it('reparationsmarkören (hamtaMarkorer, delad av diagnos och bedomning) tar regeln ur arOmkalibrering, inte ur en egen regex', () => {
    const src = readFileSync(join(ROT, 'lib/kalibrering/markorer.server.ts'), 'utf8');
    expect(src).toContain('arOmkalibrering(');
    expect(src).not.toMatch(/\/repair\/i/);
  });
});
