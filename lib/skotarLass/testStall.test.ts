import { describe, expect, it } from 'vitest';
import { avlaggIZon } from './zon';
import { kalUtPunkt, nastaTestAvlagg } from './testStall';
import type { Avlagg } from './typer';

const A = (nr: string, lat = 56.6): Avlagg => ({ id: `vida:${nr}`, nummer: nr, kalla: 'vida', lat, lng: 15.8 });
const lista = [A('2'), A('01-2', 56.601), A('3', 56.61)];

describe('testläget: ställ maskinen vid ett avlägg', () => {
  it('det som är tryckt på kartan går först', () => { expect(nastaTestAvlagg(lista, 'vida:3', 'vida:2')?.id).toBe('vida:3'); });
  it('annars nästa i listan efter det maskinen står vid, och runt', () => {
    expect(nastaTestAvlagg(lista, null, null)?.id).toBe('vida:2');
    expect(nastaTestAvlagg(lista, null, 'vida:2')?.id).toBe('vida:01-2');
    expect(nastaTestAvlagg(lista, null, 'vida:3')?.id).toBe('vida:2');
  });
  it('ett tryckt id som inte finns (längre) ignoreras; tom lista = ingen knapp', () => {
    expect(nastaTestAvlagg(lista, 'vida:99', null)?.id).toBe('vida:2');
    expect(nastaTestAvlagg([], null, null)).toBeNull();
  });
  it('att stå på avläggets punkt ger knappen; Kör ut tar maskinen ur zonen', () => {
    const a = lista[0];
    expect(avlaggIZon({ lat: a.lat, lng: a.lng }, lista, false)?.avlagg.id).toBe('vida:2');
    expect(avlaggIZon(kalUtPunkt(a), [a], true)).toBeNull();
  });
});
