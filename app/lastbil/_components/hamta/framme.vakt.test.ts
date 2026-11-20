// Vakt: det finns ingen väg till att stänga rundan som går förbi framme-kontrollen. Knappen "Klar" på Vägen hem anropar tryckKlar (som
// frågar först när bilen står långt från basen); stangDag() anropas bara via stang(), och stang() bara från tryckKlar och från frågans
// "Ja, avsluta ändå". Förare som ändå vill avsluta kan det — men aldrig utan frågan när bilen står ute.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const flode = readFileSync(join(__dirname, 'HamtaFlode.tsx'), 'utf8');
const skriv = readFileSync(join(__dirname, 'dagSkriv.ts'), 'utf8');
const rader = (kalla: string, monster: RegExp) => kalla.split('\n').filter(r => monster.test(r) && !r.trim().startsWith('//')).map(r => r.trim());

describe('Framme-kontrollen kan inte kringgås', () => {
  it('Klar-knappen går via tryckKlar, aldrig direkt till stang', () => {
    expect(flode).toContain('onClick={tryckKlar}');
    expect(flode).not.toMatch(/onClick=\{stang\b/);
    expect(flode).not.toMatch(/onClick=\{\(\) => stang\(/);
  });

  it('stang() anropas bara från tryckKlar och från "Ja, avsluta ändå"', () => {
    const anrop = rader(flode, /\bstang\(/).filter(r => !/const stang = async/.test(r));
    expect(anrop).toEqual([
      'await stang(dag.v);',              // tryckKlar: bilen på basen, eller läget går inte att avgöra
      'if (dag.v) await stang(dag.v);',   // jaAvslutaAnda: frågans "Ja, avsluta ändå"
    ]);
  });

  it('stangDag() anropas bara från stang()', () => {
    expect(rader(flode, /\bstangDag\(/)).toEqual(['const r = await stangDag(ctx, d);']);
    expect(skriv).toContain('export async function stangDag(');
  });

  it('frågan ritas av FrammeVarning och "Ja" går till jaAvslutaAnda', () => {
    expect(flode).toContain('onAvslutaAnda={jaAvslutaAnda}');
    expect(flode).toContain('onKorVidare={() => setFrammeVarning(null)}');
  });

  it('kontrollen läser lastbilens position och basen ur framme.ts (inte förarens telefon)', () => {
    expect(flode).toContain("import { kontrolleraFramme } from './framme'");
    expect(flode).toContain('kontrolleraFramme(ctx.vin)');
  });
});
