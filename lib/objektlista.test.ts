import { describe, it, expect } from 'vitest';
import { grupperaForareObjekt, sorteraAvslutade, avstandM, type ForareObjekt } from './objektlista';
import type { TraktGeometriFC } from './objektPlats';

// Kvadratisk traktgräns runt (lat,lng) för syntetiska "HÄR"-objekt.
function kvadrat(lat: number, lng: number, d = 0.01): TraktGeometriFC {
  const ring: [number, number][] = [
    [lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d],
  ];
  return {
    type: 'FeatureCollection',
    features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
}

describe('grupperaForareObjekt — fyra grupper, exakt en grupp per objekt', () => {
  const pos = { lat: 57, lng: 15 };

  it('HÄR > PÅGÅENDE > PLANERADE > AVSLUTADE och rätt bucket per status', () => {
    const objekt: ForareObjekt[] = [
      { id: 'har', namn: 'Står här', typ: 'gallring', status: 'planerad', geometri: kvadrat(57, 15), lat: 57, lng: 15 },
      { id: 'pag', namn: 'Pågår', typ: 'gallring', status: 'pagaende', lat: 57.2, lng: 15 },
      { id: 'plan', namn: 'Planerad', typ: 'gallring', status: 'planerad', lat: 57.3, lng: 15 },
      { id: 'avsl', namn: 'Avslutad', typ: 'gallring', status: 'avslutat', lat: 57.4, lng: 15 },
    ];
    const g = grupperaForareObjekt({ objekt, pos });
    expect(g.har.map((o) => o.id)).toEqual(['har']);
    expect(g.pagaende.map((o) => o.id)).toEqual(['pag']);
    expect(g.planerade.map((o) => o.id)).toEqual(['plan']);
    expect(g.avslutade.map((o) => o.id)).toEqual(['avsl']);
  });

  it('bara en punkt (ingen traktgräns): inom 300 m = HÄR, längre bort = sin vanliga grupp; ett objekt MED gräns räknas bara mot gränsen', () => {
    const objekt: ForareObjekt[] = [
      { id: 'jobb-nara', typ: 'grot', status: 'planerad', lat: 57.001, lng: 15 },      // ~111 m, ingen gräns
      { id: 'jobb-langt', typ: 'grot', status: 'planerad', lat: 57.01, lng: 15 },      // ~1,1 km
      // har en gräns som ligger långt bort — punkten 111 m bort hjälper inte
      { id: 'gransen-annanstans', typ: 'gallring', status: 'planerad', geometri: kvadrat(57.5, 15), lat: 57.001, lng: 15 },
    ];
    const g = grupperaForareObjekt({ objekt, pos });
    expect(g.har.map((o) => o.id)).toEqual(['jobb-nara']);
    expect(g.planerade.map((o) => o.id).sort()).toEqual(['gransen-annanstans', 'jobb-langt']);
  });

  it('avslutat går till AVSLUTADE även om man står inne i det', () => {
    const objekt: ForareObjekt[] = [
      { id: 'avsl-har', typ: 'gallring', status: 'avslutat', geometri: kvadrat(57, 15), lat: 57, lng: 15 },
    ];
    const g = grupperaForareObjekt({ objekt, pos });
    expect(g.har).toHaveLength(0);
    expect(g.avslutade.map((o) => o.id)).toEqual(['avsl-har']);
  });

  it('aktivSenaste7 (hyttspår/lass ≤7 dgr) räknas som pågående även när status=planerad', () => {
    const objekt: ForareObjekt[] = [
      { id: 'planmen-aktiv', typ: 'gallring', status: 'planerad', aktivSenaste7: true, lat: 57.1, lng: 15 },
    ];
    const g = grupperaForareObjekt({ objekt, pos });
    expect(g.pagaende.map((o) => o.id)).toEqual(['planmen-aktiv']);
    expect(g.planerade).toHaveLength(0);
  });

  it('skordning/skotning räknas som pågående; okänd status visas inte', () => {
    const objekt: ForareObjekt[] = [
      { id: 'sk', typ: 'gallring', status: 'skotning', lat: 57.1, lng: 15 },
      { id: 'okand', typ: 'gallring', status: 'nagot_annat', lat: 57.1, lng: 15 },
    ];
    const g = grupperaForareObjekt({ objekt, pos });
    expect(g.pagaende.map((o) => o.id)).toEqual(['sk']);
    expect([...g.har, ...g.planerade, ...g.avslutade].some((o) => o.id === 'okand')).toBe(false);
  });
});

describe('grupperaForareObjekt — sortering inom grupp', () => {
  const pos = { lat: 57, lng: 15 };

  it('maskinens typ FÖRST (klarar_typ gallring), sedan närmaste', () => {
    const objekt: ForareObjekt[] = [
      // nära men fel typ — ~450 m bort: utanför de 300 m där ett objekt utan traktgräns räknas som HÄR (se testet "bara en punkt" ovan)
      { id: 'slutavv-nara', typ: 'slutavverkning', status: 'planerad', lat: 57.004, lng: 15 },
      { id: 'gallr-langt', typ: 'gallring', status: 'planerad', lat: 57.5, lng: 15 },           // rätt typ, längre bort
      { id: 'gallr-nara', typ: 'gallring', status: 'planerad', lat: 57.01, lng: 15 },           // rätt typ, nära
    ];
    const g = grupperaForareObjekt({ objekt, pos, klararTyp: 'gallring' });
    // gallring-objekten först (närmast först inom typen), sedan slutavverkning
    expect(g.planerade.map((o) => o.id)).toEqual(['gallr-nara', 'gallr-langt', 'slutavv-nara']);
  });

  it('tilldelat denna maskin ligger överst (chip "egna")', () => {
    const objekt: ForareObjekt[] = [
      { id: 'annan-nara', typ: 'gallring', status: 'planerad', lat: 57.001, lng: 15 },
      { id: 'min-langt', typ: 'gallring', status: 'planerad', lat: 57.5, lng: 15, skotare_maskin_id: 'A130743' },
    ];
    const g = grupperaForareObjekt({ objekt, pos, maskinId: 'A130743', klararTyp: 'bada' });
    expect(g.planerade[0].id).toBe('min-langt');
  });

  it('utan position: faller tillbaka på namn-ordning', () => {
    const objekt: ForareObjekt[] = [
      { id: 'b', namn: 'Björk', typ: 'gallring', status: 'planerad' },
      { id: 'a', namn: 'Alm', typ: 'gallring', status: 'planerad' },
    ];
    const g = grupperaForareObjekt({ objekt, klararTyp: 'bada' });
    expect(g.planerade.map((o) => o.namn)).toEqual(['Alm', 'Björk']);
  });
});

describe('sorteraAvslutade — senast avslutat överst', () => {
  it('nyast först, saknad timestamp sist', () => {
    const arr: ForareObjekt[] = [
      { id: 'gammal', avslutad_timestamp: '2026-07-01T00:00:00Z' },
      { id: 'utan' },
      { id: 'ny', avslutad_timestamp: '2026-09-20T00:00:00Z' },
    ];
    const sorted = [...arr].sort(sorteraAvslutade);
    expect(sorted.map((o) => o.id)).toEqual(['ny', 'gammal', 'utan']);
  });
});

describe('avstandM', () => {
  it('~111 km per grad latitud', () => {
    const d = avstandM(57, 15, 58, 15);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});
