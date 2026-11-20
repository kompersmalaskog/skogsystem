import { describe, it, expect } from 'vitest';
import { beraknaPerHa, ringarYtaM2, stickvag, STICKVAG_BREDD_M, type StamPunkt } from './gallringPerHa';
import type { Punkt } from './avverkadAreal';

// Lokala meter → [lng, lat] runt en punkt (samma projektion som SQL-kontrollen 2026-10-22).
function tillGrad(la0: number, lo0: number) {
  return (x: number, y: number): Punkt => [lo0 + x / (Math.cos((la0 * Math.PI) / 180) * 111320), la0 + y / 110540];
}
function ring(txt: string, la0: number, lo0: number): Punkt[] {
  const g = tillGrad(la0, lo0);
  return txt.split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return g(x, y); });
}

// Traktgränserna ur prod (L_TRAKTDEL, avrundade till hela meter). Facit = Vidas egen SHAPE.STAr.
const HALABACK = [
  '39,66 32,26 -11,40 -42,45 -72,33 -105,63 -112,84 -112,99 -122,116 -138,140 -153,157 -135,182 -113,216 -9,154 19,97 39,66',
  '26,-426 -38,-427 -41,-418 -21,-344 37,-318 91,-318 115,-321 132,-336 129,-353 116,-385 112,-424 26,-426',
  '40,199 -13,162 -73,199 -10,212 -5,256 3,277 7,291 21,306 31,322 46,308 60,260 90,252 102,243 40,199',
].map((t) => ring(t, 56.362939, 15.07739));
const SANDASEN = [
  '304,-166 254,-180 195,-52 244,-11 213,57 218,118 221,132 377,147 395,144 419,65 380,-33 350,-60 339,-128 304,-166',
  '-218,-20 -175,-23 -148,-20 -119,-3 -62,-38 -52,-70 -82,-134 -122,-127 -144,-134 -175,-122 -202,-142 -241,-158 -283,-143 -285,-67 -311,-38 -329,-6 -257,14 -218,-20',
  '-156,50 -329,8 -296,35 -275,61 -232,95 -179,111 -134,134 -121,129 -134,100 -132,63 -156,50',
].map((t) => ring(t, 56.516198, 14.60798));

describe('traktgränsens yta', () => {
  it('stämmer mot Vidas egen yta (SHAPE.STAr) inom 2 %', () => {
    expect(ringarYtaM2(HALABACK) / 45888).toBeCloseTo(1, 1);
    expect(Math.abs(ringarYtaM2(HALABACK) / 45888 - 1)).toBeLessThan(0.02);
    // Sandåsen: objekt.areal säger 3,98 ha — traktgränsen är 8,83 ha. Det var felet i första räkningen.
    expect(Math.abs(ringarYtaM2(SANDASEN) / 88343 - 1)).toBeLessThan(0.02);
  });
});

// En 100 × 100 m kvadrat = 1 ha.
const g = tillGrad(56.4, 15.0);
const KVADRAT: Punkt[][] = [[g(0, 0), g(100, 0), g(100, 100), g(0, 100), g(0, 0)]];
const stam = (x: number, y: number, dbhMm = 100): StamPunkt => { const [lng, lat] = g(x, y); return { lat, lng, dbhMm }; };
const vag = (x: number): Punkt[] => [g(x, 0), g(x, 100)];

describe('per hektar', () => {
  it('räknar bara det som står innanför gränsen', () => {
    const stamrader = [...Array(90)].map((_, i) => stam(5 + (i % 9) * 10, 5 + Math.floor(i / 9) * 10))
      .concat([...Array(10)].map((_, i) => stam(150 + i, 50)));
    const p = beraknaPerHa({ ringar: KVADRAT, volymM3fub: 50, stammar: 100, stamrader, spar: [] });
    if (p.lage !== 'ok') throw new Error(p.lage);
    expect(p.arealHa).toBeCloseTo(1, 2);
    expect(p.andelUtanfor).toBeCloseTo(0.1, 5);
    expect(p.stammarPerHa).toBeCloseTo(90, 0);
    expect(p.volymPerHa).toBeCloseTo(45, 0); // samma diameter → 90 % av grundytan
    // 90 stammar à 10 cm = 0,707 m²
    expect(p.grundytaPerHa! * p.arealHa).toBeCloseTo(90 * Math.PI * 0.05 ** 2, 6);
  });

  it('skalar grundytan upp när detalj_stam har luckor (aldrig ned)', () => {
    const stamrader = [stam(50, 50), stam(60, 60)];
    const p = beraknaPerHa({ ringar: KVADRAT, volymM3fub: 1, stammar: 4, stamrader, spar: [] });
    if (p.lage !== 'ok') throw new Error(p.lage);
    expect(p.grundytaPerHa! * p.arealHa).toBeCloseTo(4 * Math.PI * 0.05 ** 2, 6);
  });

  it('utan stampositioner: hela uttaget på trakten och ingen utanför-andel', () => {
    const p = beraknaPerHa({ ringar: KVADRAT, volymM3fub: 30, stammar: 600, stamrader: [], spar: [] });
    if (p.lage !== 'ok') throw new Error(p.lage);
    expect(p.volymPerHa * p.arealHa).toBeCloseTo(30, 6);
    expect(p.andelUtanfor).toBeNull();
    expect(p.grundytaPerHa).toBeNull();
  });

  it('utan traktgräns finns inget per hektar — aldrig objekt.areal i stället', () => {
    expect(beraknaPerHa({ ringar: [], volymM3fub: 30, stammar: 600, stamrader: [], spar: [] }).lage).toBe('ingen-grans');
  });
});

describe('stickvägar ur GPS-spåret', () => {
  it('fem vägar 20 m isär på 1 ha = 20 % och 20 m', () => {
    const sv = stickvag([{ roll: 'skotare', linjer: [10, 30, 50, 70, 90].map(vag) }], KVADRAT, ringarYtaM2(KVADRAT));
    if (sv.lage !== 'ok') throw new Error(sv.lage);
    expect(sv.andel).toBeGreaterThan(0.19);
    expect(sv.andel).toBeLessThan(0.21);
    expect(sv.avstandM).toBeGreaterThan(19);
    expect(sv.avstandM).toBeLessThan(21);
  });

  it('samma väg körd två gånger räknas en gång, och spår utanför gränsen räknas inte', () => {
    const en = stickvag([{ roll: 'skotare', linjer: [10, 30, 50, 70, 90].map(vag) }], KVADRAT, 10000);
    const tva = stickvag([
      { roll: 'skotare', linjer: [10, 30, 50, 70, 90].map(vag) },
      { roll: 'skotare', linjer: [...[10, 30, 50, 70, 90].map(vag), [g(150, 0), g(150, 100)]] },
    ], KVADRAT, 10000);
    if (en.lage !== 'ok' || tva.lage !== 'ok') throw new Error('inte ok');
    expect(tva.andel).toBeCloseTo(en.andel, 5);
  });

  it('bara skotarens spår räknas — skördaren kör också inne i beståndet (Trestensdal: 34 %, 12 m isär)', () => {
    // Skördaren kör stickvägarna 20 m isär OCH en väg mitt emellan inne i beståndet.
    const skordare = { roll: 'skordare', linjer: [10, 20, 30, 40, 50, 60, 70, 80, 90].map(vag) };
    expect(stickvag([skordare], KVADRAT, 10000).lage).toBe('inget-spar');
    const sv = stickvag([skordare, { roll: 'skotare', linjer: [10, 30, 50, 70, 90].map(vag) }], KVADRAT, 10000);
    if (sv.lage !== 'ok') throw new Error(sv.lage);
    expect(sv.avstandM).toBeGreaterThan(19); // skotarens 20 m, inte skördarens 10 m
    expect(sv.roller).toEqual(['skotare']);
  });

  it('ett spår som bara täcker en del av trakten ger inget tal', () => {
    const sv = stickvag([{ roll: 'skotare', linjer: [vag(50)] }], KVADRAT, 10000);
    expect(sv.lage).toBe('ofullstandigt'); // 4 % = 100 m mellan vägarna — ingen gallring ser ut så
  });

  it('inget spår är inget spår', () => {
    expect(stickvag([], KVADRAT, 10000).lage).toBe('inget-spar');
    expect(stickvag([{ roll: 'skotare', linjer: [[g(1, 1)]] }], KVADRAT, 10000).lage).toBe('inget-spar');
  });

  it('bredden är 4 m', () => expect(STICKVAG_BREDD_M).toBe(4));
});
