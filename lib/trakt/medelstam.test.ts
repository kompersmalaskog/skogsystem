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

// Riktig utläsning (unpdf, mergePages) av Vidas traktdirektiv Lidhem rp 2025 Britteberg, traktnr 885871 — sidan 1, där tabellen står.
const BRITTEBERG = 'Traktdirektiv - Lidhem rp 2025 Britteberg Traktnr Kontraktsnr Ursprung Datum 885871 971064 (anges vid fakturering) Rotpost 2026-10-23 Säljare: Kontaktperson Inköpare VIDA Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält: LINE 7:1 PEFC 076306 2024-06-24 Föryngringsavverkning Larmkoordinat: 6278453 493143 Öst/VästNord/Syd Traktdel-id Areal, ha TGL Fföträd/ha Medelstam Uttag m3fub 62E7J8333 4,9 0X0 0,48 632 Total 4,9 0,48 632 Anteckningar: Fornåkrar enligt karta Se traktdirektiv stämplingshandling. Sida 1 av 4';

describe('Vidas traktdelstabell — medelstam ur Total-raden (riktig fil 2026-11-05)', () => {
  it('Britteberg: 0,48', () => {
    expect(tolkaMedelstam(BRITTEBERG)).toEqual({ medelstam: 0.48, varning: null });
    expect(parseTraktdirektivText(BRITTEBERG, '885871').medelstam).toBe(0.48);
  });
  it('flera traktdelar: Total-radens (viktade) värde, inte en enskild del', () => {
    const t = 'Traktdel-id Areal, ha TGL Fföträd/ha Medelstam Uttag m3fub A1 2,0 0X0 0,30 200 B2 3,0 0X0 0,60 600 Total 5,0 0,48 800 Anteckningar:';
    expect(tolkaMedelstam(t).medelstam).toBe(0.48);
  });
  it('uttag med tusentalsavgränsare ("1 234") ändrar inget', () => {
    expect(tolkaMedelstam('Medelstam Uttag m3fub X 12,3 0X0 0,52 1 234 Total 12,3 0,52 1 234 Anteckningar:').medelstam).toBe(0.52);
  });
  it('tom medelstamkolumn: arealen tas ALDRIG för medelstam', () => {
    expect(tolkaMedelstam('Medelstam Uttag m3fub X 2,5 0X0 632 Total 2,5 632 Anteckningar:').medelstam).toBeNull();
  });
  it('orimligt värde → null', () => {
    expect(tolkaMedelstam('Medelstam Uttag m3fub X 4,9 0X0 7,5 632 Total 4,9 7,5 632 Anteckningar:').medelstam).toBeNull();
  });
  it('utan tabell: oförändrat (ingen träff)', () => {
    expect(tolkaMedelstam('Total 4,9 0,48 632').medelstam).toBeNull();
  });
});
