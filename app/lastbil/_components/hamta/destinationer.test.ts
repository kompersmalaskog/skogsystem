import { describe, expect, it } from 'vitest';
import { destKoordinat, narmastePlats, rangordnaDestinationer, type DestObjekt, type DestPlats } from './destinationer';

const o = (id: string, namn: string, over: Partial<DestObjekt> = {}): DestObjekt => ({
  id, namn, vo_nummer: id.toUpperCase(), dim_objekt_id: null, status: 'planerad', lat: 56.5, lng: 14.7,
  larmkoordinat_lat: null, larmkoordinat_lng: null, larmkoordinat_bekraftad: false, skordare_maskin_id: null, skotare_maskin_id: null, ...over,
});
const GIANT = { maskin_id: 'PONS20SDJAA270231', maskin_typ: 'Harvester' };
const WISENT = { maskin_id: 'A030353', maskin_typ: 'Forwarder' };
const namnen = (r: ReturnType<typeof rangordnaDestinationer>) => r.map(x => (x.typ === 'objekt' ? x.objekt.namn : x.plats.namn));
const verkstad: DestPlats = { id: 'p1', namn: 'Verkstan', typ: 'verkstad', lat: 56.4, lng: 14.6 };

describe('rangordnaDestinationer', () => {
  const objekt = [
    o('a', 'A-trakt', { skordare_maskin_id: 'ANNAN-SKORDARE' }),
    o('b', 'B-trakt'),
    o('c', 'C-trakt', { skordare_maskin_id: GIANT.maskin_id }),
    o('d', 'D-trakt', { status: 'pagaende' }),
    o('e', 'E-avslutad', { status: 'avslutat' }),
  ];

  it('för en skördare: trakter utan skördare eller planerade för den här överst; planerad-för-den-här allra först', () => {
    const r = rangordnaDestinationer(objekt, [verkstad], GIANT, '');
    expect(namnen(r)).toEqual(['C-trakt', 'B-trakt', 'D-trakt', 'A-trakt', 'Verkstan']);
    expect(r.map(x => x.grupp)).toEqual(['vantar', 'vantar', 'vantar', 'ovriga', 'platser']);
    expect(r[0].sub).toContain('Planerad för den här maskinen');
    expect(r[3].sub).toContain('maskin finns redan');
  });

  it('för en skotare gäller skotarplatsen, inte skördarens', () => {
    const r = rangordnaDestinationer(objekt, [], WISENT, '');
    expect(r.map(x => x.grupp)).toEqual(['vantar', 'vantar', 'vantar', 'vantar']);   // ingen skotare står på någon trakt
  });

  it('avslutade trakter göms men hittas via sök — och söker man hittas också VO-numret', () => {
    expect(namnen(rangordnaDestinationer(objekt, [], GIANT, ''))).not.toContain('E-avslutad');
    const r = rangordnaDestinationer(objekt, [], GIANT, 'avslutad');
    expect(namnen(r)).toEqual(['E-avslutad']);
    expect(r[0].grupp).toBe('avslutade');
    expect(namnen(rangordnaDestinationer(objekt, [], GIANT, 'B'))).toContain('B-trakt');
  });

  it('utan maskin (peka ut var en maskin står) delas inget upp som "väntar"', () => {
    expect(rangordnaDestinationer(objekt, [], null, '').every(x => x.grupp !== 'vantar')).toBe(true);
  });

  it('en plats matchas på namn', () => {
    expect(namnen(rangordnaDestinationer([], [verkstad], GIANT, 'verk'))).toEqual(['Verkstan']);
  });
});

describe('destKoordinat — bekräftad larmkoordinat före trakten', () => {
  it('bekräftad larmkoordinat vinner', () => {
    expect(destKoordinat(o('x', 'X', { larmkoordinat_lat: 56.1, larmkoordinat_lng: 14.1, larmkoordinat_bekraftad: true }))).toEqual({ lat: 56.1, lng: 14.1, kalla: 'larmkoordinat' });
  });
  it('obekräftad larmkoordinat används inte', () => {
    expect(destKoordinat(o('x', 'X', { larmkoordinat_lat: 56.1, larmkoordinat_lng: 14.1 }))).toEqual({ lat: 56.5, lng: 14.7, kalla: 'objekt' });
  });
  it('ingen koordinat alls = null (aldrig 0,0)', () => {
    expect(destKoordinat(o('x', 'X', { lat: null, lng: null }))).toBeNull();
  });
});

describe('narmastePlats', () => {
  it('närmaste inom radien; utanför radien inget namn', () => {
    const objekt = [o('a', 'Nära', { lat: 56.5, lng: 14.7 }), o('b', 'Långt', { lat: 57.5, lng: 14.7 })];
    expect(narmastePlats({ lat: 56.501, lng: 14.701 }, objekt, [])).toMatchObject({ namn: 'Nära', objektId: 'a', platsId: null });
    expect(narmastePlats({ lat: 58, lng: 20 }, objekt, [])).toBeNull();
  });
  it('en aktiv trakt går före en avslutad på i stort sett samma plats', () => {
    const objekt = [o('a', 'Avslutad', { status: 'avslutat' }), o('b', 'Aktiv', { status: 'pagaende' })];
    expect(narmastePlats({ lat: 56.5, lng: 14.7 }, objekt, [])?.namn).toBe('Aktiv');
  });
});
