// Källvakter för kartans origo i egenkontrollen. Det värsta som kan hända i den här koden är en felrad som flyttar punkter flera mil
// (#278, #322) — vakterna håller fast att det finns EN regel (objektStartKamera, samma som planeringen), att ingen kopia smyger tillbaka, och att
// ingen "löser" blindheten genom att skriva kartbild_bounds. Beteendet testas i egenkontrollOrigo.test.ts; här läses bara källtexten.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const ROT = join(__dirname, '..');
const las = (...delar: string[]) => readFileSync(join(ROT, ...delar), 'utf8');

function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === '.git') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) filer(p, ut);
    else ut.push(p);
  }
  return ut;
}

const rel = (p: string) => relative(ROT, p).split('\\').join('/');
const arTest = (p: string) => /\.test\.(ts|tsx)$/.test(p) || p.includes('/__fixtures__/');

describe('egenkontrollen har ingen egen origoregel', () => {
  const egenkontrollKalla = [
    ...filer(join(ROT, 'app', 'egenkontroll')),
    ...filer(join(ROT, 'lib')).filter((p) => /lib\/egenkontroll[^/]*\.tsx?$/.test(rel(p))),
  ].filter((p) => /\.tsx?$/.test(p) && !arTest(p));

  it('ingen egenkontrollfil importerar kartOrigoFranBounds eller kartOrigoMedFallback (bara /matning har kvar den bounds-only-regeln)', () => {
    expect(egenkontrollKalla.length).toBeGreaterThan(8);
    for (const p of egenkontrollKalla) {
      const t = readFileSync(p, 'utf8');
      // Kommentarer får nämna dem; en import eller ett anrop får det inte.
      const utanKommentar = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(utanKommentar, rel(p)).not.toMatch(/\bkartOrigoFranBounds\b|\bkartOrigoMedFallback\b/);
    }
  });

  it('origot räknas ur objektStartKamera i EN fil och är ingen literal: ingen `zoom: 15` eller `zoom: 16` i egenkontrollOrigo.ts', () => {
    const t = las('lib', 'egenkontrollOrigo.ts');
    expect(t).toContain("import { objektStartKamera, traktGrans, type Gran } from './objektFlyg';");
    expect(t).toContain('objektStartKamera(objekt)');
    const utanKommentar = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(utanKommentar).not.toMatch(/zoom:\s*1[56]\b/);
  });

  it('RundKarta tar origo som OBLIGATORISK prop och räknar inget eget (en ny rad som räknar ett origo här är felet som flyttade punkter)', () => {
    const t = las('app', 'egenkontroll', 'RundKarta.tsx');
    expect(t).toMatch(/\n  origo: Origo \| null;\n/);
    expect(t).not.toMatch(/\bconst origo\w*\b/);
    expect(t).not.toMatch(/\bkartOrigo/);
    expect(t).not.toMatch(/lat:\s*objekt\.lat/);   // ett eget origo ur objektets koordinat
    expect(t).toContain("import type { Origo } from '@/lib/kartkoordinater';");
  });

  it('GaTillYta skickar sidans origo vidare, aldrig ett eget', () => {
    const t = las('app', 'egenkontroll', 'GaTillYta.tsx');
    expect(t).toContain('origo={origo}');
    expect(t).toContain('origoText={origoText}');
    expect(t).not.toMatch(/\bconst origo\b/);
  });

  it('sidan beslutar origot med beslutaOrigo — med kontext, kontrollpunkternas snapshots och Vidas traktgräns — och väntar på underlaget', () => {
    const t = las('app', 'egenkontroll', '[objektId]', 'page.tsx');
    expect(t).toContain('beslutaOrigo({');
    expect(t).toContain('snapshotPunkter(vy?.punkter ?? [])');
    expect(t).toContain('markeringsPunkter(kontext)');
    expect(t).toContain('markeringsGranser(kontext)');
    expect(t).toContain("kontextStatus === 'laddar' ? { typ: 'laddar' }");
    expect(t).toContain("kontextStatus === 'fel' ? { typ: 'fel'");
    expect(t).toContain('hamtaVidaGrans(objektId)');
    // Startvalet fryser första gången: vyn måste vänta på beslutet, annars öppnas en runda utan bounds i listan för alltid.
    expect(t).toContain("const origoVantar = !!vy?.egenkontroll && !origoBeslut.ok && origoBeslut.skal === 'laddar';");
    expect(t).toContain('const laddar = laddarRunda || origoVantar;');
    expect(t).not.toMatch(/\bkartOrigoFranBounds\b/);
  });

  it('provytorna lottas bara med ett origo som beslutaOrigo godkänt, och ett läsfel kastas (lottas en enda gång)', () => {
    const t = las('lib', 'egenkontroll.ts');
    const a = t.indexOf('async function skapaProvytor(');
    const b = t.indexOf('\n}\n', a);
    const f = t.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(f).toContain('const vida = await lasVidaGrans(klient, objektId);');
    expect(f).toContain("if (vida.typ === 'fel') throw new Error(");
    expect(f).toContain('const beslut = beslutaOrigo({ objekt, punkter: markeringsPunkter(data ?? []), granser: paths, vida });');
    expect(f).toContain('if (!beslut.ok) return 0;');
    expect(f).toContain('lottaProvytor(paths, beslut.origo, antal, stammar)');
    expect(f.indexOf('beslutaOrigo(')).toBeLessThan(f.indexOf('lottaProvytor('));
    expect(f).not.toContain('objektStartKamera');
    expect(f).not.toMatch(/\bkartOrigo/);
  });
});

describe('kartbild_bounds skrivs aldrig för att "lösa" objekt som saknar dem', () => {
  // Varje icke-testfil som nämner kartbild_bounds. En NY fil i listan fäller testet: granska att den INTE skriver kartbild_bounds
  // (inte heller härlett ur traktgränsen — det flyttar varje befintlig markering, zoom 15 mot 16; se lib/egenkontrollOrigo.ts) och lägg
  // sedan till den här. Enda skrivaren är zip-grenen i app/api/import-trakt/route.ts (en georefererad JPG).
  const TILLATNA = [
    'app/api/import-trakt/route.ts',
    'app/egenkontroll/RundKarta.tsx',
    'app/egenkontroll/[objektId]/page.tsx',
    'app/oversikt/SkordarKarta.tsx',
    'app/planering/KartaVy.tsx',
    'app/planering/page.tsx',
    'lib/egenkontroll.ts',
    'lib/egenkontrollOrigo.ts',
    'lib/objektoversikt/lasKarta.ts',   // Objektöversiktens karta: läser bara kartbild_bounds (select) och ger det till beslutaOrigo — skriver aldrig
    'lib/besok/server.ts',   // läser bara kartbild_bounds (select) och ger det till beslutaOrigo — skriver aldrig
    'lib/kartkoordinater.ts',
    'lib/matning/punkter.ts',
    'lib/objektFlyg.ts',
    'lib/provytor.ts',
    'lib/trakt/befintligt.ts',
    'lib/trakt/kartbildVarning.ts',
  ];

  it('inga andra filer (app, components, lib, scripts, supabase) nämner kartbild_bounds än de granskade', () => {
    const traffar = ['app', 'components', 'lib', 'scripts', 'supabase']
      .flatMap((d) => (statSync(join(ROT, d), { throwIfNoEntry: false }) ? filer(join(ROT, d)) : []))
      .filter((p) => /\.(tsx?|py|sql|mjs|js)$/.test(p) && !arTest(p))
      .filter((p) => readFileSync(p, 'utf8').includes('kartbild_bounds'))
      .map(rel)
      .sort();
    expect(traffar).toEqual([...TILLATNA].sort());
  });

  it('import-trakt tilldelar kartbild_bounds på ett enda ställe, ur JGW', () => {
    const t = las('app', 'api', 'import-trakt', 'route.ts');
    expect((t.match(/kartbild_bounds\s*=\s/g) ?? []).length).toBe(1);
    expect(t).toContain('SKRIV ALDRIG kartbild_bounds HÄRLEDDA ur traktgränsen');
  });

  it('inget skript eller ingen migration skriver kartbild_bounds (update/insert/set)', () => {
    const kallor = ['scripts', 'supabase']
      .flatMap((d) => (statSync(join(ROT, d), { throwIfNoEntry: false }) ? filer(join(ROT, d)) : []))
      .filter((p) => /\.(py|sql|mjs|js|ts)$/.test(p) && !arTest(p));
    for (const p of kallor) {
      const t = readFileSync(p, 'utf8');
      expect(t, rel(p)).not.toMatch(/kartbild_bounds\s*=|set\s+kartbild_bounds|['"]kartbild_bounds['"]\s*:/i);
    }
  });

  it('kartkoordinater.ts och egenkontrollOrigo.ts har förklaringen kvar (varför bounds aldrig skrivs)', () => {
    expect(las('lib', 'egenkontrollOrigo.ts')).toContain('SKRIV ALDRIG kartbild_bounds FÖR ATT "LÖSA" DET HÄR');
    expect(las('lib', 'kartkoordinater.ts')).toContain('ALDRIG far skrivas');
  });
});
