import { describe, expect, it } from 'vitest';
import { bedomMaskin, gpsFoljer, gpsUtesluten, skalRad, type MaskinBevis } from './maskin';

const gps = (punkter: number, traffar: number, medianM: number) => ({ punkter, traffar, medianM });
const B = (maskin_id: string, o: Partial<MaskinBevis> = {}): MaskinBevis => ({ maskin_id, ...o });

describe('Hög — maskinens eget GPS-spår följde bilen', () => {
  it('Giant 1 sep (22+23): 8 av 8 punkter, 17 m', () => {
    const r = bedomMaskin([B('PONS', { gps: gps(8, 8, 17) }), B('R64428'), B('A130743')]);
    expect(r).toMatchObject({ forslag: 'PONS', sakerhet: 'hog', konflikt: false });
  });
  it('Giant 22 sep: 9 av 10 punkter, 23 m', () => {
    expect(bedomMaskin([B('PONS', { gps: gps(10, 9, 23) }), B('X')]).sakerhet).toBe('hog');
  });
  it('en enda GPS-punkt räcker bara om den ligger ≤ 50 m från bilen', () => {
    expect(gpsFoljer(gps(1, 1, 30))).toBe(true);
    expect(gpsFoljer(gps(1, 1, 120))).toBe(false);
  });
  it('under 60 % träffar följer inte (3 av 7)', () => {
    expect(gpsFoljer(gps(7, 3, 90))).toBe(false);
  });
  it('H8E (datorn av under transport): arbetade vid lastplatsen och startades vid lossningen = Hög', () => {
    const r = bedomMaskin([B('R64428', { ankomstM: 14, avgangM: 346 }), B('PONS', { gps: gps(5, 0, 7000) })]);
    expect(r).toMatchObject({ forslag: 'R64428', sakerhet: 'hog' });
  });
  it('bara ankomst utan avgång är INTE Hög', () => {
    const r = bedomMaskin([B('R64428', { ankomstM: 14 })]);
    expect(r.sakerhet).not.toBe('hog');
  });
  it('TVÅ maskiner som båda följt bilen = konflikt: ingen automatik (Låg), bästa som förslag', () => {
    const r = bedomMaskin([B('A', { gps: gps(5, 5, 20) }), B('B', { gps: gps(5, 5, 25) })]);
    expect(r.sakerhet).toBe('lag');
    expect(r.konflikt).toBe(true);
    expect(r.forslag).toBe('A');
  });
});

describe('Medel / Låg / Okänd', () => {
  it('Medel: skotade lastplatsens trakt före OCH lossningsplatsens trakt efter (Elefant 26, 14 sep)', () => {
    const r = bedomMaskin([
      B('A130743', { kedjaFran: { dag: '2026-09-14', trakt: 'Rävemåla AU' }, kedjaTill: { dag: '2026-09-14', trakt: 'Akelius' } }),
      B('PONS', { gps: gps(3, 0, 7000) }), B('R64428'),
    ]);
    expect(r).toMatchObject({ forslag: 'A130743', sakerhet: 'medel' });
  });
  it('Låg: ett enda stöd (bara kedja till)', () => {
    const r = bedomMaskin([B('A130743', { kedjaTill: { dag: '2026-10-13', trakt: 'Bågskyttebanan' } }), B('X')]);
    expect(r.sakerhet).toBe('lag');
    expect(r.forslag).toBe('A130743');
  });
  it('Okänd: ingenting pekar ut någon — inget förslag', () => {
    const r = bedomMaskin([B('A'), B('B')]);
    expect(r).toMatchObject({ forslag: null, sakerhet: 'okand' });
  });
  it('en maskin vars GPS låg långt bort hela lasset är utesluten och kan inte föreslås', () => {
    expect(gpsUtesluten(gps(4, 0, 9000))).toBe(true);
    const r = bedomMaskin([B('PONS', { gps: gps(4, 0, 9000), kedjaFran: { dag: '2026-09-01', trakt: 'X' }, kedjaTill: { dag: '2026-09-01', trakt: 'Y' } })]);
    expect(r.forslag).toBeNull();
    expect(r.kandidater[0].utesluten).toBe(true);
  });
  it('en påbörjad flytt i appen + senaste position vid lastplatsen ger ett förslag', () => {
    const r = bedomMaskin([B('A030353', { paborjadFlytt: true, positionNara: true, kedjaFran: { dag: '2026-08-06', trakt: 'Tjuvön' } }), B('X')]);
    expect(r.forslag).toBe('A030353');
  });
});

describe('texter', () => {
  it('skalRad ger de två bästa skälen på svenska', () => {
    const r = bedomMaskin([B('PONS', { gps: gps(8, 8, 17), kedjaFran: { dag: '2026-09-01', trakt: 'Stänkelsmåla' } })]);
    expect(skalRad(r.kandidater[0].skal)).toContain('GPS-spåret följde bilen (8 av 8 punkter, cirka 17 m)');
  });
});
