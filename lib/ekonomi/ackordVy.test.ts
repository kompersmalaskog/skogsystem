import { describe, it, expect } from 'vitest';
import type { MaskinDel, ObjektRad } from './objektJamforelse';
import {
  delKr, objektKr, skogRader, klassRader, maskinRader, summa, krText, ackordSvar, vantarText, klassText, perM3,
} from './ackordVy';

const del = (maskin_id: string, roll: MaskinDel['roll'], ackord: number, timpeng: number, timmar = 10): MaskinDel => ({
  maskin_id, roll, volym: 100, ackord, timpeng, timmar, timpris: 1000, forestlinkKr: 0, manuellTid: false,
});
const obj = (id: string, klass: number | null, maskiner: MaskinDel[], volym = 1000): ObjektRad => ({
  objekt_id: id, namn: id, volym, medelstam: klass ?? 0.3, klass,
  ackord: maskiner.reduce((s, d) => s + d.ackord, 0),
  timpeng: maskiner.reduce((s, d) => s + d.timpeng, 0),
  diff: maskiner.reduce((s, d) => s + d.ackord - d.timpeng, 0),
  krPerM3: null, egenSkotning: false, ejJamforbarOrsak: null, grund: [], maskiner,
});

// Avrundningar som inte går jämnt upp: varje del ,4 / ,6 — en summa av råvärden
// avrundad en gång skulle hamna en krona bredvid summan av de visade raderna.
const RADER = [
  obj('Jeppshoka', 0.25, [del('GIANT', 'skördare', 21000.4, 0), del('WISENT', 'skotare', 12155.6, 0)]),
  obj('Björkebo', 0.3, [del('GIANT', 'skördare', 20000.4, 0), del('ELEFANT', 'skotare', 13150.4, 0)]),
  obj('Rödby', 0.25, [del('GIANT', 'skördare', 5000.6, 0), del('WISENT', 'skotare', 3519.6, 0)]),
  obj('Kvarnen', null, [del('GIANT', 'skördare', 1000, 4000.4), del('ELEFANT', 'skotare', 0, 3159.6)]),
];

describe('ackordVy — en räkning för alla växlar', () => {
  it('en del är ackord − timpeng i hela kronor', () => {
    expect(delKr({ ackord: 1000.6, timpeng: 0 })).toBe(1001);
    expect(delKr({ ackord: 0, timpeng: 1000.4 })).toBe(-1000);
  });

  it('en skog är summan av sina AVRUNDADE delar, inte råvärdet avrundat', () => {
    // 21000,4 + 12155,6 = 33156 rått; delarna 21000 + 12156 = 33156
    expect(objektKr(RADER[0])).toBe(33156);
    // 20000,4 + 13150,4 = 33150,8 → 33151 rått, men delarna visar 20000 + 13150 = 33150
    expect(objektKr(RADER[1])).toBe(33150);
  });

  it('Skog, Klass och Maskin summerar till EXAKT samma tal', () => {
    const skog = summa(skogRader(RADER));
    expect(summa(klassRader(RADER))).toBe(skog);
    expect(summa(maskinRader(RADER, id => id))).toBe(skog);
    expect(skog).toBe(33156 + 33150 + 8521 - 6160);
  });

  it('mest pengar först, förlust sist', () => {
    const blandad = [RADER[3], RADER[2], RADER[0], RADER[1]];
    expect(skogRader(blandad).map(r => r.namn)).toEqual(['Jeppshoka', 'Björkebo', 'Rödby', 'Kvarnen']);
    expect(maskinRader(blandad, id => id).map(r => r.namn)).toEqual(['GIANT', 'WISENT', 'ELEFANT']);
  });

  it('stapeln är andel av den största raden, oavsett tecken', () => {
    const r = skogRader(RADER);
    expect(r[0].andel).toBe(1);
    expect(r[3].andel).toBeCloseTo(6160 / 33156, 6);
  });

  it('klass utan värde blir egen rad "Ingen klass" — ingen skog försvinner ur summan', () => {
    const k = klassRader(RADER);
    expect(k.map(r => r.namn)).toContain('Ingen klass');
    expect(k.find(r => r.nyckel === '0.25')!.skogar.map(s => s.namn)).toEqual(['Jeppshoka', 'Rödby']);
  });

  it('klassens skördare + skotare = klassens tal', () => {
    for (const k of klassRader(RADER)) expect(k.skordare + k.skotare).toBe(k.kr);
  });

  it('maskinens skogar summerar till maskinens tal', () => {
    for (const m of maskinRader(RADER, id => id)) {
      expect(m.skogar.reduce((s, x) => s + x.kr, 0)).toBe(m.kr);
    }
  });

  it('tom period: inga rader, summa 0', () => {
    expect(skogRader([])).toEqual([]);
    expect(summa(maskinRader([], id => id))).toBe(0);
  });
});

const n = (s: string) => s.replace(/\u00a0/g, ' ');
describe('ackordVy — orden', () => {
  it('ordet bär riktningen, inte bara färgen', () => {
    expect(n(krText(33156))).toBe('33 156 kr mer');
    expect(n(krText(-6160))).toBe('6 160 kr mindre');
    expect(krText(0)).toBe('Lika');
  });
  it('svaret är Ja / Nej / Lika', () => {
    const s = ackordSvar(68666);
    expect(s.svar).toBe('Ja');
    expect(n(s.under)).toBe('68 666 kr mer än om vi fått betalt per timme');
    expect(ackordSvar(-10).svar).toBe('Nej');
    expect(ackordSvar(0).svar).toBe('Lika');
  });
  it('väntande skogar — ental och plural, inget när noll', () => {
    expect(vantarText(0)).toBeNull();
    expect(vantarText(1)).toBe('1 skog är inte klar än och är inte med');
    expect(vantarText(2)).toBe('2 skogar är inte klara än och är inte med');
  });
  it('klass och kr/m³', () => {
    expect(klassText(0.25)).toBe('Klass 0,25');
    expect(klassText(null)).toBe('Ingen klass');
    expect(perM3(33156, 2763)).toBe(12);
    expect(perM3(100, 0)).toBeNull();
  });
});
