// Steg 3: förarflödet /maskinflytt är ersatt av "Hämta en maskin" i Lastbilen. Adressen omdirigeras (308), startsidan har bara kortet
// Lastbilen, och flyttplatserna (/maskinflytt/platser) lever kvar. Vakten kontrollerar att ingen levande kod pekar på den gamla adressen.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import nextConfig from '../../next.config.js';
import { VYER } from '@/lib/vyer';

const ROT = join(__dirname, '..', '..');

function kallfiler(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'docs', 'scripts', 'supabase'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) kallfiler(p, ut);
    else if (/\.(ts|tsx|js|mjs)$/.test(n)) ut.push(p);
  }
  return ut;
}

describe('/maskinflytt är ersatt av Hämta en maskin i Lastbilen', () => {
  it('adressen omdirigeras permanent (308) till /lastbil — och bara den exakta adressen', async () => {
    const r = await (nextConfig as any).redirects();
    expect(r).toContainEqual({ source: '/maskinflytt', destination: '/lastbil', permanent: true });
    expect(r.filter((x: any) => String(x.source).startsWith('/maskinflytt'))).toHaveLength(1);
  });

  it('förarflödet är riven: ingen sida, ingen klient', () => {
    expect(existsSync(join(ROT, 'app', 'maskinflytt', 'page.tsx'))).toBe(false);
    expect(existsSync(join(ROT, 'app', 'maskinflytt', 'MaskinflyttClient.tsx'))).toBe(false);
  });

  it('flyttplatserna lever kvar och leder tillbaka till Lastbilen', () => {
    expect(existsSync(join(ROT, 'app', 'maskinflytt', 'platser', 'page.tsx'))).toBe(true);
    expect(readFileSync(join(ROT, 'app', 'maskinflytt', 'platser', 'PlatserClient.tsx'), 'utf8')).toContain('href="/lastbil"');
  });

  it('startsidan har bara kortet Lastbilen: varken Maskinflytt-kort, vyregistrering eller favorit', () => {
    expect(VYER.some(v => v.href.startsWith('/maskinflytt'))).toBe(false);
    expect(VYER.map(v => v.id)).not.toContain('maskinflytt');
    expect(VYER.map(v => v.id)).toContain('lastbilen');
    expect(readFileSync(join(ROT, 'app', 'HomeClient.tsx'), 'utf8')).not.toMatch(/href: '\/maskinflytt'/);
  });

  it('ingen kod länkar till /maskinflytt (utom /maskinflytt/platser, /maskinflytt/sammanstallning och testerna som kontrollerar att adressen saknas)', () => {
    const undantag = ['maskinflytt.borta.test.ts', 'flyttloggen.borta.test.ts', 'lastbil.render.test.tsx', 'appStart.test.ts', 'next.config.js'];
    const traffar = kallfiler(ROT)
      .filter(f => !undantag.some(u => f.endsWith(u)))
      .filter(f => /['"`]\/maskinflytt(?![/\w-])/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(ROT.length + 1));
    expect(traffar).toEqual([]);
  });
});
