import { describe, expect, it } from 'vitest';
import type { EgenkontrollPunkt } from './egenkontroll';
import {
  FIX_GAMMAL_MS,
  POSITION_MAX_NOGGRANNHET_M,
  SAKNAR_PLATS_MENING,
  arForstaSvaret,
  avstandPerPunkt,
  bedomPosition,
  efterSvar,
  kortStangning,
  narmasteObesvarade,
  ordnaGruppEfterAvstand,
  positionSkalText,
  radLage,
  startLage,
  terrangKvar,
  terrangPunkter,
  type AvstandRad,
  type Fix,
} from './egenkontrollFlode';

// Origo i mitten av en tankt trakt. x/y ar SVG-rymd: okande x = ost, okande y = syd.
const ORIGO = { lat: 56.5, lng: 14.9, zoom: 14 };

function punkt(id: string, over: Partial<EgenkontrollPunkt> = {}): EgenkontrollPunkt {
  return {
    id, egenkontroll_id: 'e1', ordning: 1, del: 'plan', grupp: 'Naturvård', kalla: 'markering',
    markering_id: null, markering_marker_id: null, punkt_typ: 'eternitytree', rubrik: id,
    antal_planerat: null, geometri_snapshot: { x: 0, y: 0 }, status: null, avvikelse_typ: null,
    varde_foreslaget: null, varde_bekraftat: null, kommentar: null, lat: null, lng: null,
    besvarad: null, plan_kommentar: null,
    ...over,
  } as unknown as EgenkontrollPunkt;
}

const fix = (over: Partial<Fix> = {}): Fix => ({ lat: 56.5, lng: 14.9, noggrannhet: 10, t: 1_000_000, ...over });
const NU = 1_000_000;

describe('bedomPosition - en funktion som avgor om positionen duger', () => {
  it('ingen fix an och tiden inte ute: soker', () => {
    expect(bedomPosition(null, null, false, NU)).toEqual({ status: 'soker', position: null, skal: null });
  });
  it('ingen fix och 10 s ute: saknas, med skal', () => {
    expect(bedomPosition(null, null, true, NU)).toMatchObject({ status: 'saknas', position: null, skal: 'tidsgrans' });
  });
  it('en bra fix: ok, och positionen ar med', () => {
    const r = bedomPosition(fix(), null, false, NU);
    expect(r.status).toBe('ok');
    expect(r.position).toEqual({ lat: 56.5, lng: 14.9, noggrannhet: 10 });
  });
  it(`${POSITION_MAX_NOGGRANNHET_M} m exakt duger, strax over gor det inte`, () => {
    expect(bedomPosition(fix({ noggrannhet: 100 }), null, false, NU).status).toBe('ok');
    const r = bedomPosition(fix({ noggrannhet: 100.5 }), null, false, NU);
    expect(r).toMatchObject({ status: 'saknas', position: null, skal: 'otillracklig' });
  });
  it('okand noggrannhet (null) far galla - den gar inte att doma', () => {
    expect(bedomPosition(fix({ noggrannhet: null }), null, false, NU).status).toBe('ok');
  });
  it('en fix aldre an gransen ar inte langre var man ar', () => {
    expect(bedomPosition(fix({ t: NU - FIX_GAMMAL_MS }), null, false, NU).status).toBe('ok');
    expect(bedomPosition(fix({ t: NU - FIX_GAMMAL_MS - 1 }), null, false, NU))
      .toMatchObject({ status: 'saknas', skal: 'gammal' });
  });
  it('nekad plats slar en i och for sig bra fix', () => {
    expect(bedomPosition(fix(), 'nekad', false, NU)).toMatchObject({ status: 'saknas', skal: 'nekad' });
    expect(bedomPosition(null, 'ej_stod', false, NU)).toMatchObject({ status: 'saknas', skal: 'ej_stod' });
  });
  it('varje skal har en egen text - tomt far aldrig betyda tva saker', () => {
    const skal = ['nekad', 'ej_stod', 'tidsgrans', 'otillracklig', 'gammal'] as const;
    const texter = skal.map((s) => positionSkalText(s, 230));
    expect(new Set(texter).size).toBe(skal.length);
    expect(texter.every((t) => t.length > 0)).toBe(true);
    expect(positionSkalText('otillracklig', 230)).toContain('±230 m');
    expect(positionSkalText(null)).toBe('');
  });
});

describe('avstandPerPunkt', () => {
  it('utan origo eller position: tom karta, aldrig en gissning', () => {
    const p = [punkt('a')];
    expect(avstandPerPunkt(p, null, { lat: 56.5, lng: 14.9 }).size).toBe(0);
    expect(avstandPerPunkt(p, ORIGO, null).size).toBe(0);
  });
  it('en punkt utan geometri far ingen post', () => {
    const m = avstandPerPunkt([punkt('a', { geometri_snapshot: null })], ORIGO, { lat: 56.5, lng: 14.9 });
    expect(m.has('a')).toBe(false);
  });
  it('en linje matas till sin NARMASTE brytpunkt', () => {
    const linje = punkt('l', { geometri_snapshot: { path: [{ x: 500, y: 0 }, { x: 5, y: 0 }, { x: 900, y: 0 }] } });
    const punktNara = punkt('p', { geometri_snapshot: { x: 5, y: 0 } });
    const pos = { lat: 56.5, lng: 14.9 };
    const m = avstandPerPunkt([linje, punktNara], ORIGO, pos);
    expect(m.get('l')!.m).toBeCloseTo(m.get('p')!.m, 6);
  });
});

describe('narmasteObesvarade', () => {
  const avst = (rader: Record<string, number>): Map<string, AvstandRad> =>
    new Map(Object.entries(rader).map(([id, m]) => [id, { m, r: 'N' }]));

  it('valjer den narmaste obesvarade', () => {
    const ps = [punkt('a'), punkt('b'), punkt('c')];
    expect(narmasteObesvarade(ps, avst({ a: 80, b: 20, c: 50 }))).toBe('b');
  });
  it('hoppar over besvarade, hur nara de an ligger', () => {
    const ps = [punkt('a'), punkt('b', { status: 'ok' })];
    expect(narmasteObesvarade(ps, avst({ a: 80, b: 1 }))).toBe('a');
  });
  it('hoppar over punkter utan plats - de gissas aldrig in', () => {
    const ps = [punkt('a'), punkt('b')];
    expect(narmasteObesvarade(ps, avst({ b: 300 }))).toBe('b');
    expect(narmasteObesvarade(ps, avst({}))).toBeNull();
  });
  it('`utom` lyfter bort punkten man precis svarat pa', () => {
    const ps = [punkt('a'), punkt('b')];
    expect(narmasteObesvarade(ps, avst({ a: 5, b: 90 }), 'a')).toBe('b');
  });
  it('lika avstand: den som kommer forst i rundan vinner, varje gang', () => {
    const ps = [punkt('a'), punkt('b')];
    expect(narmasteObesvarade(ps, avst({ a: 40, b: 40 }))).toBe('a');
    expect(narmasteObesvarade([...ps].reverse(), avst({ a: 40, b: 40 }))).toBe('b');
  });
  it('allt besvarat: ingen', () => {
    expect(narmasteObesvarade([punkt('a', { status: 'ok' })], avst({ a: 3 }))).toBeNull();
  });
});

describe('ordnaGruppEfterAvstand', () => {
  it('narmast forst, utan plats sist, lika avstand behaller rundans ordning', () => {
    const ps = [punkt('a'), punkt('x'), punkt('b'), punkt('c'), punkt('y')];
    const avst = new Map<string, AvstandRad>([
      ['a', { m: 50, r: 'N' }], ['b', { m: 10, r: 'N' }], ['c', { m: 50, r: 'N' }],
    ]);
    expect(ordnaGruppEfterAvstand(ps, avst).map((p) => p.id)).toEqual(['b', 'a', 'c', 'x', 'y']);
  });
  it('utan nagon plats: rundans ordning, oforandrad', () => {
    const ps = [punkt('a'), punkt('b')];
    expect(ordnaGruppEfterAvstand(ps, new Map()).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('terrangen - harleds ur datan', () => {
  const alla = [
    punkt('p1', { status: 'ok' }), punkt('p2'), punkt('p3', { status: 'avvikelse' }),
    punkt('u1', { del: 'utforande' }), punkt('m1', { del: 'matning' }),
  ];
  it('bara planpunkter ar i terrangen - utforande och matning raknas inte', () => {
    expect(terrangPunkter(alla).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(terrangKvar(alla)).toBe(1);
  });
  it('en avvikelse ar besvarad - den kommer inte tillbaka som obesvarad', () => {
    expect(terrangKvar([punkt('p', { status: 'avvikelse' })])).toBe(0);
  });
  it('en runda utan planpunkter har ingenting kvar i terrangen', () => {
    expect(terrangKvar([punkt('u1', { del: 'utforande' })])).toBe(0);
  });
});

describe('startLage', () => {
  const bas = { harRunda: true, klar: false, harOrigo: true, terrangKvar: 4, positionHarFallit: false, harKort: false };
  it('i flodet (kortet har en punkt) lamnas kartan inte nar sista punkten besvaras', () => {
    expect(startLage({ ...bas, terrangKvar: 0, harKort: true })).toBe('karta');
  });
  it('i flodet lamnas kartan inte heller nar positionen tappas', () => {
    expect(startLage({ ...bas, positionHarFallit: true, harKort: true })).toBe('karta');
  });
  it('men en klar runda, en runda utan plats och en ej startad runda ar alltid listan', () => {
    expect(startLage({ ...bas, harKort: true, klar: true })).toBe('lista');
    expect(startLage({ ...bas, harKort: true, harOrigo: false })).toBe('lista');
    expect(startLage({ ...bas, harKort: true, harRunda: false })).toBe('lista');
  });
  it('oppen runda, origo, punkter kvar: kartan', () => {
    expect(startLage(bas)).toBe('karta');
  });
  it('utan position: listan', () => {
    expect(startLage({ ...bas, positionHarFallit: true })).toBe('lista');
  });
  it('utan origo: listan - punkterna gar inte att placera', () => {
    expect(startLage({ ...bas, harOrigo: false })).toBe('lista');
  });
  it('en fardigt besvarad terrang oppnar direkt pa avslutet', () => {
    expect(startLage({ ...bas, terrangKvar: 0 })).toBe('lista');
  });
  it('klar runda och ej startad runda: listan', () => {
    expect(startLage({ ...bas, klar: true })).toBe('lista');
    expect(startLage({ ...bas, harRunda: false })).toBe('lista');
  });
});

describe('radLage', () => {
  it('utan frysta positionen: fulla kort (dagens lista)', () => {
    expect(radLage({ harFrystPosition: false, terrangKvar: 3 })).toBe('full');
  });
  it('med position: kompakta rader', () => {
    expect(radLage({ harFrystPosition: true, terrangKvar: 3 })).toBe('kompakt');
  });
  it('allt besvarat: kompakt - det finns inget att svara pa i listan', () => {
    expect(radLage({ harFrystPosition: false, terrangKvar: 0 })).toBe('kompakt');
  });
});

describe('efterSvar - vart kortet gar nar en punkt fatt sitt forsta svar', () => {
  const avst = (rader: Record<string, number>) =>
    new Map<string, AvstandRad>(Object.entries(rader).map(([id, m]) => [id, { m, r: 'N' }]));

  it('narmaste obesvarade, aldrig den man precis svarade pa', () => {
    const ps = [punkt('a', { status: 'ok' }), punkt('b'), punkt('c')];
    expect(efterSvar({ planpunkter: ps, besvaradId: 'a', avstand: avst({ a: 1, b: 90, c: 40 }) }))
      .toEqual({ typ: 'punkt', id: 'c' });
  });
  it('sista punkten i terrangen: klart', () => {
    const ps = [punkt('a', { status: 'ok' }), punkt('b', { status: 'ok' })];
    expect(efterSvar({ planpunkter: ps, besvaradId: 'b', avstand: avst({}) })).toEqual({ typ: 'klart' });
  });
  it('ingen position: stanna - aldrig en gissad nasta', () => {
    const ps = [punkt('a', { status: 'ok' }), punkt('b')];
    expect(efterSvar({ planpunkter: ps, besvaradId: 'a', avstand: avst({}) })).toEqual({ typ: 'stanna' });
  });
  it('bara punkter utan plats kvar: stanna, inte klart - terrangen ar inte klar', () => {
    const ps = [punkt('a', { status: 'ok' }), punkt('b')];
    expect(efterSvar({ planpunkter: ps, besvaradId: 'a', avstand: avst({ a: 5 }) })).toEqual({ typ: 'stanna' });
  });
});

describe('kortStangning - en besvarad punkt i kortet gar alltid att stanga', () => {
  const bas = { klartKort: false, terrangKvar: 3, nastaFinns: false, positionOk: false };

  it('VERKLIGA FALLET: svarat utan position, ingen nasta - kortet gar att stanga, och det sags varfor', () => {
    expect(kortStangning({ ...bas, kort: { status: 'ok' } }))
      .toEqual({ kanStangas: true, forklaring: 'position' });
  });
  it('MED position men det som aterstar saknar plats: samma fastnade kort, annan forklaring', () => {
    expect(kortStangning({ ...bas, kort: { status: 'ok' }, positionOk: true }))
      .toEqual({ kanStangas: true, forklaring: 'plats' });
  });
  it('en nasta finns att peka ut: gar att stanga, men ingen forklaring - inget ar fel', () => {
    expect(kortStangning({ ...bas, kort: { status: 'avvikelse' }, nastaFinns: true, positionOk: true }))
      .toEqual({ kanStangas: true, forklaring: null });
  });
  it('en besvarad punkt som bara ska ses igenom (terrangen klar): gar att stanga, ingen forklaring', () => {
    expect(kortStangning({ ...bas, kort: { status: 'ok' }, terrangKvar: 0 }))
      .toEqual({ kanStangas: true, forklaring: null });
  });
  it('alla svar raknas som besvarat - ocksa battre', () => {
    for (const status of ['ok', 'avvikelse', 'battre'] as const) {
      expect(kortStangning({ ...bas, kort: { status } }).kanStangas).toBe(true);
    }
  });
  it('en OBESVARAD punkt stangs aldrig - den ska besvaras', () => {
    expect(kortStangning({ ...bas, kort: { status: null } })).toEqual({ kanStangas: false, forklaring: null });
    expect(kortStangning({ ...bas, kort: { status: null }, positionOk: true, nastaFinns: true }).kanStangas).toBe(false);
  });
  it('inget kort: inget att stanga', () => {
    expect(kortStangning({ ...bas, kort: null })).toEqual({ kanStangas: false, forklaring: null });
  });
  it('pa vag till avslutet (sista punkten besvarad): ingen stang-knapp, vyn byter sjalv', () => {
    expect(kortStangning({ ...bas, kort: { status: 'ok' }, klartKort: true, terrangKvar: 0 }))
      .toEqual({ kanStangas: false, forklaring: null });
  });
  it('hangs ihop med efterSvar: varje utfall som lamnar kortet kvar ("stanna") ger en stang-knapp', () => {
    const avst = (rader: Record<string, number>) =>
      new Map<string, AvstandRad>(Object.entries(rader).map(([id, m]) => [id, { m, r: 'N' }]));
    // utan position
    const utanPos = [punkt('a', { status: 'ok' }), punkt('b')];
    expect(efterSvar({ planpunkter: utanPos, besvaradId: 'a', avstand: avst({}) })).toEqual({ typ: 'stanna' });
    expect(kortStangning({ ...bas, kort: utanPos[0], terrangKvar: terrangKvar(utanPos) }).forklaring).toBe('position');
    // med position, men b saknar plats
    const medPos = [punkt('a', { status: 'ok' }), punkt('b')];
    const a = avst({ a: 5 });
    expect(efterSvar({ planpunkter: medPos, besvaradId: 'a', avstand: a })).toEqual({ typ: 'stanna' });
    expect(
      kortStangning({
        ...bas, kort: medPos[0], terrangKvar: terrangKvar(medPos),
        nastaFinns: narmasteObesvarade(medPos, a) !== null, positionOk: true,
      }).forklaring,
    ).toBe('plats');
  });
});

describe('texterna i kortet', () => {
  it('saknar-plats-meningen ar samma som i det tomma kortet (en kalla)', () => {
    expect(SAKNAR_PLATS_MENING).toBe('Punkterna som återstår saknar plats på kartan. Svara på dem i listan.');
  });
});

describe('arForstaSvaret - bara ett forsta svar flyttar kortet', () => {
  it('obesvarad -> besvarad: ja', () => {
    expect(arForstaSvaret(null, 'ok')).toBe(true);
    expect(arForstaSvaret(null, 'avvikelse')).toBe(true);
  });
  it('att ratta ett svar flyttar ingen', () => {
    expect(arForstaSvaret('ok', 'avvikelse')).toBe(false);
    expect(arForstaSvaret('avvikelse', 'ok')).toBe(false);
  });
  it('forsta laddningen (inget tidigare varde) ar inget svar', () => {
    expect(arForstaSvaret(undefined, 'ok')).toBe(false);
  });
  it('fortfarande obesvarad: nej', () => {
    expect(arForstaSvaret(null, null)).toBe(false);
  });
});
