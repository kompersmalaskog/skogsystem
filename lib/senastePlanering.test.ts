// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SENASTE_PLANERING_KEY, hamtaSenastePlanering, objektIdUrUrl, planeringsUrl, rensaSenastePlanering, sattSenastePlanering, tolkaSenastePlanering } from './senastePlanering';
import { SENASTE_OBJEKT_KEY } from './senasteObjekt';

beforeEach(() => localStorage.clear());

describe('minnet per enhet och medarbetare', () => {
  it('sparar och läser; en annan medarbetare på samma enhet ärver aldrig', () => {
    sattSenastePlanering('anna', 'obj-1');
    expect(hamtaSenastePlanering('anna')).toBe('obj-1');
    expect(hamtaSenastePlanering('bo')).toBeNull();
  });
  it('en ny sparning ersätter; samma objekt skriver inte om', () => {
    sattSenastePlanering('anna', 'obj-1');
    const forst = localStorage.getItem(SENASTE_PLANERING_KEY);
    sattSenastePlanering('anna', 'obj-1');
    expect(localStorage.getItem(SENASTE_PLANERING_KEY)).toBe(forst);
    sattSenastePlanering('anna', 'obj-2');
    expect(hamtaSenastePlanering('anna')).toBe('obj-2');
  });
  it('rensa: bara om det är DET objektet; utan argument rensas allt', () => {
    sattSenastePlanering('anna', 'obj-1');
    rensaSenastePlanering('anna', 'obj-9');
    expect(hamtaSenastePlanering('anna')).toBe('obj-1');
    rensaSenastePlanering('anna', 'obj-1');
    expect(hamtaSenastePlanering('anna')).toBeNull();
    sattSenastePlanering('anna', 'obj-3');
    rensaSenastePlanering();
    expect(hamtaSenastePlanering('anna')).toBeNull();
  });
  it('trasig JSON, fel form och saknad användare ger null', () => {
    expect(tolkaSenastePlanering('{trasig', 'anna')).toBeNull();
    expect(tolkaSenastePlanering(JSON.stringify({ anvandarId: 'anna' }), 'anna')).toBeNull();
    expect(tolkaSenastePlanering(null, 'anna')).toBeNull();
    expect(hamtaSenastePlanering(null)).toBeNull();
  });
  it('maskindatorns minne (enhet_senaste_objekt_v1) är en annan nyckel och rörs aldrig', () => {
    expect(SENASTE_PLANERING_KEY).not.toBe(SENASTE_OBJEKT_KEY);
    localStorage.setItem(SENASTE_OBJEKT_KEY, 'maskinens-minne');
    sattSenastePlanering('anna', 'obj-1');
    rensaSenastePlanering();
    expect(localStorage.getItem(SENASTE_OBJEKT_KEY)).toBe('maskinens-minne');
  });
});

describe('objektet i adressen', () => {
  it('objektIdUrUrl läser ?objekt= och avvisar skräp', () => {
    expect(objektIdUrUrl('?objekt=3f2a-bc')).toBe('3f2a-bc');
    expect(objektIdUrUrl('?valjmaskin=1&objekt=abc')).toBe('abc');
    expect(objektIdUrUrl('')).toBeNull();
    expect(objektIdUrUrl('?objekt=')).toBeNull();
    expect(objektIdUrUrl('?objekt=<script>')).toBeNull();
    expect(objektIdUrUrl('?objekt=' + 'a'.repeat(101))).toBeNull();
    expect(objektIdUrUrl(null)).toBeNull();
  });
  it('planeringsUrl sätter och tar bort ?objekt= och behåller övriga parametrar', () => {
    expect(planeringsUrl('/planering', '', 'abc')).toBe('/planering?objekt=abc');
    expect(planeringsUrl('/planering', '?objekt=old', 'new')).toBe('/planering?objekt=new');
    expect(planeringsUrl('/planering', '?valjmaskin=1', 'abc')).toBe('/planering?valjmaskin=1&objekt=abc');
    expect(planeringsUrl('/planering', '?objekt=abc', null)).toBe('/planering');
    expect(planeringsUrl('/planering', '?objekt=abc&valjmaskin=1', null)).toBe('/planering?valjmaskin=1');
  });
});
