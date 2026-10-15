// Steg 4: Flyttloggen är riven och ersatt av Lastbilen. Två saker får aldrig glida tillbaka:
//  1. den gamla adressen leder till Lastbilens Körningar (bokmärken, gamla länkar, notiser), inte till en 404;
//  2. ingen kod länkar längre till den gamla adressen (utom själva omdirigeringen).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

import SammanstallningPage from '../maskinflytt/sammanstallning/page';

const ROT = join(__dirname, '..', '..');
const GAMMAL = '/maskinflytt/sammanstallning';

function kallfiler(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'docs', 'scripts', 'supabase', 'public'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) kallfiler(p, ut);
    else if (/\.(ts|tsx)$/.test(n)) ut.push(p);
  }
  return ut;
}

describe('Flyttloggen är riven (steg 4)', () => {
  beforeEach(() => redirect.mockClear());

  it('den gamla adressen omdirigeras till Lastbilens Körningar', () => {
    SammanstallningPage();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/lastbil?flik=korningar');
  });

  it('ingen kod länkar till den gamla adressen — utom testerna som kontrollerar att den saknas', () => {
    // Renderingstestet nämner adressen bara för att kontrollera att länken saknas.
    const undantag = ['flyttloggen.borta.test.ts', 'lastbil.render.test.tsx'];
    const traffar = kallfiler(ROT)
      .filter(f => !undantag.some(u => f.endsWith(u)))
      .filter(f => readFileSync(f, 'utf8').includes(GAMMAL))
      .map(f => f.slice(ROT.length + 1));
    expect(traffar).toEqual([]);
  });

  it('hemskärmen har inget Flyttlogg-kort, men Lastbilen och Maskinflytt finns kvar', () => {
    const hem = readFileSync(join(ROT, 'app', 'HomeClient.tsx'), 'utf8');
    expect(hem).not.toMatch(/label: 'Flyttlogg'/);
    expect(hem).toContain("href: '/lastbil'");
    expect(hem).toContain("href: '/maskinflytt'");
  });

  it('den döda vyn är borta', () => {
    expect(() => readFileSync(join(ROT, 'app', 'maskinflytt', 'sammanstallning', 'SammanstallningClient.tsx'))).toThrow();
  });
});
