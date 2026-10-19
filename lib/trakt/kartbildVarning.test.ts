import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { kartbildVarning, type KartbildUtfall } from './kartbildVarning';

const BOUNDS = [[56.0, 14.0], [56.2, 14.2]];
const utfall = (o: Partial<KartbildUtfall> = {}): KartbildUtfall => ({ envz: false, harJpg: true, kartbild_url: '887818.jpg', kartbild_bounds: BOUNDS, fel: null, ...o });

describe('kartbildVarning — zip-leveransen (Brokamåla 2026-07-01 svalde felet tyst)', () => {
  it('allt som ska finnas finns: ingen varning', () => {
    expect(kartbildVarning(utfall())).toBeNull();
  });

  it('zipen innehåller ingen JPG: varning som säger det och vad det kostar', () => {
    const t = kartbildVarning(utfall({ harJpg: false, kartbild_url: null, kartbild_bounds: null }));
    expect(t).toMatch(/^Kartbild: zipen innehåller ingen kartbild \(JPG\)\./);
    expect(t).toMatch(/ingen kartbild och inga kartbild_bounds/);
    expect(t).toMatch(/egenkontrollens karta kan inte placera/);
  });

  it('bilden gick inte att ladda upp: felet från lagringen står i varningen (inte bara i konsolen)', () => {
    const t = kartbildVarning(utfall({ kartbild_url: null, kartbild_bounds: null, fel: 'uppladdningen misslyckades (Bucket not found)' }));
    expect(t).toMatch(/uppladdningen misslyckades \(Bucket not found\)/);
    expect(t).toMatch(/ingen kartbild och inga kartbild_bounds/);
  });

  it('bilden finns men georeferensen saknas eller går inte att läsa: varning om bounds', () => {
    const t = kartbildVarning(utfall({ kartbild_bounds: null, fel: 'zipen saknar georeferensfil (JGW)' }));
    expect(t).toMatch(/zipen saknar georeferensfil \(JGW\)/);
    expect(t).toMatch(/Bilden laddades upp men saknar kartbild_bounds/);
  });

  it('bounds sattes men bilden laddades inte upp: markeringarna går att placera, och varningen säger det', () => {
    const t = kartbildVarning(utfall({ kartbild_url: null, fel: 'uppladdningen misslyckades (x)' }));
    expect(t).toMatch(/markeringarna kan placeras/);
    expect(t).not.toMatch(/inga kartbild_bounds/);
  });

  it('okänd orsak: det står, hellre än en tom förklaring', () => {
    expect(kartbildVarning(utfall({ kartbild_bounds: null }))).toMatch(/orsaken är okänd/);
  });

  it('envz: ALDRIG en varning — den leveransen har ingen georefererad JPG och ska inte ha (och får aldrig härleda bounds)', () => {
    expect(kartbildVarning(utfall({ envz: true, harJpg: false, kartbild_url: null, kartbild_bounds: null }))).toBeNull();
    expect(kartbildVarning(utfall({ envz: true, kartbild_url: null, kartbild_bounds: null, fel: 'x' }))).toBeNull();
  });
});

describe('import-trakt använder varningen och skriver aldrig härledda bounds (källvakt)', () => {
  const route = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'import-trakt', 'route.ts'), 'utf8');

  it('varningen byggs efter kartbildsblocket och läggs i varningar (som skrivs i import_varningar)', () => {
    expect(route).toContain("import { kartbildVarning } from '@/lib/trakt/kartbildVarning';");
    expect(route).toContain('kartbildVarning({ envz: !!envz, harJpg: !!jpgEntry, kartbild_url, kartbild_bounds, fel: kartbildFel })');
    expect(route).toContain('if (kartbildVarningText) varningar.push(kartbildVarningText);');
    expect(route.indexOf('kartbildVarningText')).toBeLessThan(route.indexOf('import_varningar: varningar.length > 0'));
  });

  it('varje väg där bilden eller bounds uteblir sätter en orsak: upload, georeferens, saknad JGW, undantag', () => {
    expect(route).toContain('uppladdningen misslyckades (');
    expect(route).toContain('georeferensfilen (JGW) eller bildens storlek gick inte att läsa');
    expect(route).toContain('zipen saknar georeferensfil (JGW)');
    expect(route).toContain('kartbilden kunde inte behandlas (');
  });

  it('kartbild_bounds tilldelas bara i zip-grenen, ur JGW — aldrig ur geometrin', () => {
    const tilldelningar = route.match(/kartbild_bounds\s*=\s/g) ?? [];
    expect(tilldelningar.length).toBe(1);
    const i = route.indexOf('kartbild_bounds = [');
    expect(route.slice(i - 600, i)).toContain('sweref99ToWgs84');
    expect(route.slice(route.indexOf('kartbild_bounds = ['), route.indexOf('kartbild_bounds = [') + 200)).not.toMatch(/geo\.|geoFeatures|bboxCentrum|traktGran/);
  });
});
