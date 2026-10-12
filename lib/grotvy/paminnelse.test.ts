import { describe, it, expect } from 'vitest';
import { byggGrotLista, type GrotDim, type GrotObjektRad, type GrotProd, type GrotRaw } from './lista';
import {
  grotPaminnelser, paminnelseMeddelande, paminnelseNyckel, paminnelsePayload, tidpunktFor, TIDPUNKTER, PAMINNELSE_TYP,
} from './paminnelse';

const IDAG = '2026-10-04';
const dagPlus = (n: number) => new Date(Date.UTC(2026, 9, 4 + n)).toISOString().slice(0, 10);

// En trakt som uppfyller ALLA medlemskapsvillkor — varje test ändrar bara det det prövar.
function dim(id: string, over: Partial<GrotDim> = {}): GrotDim {
  return {
    objekt_id: id, object_name: `Trakt ${id}`, vo_nummer: id, areal_ha: 4.2,
    latitude: 56.5, longitude: 14.7, huvudtyp: 'Slutavverkning', atgard: 'Slutavverkning',
    grot_anpassad: true, grot_hamtad: null, grot_senast: null, exkludera: false,
    risskotning: false, skordning_avslutad: '2026-08-01', skotning_avslutad: null, ...over,
  };
}
const prod = (id: string): GrotProd => ({ objekt_id: id, volym_m3sub: 100, sista_datum: '2026-08-20' });
function objekt(id: string, over: Partial<GrotObjektRad> = {}): GrotObjektRad {
  return { id, vo_nummer: null, namn: `Objekt ${id}`, typ: 'slutavverkning', status: 'avslutat', atgard: null, areal: null, lat: null, lng: null, dim_objekt_id: null, barighet: null, ...over };
}
function lista(dimmar: GrotDim[], objekten: GrotObjektRad[] = [], over: Partial<GrotRaw> = {}) {
  return byggGrotLista({ dim: dimmar, risjobb: [], kopplingar: [], prod: dimmar.map((d) => prod(d.objekt_id)), objekt: objekten, ...over }, { idag: IDAG });
}

describe('tidpunktFor — 7 och 2 dagar före, med ett dygns marginal åt det sena hållet', () => {
  it('7 och 6 dagar kvar → 7-notisen; 2 och 1 dag kvar → 2-notisen', () => {
    expect(tidpunktFor(7)).toBe(7);
    expect(tidpunktFor(6)).toBe(7);
    expect(tidpunktFor(2)).toBe(2);
    expect(tidpunktFor(1)).toBe(2);
  });
  it('allt annat ger ingen notis: 8+, 3–5, själva dagen, försenat, inget datum, ickeheltal', () => {
    [8, 14, 30, 5, 4, 3, 0, -1, -30].forEach((n) => expect(tidpunktFor(n), `dagar kvar = ${n}`).toBeNull());
    expect(tidpunktFor(null)).toBeNull();
    expect(tidpunktFor(undefined)).toBeNull();
    expect(tidpunktFor(1.5)).toBeNull();
    expect(tidpunktFor(NaN)).toBeNull();
  });
  it('tidpunkterna och typen är det uppdraget säger', () => {
    expect(Array.from(TIDPUNKTER)).toEqual([7, 2]);
    expect(PAMINNELSE_TYP).toBe('grot_senast');
  });
});

describe('paminnelseNyckel — en per tidpunkt och datum', () => {
  it('<VO eller dim-id>|<datum>|<tidpunkt>', () => {
    expect(paminnelseNyckel({ id: '11080404', voNummer: 'V-123' }, '2026-10-11', 7)).toBe('V-123|2026-10-11|7');
    expect(paminnelseNyckel({ id: '11080404', voNummer: '  V-123 ' }, '2026-10-11', 2)).toBe('V-123|2026-10-11|2');
  });
  it('utan VO-nummer används dim-id; tomt VO-nummer räknas som saknat', () => {
    expect(paminnelseNyckel({ id: '11080404', voNummer: null }, '2026-10-11', 7)).toBe('11080404|2026-10-11|7');
    expect(paminnelseNyckel({ id: '11080404', voNummer: '   ' }, '2026-10-11', 7)).toBe('11080404|2026-10-11|7');
  });
  it('ändrat datum eller annan tidpunkt → ny nyckel', () => {
    const a = paminnelseNyckel({ id: 'x', voNummer: 'V' }, '2026-10-11', 7);
    expect(paminnelseNyckel({ id: 'x', voNummer: 'V' }, '2026-10-12', 7)).not.toBe(a);
    expect(paminnelseNyckel({ id: 'x', voNummer: 'V' }, '2026-10-11', 2)).not.toBe(a);
  });
});

describe('grotPaminnelser — vilka rader som påminns idag', () => {
  it('datum om 7 dagar → 7-notis, om 2 → 2-notis; om 5, idag, igår och inget datum → inga', () => {
    const l = lista([
      dim('a', { grot_senast: dagPlus(7) }), dim('b', { grot_senast: dagPlus(2) }), dim('c', { grot_senast: dagPlus(5) }),
      dim('d', { grot_senast: dagPlus(0) }), dim('e', { grot_senast: dagPlus(-1) }), dim('f'),
    ]);
    const p = grotPaminnelser(l);
    expect(p.map((x) => [x.radId, x.tidpunkt, x.dagarKvar]).sort()).toEqual([['a', 7, 7], ['b', 2, 2]]);
  });
  it('en missad cron-dag tappar inte notisen: 6 dagar kvar → 7-notisen, 1 dag kvar → 2-notisen', () => {
    const p = grotPaminnelser(lista([dim('a', { grot_senast: dagPlus(6) }), dim('b', { grot_senast: dagPlus(1) })]));
    expect(p.map((x) => [x.radId, x.tidpunkt]).sort()).toEqual([['a', 7], ['b', 2]]);
  });
  it('körda trakter finns inte i listan och påminns aldrig (grot_hamtad satt, och länkat risjobb klart)', () => {
    const risjobb = dim('R1', { risskotning: true, huvudtyp: 'Grot', skotning_avslutad: '2026-10-01' });
    const l = lista(
      [dim('a', { grot_senast: dagPlus(7), grot_hamtad: '2026-10-01' }), dim('b', { grot_senast: dagPlus(7) }), dim('c', { grot_senast: dagPlus(7) })],
      [], { risjobb: [risjobb], kopplingar: [{ risjobb_objekt_id: 'R1', avverknings_objekt_id: 'b' }] },
    );
    expect(grotPaminnelser(l).map((x) => x.radId)).toEqual(['c']);
  });
  it('samma trakt som flera dim-rader (samma VO, samma datum) påminns EN gång', () => {
    const l = lista([dim('a1', { vo_nummer: 'V1', grot_senast: dagPlus(7) }), dim('a2', { vo_nummer: 'V1', grot_senast: dagPlus(7) }), dim('b', { vo_nummer: 'V2', grot_senast: dagPlus(7) })]);
    const p = grotPaminnelser(l);
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.nyckel).sort()).toEqual([`V1|${dagPlus(7)}|7`, `V2|${dagPlus(7)}|7`]);
  });
  it('markvillkoret kommer ur planeringen och bara när det är en begränsning (dålig bärighet)', () => {
    const l = lista(
      [dim('a', { grot_senast: dagPlus(7) }), dim('b', { grot_senast: dagPlus(7) }), dim('c', { grot_senast: dagPlus(7) }), dim('d', { grot_senast: dagPlus(7) })],
      [objekt('oa', { vo_nummer: 'a', barighet: 'dalig' }), objekt('ob', { vo_nummer: 'b', barighet: 'medel' }), objekt('oc', { vo_nummer: 'c', barighet: 'bra' })], // d saknar planering
    );
    const per = new Map(grotPaminnelser(l).map((x) => [x.radId, x.markBegransning]));
    expect(per.get('a')).toBe('dålig bärighet');
    expect(per.get('b')).toBeNull();
    expect(per.get('c')).toBeNull();
    expect(per.get('d')).toBeNull();
  });
  it('ändras datumet får samma trakt nya nycklar (nya notiser för nya datumet)', () => {
    const fore = grotPaminnelser(lista([dim('a', { grot_senast: dagPlus(7) })]));
    const efter = grotPaminnelser(lista([dim('a', { grot_senast: dagPlus(6) })]));
    expect(fore[0].nyckel).not.toBe(efter[0].nyckel);
  });
  it('tom lista → inga påminnelser', () => {
    expect(grotPaminnelser(lista([]))).toEqual([]);
  });
});

describe('paminnelseMeddelande — texten', () => {
  const p = { namn: 'Karsemåla AU 2025', senast: '2026-10-11', dagar_fore: 7 as const, mark_begransning: null };
  it('titel GROT · namn, brödtext "Ska vara bortkört senast 11 okt", tryck öppnar översikten', () => {
    const m = paminnelseMeddelande(p, '2026-10-04');
    expect(m.title).toBe('GROT · Karsemåla AU 2025');
    expect(m.body).toBe('Ska vara bortkört senast 11 okt');
    expect(m.url).toBe('/oversikt-v2');
    expect(m.tag).toContain('2026-10-11');
  });
  it('markvillkoret kommer efter tankstreck — bara när det är satt', () => {
    expect(paminnelseMeddelande({ ...p, mark_begransning: 'dålig bärighet' }, '2026-10-04').body).toBe('Ska vara bortkört senast 11 okt — dålig bärighet');
    expect(paminnelseMeddelande({ ...p, mark_begransning: '' }, '2026-10-04').body).toBe('Ska vara bortkört senast 11 okt');
    expect(paminnelseMeddelande({ ...p, mark_begransning: '  ' }, '2026-10-04').body).toBe('Ska vara bortkört senast 11 okt');
  });
  it('annat år än idag tas med i datumet', () => {
    expect(paminnelseMeddelande({ ...p, senast: '2027-01-02' }, '2026-12-31').body).toBe('Ska vara bortkört senast 2 jan 2027');
  });
  it('tomt eller trasigt underlag ger en läsbar text, inte ett undantag', () => {
    expect(paminnelseMeddelande(null, '2026-10-04')).toMatchObject({ title: 'GROT · okänt objekt', body: 'Ska vara bortkört senast okänt datum' });
    expect(paminnelseMeddelande({}, '2026-10-04').title).toBe('GROT · okänt objekt');
  });
  it('payloaden som köas ger exakt den text som pushas', () => {
    const [x] = grotPaminnelser(lista([dim('a', { object_name: 'Bjällerhult au + ga', grot_senast: dagPlus(7) })], [objekt('oa', { vo_nummer: 'a', barighet: 'dalig' })]));
    expect(paminnelsePayload(x)).toEqual({ namn: 'Bjällerhult au + ga', senast: dagPlus(7), dagar_fore: 7, mark_begransning: 'dålig bärighet' });
    expect(paminnelseMeddelande(paminnelsePayload(x), IDAG).body).toBe('Ska vara bortkört senast 11 okt — dålig bärighet');
  });
});
