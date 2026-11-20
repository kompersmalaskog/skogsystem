import { describe, expect, it } from 'vitest';
import { expression, featureFilter, latest, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  basvagsNummer, geometriKoordinater, klassaPunkt, kontextFeature, kontextLager,
  kontextUtanKontrollpunkter, kontrollFeatures, kontrollLager, kontrollLagerIdn,
  mittpunktPaLinje, pilVinkel, valdLinjeFilter, valdSymbolFilter,
  provytaFeatures, provytaLager, provytaLagerIdn,
  KONTEXT_KALLA, KONTROLL_KALLA, NUMMER_KALLA, PROVYTA_KALLA, TRAKTGRANS_TYP, VALD_LINJE_ID, VALD_SYMBOL_ID,
} from './egenkontrollkarta';
import { provytaBildNamn } from './provytaIkon';
import { traffKindFranEgenskaper } from './egenkontrollTryck';
import type { ProvytaStatus } from './provytor';
import {
  KANT_SVART_STARK, LEGEND, LINJE_BREDD_GRANS, LINJE_KANT_BREDD_GRANS, LINJE_STIL, PIL_STIL, STRECK_RANDAD,
  linjeLager, zoomKurva,
} from './kartstil';
import { markerIconDefs } from './marker-icons';
import { ZONE_COLORS } from './zone-colors';

// Origo och koordinater: samma rymd som kartan. Ett litet origo racker.
const ORIGO = { lat: 56.5, lng: 14.7, zoom: 15 };

/** Kontextlagrets traktgransslager: ek-k-lin-boundary-kant, ek-k-lin-boundary, ek-k-lin-boundary-streck. */
const arTraktgransLager = (id: string) =>
  id === `ek-k-lin-${TRAKTGRANS_TYP}` || id.startsWith(`ek-k-lin-${TRAKTGRANS_TYP}-`);

describe('lagren ar giltiga enligt MapLibres egen stil-spec', () => {
  // addLayer med ett ogiltigt uttryck KASTAR INTE - MapLibre loggar och hoppar
  // lagret. Bygget ar gront, tsc ar gront, och lagret ar bara borta. Det har
  // testet ar det som i stallet gor det hogt.
  const kalla = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  const stil = (lager: any[]) => ({
    version: 8 as const,
    sources: { [KONTEXT_KALLA]: kalla, [KONTROLL_KALLA]: kalla, [NUMMER_KALLA]: kalla } as any,
    layers: lager,
  });

  // icon-image refererar bilder som laggs till med addImage vid korning - det
  // kan en statisk validering inte veta, sa det meddelandet ar inte ett fel har.
  const riktigaFel = (lager: any[]) =>
    validateStyleMin(stil(lager) as any)
      .map((f: any) => `${f.message}`)
      .filter((m: string) => !/sprite/i.test(m));

  it('kontrollagren', () => {
    expect(riktigaFel(kontrollLager())).toEqual([]);
  });

  it('kontextlagren', () => {
    expect(riktigaFel(kontextLager())).toEqual([]);
  });

  it('en nastlad zoomkurva hade faktiskt avvisats - testet kan alltsa fanga felet', () => {
    // Kontrollen av kontrollen: ett uttryck med interpolate inuti aritmetik
    // ar ogiltigt, och valideringen MASTE saga det. Annars bevisar grona
    // lagertester ingenting.
    const dalig = [{
      id: 'dalig', type: 'line', source: KONTROLL_KALLA,
      paint: { 'line-width': ['+', ['interpolate', ['linear'], ['zoom'], 5, 2, 17, 7], 4] },
    }];
    expect(riktigaFel(dalig as any).length).toBeGreaterThan(0);
  });

  it('inget lager har tva zoomkurvor i samma uttryck', () => {
    const rakna = (u: unknown): number =>
      Array.isArray(u)
        ? (u[0] === 'interpolate' || u[0] === 'step' ? 1 : 0) + u.reduce((n: number, d: unknown) => n + rakna(d), 0)
        : 0;
    for (const l of [...kontrollLager(), ...kontextLager()]) {
      for (const grupp of [l.paint ?? {}, l.layout ?? {}]) {
        for (const [namn, uttryck] of Object.entries(grupp)) {
          expect(rakna(uttryck), `${l.id}.${namn}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('alla lager har unika id och en kalla som finns', () => {
    const alla = [...kontrollLager(), ...kontextLager()];
    const idn = alla.map((l) => l.id);
    expect(new Set(idn).size).toBe(idn.length);
    for (const l of alla) {
      expect([KONTEXT_KALLA, KONTROLL_KALLA, NUMMER_KALLA]).toContain(l.source);
    }
  });

  it('kontextlagret har inga textlager och ingen glyph-kalla behovs', () => {
    for (const l of [...kontrollLager(), ...kontextLager()]) {
      expect(JSON.stringify(l)).not.toContain('text-field');
    }
  });

  it('den valda punktens gloria och dess filter hor ihop', () => {
    const idn = kontrollLagerIdn();
    expect(idn).toContain(VALD_LINJE_ID);
    expect(idn).toContain(VALD_SYMBOL_ID);
    expect(valdLinjeFilter('x')).toEqual(['all', ['!=', ['get', 'kind'], 'symbol'], ['==', ['get', 'id'], 'x']]);
    expect(valdSymbolFilter('x')).toEqual(['all', ['==', ['get', 'kind'], 'symbol'], ['==', ['get', 'id'], 'x']]);
  });

  it('kontextlagret ar underordnat: lag opacitet, och inga tryckytor - UTOM traktgransen', () => {
    for (const l of kontextLager()) {
      expect(l.id).not.toMatch(/hit/i);
      if (arTraktgransLager(l.id)) continue; // ritas som i planeringen, se nedan
      const o = l.paint?.['line-opacity'] ?? l.paint?.['icon-opacity'] ?? l.paint?.['fill-opacity'];
      expect(o, l.id).toBeLessThanOrEqual(0.5);
    }
  });

  it('status ar en ring/ett band RUNT - typens egen symbol och linje finns kvar', () => {
    const idn = kontrollLagerIdn();
    expect(idn).toContain('ek-p-sym');            // symbolen
    expect(idn).toContain('ek-p-ring-ok');        // ringen
    expect(idn).toContain('ek-p-ring-avvikelse');
    expect(idn).toContain('ek-p-lin-mainRoad');   // linjen
    expect(idn).toContain('ek-p-status-linje-ok'); // bandet
    // Obesvarad har varken ring eller band.
    expect(idn.some((i) => /obesvarad/.test(i))).toBe(false);
    // Status ligger UNDER linjen och symbolen - annars doljer den dem.
    expect(idn.indexOf('ek-p-status-linje-ok')).toBeLessThan(idn.indexOf('ek-p-lin-mainRoad'));
    expect(idn.indexOf('ek-p-status-zon-ok')).toBeLessThan(idn.indexOf('ek-p-zon-linje'));
    expect(idn.indexOf('ek-p-ring-ok')).toBeLessThan(idn.indexOf('ek-p-sym'));
  });

  it('avvikelse ar TJOCKARE an ok - skillnaden far inte bara vara farg', () => {
    const lager = (id: string) => kontrollLager().find((l) => l.id === id)!;
    expect(lager('ek-p-ring-avvikelse').paint['circle-stroke-width'])
      .toBeGreaterThan(lager('ek-p-ring-ok').paint['circle-stroke-width']);
    const bredd = (id: string) => lager(id).paint['line-width'][4]; // forsta stoppets varde
    expect(bredd('ek-p-status-linje-avvikelse')).toBeGreaterThan(bredd('ek-p-status-linje-ok'));
  });
});

describe('klassaPunkt - typ OCH form', () => {
  const xy = { x: 1, y: 2 };
  const path = { path: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 0 }] };

  it('wet ar bade symbol och zon - formen avgor', () => {
    // Verifierat pa Ulfsnas: "Blot flack 1/2" (x/y) och "Blot zon" (path).
    expect(klassaPunkt('wet', xy)).toEqual({ kind: 'symbol', typ: 'wet', kand: true });
    expect(klassaPunkt('wet', path)).toEqual({ kind: 'zon', typ: 'wet', kand: true });
  });

  it('fornlamning ar en zon, mainRoad en linje, evighetstrad en symbol', () => {
    expect(klassaPunkt('fornlamning', path)?.kind).toBe('zon');
    expect(klassaPunkt('mainRoad', path)?.kind).toBe('linje');
    expect(klassaPunkt('eternitytree', xy)?.kind).toBe('symbol');
    expect(klassaPunkt('nature', path)?.kind).toBe('linje');
  });

  it('linjetyper och zontyper har inga gemensamma id - annars vore uppslaget tvetydigt', () => {
    const linje = new Set(LINJE_STIL.map((l) => l.id));
    for (const z of Object.keys(ZONE_COLORS)) expect(linje.has(z), z).toBe(false);
  });

  it('okand typ ger en NEUTRAL punkt, inte en forsvunnen', () => {
    expect(klassaPunkt('hittepa', path)).toEqual({ kind: 'linje', typ: 'hittepa', kand: false });
    expect(klassaPunkt('hittepa', xy)).toEqual({ kind: 'symbol', typ: 'hittepa', kand: false });
  });

  it('ingen plats ger null: fast punkt, saknad geometri, trasig path', () => {
    expect(klassaPunkt('korspar', null)).toBeNull();
    expect(klassaPunkt('x', undefined)).toBeNull();
    expect(klassaPunkt('x', {})).toBeNull();
    expect(klassaPunkt('x', { path: [{ x: 1, y: 1 }] })).toBeNull();
    expect(klassaPunkt(null, 'text')).toBeNull();
  });

  it('varje symbol i marker-icons ar kand', () => {
    for (const d of markerIconDefs) expect(klassaPunkt(d.id, xy)?.kand, d.id).toBe(true);
  });
});

describe('basvagsNummer - kastar aldrig', () => {
  it.each([
    ['Basväg 4', 4],
    ['Basväg 1', 1],
    ['Basväg 12', 12],
    ['Basväg 4, 2 st', 4],
    ['  Basväg 7', 7],
    ['basväg 3', 3],
  ])('%s -> %s', (rubrik, nr) => {
    expect(basvagsNummer(rubrik)).toBe(nr);
  });

  it.each([
    ['Basväg'], [''], ['Evighetsträd 1, 1 st'], ['Basväg 0'], ['Basväg 1000'],
    ['Basväg x'], ['Basväg 4 och 5'], ['Fornlämning'],
  ])('matchar inte: "%s" -> null', (rubrik) => {
    expect(basvagsNummer(rubrik)).toBeNull();
  });

  it('klarar vad som helst utan att kasta', () => {
    for (const v of [null, undefined, 5, {}, [], true, NaN, Symbol.iterator.toString()]) {
      expect(() => basvagsNummer(v)).not.toThrow();
      expect(basvagsNummer(v)).toBeNull();
    }
  });

  it('klarar en dekomponerad a-prick (NFC-normaliserar)', () => {
    expect(basvagsNummer('Basväg 2')).toBe(2);
  });
});

describe('mittpunktPaLinje - raknad pa langd, inte pa antal punkter', () => {
  it('ligger halvvags pa en rak linje', () => {
    const m = mittpunktPaLinje([[14.7, 56.5], [14.71, 56.5]])!;
    expect(m[0]).toBeCloseTo(14.705, 6);
  });

  it('en tat klase av punkter i ena anden drar inte mitten dit', () => {
    // Fyra punkter tatt i borjan, sedan ett langt steg: mitten ligger i det langa steget.
    const m = mittpunktPaLinje([[14.7, 56.5], [14.7001, 56.5], [14.7002, 56.5], [14.7003, 56.5], [14.72, 56.5]])!;
    expect(m[0]).toBeGreaterThan(14.708);
  });

  it('ar ofarlig for for korta linjer och nollangd', () => {
    expect(mittpunktPaLinje([])).toBeNull();
    expect(mittpunktPaLinje([[14.7, 56.5]])).toBeNull();
    expect(mittpunktPaLinje([[14.7, 56.5], [14.7, 56.5]])).toEqual([14.7, 56.5]);
  });
});

describe('kontrollFeatures', () => {
  const punkt = (over: any) => ({
    id: 'p1', punkt_typ: 'mainRoad', rubrik: 'Basväg 3', status: null,
    geometri_snapshot: { path: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 10 }] },
    ...over,
  });

  it('numrerad basvag: linje + ett nummer med punktens id', () => {
    const r = kontrollFeatures(punkt({}), ORIGO);
    expect(r.feature?.geometry.type).toBe('LineString');
    expect(r.feature?.properties).toMatchObject({ kind: 'linje', typ: 'mainRoad', status: 'obesvarad' });
    expect(r.nummer?.properties).toMatchObject({ id: 'p1', nr: 3 });
  });

  it('basvag vars rubrik inte matchar: linjen ritas, bara utan siffra', () => {
    const r = kontrollFeatures(punkt({ rubrik: 'Något helt annat' }), ORIGO);
    expect(r.feature).not.toBeNull();
    expect(r.nummer).toBeNull();
  });

  it('nummer sitter bara pa basvagar', () => {
    const r = kontrollFeatures(punkt({ punkt_typ: 'nature', rubrik: 'Basväg 3' }), ORIGO);
    expect(r.nummer).toBeNull();
  });

  it('zon blir en Polygon med stangd ring', () => {
    const r = kontrollFeatures(punkt({
      punkt_typ: 'fornlamning', rubrik: 'Fornlämning', status: 'ok',
      geometri_snapshot: { path: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }] },
    }), ORIGO);
    expect(r.feature?.geometry.type).toBe('Polygon');
    const ring = r.feature!.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(r.feature?.properties.status).toBe('ok');
  });

  it('symbol: Point med ikon; okand symbol far default-ikonen', () => {
    const k = kontrollFeatures(punkt({ punkt_typ: 'eternitytree', rubrik: 'Evighetsträd 1', status: 'avvikelse', geometri_snapshot: { x: 5, y: 5 } }), ORIGO);
    expect(k.feature?.geometry.type).toBe('Point');
    expect(k.feature?.properties).toMatchObject({ kind: 'symbol', ikon: 'eternitytree', status: 'avvikelse' });
    const o = kontrollFeatures(punkt({ punkt_typ: 'hittepa', geometri_snapshot: { x: 5, y: 5 } }), ORIGO);
    expect(o.feature?.properties.ikon).toBe('default');
  });

  it('en punkt utan geometri ar ingen plats', () => {
    expect(kontrollFeatures(punkt({ geometri_snapshot: null }), ORIGO)).toEqual({ feature: null, nummer: null });
  });
});

describe('kontextFeature', () => {
  it('traktgrans och dike blir linjer med sin typ', () => {
    const g = kontextFeature({ lineType: 'boundary', isLine: true, path: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }, ORIGO);
    expect(g?.properties).toMatchObject({ kind: 'linje', typ: 'boundary' });
    const d = kontextFeature({ lineType: 'ditch', path: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }, ORIGO);
    expect(d?.properties).toMatchObject({ kind: 'linje', typ: 'ditch' });
  });

  it('fallriktningspil: kind pil, med sin riktning', () => {
    const f = kontextFeature({ arrowType: 'fellingdirection', isArrow: true, x: 3, y: 4, angle: 90 }, ORIGO);
    expect(f?.properties).toMatchObject({ kind: 'pil', typ: 'fellingdirection', rotation: 90 });
  });

  it('angle 0 VINNER over rotation - nya pilar har angle:0', () => {
    expect(pilVinkel({ angle: 0, rotation: 45 })).toBe(0);
    expect(pilVinkel({ rotation: 45 })).toBe(45);
    expect(pilVinkel({})).toBe(0);
    expect(pilVinkel({ angle: 'inte ett tal' })).toBe(0);
  });

  it('okand pil ritas inte - hellre ingenting an en gissad pil', () => {
    expect(kontextFeature({ arrowType: 'hittepa', x: 1, y: 1 }, ORIGO)).toBeNull();
    for (const p of PIL_STIL) expect(kontextFeature({ arrowType: p.id, x: 1, y: 1 }, ORIGO)).not.toBeNull();
  });

  it('varningssymbol blir en symbol; zon blir en zon; gallring far neutral typ', () => {
    expect(kontextFeature({ type: 'warning', isMarker: true, x: 1, y: 1 }, ORIGO)?.properties).toMatchObject({ kind: 'symbol', ikon: 'warning' });
    const z = kontextFeature({ zoneType: 'gallring', path: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }] }, ORIGO);
    expect(z?.properties).toMatchObject({ kind: 'zon', typ: 'gallring' });
  });

  it('skrap blir null och kastar inte', () => {
    for (const v of [null, undefined, 5, 'x', [], {}, { path: 'nej' }, { path: [] }]) {
      expect(() => kontextFeature(v, ORIGO)).not.toThrow();
      expect(kontextFeature(v, ORIGO)).toBeNull();
    }
  });
});

describe('kontextUtanKontrollpunkter - kontrollpunkter ritas inte tva ganger', () => {
  const kontext = [
    { marker_id: 'm1', data: {} }, { marker_id: 'm2', data: {} },
    { marker_id: 'm3', data: {} }, { marker_id: null, data: {} }, { data: {} },
  ];

  it('drar bort de markeringar som redan ar kontrollpunkter', () => {
    const r = kontextUtanKontrollpunkter(kontext, [{ markering_marker_id: 'm1' }, { markering_marker_id: 'm3' }]);
    expect(r.map((m) => m.marker_id)).toEqual(['m2', null, undefined]);
  });

  it('jamfor som text - ett tal och en sträng ar samma markering', () => {
    const r = kontextUtanKontrollpunkter([{ marker_id: '1700000000000', data: {} }], [{ markering_marker_id: '1700000000000' }]);
    expect(r).toEqual([]);
  });

  it('en punkt vars markering raderats (null) tar inte bort nagot', () => {
    expect(kontextUtanKontrollpunkter(kontext, [{ markering_marker_id: null }]).length).toBe(kontext.length);
  });
});

describe('geometriKoordinater', () => {
  it('Polygon ar en niva djupare - utan det blev fitBounds fel for zoner', () => {
    expect(geometriKoordinater({ type: 'Polygon', coordinates: [[[1, 1], [2, 2], [1, 1]]] }).length).toBe(3);
    expect(geometriKoordinater({ type: 'Point', coordinates: [1, 2] })).toEqual([[1, 2]]);
    expect(geometriKoordinater({ type: 'LineString', coordinates: [[1, 1], [2, 2]] }).length).toBe(2);
    expect(geometriKoordinater(null)).toEqual([]);
  });
});

describe('zoomKurva', () => {
  it('forskjutning och skalning sker i kod - uttrycket har fortfarande EN interpolate', () => {
    const k = zoomKurva([[5, 2], [17, 7]], 1, 4);
    expect(k).toEqual(['interpolate', ['linear'], ['zoom'], 5, 6, 17, 11]);
  });
});

describe('provytorna - tre tillstand i kartan', () => {
  const kalla = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  const STATUS: ProvytaStatus[] = ['omatt', 'matt', 'overhoppad'];
  const MATT = '2026-10-04T15:43:28.181+00:00';
  const ruta = (status: ProvytaStatus) => ({
    nummer: 1, lat: 56.5, lng: 14.7,
    matt: status === 'omatt' ? null : MATT,       // overhoppad har OCKSA matt satt
    overhoppad: status === 'overhoppad',
  });

  it('lagren ar giltiga enligt MapLibres stil-spec', () => {
    const stil = { version: 8 as const, sources: { [PROVYTA_KALLA]: kalla } as any, layers: provytaLager() };
    const fel = validateStyleMin(stil as any).map((f: any) => `${f.message}`).filter((m: string) => !/sprite/i.test(m));
    expect(fel).toEqual([]);
  });

  it('lagrens id:n ar kontraktet mot tryckhanteraren och lagermenyn', () => {
    expect(provytaLagerIdn()).toEqual(['ek-provyta-matt', 'ek-provyta-omatt']);
    expect(provytaLager().map((l) => l.id)).toEqual(provytaLagerIdn());
  });

  it('varje tillstand traffar EXAKT ETT lager - ingen yta ritas tva ganger eller aldrig', () => {
    const lager = provytaLager();
    for (const status of STATUS) {
      const feature = { type: 1, properties: { status } };
      const traffar = lager.filter((l) => featureFilter(l.filter).filter({ zoom: 0 }, feature as any));
      expect(traffar.length, status).toBe(1);
    }
  });

  it('varje tillstand far SIN ikon - och den ikonen finns i listan av ikoner som laggs till', () => {
    const lager = provytaLager();
    const forvantat = new Set(STATUS.map(provytaBildNamn));
    const sett = new Set<string>();
    for (const status of STATUS) {
      const feature = { type: 1, properties: { status } };
      const l = lager.find((x) => featureFilter(x.filter).filter({ zoom: 0 }, feature as any))!;
      const uttr = expression.createExpression(l.layout['icon-image'], (latest as any).layout_symbol['icon-image']);
      expect(uttr.result).toBe('success');
      const bild = (uttr as any).value.evaluate({ zoom: 0 }, feature).name as string;
      expect(bild, status).toBe(provytaBildNamn(status));
      sett.add(bild);
    }
    expect(sett).toEqual(forvantat);
  });

  it('en yta ritas alltid och traffas alltid: icon-allow-overlap', () => {
    for (const l of provytaLager()) {
      expect(l.layout['icon-allow-overlap']).toBe(true);
      expect(l.layout['icon-ignore-placement']).toBe(true);
    }
  });

  it('features: status harleds ur data - overhoppad ar overhoppad aven nar matt ar satt', () => {
    for (const status of STATUS) {
      const [f] = provytaFeatures([ruta(status)]);
      expect(f.properties.status, status).toBe(status);
    }
  });

  it('ytor utan plats ritas inte - de gissas aldrig in', () => {
    expect(provytaFeatures([{ ...ruta('omatt'), lat: null }, { ...ruta('omatt'), lng: null }])).toEqual([]);
  });

  it('en provyta kanns igen som provyta vid tryck (nummer, aldrig kind)', () => {
    const [f] = provytaFeatures([ruta('matt')]);
    expect(f.properties.kind).toBeUndefined();
    expect(traffKindFranEgenskaper(f.properties)).toBe('provyta');
  });
});

describe('traktgransen i kontextlagret - ritas som i planeringen, inte nedtonad', () => {
  const kontext = kontextLager();
  const grans = kontext.filter((l) => arTraktgransLager(l.id));
  const lagerMedId = (lager: any[], id: string) => lager.find((l) => l.id === id);
  const kant = lagerMedId(kontext, 'ek-k-lin-boundary-kant');
  const grund = lagerMedId(kontext, 'ek-k-lin-boundary');
  const streck = lagerMedId(kontext, 'ek-k-lin-boundary-streck');

  it('tre lager: svart kant, rod grund, gul streckning - i den ordningen, nerifran', () => {
    expect(grans.map((l) => l.id)).toEqual(['ek-k-lin-boundary-kant', 'ek-k-lin-boundary', 'ek-k-lin-boundary-streck']);
    expect(kontext.indexOf(kant)).toBeLessThan(kontext.indexOf(grund));
    expect(kontext.indexOf(grund)).toBeLessThan(kontext.indexOf(streck));
  });

  it('farg och streckning som planeringen: rod + gul [2,2], svart kant', () => {
    expect(kant.paint['line-color']).toBe(KANT_SVART_STARK);
    expect(grund.paint['line-color']).toBe(LEGEND.fara);
    expect(streck.paint['line-color']).toBe(LEGEND.gul);
    expect(streck.paint['line-dasharray']).toEqual([...STRECK_RANDAD]);
    expect(grund.paint['line-dasharray']).toBeUndefined(); // grunden ar heldragen, streckningen ligger ovanpa
  });

  it('bredd som planeringens (faktor 1, inte 0,6): grans- och kantkurvan', () => {
    expect(grund.paint['line-width']).toEqual(zoomKurva(LINJE_BREDD_GRANS));
    expect(streck.paint['line-width']).toEqual(zoomKurva(LINJE_BREDD_GRANS));
    expect(kant.paint['line-width']).toEqual(zoomKurva(LINJE_KANT_BREDD_GRANS));
  });

  it('INGEN opacitet pa nagot av lagren - det var nedtoningen som gjorde den orange', () => {
    for (const l of grans) expect(l.paint['line-opacity'], l.id).toBeUndefined();
  });

  it('identisk med kontrollagrets gransstil (utom id och kalla) - en stil, inte tva', () => {
    const likna = (l: any) => JSON.stringify({ ...l, id: undefined, source: undefined, filter: undefined });
    for (const suffix of ['-kant', '', '-streck']) {
      expect(likna(lagerMedId(kontext, `ek-k-lin-boundary${suffix}`)), suffix).toBe(
        likna(lagerMedId(kontrollLager(), `ek-p-lin-boundary${suffix}`)),
      );
    }
  });

  it('filtret tar bara traktgransen (kind linje, typ boundary), inga andra linjer', () => {
    for (const l of grans) {
      const f = featureFilter(l.filter);
      const linje = (typ: string) => ({ type: 'Feature', properties: { kind: 'linje', typ }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } });
      expect(f.filter({ zoom: 14 }, linje('boundary') as any), l.id).toBe(true);
      expect(f.filter({ zoom: 14 }, linje('ditch') as any), l.id).toBe(false);
    }
  });

  it('allt ANNAT i kontextlagret ar fortfarande nedtonat (undantaget ar bara granstypen)', () => {
    const diket = lagerMedId(kontext, 'ek-k-lin-ditch');
    expect(diket.paint['line-opacity']).toBe(0.4);
    expect(lagerMedId(kontext, 'ek-k-lin-ditch-kant')).toBeUndefined(); // utanKant
    expect(lagerMedId(kontext, 'ek-k-lin-okand').paint['line-opacity']).toBe(0.4);
    const bredd = (l: any) => l.paint['line-width'][4]; // forsta stoppets varde
    expect(bredd(diket)).toBeLessThan(bredd(grund) as number);
  });

  it('inget lager dubblerat: varje id finns en gang, och granslagren finns inte i den nedtonade delen', () => {
    const idn = kontext.map((l) => l.id);
    expect(new Set(idn).size).toBe(idn.length);
    expect(linjeLager(KONTEXT_KALLA, 'ek-k', null, { opacitet: 0.4, breddFaktor: 0.6, utanKant: true }, { utom: [TRAKTGRANS_TYP] })
      .some((l) => arTraktgransLager(l.id))).toBe(false);
  });
});

describe('linjeLager - urval av linjetyper', () => {
  const idn = (lager: any[]) => lager.map((l) => l.id);

  it('utan urval: alla typer och den okanda fallbacken (som forr)', () => {
    const alla = idn(linjeLager(KONTEXT_KALLA, 'x', null));
    expect(alla).toContain('x-lin-boundary');
    expect(alla).toContain('x-lin-ditch');
    expect(alla).toContain('x-lin-okand');
  });

  it('endast: bara de typerna, och ingen okand fallback', () => {
    const ur = idn(linjeLager(KONTEXT_KALLA, 'x', null, undefined, { endast: ['boundary'] }));
    expect(ur).toEqual(['x-lin-boundary-kant', 'x-lin-boundary', 'x-lin-boundary-streck']);
  });

  it('utom: allt utom de typerna, fallbacken kvar', () => {
    const ur = idn(linjeLager(KONTEXT_KALLA, 'x', null, undefined, { utom: ['boundary'] }));
    expect(ur.some((i) => i.startsWith('x-lin-boundary'))).toBe(false);
    expect(ur).toContain('x-lin-ditch');
    expect(ur).toContain('x-lin-okand');
  });

  it('endast + utom tillsammans delar upp alla lager utan overlapp eller luckor', () => {
    const helt = idn(linjeLager(KONTEXT_KALLA, 'x', null));
    const delad = [
      ...idn(linjeLager(KONTEXT_KALLA, 'x', null, undefined, { endast: ['boundary'] })),
      ...idn(linjeLager(KONTEXT_KALLA, 'x', null, undefined, { utom: ['boundary'] })),
    ];
    expect([...delad].sort()).toEqual([...helt].sort());
  });
});
