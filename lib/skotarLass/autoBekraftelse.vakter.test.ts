// Vakt: ingenting får längre bekräfta ett lass "av sig självt" (bekraftad_av = 'auto'). Martin 2026-10-20: appen vet att maskinen lossar, aldrig VAD —
// bara föraren (Stämmer/Klar) eller en planerare (granskningen) säger ja. 'auto' finns kvar som värde att LÄSA (de gamla lassen), aldrig att skriva.
// Hittar den här testen en skrivning ska den tas bort, inte undantas.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rot = join(__dirname, '..', '..');
function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) filer(p, ut); else ut.push(p);
  }
  return ut;
}
const kalla = ['lib', 'components', 'app', 'scripts'].flatMap((d) => filer(join(rot, d))).filter((f) => /\.(ts|tsx|mjs|py)$/.test(f) && !/\.(test|vakter\.test)\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
const kodUtanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Ett värde som SKRIVS: efter 'auto' kommer ett slut (komma, semikolon, parentes, klammer, radslut) — inte `|` som i en typ, inte `===` som i en jämförelse.
const SKRIVER_AUTO = [
  /\bbekraftadAv\s*[:=]\s*'auto'\s*(?:[,;)}\]]|$)/m,
  /\bbekraftad_av\s*[:=]\s*'auto'\s*(?:[,;)}\]]|$)/m,
  /\bbekraftad_av\s*:\s*"auto"/,
  /\bbekrafta\(\s*[^)]*['"]auto['"]/,
  /\bav\s*:\s*'auto'\s*[,)]/,
];

describe('ingen självbekräftelse (bekraftad_av = auto)', () => {
  it('ingen kodfil skriver auto: varken som objektvärde, tilldelning, payload eller argument till bekrafta()', () => {
    expect(kalla.length).toBeGreaterThan(200);
    for (const f of kalla) {
      const k = kodUtanKommentarer(readFileSync(f, 'utf8'));
      for (const re of SKRIVER_AUTO) expect(k, `${relative(rot, f)} ${re}`).not.toMatch(re);
    }
  });
  it('vakten fångar det den ska (mutantkontroll av själva mönstren)', () => {
    const fel = [
      "const x = { ...l, bekraftadAv: 'auto', status: 'bekraftat' };", "l.bekraftadAv = 'auto';", "bekraftad_av: 'auto',", "bekrafta(l, 'auto', nu)",
      "function bekrafta(l: Lass, av: 'auto', nu: number)", "{ bekraftad_av: \"auto\" }", "rad.bekraftad_av = 'auto'\n",
    ];
    for (const s of fel) expect(SKRIVER_AUTO.some((re) => re.test(s)), s).toBe(true);
    const ok = [
      "bekraftadAv: 'auto' | 'forare' | 'planerare' | null;", "if (l.bekraftadAv === 'auto') return;", "l.bekraftadAv !== 'auto'",
      "r.bekraftad_av === 'auto' || r.bekraftad_av === 'forare'", "export function bekrafta(l: Lass, av: 'forare', nu: number): Lass {",
    ];
    for (const s of ok) expect(SKRIVER_AUTO.some((re) => re.test(s)), s).toBe(false);
  });
  it('typen: bekrafta() tar bara forare, och bara den kan sätta bekraftadAv i appen', () => {
    const modell = readFileSync(join(rot, 'lib/skotarLass/lassModell.ts'), 'utf8');
    expect(modell).toMatch(/export function bekrafta\(l: Lass, av: 'forare', nu: number\): Lass/);
    expect(modell).toMatch(/if \(av !== 'forare' \|\| !kanBekrafta\(l\)\) return l;/);
    // Den enda raden i appen som skriver bekraftadAv med ett värde är bekrafta() själv.
    const skriv = kalla.filter((f) => /\bbekraftadAv\s*:\s*(?!null\b)[a-zA-Z'"]/.test(kodUtanKommentarer(readFileSync(f, 'utf8'))) && !f.endsWith('typer.ts')).map((f) => relative(rot, f)).sort();
    expect(skriv).toEqual(['lib/skotarLass/lassModell.ts', 'lib/skotarLass/server.ts']);   // bekrafta(), och läsningen från databasen
  });
  it('databasen: ingen migration sätter bekraftad_av till auto; triggern gör ett nytt auto till ett lass som väntar på föraren', () => {
    const dir = join(rot, 'supabase/migrations');
    const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => kodUtanKommentarer(readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '')));
    for (const s of sql) {
      expect(s).not.toMatch(/\bupdate\s+skotar_lass\s+set\b[^;]*\bbekraftad_av\s*=\s*'auto'/i);
      expect(s).not.toMatch(/\bbekraftad_av\s*:=\s*'auto'/i);
    }
    const g = readFileSync(join(dir, '20261024120000_skotar_lass_granskning.sql'), 'utf8');
    expect(g).toMatch(/create or replace trigger skotar_lass_ingen_auto before insert or update on skotar_lass/);
    expect(g).toMatch(/new\.bekraftad_av := null;/);
    expect(g).toMatch(/check \(bekraftad_av in \('auto', 'forare', 'planerare'\)\)/);
  });
});
