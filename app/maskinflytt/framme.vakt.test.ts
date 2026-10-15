// Vakt: det finns ingen väg till framme() som går förbi kontrollen. Knappen "Framme på LBC" anropar
// tryckFramme (som frågar först); framme() anropas bara därifrån och från frågans "Ja, avsluta ändå".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const kalla = readFileSync(join(__dirname, 'MaskinflyttClient.tsx'), 'utf8');

describe('Framme-kontrollen kan inte kringgås', () => {
  it('knappen går via tryckFramme, aldrig direkt till framme', () => {
    expect(kalla).toContain('onClick={tryckFramme}');
    expect(kalla).not.toMatch(/onClick=\{framme\}/);
    expect(kalla).not.toMatch(/onClick=\{\(\) => framme\(\)\}/);
  });

  it('framme() anropas bara från tryckFramme och från "Ja, avsluta ändå"', () => {
    const anrop = kalla.split('\n')
      .map((rad, i) => ({ rad, nr: i + 1 }))
      .filter(({ rad }) => /\bframme\(\)/.test(rad) && !/async function framme\(\)/.test(rad) && !rad.trim().startsWith('//'));
    expect(anrop.map(a => a.rad.trim())).toEqual([
      'await framme()',                                                              // tryckFramme: bilen på basen, eller läget går inte att avgöra
      'onAvslutaAnda={() => { setFrammeVarning(null); void framme() }} />',          // frågan: "Ja, avsluta ändå"
    ]);
  });

  it('kontrollen läser lastbilens position och basen ur framme.ts (inte förarens telefon)', () => {
    expect(kalla).toContain("import { kontrolleraFramme } from './framme'");
    expect(kalla).toContain('kontrolleraFramme(lastbilVin)');
  });
});
