import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { klassaVarning, klassaVarningar, tillVarningar, varningText } from './varningar';

// Raderna är de verkliga i prod (hela import_varningar-tabellen 2026-10-19: 106 + 23 + 18 + 10 + 4 + 3 + 2).
const PROD: [string, 'fraga' | 'noterat' | 'utveckling'][] = [
  ['OGI ForestOwner: URBAN EK (urban.ek@vida.se) — VIDA-kontakt, ej lagrad som markägare.', 'noterat'],
  ['Okänt lagernamn "SV_FASTIGHET" — importeras som typ \'okänt\'. Kolla om VIDA lagt till ett lager.', 'utveckling'],
  ['Okänt lagernamn "L_RAA_POLY_101" — importeras som typ \'okänt\'. Kolla om VIDA lagt till ett lager.', 'utveckling'],
  ['Hoppade över lagret "L_LST_NATURVARD_101" — region-/riksstort referenslager (upp till tiotusentals ha), ej trakt-relevant. Importeras inte.', 'noterat'],
  ['Flera traktkarta (886981_01_TK.pdf, 886981_04_TK.pdf) — behåller den första.', 'noterat'],
  ['PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.', 'fraga'],
  ['PDF utan känt suffix: "Kommunikation_A 52199-2025_14.pdf" — sparad som övrigt dokument.', 'fraga'],
  ['"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.', 'fraga'],
  ['Okänt Purpose "GROT-skotning" — sätter inte typ.', 'utveckling'],
  ['Okänt Purpose "Övrig Avverkning" — sätter inte typ.', 'utveckling'],
];

describe('klassaVarning — prod-raderna får rätt sort', () => {
  for (const [text, sort] of PROD) it(`${sort}: ${text.slice(0, 50)}`, () => expect(klassaVarning(text).sort).toBe(sort));

  it('osäker stämplingslängd och okänd PDF är SAMMA fråga (samma nyckel per fil), med ledtråden bevarad', () => {
    const a = klassaVarning('"Mölleryd.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.');
    const b = klassaVarning('PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.');
    expect(a.nyckel).toBe(b.nyckel);
    expect(a.fil).toBe('Mölleryd.pdf');
    expect(a.ledtrad).toBe('info_namnde_stamplingslangd');
    expect(b.ledtrad).toBeUndefined();
  });
  it('en rad ingen regel känner igen är noterat — den blir varken en fråga eller försvinner', () => {
    const v = klassaVarning('Omimport: lät dina ändringar ligga kvar i lat (leveransen hade ett annat värde).');
    expect(v.sort).toBe('noterat');
    expect(v.text).toContain('Omimport');
  });
  it('texten bevaras oförändrad', () => {
    for (const [text] of PROD) expect(klassaVarning(text).text).toBe(text);
  });
});

describe('importens skrivning och läsningen av äldre rader', () => {
  it('tom lista skrivs som TOM LISTA — "kontrollerat, inget hittat" är inte "aldrig kontrollerat" (null)', () => expect(klassaVarningar([])).toEqual([]));
  it('importen skriver objekt; en äldre textrad läses som samma objekt', () => {
    const [ny] = klassaVarningar([PROD[7][0]])!;
    expect(ny).toMatchObject({ sort: 'fraga', fil: 'Skälviken.pdf' });
    expect(tillVarningar([PROD[7][0]])[0]).toEqual(ny);
    expect(tillVarningar([ny])[0]).toEqual(ny);
  });
  it('varningText ger raden som den är, för loggar', () => {
    expect(varningText('abc')).toBe('abc');
    expect(varningText({ nyckel: 'k', sort: 'noterat', text: 'abc' })).toBe('abc');
  });
});

describe('källvakt: båda skrivningarna i routen går via klassningen', () => {
  const route = readFileSync(resolve(__dirname, '../../app/api/import-trakt/route.ts'), 'utf8');
  it('INSERT och UPDATE skriver strukturerade rader, aldrig den råa listan', () => {
    expect(route).toMatch(/import_varningar: klassaVarningar\(varningar\)/);
    expect(route).toMatch(/const rader = klassaVarningar\(varningar\);/);   // UPDATE: klassade rader (+ ev. volymfrågan), sedan patch.import_varningar = rader
    expect(route).toMatch(/patch\.import_varningar = rader;/);
    expect(route).not.toMatch(/import_varningar: varningar\.length/);
    expect(route).not.toMatch(/patch\.import_varningar = varningar\.length/);
  });
});
