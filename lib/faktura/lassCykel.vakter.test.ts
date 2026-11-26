// Källvakter för skotningsavståndet.
//
// Felen den här filen finns för är alla TYSTA — de ger ett tal som ser mätt ut:
//
//   · spårkopian används igen (utturen fattas, Skälviken 383 i stället för 739)
//   · halveringen görs två gånger (369 m ser ut som fågelvägen 377)
//   · zonen 60 m står på två ställen och glider isär
//   · haversinen tappar strict och ger π × jordradien per lass
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { CYKEL } from './lassCykel';

const MIGRATION = 'supabase/migrations/20261118100350_skotar_lass_cykel.sql';
const SQL = readFileSync(MIGRATION, 'utf8');
const CYKEL_TS = readFileSync('lib/faktura/lassCykel.ts', 'utf8');
const AVSTAND_TS = readFileSync('lib/faktura/lassAvstand.ts', 'utf8');

const utanKommentar = (f: string) =>
  f.replace(/--[^\n]*/g, '').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('SQL och TS säger samma sak', () => {
  it('avläggszonen är samma tal på båda ställena', () => {
    const m = SQL.match(/select\s+(\d+)::double precision as avlagg_zon_m/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(CYKEL.AVLAGG_ZON_M);
  });

  it('SQL pekar på TS-konstanten, så den som ändrar en hittar den andra', () => {
    expect(SQL).toContain('CYKEL.AVLAGG_ZON_M i lib/faktura/lassCykel.ts');
    expect(CYKEL_TS).toContain('skotar_lass_cykel');
  });

  it('jordradien är densamma som lib/geoMat', () => {
    expect(SQL).toContain('6371008.8');
    expect(readFileSync('lib/geoMat.ts', 'utf8')).toContain('6371008.8');
  });
});

describe('halveringen', () => {
  it('SQL halverar ALDRIG — hela cykeln lämnar databasen', () => {
    // Bara cykelfunktionens kropp: haversinen har sin EGEN /2 i formeln
    // (sin(Δlat/2)), och den har inget med skotningsavståndet att göra.
    const i = SQL.indexOf('create or replace function public.skotar_lass_cykel');
    expect(i).toBeGreaterThan(0);
    expect(utanKommentar(SQL.slice(i))).not.toMatch(/\/\s*2\b/);
  });

  it('TS halverar bara via skotningsavstandM, aldrig med en egen division', () => {
    expect(CYKEL_TS).toContain("from '@/lib/skotningsavstand'");
    expect(utanKommentar(CYKEL_TS)).not.toMatch(/\/\s*2\b/);
  });

  it('skotningsavstandM anropas en gång per tal, inte i kedja', () => {
    // skotningsavstandM(skotningsavstandM(x)) hade gett 369 m på Skälviken —
    // nästan precis fågelvägen 377, alltså ett fel som ser rimligt ut.
    expect(CYKEL_TS).not.toMatch(/skotningsavstandM\(\s*skotningsavstandM/);
  });
});

describe('haversinen i SQL', () => {
  it('är STRICT — least(1, NULL) är 1 i Postgres', () => {
    expect(SQL).toMatch(/create or replace function public\.skotar_hav_m[\s\S]*?language sql immutable strict/);
  });

  it('kommentaren förklarar varför, så ingen tar bort strict', () => {
    expect(SQL).toContain('least(1, NULL)');
    expect(SQL).toContain('20 015 114');
  });
});

describe('spårkopian är borta och byggs inte tillbaka', () => {
  it('sparAvstandM finns inte längre', () => {
    expect(AVSTAND_TS).not.toMatch(/export function sparAvstandM/);
    expect(AVSTAND_TS).not.toMatch(/export type SparPunkt/);
  });

  it('ingen fakturafil räknar ett avstånd ur skotar_lass.spar', () => {
    const filer = readdirSync('lib/faktura')
      .filter(f => f.endsWith('.ts') && !f.includes('.test.'));
    const synd: string[] = [];
    for (const f of filer) {
      const txt = utanKommentar(readFileSync(`lib/faktura/${f}`, 'utf8'));
      // Spårkopian: kolumnen `spar` eller fältet .spar i en select/mappning.
      if (/select\([^)]*\bspar\b/.test(txt) || /\.spar\b/.test(txt)) synd.push(f);
    }
    expect(synd).toEqual([]);
  });

  it('vakten skulle ha fångat det gamla felet', () => {
    // Om någon återinför mönstret ska listan ovan inte vara tom.
    const gammalt = utanKommentar("const x = sb.from('skotar_lass').select('id, spar')");
    expect(/select\([^)]*\bspar\b/.test(gammalt)).toBe(true);
  });
});

describe('bara klara lass bär pengar', () => {
  it('SQL filtrerar bekraftat och inte auto', () => {
    expect(SQL).toContain("sl.status = 'bekraftat'");
    expect(SQL).toContain("sl.bekraftad_av is distinct from 'auto'");
  });
});

describe('vändpunkten är ett fönster, inte en join', () => {
  it('ingen brytpunkt-CTE — den gav 24 s på en trakt', () => {
    expect(SQL).not.toMatch(/brytpunkt as/);
    expect(SQL).toContain('first_value(pt.rn)');
  });

  it('hyttspåret expanderas en gång, inte per lass', () => {
    expect(SQL).toMatch(/hp as materialized/);
    expect(SQL).toMatch(/pt as materialized/);
  });

  it('kommentaren säger varför, med den uppmätta tiden', () => {
    expect(SQL).toContain('24 s');
    expect(SQL).toContain('237 ms');
  });
});
