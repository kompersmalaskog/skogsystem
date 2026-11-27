// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { arSvagDator, glasLageFranMiljon, glasUrAdress, rensaGlasLage, tillampaGlasLage, valjGlasLage } from './glasLage';

describe('valjGlasLage — maskinläget är solid tills glas är mätt på hytthårdvara', () => {
  it('maskinläge → solid, också på en stark dator', () => {
    expect(valjGlasLage({ maskinlage: true, svagDator: false })).toBe('solid');
  });
  it('planeringsvyn på en vanlig dator eller telefon → glas', () => {
    expect(valjGlasLage({ maskinlage: false, svagDator: false })).toBe('glas');
  });
  it('svag dator → solid även utanför maskinläget', () => {
    expect(valjGlasLage({ maskinlage: false, svagDator: true })).toBe('solid');
  });
  it('?glas=glas går före maskinläget (mätning på hytthårdvara) och ?glas=solid före glas', () => {
    expect(valjGlasLage({ maskinlage: true, svagDator: true, tvingat: 'glas' })).toBe('glas');
    expect(valjGlasLage({ maskinlage: false, svagDator: false, tvingat: 'solid' })).toBe('solid');
  });
});

describe('arSvagDator', () => {
  it('≤ 2 kärnor eller ≤ 2 GB är svagt', () => {
    expect(arSvagDator({ hardwareConcurrency: 2 })).toBe(true);
    expect(arSvagDator({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(true);
  });
  it('4 kärnor och 4 GB är inte svagt; okänt är aldrig svagt (Safari säger inget om minnet)', () => {
    expect(arSvagDator({ hardwareConcurrency: 4, deviceMemory: 4 })).toBe(false);
    expect(arSvagDator({ hardwareConcurrency: 6 })).toBe(false);
    expect(arSvagDator({})).toBe(false);
    expect(arSvagDator(null)).toBe(false);
    expect(arSvagDator({ hardwareConcurrency: 0, deviceMemory: 0 })).toBe(false);
  });
});

describe('glasUrAdress', () => {
  it('läser bara glas och solid', () => {
    expect(glasUrAdress('?glas=solid')).toBe('solid');
    expect(glasUrAdress('?objekt=1&glas=glas')).toBe('glas');
    expect(glasUrAdress('?glas=blur')).toBeNull();
    expect(glasUrAdress('')).toBeNull();
    expect(glasUrAdress(undefined)).toBeNull();
  });
});

describe('tillampaGlasLage / rensaGlasLage', () => {
  it('skriver data-glas på body och tar bort det igen', () => {
    const doc = document.implementation.createHTMLDocument('t');
    tillampaGlasLage('solid', doc);
    expect(doc.body.getAttribute('data-glas')).toBe('solid');
    tillampaGlasLage('glas', doc);
    expect(doc.body.getAttribute('data-glas')).toBe('glas');
    rensaGlasLage(doc);
    expect(doc.body.hasAttribute('data-glas')).toBe(false);
  });
  it('rör ingenting utan dokument', () => {
    expect(() => tillampaGlasLage('solid', undefined)).not.toThrow();
    expect(() => rensaGlasLage(undefined)).not.toThrow();
  });
  it('glasLageFranMiljon: maskinläge ger solid i den riktiga miljön (jsdom, vanlig adress)', () => {
    expect(glasLageFranMiljon(true)).toBe('solid');
    expect(glasLageFranMiljon(false)).toBe('glas');
  });
});
