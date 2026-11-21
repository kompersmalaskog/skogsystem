import { describe, it, expect } from 'vitest';
import type { UppfoljningObjekt } from './transform';
import { skogKort, skogDokument, vaderRad, svarText } from './iSkogenSida';

const obj = (over: Partial<UppfoljningObjekt>): UppfoljningObjekt => ({
  vo_nummer: 'VO1', namn: 'Objekt', typ: 'slutavverkning', volymSkordare: 1000, volymSkotare: 0,
  skordareStart: null, skordareSlut: null, skotareStart: null, skotareSlut: null, skotareLastDate: null, skordareLastDate: null,
  sistaAvverkning: '2026-10-01', antalLass: 1, skordningAvslutad: false, skotningAvslutad: false, egenSkotning: false,
  externSkotning: false, skordareObjektId: null, skotareObjektId: null,
  ...over,
} as unknown as UppfoljningObjekt);

const NU = Date.parse('2026-11-21T17:00:00Z');
const IDAG = '2026-11-21';

describe('skogKort', () => {
  const data = [
    obj({ vo_nummer: 'A', namn: 'Arvidstorp', volymSkordare: 628, volymSkotare: 440, skordareStart: '2026-10-27', sistaAvverkning: '2026-11-02', skotareStart: '2026-11-10', skordningAvslutad: true }),
    obj({ vo_nummer: 'B', namn: 'Britteberg', volymSkordare: 673, antalLass: 0, skordareStart: '2026-11-04', sistaAvverkning: '2026-11-10', skordningAvslutad: true }),
    obj({ vo_nummer: 'G', namn: 'Gallring Kör', typ: 'gallring', volymSkordare: 300, antalLass: 0, skordareStart: '2026-11-17', sistaAvverkning: '2026-11-21', skordareLastDate: '2026-11-21' }),
    obj({ vo_nummer: 'E', namn: 'Egen', volymSkordare: 500, sistaAvverkning: '2026-11-01', skordningAvslutad: true, egenSkotning: true }),
    obj({ vo_nummer: 'S', namn: 'Skälviken', volymSkordare: 1725, volymSkotare: 1725, skordareStart: '2026-10-20', sistaAvverkning: '2026-10-28', skotareStart: '2026-11-03', skotareLastDate: '2026-11-12', skotningAvslutad: true }),
  ];

  it('bara tid och steg — längst legat först, inga m³', () => {
    const k = skogKort(data, NU, IDAG);
    expect(k.iSkogen.map(x => x.namn)).toEqual(['Arvidstorp', 'Britteberg', 'Gallring Kör']);
    expect(k.iSkogen[0].dagar).toBe(19);
    expect(k.iSkogen[0].steg).toEqual(['Skördaren fällde 27 okt – 2 nov · 7 dagar', 'Virket väntade 7 dagar', 'Skotaren kör sedan 10 nov']);
    expect(k.iSkogen[1].steg).toEqual(['Skördaren fällde 4–10 nov · 7 dagar', 'Virket väntar 11 dagar · skotaren har inte börjat']);
    expect(k.iSkogen[2].dagar).toBeNull();
    expect(k.iSkogen[2].steg).toEqual(['Skördaren fäller sedan 17 nov · 5 dagar']);
    expect(JSON.stringify(k)).not.toMatch(/m³/);
    expect(k.iSkogen.find(x => x.namn === 'Egen')).toBeUndefined();
  });

  it('framme: dagar till sista lasset och väderperioden slutar vid sista lasset', () => {
    const k = skogKort(data, NU, IDAG);
    expect(k.framme).toHaveLength(1);
    expect(k.framme[0].dagar).toBe(15);
    expect(k.framme[0].steg.at(-1)).toBe('Skotaren körde 3–12 nov · 10 dagar');
    expect(k.framme[0].period).toEqual({ fran: '2026-10-20', till: '2026-11-12' });
    expect(k.iSkogen[0].period).toEqual({ fran: '2026-10-27', till: IDAG });
  });
});

describe('vaderRad', () => {
  it('säger aldrig 0 mm för det vi inte vet', () => {
    expect(vaderRad(undefined)).toBe('Hämtar vädret …');
    expect(vaderRad({ ok: false, orsak: 'las' })).toBe('Vädret kunde inte hämtas');
    expect(vaderRad({ ok: false, orsak: 'saknar_plats' })).toMatch(/ingen position/);
  });
  it('regn, regndagar och temperatur på en rad', () => {
    expect(vaderRad({ ok: true, summa: { regnMm: 61, regnDagar: 11, tMin: -3, tMax: 9, dagar: 25, saknas: 0 } } as never))
      .toBe('Regn 61 mm · 11 dagar med regn · −3 till 9 °C');
    expect(vaderRad({ ok: true, summa: { regnMm: 0, regnDagar: 0, tMin: 2, tMax: 5, dagar: 3, saknas: 0 } } as never))
      .toBe('Regn 0 mm · 2 till 5 °C');
  });
});

describe('skogDokument', () => {
  it('A4:n har samma rader som sidan', () => {
    const k = skogKort([obj({ vo_nummer: 'A', namn: 'Arvidstorp', volymSkotare: 100, skordareStart: '2026-10-27', sistaAvverkning: '2026-11-02', skotareStart: '2026-11-10', skordningAvslutad: true })], NU, IDAG);
    const vader = new Map([['A', { ok: true, summa: { regnMm: 61, regnDagar: 11, tMin: -3, tMax: 9, dagar: 25, saknas: 0 } } as never]]);
    const d = skogDokument(k, vader, IDAG);
    expect(d.svar).toBe('1 trakt i skogen · längst legat 19 dagar');
    expect(d.sektioner[0].rader[0]).toEqual({
      titel: 'Arvidstorp', status: '19 dagar',
      text: 'Skördaren fällde 27 okt – 2 nov · 7 dagar\nVirket väntade 7 dagar\nSkotaren kör sedan 10 nov\nRegn 61 mm · 11 dagar med regn · −3 till 9 °C',
    });
    expect(d.sektioner).toHaveLength(1);
  });
  it('svaret', () => {
    expect(svarText(0, null)).toBe('Inget virke ligger i skogen');
    expect(svarText(2, null)).toBe('2 trakter i skogen');
  });
});
