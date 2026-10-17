import { describe, it, expect } from 'vitest';
import { andradeFalt, kravKund, rattaKvitto, kvittoText, type Falt } from './ratta';
import { tolkaKm, gransText } from './kmRegler';

const FORE: Falt = {
  maskin_id: 'M1', extern_maskin: null, fran_objekt_id: 'o1', fran_plats_id: null,
  till_objekt_id: 'o2', till_plats_id: null, flytt_typ: 'produktion', kund: null,
};

describe('andradeFalt — diffen till p_andringar innehåller bara det som ändrats', () => {
  it('inget ändrat → tom diff', () => {
    expect(andradeFalt(FORE, { ...FORE })).toEqual({});
  });
  it('maskin: paret maskin_id + extern_maskin följs åt, inget annat', () => {
    expect(andradeFalt(FORE, { ...FORE, maskin_id: 'M2' })).toEqual({ maskin_id: 'M2', extern_maskin: null });
    expect(andradeFalt(FORE, { ...FORE, maskin_id: null, extern_maskin: '  Hyrd  ' })).toEqual({ maskin_id: null, extern_maskin: 'Hyrd' });
  });
  it('från/till: paret objekt + plats följs åt', () => {
    expect(andradeFalt(FORE, { ...FORE, till_objekt_id: null, till_plats_id: 'p9' })).toEqual({ till_objekt_id: null, till_plats_id: 'p9' });
    expect(andradeFalt(FORE, { ...FORE, fran_objekt_id: 'o7' })).toEqual({ fran_objekt_id: 'o7', fran_plats_id: null });
  });
  it('typ och kund var för sig; blank kund = ingen kund', () => {
    expect(andradeFalt(FORE, { ...FORE, flytt_typ: 'service' })).toEqual({ flytt_typ: 'service' });
    expect(andradeFalt(FORE, { ...FORE, kund: '  Vida  ' })).toEqual({ kund: 'Vida' });
    expect(andradeFalt({ ...FORE, kund: 'Vida' }, { ...FORE, kund: ' ' })).toEqual({ kund: null });
    expect(andradeFalt({ ...FORE, kund: null }, { ...FORE, kund: '  ' })).toEqual({});
  });
  it('flera ändringar ger bara de ändrade nycklarna (aldrig tider, km eller koordinater)', () => {
    const diff = andradeFalt(FORE, { ...FORE, maskin_id: 'M2', flytt_typ: 'service' });
    expect(Object.keys(diff).sort()).toEqual(['extern_maskin', 'flytt_typ', 'maskin_id']);
  });
});

describe('kravKund', () => {
  it('kunduppdrag kräver kund, övriga typer gör det inte', () => {
    expect(kravKund('kunduppdrag', null)).toBe(false);
    expect(kravKund('kunduppdrag', '  ')).toBe(false);
    expect(kravKund('kunduppdrag', 'Vida')).toBe(true);
    expect(kravKund('produktion', null)).toBe(true);
  });
});

describe('kvittot byggs på databasens svar (underlag + position)', () => {
  it('osäker eller saknad position → "kolla kartan"', () => {
    for (const position of ['osaker', 'hittades_inte'] as const) {
      expect(kvittoText({ fakturerbar_fore: true, fakturerbar_efter: true, underlag: 'uppdaterat', position }, 'rattning')).toContain('Positionen kunde inte flyttas automatiskt — kolla kartan.');
      expect(kvittoText({ fakturerbar_fore: true, fakturerbar_efter: false, underlag: 'struket', position }, 'stryk')).toContain('Positionen kunde inte tas bort automatiskt — kolla kartan.');
    }
  });
  it('lyckad position och underlag nämns, ingen position nämns inte', () => {
    expect(rattaKvitto({ fakturerbar_fore: true, fakturerbar_efter: true, underlag: 'uppdaterat', position: 'flyttad' }, 'rattning'))
      .toEqual(['Flytten är rättad.', 'Dess underlag i faktureringen är uppdaterat.', 'Maskinens position flyttades till rätt maskin.']);
    expect(rattaKvitto({ fakturerbar_fore: true, fakturerbar_efter: true, underlag: 'ingen', position: 'ingen' }, 'rattning')).toEqual(['Flytten är rättad.']);
  });
});

describe('kmRegler', () => {
  it('tolkaKm: decimalkomma, skräp och icke-positivt är ogiltigt', () => {
    expect(tolkaKm('46,5')).toBe(46.5);
    expect(tolkaKm(' 58 ')).toBe(58);
    for (const v of ['', 'abc', '0', '-5']) expect(tolkaKm(v)).toBeNull();
  });
  it('gransText: bara när 30-gränsen korsas', () => {
    expect(gransText(28, 29)).toBeNull();
    expect(gransText(28, 31)).toContain('artikel 3');
    expect(gransText(53, 28)).toContain('artikel 5');
    expect(gransText(null, 31)).toBeNull();
  });
});
