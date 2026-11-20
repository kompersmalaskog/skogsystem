import { describe, it, expect } from 'vitest';
import {
  objektInnehallerPunkt,
  traktgransRingar,
  objektHuvudtyp,
  maskinKlararObjekt,
  arTilldelad,
  valjObjektForPosition,
  type TraktGeometriFC,
  type ObjektForVal,
} from './objektPlats';
import halabackTraktdel from './__fixtures__/halaback_au2025_traktdel.json';

// Hålabäck au 2025 (vo 11251359) — enbart L_TRAKTDEL-featurenas geometri, hämtad ur prod
// objekt_geometri (se scratchpad/containment_proper.mjs). Facit-koordinaten kommer ur spec-kodbeviset.
const HB = halabackTraktdel as unknown as TraktGeometriFC;

// En kvadratisk traktgräns-FeatureCollection runt (lat,lng) med radien d grader. För syntetiska test.
function kvadrat(lat: number, lng: number, d: number): TraktGeometriFC {
  const ring: [number, number][] = [
    [lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d],
  ];
  return {
    type: 'FeatureCollection',
    features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
}

describe('traktgransRingar — plockar bara ut Vida L_TRAKTDEL', () => {
  it('Hålabäck au 2025 har traktdel-ringar', () => {
    const rings = traktgransRingar(HB);
    expect(rings.length).toBeGreaterThanOrEqual(1);
    expect(rings.every((r) => r.length >= 3)).toBe(true);
  });

  it('ignorerar beståndsplan/fastighet (features utan L_TRAKTDEL ger inga ringar)', () => {
    const fc: TraktGeometriFC = {
      type: 'FeatureCollection',
      features: [
        { properties: { _lager: 'SV_BESKRIVNINGSENHET_FL' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
        { properties: { _lager: 'SV_FASTIGHET' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] } },
      ],
    };
    expect(traktgransRingar(fc)).toHaveLength(0);
  });
});

describe('objektInnehallerPunkt — kodbevis Hålabäck au 2025', () => {
  it('spec-punkten 56.3524, 15.0509 ligger INNE i trakten', () => {
    expect(objektInnehallerPunkt(HB, 56.3524, 15.0509)).toBe(true);
  });
  it('avlägg 01-1 (56.35219, 15.05214) ligger INNE', () => {
    expect(objektInnehallerPunkt(HB, 56.35219, 15.05214)).toBe(true);
  });
  it('~5 km öster ligger UTE', () => {
    expect(objektInnehallerPunkt(HB, 56.3524, 15.0509 + 0.08)).toBe(false);
  });
  it('~5 km norr ligger UTE', () => {
    expect(objektInnehallerPunkt(HB, 56.3524 + 0.045, 15.0509)).toBe(false);
  });
  it('saknad / tom geometri → false (de flesta objekt saknar objekt_geometri)', () => {
    expect(objektInnehallerPunkt(null, 56.3524, 15.0509)).toBe(false);
    expect(objektInnehallerPunkt({ type: 'FeatureCollection', features: [] }, 56.3524, 15.0509)).toBe(false);
  });
});

describe('objektHuvudtyp', () => {
  it('avverkningsform Biobränsle = GROT-jobb (eget grot)', () => {
    expect(objektHuvudtyp({ typ: 'slutavverkning', avverkningsform: 'Biobränsle' })).toBe('grot');
  });
  it('objekt.grot=true på en slutavverkning är INTE grot-typ (producerar bara GROT)', () => {
    // Prod: 15 slutavverknings­objekt har grot=true (Hålabäck au 2025 m.fl.) — de är slutavverkning.
    expect(objektHuvudtyp({ typ: 'slutavverkning', grot: true })).toBe('slutavverkning');
    expect(objektHuvudtyp({ typ: 'slutavverkning', grot: true, avverkningsform: 'Föryngringsavverkning' })).toBe('slutavverkning');
    expect(objektHuvudtyp({ typ: 'gallring', grot: true })).toBe('gallring');
  });
  it('härleder ur objekt.typ-texten', () => {
    expect(objektHuvudtyp({ typ: 'gallring' })).toBe('gallring');
    expect(objektHuvudtyp({ typ: 'slutavverkning' })).toBe('slutavverkning');
  });
  it('okänd typ → null', () => {
    expect(objektHuvudtyp({ typ: null })).toBeNull();
    expect(objektHuvudtyp({})).toBeNull();
  });
});

describe('maskinKlararObjekt — klarar_typ/skotar_roll mot objektets typ', () => {
  it("'bada' tar allt", () => {
    expect(maskinKlararObjekt('bada', { typ: 'gallring' })).toBe(true);
    expect(maskinKlararObjekt('bada', { typ: 'slutavverkning' })).toBe(true);
  });
  it('tom/okänd klarar_typ tar allt (ingen falsk uteslutning)', () => {
    expect(maskinKlararObjekt(null, { typ: 'gallring' })).toBe(true);
    expect(maskinKlararObjekt('allt', { typ: 'slutavverkning' })).toBe(true);
  });
  it('gallringsmaskin klarar gallring men inte slutavverkning', () => {
    expect(maskinKlararObjekt('gallring', { typ: 'gallring' })).toBe(true);
    expect(maskinKlararObjekt('gallring', { typ: 'slutavverkning' })).toBe(false);
  });
});

describe('arTilldelad', () => {
  it('matchar skördar- eller skotarplatsen', () => {
    expect(arTilldelad({ skordare_maskin_id: 'R64101', skotare_maskin_id: null }, 'R64101')).toBe(true);
    expect(arTilldelad({ skordare_maskin_id: null, skotare_maskin_id: 'A130743' }, 'A130743')).toBe(true);
    expect(arTilldelad({ skordare_maskin_id: 'R64101', skotare_maskin_id: 'A130743' }, 'JD810E')).toBe(false);
    expect(arTilldelad({ skordare_maskin_id: null, skotare_maskin_id: null }, null)).toBe(false);
  });
});

describe('valjObjektForPosition', () => {
  const inne = { lat: 56.3524, lng: 15.0509 };

  it('spec-kodbevis: Hålabäck-geometrin + spec-punkten → den träffen, inte flera', () => {
    const objekt: ObjektForVal[] = [{ id: 'halaback', typ: 'slutavverkning', status: 'avslutat', geometri: HB }];
    const r = valjObjektForPosition({ ...inne, objekt });
    expect(r.traff?.id).toBe('halaback');
    expect(r.flera).toBe(false);
  });

  it('5 km bort → ingen träff (anroparen faller tillbaka på tilldelat objekt, sektion A4)', () => {
    const objekt: ObjektForVal[] = [{ id: 'halaback', typ: 'slutavverkning', status: 'avslutat', geometri: HB }];
    const r = valjObjektForPosition({ lat: 56.3524, lng: 15.0509 + 0.08, objekt });
    expect(r.traff).toBeNull();
    expect(r.kandidater).toHaveLength(0);
  });

  it('överlappande trakter: tilldelat denna maskin vinner tiebreaket', () => {
    const geo = kvadrat(58, 15, 0.01);
    const objekt: ObjektForVal[] = [
      { id: 'planerad-ej-min', typ: 'slutavverkning', status: 'planerad', geometri: geo, skotare_maskin_id: 'ANNAN', areal: 1 },
      { id: 'min', typ: 'gallring', status: 'planerad', geometri: geo, skotare_maskin_id: 'A130743', areal: 50 },
    ];
    const r = valjObjektForPosition({ lat: 58, lng: 15, maskinId: 'A130743', objekt });
    expect(r.flera).toBe(true);
    expect(r.traff?.id).toBe('min'); // tilldelad slår status/areal
  });

  it('överlappande trakter utan tilldelning: pågående slår planerad, sedan minsta arealen', () => {
    const geo = kvadrat(59, 16, 0.01);
    const objekt: ObjektForVal[] = [
      { id: 'planerad-stor', typ: 'gallring', status: 'planerad', geometri: geo, areal: 5 },
      { id: 'pagaende-stor', typ: 'gallring', status: 'pagaende', geometri: geo, areal: 99 },
      { id: 'pagaende-liten', typ: 'gallring', status: 'pagaende', geometri: geo, areal: 3 },
    ];
    const r = valjObjektForPosition({ lat: 59, lng: 16, objekt });
    expect(r.traff?.id).toBe('pagaende-liten'); // pågående före planerad; minst areal bland pågående
  });
});
