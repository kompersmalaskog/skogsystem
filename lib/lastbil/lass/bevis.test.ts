import { describe, expect, it } from 'vitest';
import { byggKedja, samlaBevis, sammanfattaFoljer } from './bevis';

describe('sammanfattaFoljer', () => {
  it('räknar punkter, träffar (≤ 150 m) och medianavstånd per maskin', () => {
    const m = sammanfattaFoljer([
      { maskin_id: 'G', idx: 0, dist_m: 12 }, { maskin_id: 'G', idx: 1, dist_m: 20 }, { maskin_id: 'G', idx: 2, dist_m: 400 },
      { maskin_id: 'H', idx: 0, dist_m: 8000 },
    ], ['G', 'H', 'W']);
    expect(m.get('G')).toEqual({ punkter: 3, traffar: 2, medianM: 20 });
    expect(m.get('H')).toEqual({ punkter: 1, traffar: 0, medianM: 8000 });
    expect(m.has('W')).toBe(false);   // ingen rad = maskinen loggade inte då: inget bevis, inte "långt bort"
  });
});

describe('byggKedja', () => {
  const arbete = [
    { maskin_id: 'E', dag: '2026-09-11', objekt_id: 'fran', trakt: 'Rävemåla' },
    { maskin_id: 'E', dag: '2026-09-14', objekt_id: 'till', trakt: 'Akelius' },
    { maskin_id: 'E', dag: '2026-09-20', objekt_id: 'till', trakt: 'Akelius' },
    { maskin_id: 'W', dag: '2026-09-14', objekt_id: 'fran', trakt: 'Rävemåla' },
  ];
  it('maskinen skotade lastplatsens trakt de tre dagarna före och lossningsplatsens trakt efter', () => {
    const k = byggKedja(arbete, 'E', { objekt_id: 'fran' }, { objekt_id: 'till' }, '2026-09-14', '2026-09-14');
    expect(k.kedjaFran).toEqual({ dag: '2026-09-11', trakt: 'Rävemåla' });
    expect(k.kedjaTill).toEqual({ dag: '2026-09-14', trakt: 'Akelius' });
  });
  it('fyra dagar före räknas inte', () => {
    expect(byggKedja(arbete, 'E', { objekt_id: 'fran' }, { objekt_id: 'till' }, '2026-09-15', '2026-09-15').kedjaFran).toBeNull();
  });
  it('en annan maskins arbete räknas inte', () => {
    expect(byggKedja(arbete, 'W', { objekt_id: 'x' }, { objekt_id: 'till' }, '2026-09-14', '2026-09-14')).toEqual({ kedjaFran: null, kedjaTill: null });
  });
  it('plats utan objekt (flyttplats) ger ingen kedja', () => {
    expect(byggKedja(arbete, 'E', { objekt_id: null }, { objekt_id: null }, '2026-09-14', '2026-09-14')).toEqual({ kedjaFran: null, kedjaTill: null });
  });
});

describe('samlaBevis', () => {
  it('rundar avstånden och tar rätt maskins rader', () => {
    const b = samlaBevis({
      maskin_id: 'R', gps: new Map(), kedja: { kedjaFran: null, kedjaTill: null }, paborjadFlytt: true, positionNara: false,
      ankomst: [{ maskin_id: 'R', tid: 't', dist_m: 14.4 }, { maskin_id: 'X', tid: 't', dist_m: 1 }],
      avgang: [{ maskin_id: 'R', tid: 't', dist_m: null }],
    });
    expect(b).toMatchObject({ maskin_id: 'R', ankomstM: 14, avgangM: null, paborjadFlytt: true, positionNara: false });
  });
});
