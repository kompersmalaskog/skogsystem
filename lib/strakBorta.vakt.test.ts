// lib/strak.ts (stråkbyggaren: skelettering av alla dagar → stumpar och GPS-hopp som förstorade rutnätet) är borttagen 2026-11-23. Körspåren ritas överallt av
// lib/korspar (en rensad linje per dag). Vakten: ingen källfil importerar den, och filen kommer inte tillbaka.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function filer(dir: string, ut: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git' || e.name === '__fixtures__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filer(p, ut); else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) ut.push(p);
  }
  return ut;
}

describe('lib/strak är borta', () => {
  it('filen finns inte och ingen källfil importerar den', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'lib/strak.ts'))).toBe(false);
    const dar = filer(process.cwd()).filter((f) => !f.endsWith('strakBorta.vakt.test.ts'))
      .filter((f) => /from\s+['"][^'"]*\/strak['"]|from\s+['"]\.\/strak['"]|require\(['"][^'"]*\/strak['"]\)/.test(fs.readFileSync(f, 'utf8')));
    expect(dar).toEqual([]);
  });
});
