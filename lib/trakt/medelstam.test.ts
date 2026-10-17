import { describe, expect, it } from 'vitest';
import { tolkaMedelstam } from './medelstam';
import { parseTraktdirektivText } from './td-parser';
import { tdText } from './__fixtures__/td-text';

describe('tolkaMedelstam — konservativt: etikett + ett entydigt tal, annars null', () => {
  it.each([
    ['Medelstam 0,72', 0.72],
    ['Medelstam: 0,72', 0.72],
    ['Medelstam (m3fub) 0,72', 0.72],
    ['Medelstam m³fub: 0.72', 0.72],
    ['Total 3,6 ha 950 m3fub\nMedelstam 0,8\nSida 2', 0.8],
    ['Medelstam 0,72 ... Medelstam 0,72', 0.72],            // samma värde på två ställen är inte tvetydigt
  ])('%j → %s', (text, forvantat) => {
    expect(tolkaMedelstam(text)).toEqual({ medelstam: forvantat, varning: null });
  });
  it('ingen träff → null utan varning (en TD utan medelstam är inget fel)', () => {
    expect(tolkaMedelstam(tdText())).toEqual({ medelstam: null, varning: null });
    expect(tolkaMedelstam('')).toEqual({ medelstam: null, varning: null });
  });
  it('flera OLIKA värden → null + varning med råtexten (ingen gissning mellan dem)', () => {
    const r = tolkaMedelstam('Medelstam 0,72\nMedelstam 0,41');
    expect(r.medelstam).toBeNull();
    expect(r.varning).toContain('"Medelstam 0,72"');
    expect(r.varning).toContain('"Medelstam 0,41"');
  });
  it('värde utanför rimligt intervall (0,01–3 m³fub) och tal som fortsätter ("0,72,5") godtas inte', () => {
    expect(tolkaMedelstam('Medelstam 12').medelstam).toBeNull();
    expect(tolkaMedelstam('Medelstam 0').medelstam).toBeNull();
    expect(tolkaMedelstam('Medelstam 0,72,5').medelstam).toBeNull();
  });
  it('ett tal som står LÅNGT från ordet (andra kolumner emellan) tolkas inte', () => {
    expect(tolkaMedelstam('Medelstam   Trädslag Tall Gran 0,35').medelstam).toBeNull();
  });
});

describe('td-parsern bär medelstam', () => {
  it('med entydig rad: fältet satt; utan: null (och inga nya varningar)', () => {
    const med = parseTraktdirektivText(tdText({ extra: 'Medelstam 0,72' }), '887818');
    expect(med.medelstam).toBe(0.72);
    const utan = parseTraktdirektivText(tdText(), '887818');
    expect(utan.medelstam).toBeNull();
    expect(utan.tolkningsvarningar.some((v) => /Medelstam/.test(v))).toBe(false);
  });
  it('tvetydigt: null + varning i tolkningsvarningar (går till objektets import_varningar)', () => {
    const r = parseTraktdirektivText(tdText({ extra: 'Medelstam 0,72 Medelstam 0,41' }), '887818');
    expect(r.medelstam).toBeNull();
    expect(r.tolkningsvarningar.some((v) => /Medelstam ur traktdirektivet kunde inte avgöras/.test(v))).toBe(true);
  });
});
