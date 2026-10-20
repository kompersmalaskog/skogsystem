import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as karta from './fallningKarta';
import { avstandTillYtaM } from './geo';
import { bedomFallning, fallningKandidater, FALLNING_M, NEUTRAL, type FallningKandidat } from './fallning';
import { FARG_FARA, FARG_KULTUR, FARG_NATUR, FALLNING_SYMBOL, FALLNING_VIDA, GRUPPER } from './grupper';

const POS = { lat: 56.2276, lon: 14.686 };
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos(POS.lat * Math.PI / 180));
/** Punkt `n` m norrut / `e` m österut om POS. */
const norr = (n: number, e = 0) => ({ lat: POS.lat + n * M_LAT, lon: POS.lon + e * M_LON });
// Testets "svg": x = lon, y = lat, så en markering läggs direkt på rätt plats.
const svgToLatLon = (x: number, y: number) => ({ lat: y, lon: x });
const sym = (id: string, type: string, n: number, e = 0) => { const p = norr(n, e); return { id, isMarker: true, type, x: p.lon, y: p.lat }; };
const linje = (id: string, lineType: string, pts: [number, number][]) => ({ id, isLine: true, lineType, path: pts.map(([n, e]) => { const p = norr(n, e); return { x: p.lon, y: p.lat }; }) });
const zon = (id: string, zoneType: string, pts: [number, number][]) => ({ id, isZone: true, zoneType, path: pts.map(([n, e]) => { const p = norr(n, e); return { x: p.lon, y: p.lat }; }) });
const bedom = (markers: any[], vida: any = null) => bedomFallning(fallningKandidater({ pos: POS, markers, svgToLatLon, vida }));

const vidaYta = (extra: Record<string, any>, pts: [number, number][]) => ({ type: 'Feature', properties: extra, geometry: { type: 'Polygon', coordinates: [[...pts.map(([n, e]) => { const p = norr(n, e); return [p.lon, p.lat]; }), (() => { const p = norr(pts[0][0], pts[0][1]); return [p.lon, p.lat]; })()]] } });
const vidaLinje = (extra: Record<string, any>, pts: [number, number][]) => ({ type: 'Feature', properties: extra, geometry: { type: 'LineString', coordinates: pts.map(([n, e]) => { const p = norr(n, e); return [p.lon, p.lat]; }) } });
const vidaPunkt = (extra: Record<string, any>, n: number, e = 0) => { const p = norr(n, e); return { type: 'Feature', properties: extra, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }; };

describe('fällningscirkeln — radie och neutral', () => {
  it('radien är 30 m', () => expect(FALLNING_M).toBe(30));
  it('inget i närheten: neutral, svag, ingen orsak', () => {
    const u = bedom([]);
    expect(u).toBe(NEUTRAL);
    expect(u.grupp).toBeNull();
    expect(u.orsaker).toEqual([]);
    expect(u.opacitet).toBeLessThan(0.5);
  });
  it('precis utanför 30 m är neutral, precis innanför tar färg', () => {
    expect(bedom([sym('a', 'powerline', 31)]).grupp).toBeNull();
    expect(bedom([sym('a', 'powerline', 29)]).grupp).toBe('fara');
  });
});

describe('fällningscirkeln — färg per grupp', () => {
  it.each([
    ['powerline', 'fara', FARG_FARA], ['warning', 'fara', FARG_FARA],
    ['culturemonument', 'kultur', FARG_KULTUR], ['culturestump', 'kultur', FARG_KULTUR],
    ['naturecorner', 'natur', FARG_NATUR], ['eternitytree', 'natur', FARG_NATUR],
  ])('symbolen %s ger %s', (typ, grupp, farg) => {
    const u = bedom([sym('x', typ, 12)]);
    expect(u.grupp).toBe(grupp);
    expect(u.farg).toBe(farg);
    expect(u.orsaker.map((o) => o.id)).toEqual(['x']);
    expect(u.opacitet).toBeGreaterThan(0.5);
  });

  it('färgen är gruppens egen ur grupper.ts', () => {
    expect(bedom([sym('x', 'powerline', 5)]).farg).toBe(GRUPPER.fara.farg);
    expect(bedom([sym('x', 'culturemonument', 5)]).farg).toBe(GRUPPER.kultur.farg);
    expect(bedom([sym('x', 'eternitytree', 5)]).farg).toBe(GRUPPER.natur.farg);
  });

  it('Evighetsträd räknas fast det inte larmar', () => {
    expect(bedom([sym('e', 'eternitytree', 10)]).grupp).toBe('natur');
  });

  it('påverkar INTE: Brant, Fuktig mark, Högstubbe, Manuell fällning, Träd att avverka, Avlägg, Väg', () => {
    for (const typ of ['steep', 'wet', 'highstump', 'manualfelling', 'felloutside', 'landing', 'road', 'ditch', 'bridge']) {
      expect(bedom([sym('x', typ, 5)]).grupp, typ).toBeNull();
    }
    expect(Object.keys(FALLNING_SYMBOL).sort()).toEqual(['culturemonument', 'culturestump', 'eternitytree', 'naturecorner', 'powerline', 'warning']);
  });

  it('Röd vinner över Brun och Grön — även när Röd ligger längre bort', () => {
    const u = bedom([sym('natur', 'eternitytree', 3), sym('kultur', 'culturemonument', 4), sym('fara', 'warning', 28)]);
    expect(u.grupp).toBe('fara');
    expect(u.orsaker.map((o) => o.id)).toEqual(['fara']);
  });

  it('Brun och Grön samtidigt: den närmaste avgör, och bara den gruppens objekt lyser', () => {
    const a = bedom([sym('kultur', 'culturemonument', 20), sym('natur', 'naturecorner', 8), sym('natur2', 'eternitytree', 25)]);
    expect(a.grupp).toBe('natur');
    expect(a.orsaker.map((o) => o.id)).toEqual(['natur', 'natur2']);
    const b = bedom([sym('kultur', 'culturemonument', 6), sym('natur', 'naturecorner', 9)]);
    expect(b.grupp).toBe('kultur');
    expect(b.orsaker.map((o) => o.id)).toEqual(['kultur']);
  });
});

describe('fällningscirkeln — linjer och ytor räknas på närmaste punkt', () => {
  it('Stenmur: ändpunkterna är långt borta men linjen passerar 20 m bort → grön', () => {
    const m = linje('mur', 'stonewall', [[20, -200], [20, 200]]);
    const u = bedom([m]);
    expect(u.grupp).toBe('natur');
    expect(u.orsaker[0].avstandM).toBeGreaterThan(19);
    expect(u.orsaker[0].avstandM).toBeLessThan(21);
  });
  it('Stenmur 40 m bort räknas inte', () => {
    expect(bedom([linje('mur', 'stonewall', [[40, -200], [40, 200]])]).grupp).toBeNull();
  });
  it('övriga linjer (basväg, dike, naturvård) påverkar inte', () => {
    for (const t of ['mainRoad', 'ditch', 'nature', 'boundary', 'sideRoadRed']) expect(bedom([linje('l', t, [[5, -50], [5, 50]])]).grupp, t).toBeNull();
  });
  it('Hänsynsyta: står man i ytan är avståndet 0, 20 m utanför kanten räknas, 40 m utanför inte', () => {
    const ruta = (n0: number, n1: number): [number, number][] => [[n0, -30], [n0, 30], [n1, 30], [n1, -30]];
    const inne = bedom([zon('h', 'protected', ruta(-10, 10))]);
    expect(inne.grupp).toBe('natur');
    expect(inne.orsaker[0].avstandM).toBe(0);
    const nara = bedom([zon('h', 'protected', ruta(20, 60))]);
    expect(nara.grupp).toBe('natur');
    expect(Math.round(nara.orsaker[0].avstandM)).toBe(20);
    expect(bedom([zon('h', 'protected', ruta(40, 80))]).grupp).toBeNull();
  });
  it('Kulturmiljö och Fornlämning ger brunt, Brant/Ej framkomlig/Blött/Gallringszon påverkar inte', () => {
    const ruta: [number, number][] = [[10, -20], [10, 20], [40, 20], [40, -20]];
    expect(bedom([zon('a', 'culture', ruta)]).grupp).toBe('kultur');
    expect(bedom([zon('a', 'fornlamning', ruta)]).grupp).toBe('kultur');
    for (const t of ['steep', 'noentry', 'wet', 'gallring']) expect(bedom([zon('a', t, ruta)]).grupp, t).toBeNull();
  });
  it('avstandTillYtaM: inne 0, hål räknas som utanför', () => {
    const ytter = [norr(-50, -50), norr(-50, 50), norr(50, 50), norr(50, -50)];
    const hal = [norr(-10, -10), norr(-10, 10), norr(10, 10), norr(10, -10)];
    expect(avstandTillYtaM(POS, [ytter])).toBe(0);
    expect(Math.round(avstandTillYtaM(POS, [ytter, hal]))).toBe(10);
  });
});

describe('fällningscirkeln — Vidas geometri', () => {
  const fc = (...features: any[]) => ({ features });
  it('Kraftledning (linje) → Röd', () => {
    const u = bedom([], fc(vidaLinje({ _typ: 'linje', _lager: 'L_TILLAGGSLINJER', FLBESKR: 'Kraftledning' }, [[15, -100], [15, 100]])));
    expect(u.grupp).toBe('fara');
    expect(u.orsaker[0].namn).toBe('Kraftledning');
  });
  it('Hänsynsyta, Nyckelbiotop → Grön; RAÄ-yta och RAÄ-punkt → Brun', () => {
    const ruta: [number, number][] = [[10, -20], [10, 20], [50, 20], [50, -20]];
    expect(bedom([], fc(vidaYta({ _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR' }, ruta))).grupp).toBe('natur');
    expect(bedom([], fc(vidaYta({ _lager: 'SV_SKS_NYCKELBIOTOP_101' }, ruta))).grupp).toBe('natur');
    expect(bedom([], fc(vidaYta({ _lager: 'L_RAA_POLY_101' }, ruta))).grupp).toBe('kultur');
    expect(bedom([], fc(vidaPunkt({ _lager: 'L_RAA_POINT_101' }, 14))).grupp).toBe('kultur');
    expect(Object.values(FALLNING_VIDA).sort()).toEqual(['fara', 'kultur', 'kultur', 'natur', 'natur']);
  });
  it('traktgräns, avlägg och basväg (Vida) påverkar inte', () => {
    const ruta: [number, number][] = [[-100, -100], [-100, 100], [100, 100], [100, -100]];
    const u = bedom([], fc(
      vidaYta({ _typ: 'traktgräns', _lager: 'L_TRAKTDEL' }, ruta),
      vidaPunkt({ _typ: 'punkt', _lager: 'L_TILLAGGSPUNKTER', FLBESKR: 'Virkesavlägg' }, 5),
      vidaLinje({ _typ: 'linje', _lager: 'L_TILLAGGSLINJER', FLBESKR: 'Basväg' }, [[5, -50], [5, 50]]),
    ));
    expect(u.grupp).toBeNull();
  });
  it('en Vida-yta långt bort räknas inte och kostar inget', () => {
    const ruta: [number, number][] = [[500, -20], [500, 20], [540, 20], [540, -20]];
    expect(bedom([], fc(vidaYta({ _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR' }, ruta))).grupp).toBeNull();
  });
});

describe('bedomFallning (rena regler)', () => {
  const k = (id: string, grupp: FallningKandidat['grupp'], avstandM: number): FallningKandidat => ({ id, namn: id, grupp, avstandM, geometri: null });
  it('tom lista och oändliga avstånd är neutral', () => {
    expect(bedomFallning([])).toBe(NEUTRAL);
    expect(bedomFallning([k('a', 'fara', Infinity), k('b', 'natur', NaN)])).toBe(NEUTRAL);
  });
  it('kantfall: exakt 30 m räknas', () => expect(bedomFallning([k('a', 'natur', 30)]).grupp).toBe('natur'));
});

const page = readFileSync('app/planering/page.tsx', 'utf8');
describe('fällningscirkeln i sidan', () => {
  it('bara skördaren: hooken är avstängd i skotarläget och effekten ritar inget där', () => {
    expect(page).toContain('aktiv: korvyActive && !skotarKorvy,');
    expect(page).toContain('const visa = korvyActive && !skotarKorvy &&');
  });
  it('radien är FALLNING_M (30 m), inte den gamla 40 m-konstanten', () => {
    expect(page).toContain('circlePolygon(pos.lat, pos.lon, FALLNING_M, 48)');
    expect(page).not.toContain('circlePolygon(pos.lat, pos.lon, FALLNINGSRADIE_M, 48)');
  });
  it('cirkeln är tyst: ingen ljud- eller kortkoppling i fällningseffekten', () => {
    const a = page.indexOf('// === KÖRVY: fällningscirkeln');
    const b = page.indexOf('// === KÖRVY: larmets ringar på kartan');
    const eff = page.slice(a, b);
    expect(eff).not.toMatch(/spelaLarmLjud|vibrate|setLarm|kvittera/);
  });
});

describe('fällningscirkelns kartlager (lib/larm/fallningKarta)', () => {
  it('neutral: vit, svag, tunn, streckad; färgad: gruppens färg, tjock, heldragen; osynlig när visa är false', () => {
    const n = karta.fallningCirkelPaint(NEUTRAL, true);
    expect(n['line-color']).toBe('#ffffff');
    expect(n['line-opacity']).toBeLessThan(0.5);
    expect(n['line-width']).toBe(2);
    expect(n['line-dasharray']).toEqual([2, 2]);
    const f = bedom([sym('x', 'powerline', 10)]);
    const c = karta.fallningCirkelPaint(f, true);
    expect(c['line-color']).toBe(FARG_FARA);
    expect(c['line-opacity']).toBeGreaterThan(0.8);
    expect(c['line-width']).toBe(4);
    expect(c['line-dasharray']).toEqual([1, 0]);
    expect(karta.fallningCirkelPaint(f, false)['line-opacity']).toBe(0);
  });
  it('orsakerna blir features i gruppens färg; inget när cirkeln inte visas', () => {
    const f = bedom([sym('x', 'culturemonument', 10)]);
    const d = karta.fallningOrsakData(f, true);
    expect(d.features).toHaveLength(1);
    expect(d.features[0].properties).toMatchObject({ id: 'x', farg: FARG_KULTUR });
    expect(karta.fallningOrsakData(f, false).features).toEqual([]);
    expect(karta.fallningOrsakData(NEUTRAL, true).features).toEqual([]);
  });
  it('sidan lägger lagren ur fallningLagerSpecar och rör inget annat', () => {
    expect(page.includes('fallningLagerSpecar()')).toBe(true);
    expect(page.includes("id: 'larm-fall-fill'")).toBe(false);
    expect(karta.fallningLagerSpecar().map((l: any) => l.id)).toEqual(['larm-fall-fill', 'larm-fall-kant', 'larm-fall-linje', 'larm-fall-punkt']);
    expect(karta.fallningLagerSpecar().every((l: any) => l.id.startsWith('larm-'))).toBe(true);   // KEEP_PREFIX i körvyn
  });
});
