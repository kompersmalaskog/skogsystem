import { describe, it, expect } from 'vitest';
import { KVITTO_MS, kanPlaceraPaPosition, placeringsFelText, nyMarkering, angraMarkering, kvittoRubrik, kvittoKvar } from './snabbMarkering';
import { raknaMiljo, miljoKrav, kravStatus } from './miljokrav';

describe('nyMarkering — samma form som planeringens egen utsättning', () => {
  it('högstubbe/evighetsträd/naturhörna får antal 1 (räknas mot kravet); andra symboler inte', () => {
    expect(nyMarkering('highstump', 1, 10, 20)).toEqual({ id: 1, type: 'highstump', x: 10, y: 20, isMarker: true, comment: '', antal: 1 });
    expect(nyMarkering('eternitytree', 2, 0, 0).antal).toBe(1);
    expect(nyMarkering('naturecorner', 3, 0, 0).antal).toBe(1);
    expect(nyMarkering('landing', 4, 0, 0)).toEqual({ id: 4, type: 'landing', x: 0, y: 0, isMarker: true, comment: '' });
  });
});

describe('KODBEVIS: sätta → räknaren ökar → Ångra tar bort markeringen', () => {
  it('högstubbe satt ökar räknaren med 1; Ångra tar bort exakt den och räknaren går tillbaka', () => {
    const fore = [nyMarkering('highstump', 1, 0, 0), nyMarkering('eternitytree', 2, 0, 0), nyMarkering('landing', 3, 0, 0)];
    expect(raknaMiljo(fore)).toEqual({ hogstubbar: 1, evighetstrad: 1 });
    const efterSatt = [...fore, nyMarkering('highstump', 99, 5, 5)];
    expect(raknaMiljo(efterSatt).hogstubbar).toBe(2);
    const efterAngra = angraMarkering(efterSatt, 99);
    expect(efterAngra).toEqual(fore);
    expect(raknaMiljo(efterAngra).hogstubbar).toBe(1);
  });
  it('Ångra rör aldrig andra markeringar, och id jämförs oavsett siffra/sträng (marker_id lagras som text)', () => {
    const lista = [nyMarkering('highstump', 7, 0, 0), nyMarkering('highstump', 8, 0, 0)];
    expect(angraMarkering(lista, '7').map((m) => m.id)).toEqual([8]);
    expect(angraMarkering(lista, 123)).toEqual(lista);
  });
  it('Ångra av en ensam markering gör att "efter"-bedömningen räknar om (en markering färre kan ge "efter")', () => {
    const krav = miljoKrav(3.64, 'FSC PEFC').hogstubbar;          // 11
    const sex = Array.from({ length: 6 }, (_, i) => nyMarkering('highstump', i + 1, 0, 0));
    expect(kravStatus(raknaMiljo(sex).hogstubbar, krav, 0.5)).toBe('ok');                       // 6 ≥ 5
    expect(kravStatus(raknaMiljo(angraMarkering(sex, 6)).hogstubbar, krav, 0.5)).toBe('ok');    // 5 ≥ 5
    expect(kravStatus(raknaMiljo(angraMarkering(angraMarkering(sex, 6), 5)).hogstubbar, krav, 0.5)).toBe('efter');   // 4 < 5
  });
});

describe('kanPlaceraPaPosition — aldrig en markering på en gammal eller saknad position', () => {
  it('färsk position → ok', () => {
    const r = kanPlaceraPaPosition({ lat: 56.35, lon: 15.05 }, true);
    expect(r).toEqual({ ok: true, pos: { lat: 56.35, lon: 15.05 } });
  });
  it('ingen position → nej med tydlig text', () => {
    for (const p of [null, undefined, { lat: NaN, lon: 15 }, { lat: 56, lon: Infinity }]) {
      const r = kanPlaceraPaPosition(p as any, true);
      expect(r).toEqual({ ok: false, skal: 'ingen-position' });
    }
    expect(placeringsFelText('ingen-position')).toMatch(/Ingen position/);
  });
  it('position som åldersvakten dömt som gammal (fixFarsk=false) → nej, inte en högstubbe 2,5 h bort', () => {
    expect(kanPlaceraPaPosition({ lat: 56.35, lon: 15.05 }, false)).toEqual({ ok: false, skal: 'gammal-position' });
    expect(placeringsFelText('gammal-position')).toMatch(/gammal/);
  });
});

describe('kvitto', () => {
  it('står kvar i 5 s och är sedan borta', () => {
    expect(KVITTO_MS).toBe(5000);
    expect(kvittoKvar(1000, 1000)).toBe(5000);
    expect(kvittoKvar(1000, 4000)).toBe(2000);
    expect(kvittoKvar(1000, 6000)).toBe(0);
    expect(kvittoKvar(1000, 99999)).toBe(0);
  });
  it('rubriken är "<symbol> satt"', () => {
    expect(kvittoRubrik('Högstubbe')).toBe('Högstubbe satt');
    expect(kvittoRubrik('Evighetsträd')).toBe('Evighetsträd satt');
  });
});
