import { describe, it, expect } from 'vitest';
import { avverkadAreaM2, avverkadAndel, avverkatHa, AVVERKAT_BUFFERT_M, type Punkt } from './avverkadAreal';

// Testgeometri i meter runt Hålabäck (56,35 N, 15,05 E) → lng/lat. Samma sfär-approximation som libben (lokal ekvirektangulär).
const LAT0 = 56.35, LNG0 = 15.05, R = 6371008.8, RAD = Math.PI / 180;
const fran = (x: number, y: number): Punkt => [LNG0 + x / (R * Math.cos(LAT0 * RAD) * RAD), LAT0 + y / (R * RAD)];
const spar = (...pts: [number, number][]): Punkt[] => pts.map(([x, y]) => fran(x, y));
const nara = (varde: number, facit: number, tolProcent: number) => Math.abs(varde - facit) / facit <= tolProcent / 100;

describe('avverkadAreaM2 — union av 10 m buffert runt spåret', () => {
  it('buffert-konstanten är 10 m (Martins spec)', () => {
    expect(AVVERKAT_BUFFERT_M).toBe(10);
  });

  it('ett rakt spår på 100 m → 100×20 + halvcirklarna i ändarna (π·10²) ≈ 2314 m²', () => {
    const a = avverkadAreaM2([spar([0, 0], [0, 100])]);
    expect(nara(a, 2000 + Math.PI * 100, 3)).toBe(true);
  });

  it('en ensam punkt → en cirkel med radien 10 m ≈ 314 m²', () => {
    const a = avverkadAreaM2([spar([0, 0])]);
    expect(nara(a, Math.PI * 100, 6)).toBe(true);
  });

  it('samma spår körs två gånger → en gång (union, ingen dubbelräkning)', () => {
    const ett = avverkadAreaM2([spar([0, 0], [0, 100])]);
    const tva = avverkadAreaM2([spar([0, 0], [0, 100]), spar([0, 0], [0, 100]), spar([0, 100], [0, 0])]);
    expect(tva).toBeCloseTo(ett, 6);
  });

  it('två parallella spår 5 m isär → mindre än summan (överlappande buffertar), men mer än ett', () => {
    const ett = avverkadAreaM2([spar([0, 0], [0, 100])]);
    const bada = avverkadAreaM2([spar([0, 0], [0, 100]), spar([5, 0], [5, 100])]);
    expect(bada).toBeGreaterThan(ett);
    expect(bada).toBeLessThan(2 * ett);
    expect(nara(bada, 100 * 25 + Math.PI * 100, 4)).toBe(true);   // 25 m brett stråk + två halvcirklar
  });

  it('tomt / ogiltigt → 0', () => {
    expect(avverkadAreaM2([])).toBe(0);
    expect(avverkadAreaM2(null)).toBe(0);
    expect(avverkadAreaM2([[]])).toBe(0);
    expect(avverkadAreaM2([[[NaN, 1] as any]])).toBe(0);
  });

  it('klipps mot traktgränsen: ett spår längs gränsen räknas bara på insidan (≈ hälften)', () => {
    // ringen täcker x ≥ 0; spåret går längs x = 0 → halva stråket ligger utanför
    const ring: Punkt[] = [fran(0, -50), fran(200, -50), fran(200, 150), fran(0, 150)];
    const klippt = avverkadAreaM2([spar([0, 0], [0, 100])], { ringar: [ring] });
    const oklippt = avverkadAreaM2([spar([0, 0], [0, 100])]);
    expect(nara(klippt, oklippt / 2, 4)).toBe(true);
  });

  it('spår helt utanför traktgränsen → 0', () => {
    const ring: Punkt[] = [fran(500, 500), fran(600, 500), fran(600, 600), fran(500, 600)];
    expect(avverkadAreaM2([spar([0, 0], [0, 100])], { ringar: [ring] })).toBe(0);
  });

  it('tom ringlista = ingen klippning (traktgräns saknas i geometrin)', () => {
    const a = avverkadAreaM2([spar([0, 0], [0, 100])], { ringar: [] });
    expect(nara(a, 2000 + Math.PI * 100, 3)).toBe(true);
  });

  it('spår som ligger helt inne i traktgränsen påverkas inte av klippningen', () => {
    const ring: Punkt[] = [fran(-100, -100), fran(100, -100), fran(100, 200), fran(-100, 200)];
    const klippt = avverkadAreaM2([spar([0, 0], [0, 100])], { ringar: [ring] });
    const oklippt = avverkadAreaM2([spar([0, 0], [0, 100])]);
    expect(klippt).toBeCloseTo(oklippt, 6);
  });

  it('flera ringar (en trakt i bitar): spår som korsar båda räknas i båda', () => {
    const r1: Punkt[] = [fran(-50, -10), fran(50, -10), fran(50, 40), fran(-50, 40)];
    const r2: Punkt[] = [fran(-50, 60), fran(50, 60), fran(50, 110), fran(-50, 110)];
    const a = avverkadAreaM2([spar([0, 0], [0, 100])], { ringar: [r1, r2] });
    // bara de 20 m breda stråken inom y∈[0..40+10] resp. [60..100+10]: luckan 40..60 räknas inte
    const utanLucka = avverkadAreaM2([spar([0, 0], [0, 100])], { ringar: [[fran(-50, -10), fran(50, -10), fran(50, 110), fran(-50, 110)]] });
    expect(a).toBeLessThan(utanLucka);
    expect(nara(utanLucka - a, 20 * 20, 6)).toBe(true);   // 20 m lucka × 20 m bredd
  });

  it('stor yta håller sig inom rimlig tid (30 ha-trakt, tätt spår)', () => {
    const t0 = Date.now();
    const rutor: Punkt[][] = [];
    for (let rad = 0; rad < 20; rad++) {   // 20 slingor à 600 m, 20 m isär → ca 12 ha
      const pts: [number, number][] = [];
      for (let y = 0; y <= 600; y += 5) pts.push([rad * 20, y]);
      rutor.push(spar(...pts));
    }
    const a = avverkadAreaM2(rutor);
    expect(a).toBeGreaterThan(100000);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('avverkadAndel / avverkatHa', () => {
  it('KODBEVIS: Östra-Höka 3,64 ha och 1,82 ha avverkat → 50 %', () => {
    expect(avverkadAndel(18200, 3.64)).toBeCloseTo(0.5, 10);
  });
  it('klampas till 0–1; okänt areal → null', () => {
    expect(avverkadAndel(99999999, 3.64)).toBe(1);
    expect(avverkadAndel(-5, 3.64)).toBe(0);
    expect(avverkadAndel(100, null)).toBeNull();
    expect(avverkadAndel(100, 0)).toBeNull();
    expect(avverkadAndel(NaN, 3.64)).toBeNull();
  });
  it('avverkatHa klampas till objektets areal (visar aldrig mer än Y i "X av Y ha")', () => {
    expect(avverkatHa(18200, 3.64)).toBeCloseTo(1.82, 10);
    expect(avverkatHa(99999999, 3.64)).toBe(3.64);
    expect(avverkatHa(5000, null)).toBeCloseTo(0.5, 10);
  });
});
