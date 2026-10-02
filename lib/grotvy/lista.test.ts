import { describe, it, expect } from 'vitest';
import {
  byggGrotLista, grotVantandeObjektIds, objektRaderFor, koordinatFor, typFor, rollMatcharTyp,
  rimligKoordinat, arGrotSkal, STAAR_HAR_DAGAR,
  type GrotDim, type GrotObjektRad, type GrotProd, type GrotKoppling, type GrotRaw, type GrotPlats,
} from './lista';

const IDAG = '2026-10-02';

// En trakt som uppfyller ALLA medlemskapsvillkor — varje test ändrar bara det det prövar.
function dim(id: string, over: Partial<GrotDim> = {}): GrotDim {
  return {
    objekt_id: id, object_name: `Trakt ${id}`, vo_nummer: id, areal_ha: 4.2,
    latitude: 56.5, longitude: 14.7, huvudtyp: 'Slutavverkning', atgard: 'Slutavverkning',
    grot_anpassad: true, grot_hamtad: null, grot_senast: null, grot_skal: null, exkludera: false,
    risskotning: false, skordning_avslutad: '2026-08-01', skotning_avslutad: null, ...over,
  };
}
const prod = (id: string, m3: number | string, sista: string | null = '2026-08-20'): GrotProd => ({ objekt_id: id, volym_m3sub: m3, sista_datum: sista });
function objekt(id: string, over: Partial<GrotObjektRad> = {}): GrotObjektRad {
  return { id, vo_nummer: null, namn: `Objekt ${id}`, typ: 'slutavverkning', status: 'avslutat', atgard: null, areal: null, lat: null, lng: null, dim_objekt_id: null, ...over };
}
function raw(over: Partial<GrotRaw> = {}): GrotRaw {
  return { dim: [], risjobb: [], kopplingar: [], prod: [], objekt: [], ...over };
}
const ids = (l: { alla: { id: string }[] }) => l.alla.map((r) => r.id);

describe('medlemskap — rislistan + skördningen avslutad', () => {
  it('en trakt som uppfyller allt är med', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 500)] }), { idag: IDAG });
    expect(ids(l)).toEqual(['1']);
    expect(l.alla[0].skordatM3).toBe(500);
  });
  it('inte grot_anpassad → ur', () => {
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { grot_anpassad: false })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { grot_anpassad: null })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
  });
  it('exkluderad → ur', () => {
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { exkludera: true })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
  });
  it('ett risjobb är ingen trakt — varken via risskotning eller huvudtyp Grot', () => {
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { risskotning: true })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { huvudtyp: 'Grot' })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
  });
  it('grot_hamtad satt → ur', () => {
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { grot_hamtad: '2026-09-01' })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
  });
  it('skördningen inte avslutad → ur (flaggan är grind)', () => {
    expect(ids(byggGrotLista(raw({ dim: [dim('1', { skordning_avslutad: null })], prod: [prod('1', 500)] }), { idag: IDAG }))).toEqual([]);
  });
  it('ingen skördad volym → ur (saknad rad och 0 m³)', () => {
    expect(ids(byggGrotLista(raw({ dim: [dim('1')], prod: [] }), { idag: IDAG }))).toEqual([]);
    expect(ids(byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 0)] }), { idag: IDAG }))).toEqual([]);
    expect(ids(byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 'x')] }), { idag: IDAG }))).toEqual([]);
  });
  it('volym som text (numeric från PostgREST) läses som tal', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', '309.3432')] }), { idag: IDAG });
    expect(l.alla[0].skordatM3).toBeCloseTo(309.3432, 4);
  });
});

describe('avverkat = sista skördardagen, inte flaggans datum', () => {
  it('datum och dagar kommer ur vy_uppf_prod_per_objekt', () => {
    const l = byggGrotLista(raw({ dim: [dim('1', { skordning_avslutad: '2026-04-29' })], prod: [prod('1', 100, '2026-04-09')] }), { idag: IDAG });
    expect(l.alla[0].avverkat).toBe('2026-04-09');
    expect(l.alla[0].dagar).toBe(176);
  });
  it('saknat sista_datum → null, inte flaggans datum', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 100, null)] }), { idag: IDAG });
    expect(l.alla[0].avverkat).toBeNull();
    expect(l.alla[0].dagar).toBeNull();
  });
});

describe('körd-regel — länkat risjobb med skotning_avslutad', () => {
  const risjobb = (klar: string | null) => dim('R1', { risskotning: true, huvudtyp: 'Grot', object_name: 'GROT Trakt 1', skotning_avslutad: klar });
  const lank: GrotKoppling = { risjobb_objekt_id: 'R1', avverknings_objekt_id: '1' };
  it('risjobbet klart → trakten lämnar listan', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 500)], risjobb: [risjobb('2026-09-30')], kopplingar: [lank] }), { idag: IDAG });
    expect(ids(l)).toEqual([]);
  });
  it('risjobbet inte klart → trakten är kvar', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 500)], risjobb: [risjobb(null)], kopplingar: [lank] }), { idag: IDAG });
    expect(ids(l)).toEqual(['1']);
  });
  it('ett klart risjobb räcker även om en annan länk inte är klar', () => {
    const r2 = dim('R2', { risskotning: true, huvudtyp: 'Grot', skotning_avslutad: null });
    const l = byggGrotLista(raw({
      dim: [dim('1')], prod: [prod('1', 500)], risjobb: [risjobb('2026-09-30'), r2],
      kopplingar: [lank, { risjobb_objekt_id: 'R2', avverknings_objekt_id: '1' }],
    }), { idag: IDAG });
    expect(ids(l)).toEqual([]);
  });
  it('länk till en annan trakt påverkar inte denna', () => {
    const l = byggGrotLista(raw({
      dim: [dim('1'), dim('2')], prod: [prod('1', 500), prod('2', 300)], risjobb: [risjobb('2026-09-30')],
      kopplingar: [{ risjobb_objekt_id: 'R1', avverknings_objekt_id: '2' }],
    }), { idag: IDAG });
    expect(ids(l)).toEqual(['1']);
  });
  it('en hängande länk (risjobbet finns inte i dim) ignoreras', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 500)], kopplingar: [lank] }), { idag: IDAG });
    expect(ids(l)).toEqual(['1']);
  });
});

describe('två grupper och ordning', () => {
  it('"När det passar": äldst avverkat först, okänt datum sist, namn avgör vid lika', () => {
    const l = byggGrotLista(raw({
      dim: [dim('a', { object_name: 'Nyast' }), dim('b', { object_name: 'Äldst' }), dim('c', { object_name: 'Utan datum' }), dim('d', { object_name: 'Bertil' }), dim('e', { object_name: 'Adam' })],
      prod: [prod('a', 1, '2026-09-20'), prod('b', 1, '2025-12-17'), prod('c', 1, null), prod('d', 1, '2026-05-05'), prod('e', 1, '2026-05-05')],
    }), { idag: IDAG });
    expect(l.markagaren).toEqual([]);
    expect(l.passar.map((r) => r.namn)).toEqual(['Äldst', 'Adam', 'Bertil', 'Nyast', 'Utan datum']);
  });
  it('"Markägaren vill ha det bort": sorterat på datum, försenat före kommande, resten under', () => {
    const l = byggGrotLista(raw({
      dim: [
        dim('a', { object_name: 'Senare', grot_senast: '2026-11-01' }),
        dim('b', { object_name: 'Försenad', grot_senast: '2026-09-20' }),
        dim('c', { object_name: 'Snart', grot_senast: '2026-10-03' }),
        dim('d', { object_name: 'Vanlig' }),
      ],
      prod: [prod('a', 1), prod('b', 1), prod('c', 1), prod('d', 1)],
    }), { idag: IDAG });
    expect(l.markagaren.map((r) => r.namn)).toEqual(['Försenad', 'Snart', 'Senare']);
    expect(l.passar.map((r) => r.namn)).toEqual(['Vanlig']);
    expect(l.alla.map((r) => r.namn)).toEqual(['Försenad', 'Snart', 'Senare', 'Vanlig']);
  });
  it('tom markägargrupp → tom lista (vyn visar då ingen rubrik)', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 5)] }), { idag: IDAG });
    expect(l.markagaren).toHaveLength(0);
    expect(l.passar).toHaveLength(1);
  });
  it('lika datum i markägargruppen → äldst avverkat först', () => {
    const l = byggGrotLista(raw({
      dim: [dim('a', { object_name: 'Nyare', grot_senast: '2026-10-10' }), dim('b', { object_name: 'Äldre', grot_senast: '2026-10-10' })],
      prod: [prod('a', 1, '2026-09-01'), prod('b', 1, '2026-03-01')],
    }), { idag: IDAG });
    expect(l.markagaren.map((r) => r.namn)).toEqual(['Äldre', 'Nyare']);
  });
  it('skäl behålls bara när datum finns, och bara om det är ett av de tre', () => {
    const l = byggGrotLista(raw({
      dim: [
        dim('a', { grot_senast: '2026-10-10', grot_skal: 'plantering' }),
        dim('b', { grot_senast: null, grot_skal: 'markberedning' }),
        dim('c', { grot_senast: '2026-10-11', grot_skal: 'okänt skäl' }),
      ],
      prod: [prod('a', 1), prod('b', 1), prod('c', 1)],
    }), { idag: IDAG });
    const per = new Map(l.alla.map((r) => [r.id, r]));
    expect(per.get('a')!.skal).toBe('plantering');
    expect(per.get('b')!.skal).toBeNull();
    expect(per.get('b')!.senast).toBeNull();
    expect(per.get('c')!.skal).toBeNull();
    expect(per.get('c')!.senast).toBe('2026-10-11');
  });
});

describe('dim ↔ objekt', () => {
  const d = dim('11111307', { vo_nummer: '11111307' });
  it('FK vinner över vo_nummer', () => {
    const fk = objekt('fk', { dim_objekt_id: '11111307' });
    const vo = objekt('vo', { vo_nummer: '11111307' });
    expect(objektRaderFor(d, [vo, fk]).map((o) => o.id)).toEqual(['fk', 'vo']);
  });
  it('vo_nummer = dimmens vo_nummer', () => {
    expect(objektRaderFor(dim('X', { vo_nummer: '4-123' }), [objekt('o1', { vo_nummer: '4-123' })]).map((o) => o.id)).toEqual(['o1']);
  });
  it('vo_nummer = dimmens objekt_id (numeriska nycklar)', () => {
    expect(objektRaderFor(dim('11111307', { vo_nummer: null }), [objekt('o1', { vo_nummer: '11111307' })]).map((o) => o.id)).toEqual(['o1']);
  });
  it('ingen träff → tom (trakten saknar objekt i planeringen)', () => {
    expect(objektRaderFor(d, [objekt('o1', { vo_nummer: '999' })])).toEqual([]);
    const l = byggGrotLista(raw({ dim: [d], prod: [prod('11111307', 5)] }), { idag: IDAG });
    expect(l.alla[0].objekt).toBeNull();
    expect(grotVantandeObjektIds(l).size).toBe(0);
  });
  it('samma objekt-rad räknas bara en gång även om flera regler träffar', () => {
    const o = objekt('o1', { dim_objekt_id: '11111307', vo_nummer: '11111307' });
    expect(objektRaderFor(d, [o])).toHaveLength(1);
  });
  it('grotVantandeObjektIds samlar objekt.id för trakter med objekt-rad', () => {
    const l = byggGrotLista(raw({
      dim: [dim('1'), dim('2')], prod: [prod('1', 5), prod('2', 5)],
      objekt: [objekt('uuid-1', { vo_nummer: '1' })],
    }), { idag: IDAG });
    expect(Array.from(grotVantandeObjektIds(l))).toEqual(['uuid-1']);
  });
});

describe('koordinater', () => {
  it('objektets egen punkt före dim_objekt', () => {
    const o = objekt('o', { lat: 56.6, lng: 14.8 });
    expect(koordinatFor(o, dim('1', { latitude: 56.1, longitude: 14.1 }))).toEqual({ lat: 56.6, lng: 14.8 });
  });
  it('dim_objekt när objektet saknar punkt eller saknas', () => {
    expect(koordinatFor(objekt('o'), dim('1', { latitude: 56.1, longitude: 14.1 }))).toEqual({ lat: 56.1, lng: 14.1 });
    expect(koordinatFor(null, dim('1', { latitude: 56.1, longitude: 14.1 }))).toEqual({ lat: 56.1, lng: 14.1 });
  });
  it('en punkt 52 mil bort räknas som saknad och faller tillbaka', () => {
    const fel = objekt('o', { lat: 60.61, lng: 16.69 });
    expect(koordinatFor(fel, dim('1', { latitude: 56.1, longitude: 14.1 }))).toEqual({ lat: 56.1, lng: 14.1 });
    expect(koordinatFor(fel, dim('1', { latitude: 60.61, longitude: 16.69 }))).toBeNull();
  });
  it('ingen punkt alls → null (raden visar "–")', () => {
    expect(koordinatFor(null, dim('1', { latitude: null, longitude: null }))).toBeNull();
  });
  it('rimligKoordinat: null, NaN och 0/0 är inte rimliga', () => {
    expect(rimligKoordinat(null, 14)).toBe(false);
    expect(rimligKoordinat(NaN, 14)).toBe(false);
    expect(rimligKoordinat(0, 0)).toBe(false);
    expect(rimligKoordinat(56.5, 14.72)).toBe(true);
  });
});

describe('typ och skotar_roll', () => {
  it('objektets typ först, annars huvudtyp', () => {
    expect(typFor(objekt('o', { typ: 'gallring' }), dim('1'))).toBe('gallring');
    expect(typFor(null, dim('1', { huvudtyp: 'Gallring' }))).toBe('gallring');
    expect(typFor(null, dim('1', { huvudtyp: 'Slutavverkning' }))).toBe('slutavverkning');
    expect(typFor(null, dim('1', { huvudtyp: null }))).toBeNull();
  });
  it('rollMatcharTyp speglar v2: allt tar allt, annars exakt typ, okänd typ bara allt', () => {
    expect(rollMatcharTyp('allt', 'gallring')).toBe(true);
    expect(rollMatcharTyp('allt', null)).toBe(true);
    expect(rollMatcharTyp('slutavverkning', 'slutavverkning')).toBe(true);
    expect(rollMatcharTyp('slutavverkning', 'gallring')).toBe(false);
    expect(rollMatcharTyp('gallring', 'gallring')).toBe(true);
    expect(rollMatcharTyp('slutavverkning', null)).toBe(false);
    expect(rollMatcharTyp(null, 'slutavverkning')).toBe(false);
    expect(rollMatcharTyp('okänd', 'slutavverkning')).toBe(false);
  });
  it('arGrotSkal', () => {
    expect(arGrotSkal('markberedning')).toBe(true);
    expect(arGrotSkal('plantering')).toBe(true);
    expect(arGrotSkal('annat')).toBe(true);
    expect(arGrotSkal('Annat')).toBe(false);
    expect(arGrotSkal(null)).toBe(false);
  });
});

describe('"X står här" — bara via ett länkat risjobb, bara färsk position', () => {
  const risjobb = dim('R1', { risskotning: true, huvudtyp: 'Grot', object_name: 'GROT Brokamåla', vo_nummer: 'R1' });
  const bas = (platser: Map<string, GrotPlats>, over: Partial<GrotRaw> = {}) => byggGrotLista(raw({
    dim: [dim('1')], prod: [prod('1', 500)], risjobb: [risjobb],
    kopplingar: [{ risjobb_objekt_id: 'R1', avverknings_objekt_id: '1' }],
    objekt: [objekt('uuid-r1', { vo_nummer: 'R1' })], ...over,
  }), { idag: IDAG, platser, skotare: [{ id: 'A030353', namn: 'Wisent' }, { id: 'A110148', namn: 'Elefanten' }] });

  it('maskinens senaste plats är risjobbets objekt, ≤ 7 dagar → står här', () => {
    const l = bas(new Map([['A030353', { objektId: 'uuid-r1', tidpunkt: '2026-10-01' }]]));
    expect(l.alla[0].staarHar).toEqual({ maskinId: 'A030353', risjobb: 'GROT Brokamåla' });
  });
  it('exakt 7 dagar räknas, 8 dagar gör det inte', () => {
    expect(STAAR_HAR_DAGAR).toBe(7);
    expect(bas(new Map([['A030353', { objektId: 'uuid-r1', tidpunkt: '2026-09-25' }]])).alla[0].staarHar).not.toBeNull();
    expect(bas(new Map([['A030353', { objektId: 'uuid-r1', tidpunkt: '2026-09-24' }]])).alla[0].staarHar).toBeNull();
  });
  it('ISO-tid med klockslag fungerar', () => {
    expect(bas(new Map([['A030353', { objektId: 'uuid-r1', tidpunkt: '2026-10-02T06:12:00Z' }]])).alla[0].staarHar?.maskinId).toBe('A030353');
  });
  it('maskinen står på något annat objekt → inte här', () => {
    expect(bas(new Map([['A030353', { objektId: 'annat', tidpunkt: '2026-10-01' }]])).alla[0].staarHar).toBeNull();
  });
  it('maskinen står på TRAKTENS egen objekt-rad räknas inte — bara via risjobbet', () => {
    const l = bas(new Map([['A030353', { objektId: 'uuid-t1', tidpunkt: '2026-10-01' }]]), { objekt: [objekt('uuid-r1', { vo_nummer: 'R1' }), objekt('uuid-t1', { vo_nummer: '1' })] });
    expect(l.alla[0].staarHar).toBeNull();
  });
  it('okänd position (ingen objektId / ingen tid) → inte här', () => {
    expect(bas(new Map([['A030353', { objektId: null, tidpunkt: '2026-10-01' }]])).alla[0].staarHar).toBeNull();
    expect(bas(new Map([['A030353', { objektId: 'uuid-r1', tidpunkt: null }]])).alla[0].staarHar).toBeNull();
  });
  it('risjobb utan objekt-rad kan inte matchas → inte här', () => {
    expect(bas(new Map([['A030353', { objektId: 'uuid-r1', tidpunkt: '2026-10-01' }]]), { objekt: [] }).alla[0].staarHar).toBeNull();
  });
  it('en maskin som inte är en av skotarna räknas inte', () => {
    expect(bas(new Map([['R64101', { objektId: 'uuid-r1', tidpunkt: '2026-10-01' }]])).alla[0].staarHar).toBeNull();
  });
  it('utan platser eller skotare visas aldrig "står här"', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 5)] }), { idag: IDAG });
    expect(l.alla[0].staarHar).toBeNull();
  });
  it('utan länkat risjobb → aldrig "står här", hur nära maskinen än står', () => {
    const l = byggGrotLista(raw({ dim: [dim('1')], prod: [prod('1', 5)], objekt: [objekt('uuid-t1', { vo_nummer: '1' })] }), {
      idag: IDAG, platser: new Map([['A030353', { objektId: 'uuid-t1', tidpunkt: '2026-10-02' }]]), skotare: [{ id: 'A030353', namn: 'Wisent' }],
    });
    expect(l.alla[0].staarHar).toBeNull();
  });
});

describe('radens fält', () => {
  it('åtgärd: objektets först, annars dimmens; areal likaså', () => {
    const l = byggGrotLista(raw({
      dim: [dim('1', { atgard: 'Slutavverkning', areal_ha: 3 }), dim('2', { atgard: 'Föryngringsavverkning', areal_ha: 5.5 })],
      prod: [prod('1', 5), prod('2', 5)],
      objekt: [objekt('o1', { vo_nummer: '1', atgard: 'Slutavv. gran', areal: 7.25 })],
    }), { idag: IDAG });
    const per = new Map(l.alla.map((r) => [r.id, r]));
    expect(per.get('1')!.atgard).toBe('Slutavv. gran');
    expect(per.get('1')!.arealHa).toBe(7.25);
    expect(per.get('2')!.atgard).toBe('Föryngringsavverkning');
    expect(per.get('2')!.arealHa).toBe(5.5);
  });
  it('namn: dimmens, annars objektets, annars nyckeln', () => {
    const l = byggGrotLista(raw({
      dim: [dim('1', { object_name: '  Rössmåla  ' }), dim('2', { object_name: null }), dim('3', { object_name: '' })],
      prod: [prod('1', 5), prod('2', 5), prod('3', 5)],
      objekt: [objekt('o2', { vo_nummer: '2', namn: 'Objektnamn' })],
    }), { idag: IDAG });
    const per = new Map(l.alla.map((r) => [r.id, r]));
    expect(per.get('1')!.namn).toBe('Rössmåla');
    expect(per.get('2')!.namn).toBe('Objektnamn');
    expect(per.get('3')!.namn).toBe('3');
  });
});
