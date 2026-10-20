// Vakt: egenkontrollen har ingen flikrad (Hem, Översikt, Planering, Objekt, Mer). Listan går ut via hemknappen i toppfältet (TopBar),
// rundvyn via pilen i KartHuvud till listan. Flikraden är undantaget i appen (bara Gallring, Ekonomi och två vyer med egna bottenfält),
// och rundvyns ark äger botten — se STATUS.md. Kommer en flikrad tillbaka här ska det vara ett beslut, inte en slump.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROT = join(__dirname, '..', '..');
const EK = join(ROT, 'app', 'egenkontroll');

function kallfiler(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return kallfiler(f);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [f] : [];
  });
}

describe('egenkontrollen har ingen flikrad', () => {
  it('ingen fil under app/egenkontroll importerar eller ritar BottomNav', () => {
    const filer = kallfiler(EK);
    expect(filer.length).toBeGreaterThan(5);
    const traffar = filer.filter((f) => /BottomNav/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROT.length + 1));
    expect(traffar).toEqual([]);
  });

  it('listans bottenluft räknas ur safe-area (medSafeBotten), inte ur en flikrads höjd', () => {
    const kod = readFileSync(join(EK, 'ListDelar.tsx'), 'utf8');
    expect(kod).toMatch(/BOTTEN_LUFT\s*=\s*medSafeBotten\(AVSTAND\.xl\)/);
    expect(kod).not.toMatch(/AVSTAND\.xxl\s*\*\s*4/);
  });
});
