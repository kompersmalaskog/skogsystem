import { describe, it, expect } from 'vitest';
import { voGruppKarta, medVoGrupp } from './voGrupp';

// Prod 2026-10-24: Mölleryd har skördarens dim-rad under 11166477 och skotarens under 11271883; planeringens objekt
// har vo 11271883 och 11166477 som extra nummer. Kroksjömåla Grot (P-1023) har slutavverkningens nummer som extra nummer.
const OBJEKT = [
  { id: 'mol', namn: 'Mölleryd RP J-Hus -25', vo_nummer: '11271883' },
  { id: 'kro', namn: 'Kroksjömåla Grot', vo_nummer: 'P-1023' },
  { id: 'lju', namn: 'Ljuvadal Camping & Upplevelser', vo_nummer: 'P-1024' },
];
const ALIAS = [
  { objekt_id: 'mol', nummer: '11166477', maskin_id: null },
  { objekt_id: 'kro', nummer: '11251460', maskin_id: null },
  { objekt_id: 'lju', nummer: 'k132', maskin_id: 'PONS20SDJAA270231' },
];
const DIM = [
  { objekt_id: '11166477', vo_nummer: '11166477', object_name: 'Mölleryd RP J-Hus -25' },
  { objekt_id: '11271883', vo_nummer: '11271883', object_name: 'Mölleryd RP J-Hus -25' },
  { objekt_id: '11251460', vo_nummer: '11251460', object_name: 'Kroksjömåla 123 A-A -25' },
  { objekt_id: 'x', vo_nummer: 'P-1023', object_name: 'Kroksjömåla Grot' },
];

describe('samma objekt under två VO-nummer', () => {
  const karta = voGruppKarta(ALIAS, OBJEKT, DIM);

  it('Mölleryd blir en grupp under objektets eget nummer', () => {
    expect(karta.get('11166477')).toBe('11271883');
    const rader = medVoGrupp(DIM, karta);
    expect(rader.filter(r => r._vo_grupp === '11271883').map(r => r.objekt_id)).toEqual(['11166477', '11271883']);
  });

  it('olika namn slås aldrig ihop (Kroksjömåla Grot och slutavverkningen)', () => {
    expect(karta.has('11251460')).toBe(false);
  });

  it('maskinbundna k-nummer och nummer som är ett annat objekts eget VO slås inte ihop', () => {
    expect(karta.has('k132')).toBe(false);
    const k2 = voGruppKarta(ALIAS, [...OBJEKT, { id: 'egen', namn: 'Mölleryd RP J-Hus -25', vo_nummer: '11166477' }], DIM);
    expect(k2.has('11166477')).toBe(false);
  });

  it('utan dim-rad under objektets nummer händer inget', () => {
    expect(voGruppKarta(ALIAS, OBJEKT, DIM.filter(d => d.vo_nummer !== '11271883')).size).toBe(0);
  });

  it('rader utan VO får ingen grupp', () => {
    expect(medVoGrupp([{ vo_nummer: null, object_name: 'a' }], karta)[0]._vo_grupp).toBeNull();
  });
});
