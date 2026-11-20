import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { byggVaktKlient, hamtaOvertradelser, kontrolleraEfterTest, nollstall } from './supabaseVakt';

const rot = path.resolve(__dirname, '../..');

describe('vakten: klienten som ersätter lib/supabase', () => {
  it('varje användning registreras och kastar när den anropas', () => {
    const k = byggVaktKlient() as Record<string, (...a: unknown[]) => unknown>;
    try {
      expect(() => k.from('objekt')).toThrow(/RIKTIGA Supabase-klienten \(supabase\.from\)/);
      k.auth;
      expect(hamtaOvertradelser().map((o) => o.egenskap)).toEqual(['from', 'auth']);
      expect(hamtaOvertradelser()[0].var).toContain('supabaseVakt.test.ts');   // var i koden …
      expect(hamtaOvertradelser()[0].var).not.toMatch(/supabaseVakt\.ts/);    // … inte vaktens egen fil
    } finally { nollstall(); }
  });

  it('inspektion, await och symboler är ingen användning', () => {
    const k = byggVaktKlient() as Record<string | symbol, unknown>;
    try {
      void k.then; void k.toJSON; void k.asymmetricMatch; void k[Symbol.toPrimitive]; void k.constructor;
      expect(hamtaOvertradelser()).toHaveLength(0);
    } finally { nollstall(); }
  });

  it('efter ett test: har klienten använts kastas det EN gång och nästa test börjar rent', () => {
    const k = byggVaktKlient() as Record<string, unknown>;
    void k.rpc;
    expect(() => kontrolleraEfterTest()).toThrow(/nådde den RIKTIGA Supabase-klienten 1 gång[\s\S]*supabase\.rpc/);
    expect(hamtaOvertradelser()).toHaveLength(0);
    expect(() => kontrolleraEfterTest()).not.toThrow();
  });

  it('är klienten inte använd kastas inget', () => {
    byggVaktKlient();
    expect(() => kontrolleraEfterTest()).not.toThrow();
  });
});

describe('vakten är inkopplad i sviten', () => {
  it('vitest.config.ts kör vitest.setup.ts före varje testfil, och den filen byter lib/supabase och kontrollerar efter varje test', () => {
    expect(readFileSync(path.join(rot, 'vitest.config.ts'), 'utf8')).toMatch(/setupFiles:\s*\[\s*'\.\/vitest\.setup\.ts'\s*\]/);
    const setup = readFileSync(path.join(rot, 'vitest.setup.ts'), 'utf8');
    expect(setup).toMatch(/vi\.mock\('@\/lib\/supabase'/);
    expect(setup).toMatch(/afterEach\(\(\) => kontrolleraEfterTest\(\)\)/);
  });

  // Beviset att den FÄLLER: ett test som når klienten och fångar felet (som appkoden gör) faller ändå — i en riktig underkörning med samma setup.
  it('ett test som når klienten faller, också när det fångar felet; ett som inte gör det går grönt', () => {
    const r = spawnSync('npx', ['vitest', 'run', '--config', 'lib/testStod/__fixtures__/vitest.vakt.config.ts'], { cwd: rot, encoding: 'utf8', timeout: 90_000, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
    const ut = (r.stdout ?? '') + (r.stderr ?? '');
    expect(r.status, ut).toBe(1);
    expect(ut).toMatch(/nådde den RIKTIGA Supabase-klienten 1 gång/);
    expect(ut).toMatch(/supabase\.from/);
    expect(ut).toMatch(/Tests\s+1 failed \| 1 passed \(2\)/);
  }, 120_000);
});
