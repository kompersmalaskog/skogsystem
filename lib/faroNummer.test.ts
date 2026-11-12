import { describe, it, expect } from 'vitest';
import { faroKortText, faroMarkeringar, faroNrData, faroNrLager, faroPunkter } from './faroNummer';
import type { KartMarkering } from './objektKort';
import { lagerRang, RANG } from './lagerOrdning';

const mark = (id: string, typ: string, namn: string, text = '', lat: number | null = 57, lng: number | null = 15): KartMarkering =>
  ({ id, slag: 'symbol', typ, namn, comment: '', lat, lng, skapad: null, ordning: Number(id), kommentarer: text ? [{ id: 'k' + id, text, forfattare: 'M' }] : [] } as any);

describe('farorna med nummer', () => {
  const ms = [mark('1', 'landing', 'Avlägg'), mark('2', 'warning', 'Varning', 'Döda träd'), mark('3', 'jakttorn', 'Jakttorn'), mark('4', 'warning', 'Varning', 'Brunn\nmärkt')];
  it('bara faror, och punkternas nummer är platsen i listans ordning', () => {
    const f = faroMarkeringar(ms);
    expect(f.every((m) => m.typ !== 'landing')).toBe(true);
    const p = faroPunkter(ms);
    expect(p.map((x) => x.nr)).toEqual(f.map((_, i) => i + 1));
    expect(p.map((x) => x.id)).toEqual(f.map((m) => m.id));
  });
  it('kort text: första raden i första kommentaren, annars namnet, högst 40 tecken', () => {
    expect(faroKortText(mark('4', 'warning', 'Varning', 'Brunn\nmärkt'))).toBe('Brunn');
    expect(faroKortText(mark('5', 'jakttorn', 'Jakttorn'))).toBe('Jakttorn');
    expect(faroKortText(mark('6', 'warning', 'V', 'x'.repeat(60))).length).toBe(40);
  });
  it('en fara utan plats får inget nummer på kartan men behåller sin plats i ordningen', () => {
    const p = faroPunkter([mark('2', 'warning', 'Varning', 'a', null, null), mark('4', 'warning', 'Varning', 'b')]);
    expect(p).toHaveLength(1);
    expect(p[0].nr).toBe(2);
  });
  it('lagren heter larm-… (körvyns lista) och ligger över symbolerna', () => {
    for (const l of faroNrLager({ rod: '#f00', vit: '#fff', mork: '#000' })) {
      expect(l.id.startsWith('larm-')).toBe(true);
      expect(lagerRang({ id: l.id, type: l.type })).toBeGreaterThan(RANG.symboler);
    }
  });
  it('den valda märks', () => {
    const d = faroNrData([{ id: 'a', nr: 1, lat: 1, lng: 2, text: 't' }, { id: 'b', nr: 2, lat: 1, lng: 2, text: 'u' }], 'b');
    expect(d.features.map((f) => f.properties.vald)).toEqual([false, true]);
  });
});
