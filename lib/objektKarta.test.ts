import { describe, it, expect } from 'vitest';
import {
  ARK_HOJD_ANDEL, PRICK_LAGER_SPEC, TRYCK_TOLERANS_PX, TOM_KARTA_STIL, arTryck, byggPrickar, kartPadding, narmastePrick, prickGrans, prickarGeoJson, sakerstallPrickLager,
} from './objektKarta';
import { grupperaObjekt, type ListObjekt } from './objektVal';
import { FARG } from './design/tokens';
import { PANEL_BREDD_PX } from './plusArk';

const O = (id: string, status: string | null, extra: Partial<ListObjekt> = {}): ListObjekt =>
  ({ id, namn: `Obj ${id}`, status, typ: 'slutavverkning', lat: 56.4 + id.length / 100, lng: 14.7, ...extra });

const OBJEKT: ListObjekt[] = [
  O('har', 'planerad', { lat: 56.40, lng: 14.70 }),                        // står man på: planerad men Här
  O('pa', 'pagaende', { lat: 56.50, lng: 14.80 }),
  O('sk', 'skotning', { lat: 56.60, lng: 14.90 }),
  O('pl', 'planerad', { lat: 56.30, lng: 14.60 }),
  O('vl', 'avslutat', { lat: 56.55, lng: 14.85, vo_nummer: 'VO-V' }),     // avslutat MED skotning kvar → Pågår
  O('av', 'avslutat', { lat: 56.20, lng: 14.50, avslutad_timestamp: '2026-09-01T00:00:00Z' }),
  O('ag', 'avslutat', { lat: 56.21, lng: 14.51, typ: 'gallring', avslutad_timestamp: '2026-08-01T00:00:00Z' }),
  O('op', null, { lat: 56.10, lng: 14.40 }),                               // oplanerad: bara listan
  O('xk', 'planerad', { lat: null, lng: null }),                           // ingen koordinat: bara listan
];
const KVAR = new Set(['VO-V']);
const gr = () => grupperaObjekt(OBJEKT, { skotningKvar: KVAR, arHar: (o) => o.id === 'har' });
const aktiva = () => byggPrickar(gr(), [], KVAR, false);
const per = (p: ReturnType<typeof aktiva>) => Object.fromEntries(p.map((x) => [x.id, x]));

describe('byggPrickar — aktiva objekt', () => {
  it('grön = Pågår (även Skotning kvar), grå = Planerade', () => {
    const p = per(aktiva());
    expect(p.pa.farg).toBe('gron');
    expect(p.sk.farg).toBe('gron');      // status skotning = arbete pågår
    expect(p.vl.farg).toBe('gron');      // avslutat men skotning kvar
    expect(p.pl.farg).toBe('gra');
  });

  it('objektet man står på (Här) har blå ring och behåller sin statusfärg', () => {
    const p = per(aktiva());
    expect(p.har.har).toBe(true);
    expect(p.har.farg).toBe('gra');      // planerad
    expect(p.pa.har).toBe(false);
    expect(p.pl.har).toBe(false);
  });

  it('avslutade, oplanerade och objekt utan koordinat ritas inte', () => {
    const ids = aktiva().map((x) => x.id).sort();
    expect(ids).toEqual(['har', 'pa', 'pl', 'sk', 'vl']);
  });

  it('namnens kollisionsordning: Här före Pågår före Planerade', () => {
    const p = per(aktiva());
    expect(p.har.prio).toBeLessThan(p.pa.prio);
    expect(p.pa.prio).toBeLessThan(p.pl.prio);
  });

  it('inga objekt → inga prickar; saknat namn får ett läsbart', () => {
    expect(byggPrickar(grupperaObjekt([], {}), [], null, false)).toEqual([]);
    const p = byggPrickar(grupperaObjekt([O('x', 'planerad', { namn: null })], {}), [], null, false);
    expect(p[0].namn).toBe('Namnlöst objekt');
  });
});

describe('byggPrickar — Avslutade-vyn', () => {
  it('utanför Avslutade-vyn ritas avslutade aldrig, ens om de skickas med', () => {
    const g = gr();
    expect(byggPrickar(g, g.avslutade, KVAR, false).map((x) => x.id).sort()).toEqual(['har', 'pa', 'pl', 'sk', 'vl']);
  });
  it('bara den valda typens avslutade syns (inget aktivt), grå och utan Här-ring', () => {
    const g = gr();
    const slut = g.avslutade.filter((o) => o.typ === 'slutavverkning');
    const p = byggPrickar(g, slut, KVAR, true);
    expect(p.map((x) => x.id)).toEqual(['av']);
    expect(p[0]).toMatchObject({ farg: 'gra', har: false });
    const gal = g.avslutade.filter((o) => o.typ === 'gallring');
    expect(byggPrickar(g, gal, KVAR, true).map((x) => x.id)).toEqual(['ag']);
  });
  it('avslutade utan koordinat hoppas över', () => {
    const g = grupperaObjekt([O('a', 'avslutat', { lat: null, lng: null })], {});
    expect(byggPrickar(g, g.avslutade, null, true)).toEqual([]);
  });
});

describe('prickarGeoJson och prickGrans', () => {
  it('en punkt per prick med färg, ring och prio som egenskaper (lng, lat)', () => {
    const fc = prickarGeoJson(aktiva());
    expect(fc.type).toBe('FeatureCollection');
    const har = fc.features.find((f) => f.properties.id === 'har')!;
    expect(har.geometry.coordinates).toEqual([14.70, 56.40]);
    expect(har.properties).toMatchObject({ har: 1, farg: FARG.text3, prio: 0 });
    expect(fc.features.find((f) => f.properties.id === 'pa')!.properties).toMatchObject({ har: 0, farg: FARG.gron });
    expect(prickarGeoJson([]).features).toEqual([]);
  });
  it('gränsen omsluter alla prickar; tom lista = null', () => {
    expect(prickGrans(aktiva())).toEqual([[14.60, 56.30], [14.90, 56.60]]);
    expect(prickGrans([])).toBeNull();
  });
});

describe('kartPadding — den synliga delen av kartan', () => {
  it('telefon: arket täcker nedre halvan → hälften av höjden som nedre padding', () => {
    const p = kartPadding({ bredd: 390, hojd: 800 });
    expect(ARK_HOJD_ANDEL).toBe(0.5);
    expect(p.bottom).toBeGreaterThanOrEqual(400);
    expect(p.right).toBeLessThan(100);
  });
  it('bred skärm: panelen täcker höger sida → panelens bredd som högre padding', () => {
    const p = kartPadding({ bredd: 1280, hojd: 800 });
    expect(p.right).toBeGreaterThanOrEqual(PANEL_BREDD_PX);
    expect(p.bottom).toBeLessThan(100);
  });
  it('lägesvalet följer fönstrets bredd (899 = ark, 900 = panel)', () => {
    expect(kartPadding({ bredd: 899, hojd: 800 }).bottom).toBeGreaterThan(400);
    expect(kartPadding({ bredd: 900, hojd: 800 }).right).toBeGreaterThan(PANEL_BREDD_PX);
  });
});

describe('tryck', () => {
  it('närmaste prick vinner; lika långt: Här före Pågår före Planerade', () => {
    expect(narmastePrick([{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 22, y: 10 }], { x: 20, y: 10 })).toBe('b');
    expect(narmastePrick([{ id: 'pl', x: 0, y: 0, prio: 2 }, { id: 'har', x: 0, y: 0, prio: 0 }], { x: 5, y: 0 })).toBe('har');
    expect(narmastePrick([], { x: 1, y: 1 })).toBeNull();
  });
  it('en panorering som slutar i ett klick är inget tryck; ett darrigt finger är det', () => {
    expect(arTryck({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(arTryck({ x: 0, y: 0 }, { x: TRYCK_TOLERANS_PX, y: 0 })).toBe(true);
    expect(arTryck({ x: 0, y: 0 }, { x: TRYCK_TOLERANS_PX + 1, y: 0 })).toBe(false);
    expect(arTryck(null, { x: 5, y: 5 })).toBe(true);
  });
});

describe('lagren', () => {
  it('namnlagret krockas bort (inget överlapp, bara prick kvar) och sorteras på prio; pricken är ett eget lager', () => {
    const l = PRICK_LAGER_SPEC.namn.layout as any;
    expect(l['text-allow-overlap']).toBe(false);
    expect(l['text-variable-anchor']).toEqual(['right', 'left']);   // bredvid pricken, aldrig runt om
    expect(l['symbol-sort-key']).toEqual(['get', 'prio']);
    expect(PRICK_LAGER_SPEC.prick.type).toBe('circle');
    expect(PRICK_LAGER_SPEC.ring.filter).toEqual(['==', ['get', 'har'], 1]);
    expect(PRICK_LAGER_SPEC.ring.paint['circle-stroke-color']).toBe(FARG.bla);
    expect(PRICK_LAGER_SPEC.prick.paint['circle-color']).toEqual(['get', 'farg']);
  });
  it('sakerstallPrickLager lägger källa + tre lager en gång (idempotent)', () => {
    const k: Record<string, any> = {}; const l: string[] = [];
    const map = {
      getSource: (id: string) => k[id], addSource: (id: string, s: any) => { k[id] = { ...s, setData: () => {} }; },
      getLayer: (id: string) => (l.includes(id) ? {} : undefined), addLayer: (s: any) => { l.push(s.id); },
    };
    expect(sakerstallPrickLager(map)).not.toBeNull();
    sakerstallPrickLager(map);
    expect(l).toEqual(['objlista-ring', 'objlista-prick', 'objlista-namn']);
  });
  it('tomkartans stil: Lantmäteriets bas som planeringsvyn (aldrig en svart yta)', () => {
    expect(TOM_KARTA_STIL.sources.lantmateriet.tiles[0]).toBe('/api/forarkarta?z={z}&x={x}&y={y}');
    expect(TOM_KARTA_STIL.layers.map((x) => x.id)).toEqual(['bg', 'lm-layer']);
  });
});
