import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import { packaLaser, planeraUtsnitt, tillSparat } from './rutnat';
import { matUttag, provaUttag, MIN_STAMMAR, type Stam } from './uttag';
import { raknaUttag } from './uttagServer';

const SWEREF = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const ll = (x: number, y: number) => proj4(SWEREF, 'EPSG:4326', [x, y]) as [number, number];
const X0 = 500_000, Y0 = 6_250_000;
/** 200 × 100 m = 2 ha, 200 m³sk/ha överallt → 400 m³sk. */
function trakt(volymHa = 200) {
  const p = planeraUtsnitt([[ll(X0, Y0), ll(X0 + 200, Y0), ll(X0 + 200, Y0 + 100), ll(X0, Y0 + 100), ll(X0, Y0)]])!;
  const n = p[0].u.bredd * p[0].u.hojd;
  const f = (v: number) => new Float32Array(n).fill(v);
  return [packaLaser(p[0], { volym: f(volymHa), hojd: f(150), grundyta: f(24), diameter: f(18), dag: f(18_800) }, null)];
}
/** Stammar på ett rutnät var 5:e meter över x från x0 till x1 (hela höjden), var och en `vol` m³. Tiden följer x. */
function stammar(x0: number, x1: number, vol: number): Stam[] {
  const ut: Stam[] = [];
  for (let x = x0 + 2.5; x < x1; x += 5) for (let y = 2.5; y < 100; y += 5) ut.push({ x: X0 + x, y: Y0 + y, vol, t: x * 1000 + y });
  return ut;
}

describe('matUttag', () => {
  it('halva trakten gådd med 30 % uttag: resten räknas på samma uttag', () => {
    // Västra halvan (1 ha, 200 m³sk): 400 stammar × 0,15 = 60 m³fub. Rutorna inom räckvidd når en bit in i östra halvan.
    const m = matUttag(trakt(), stammar(0, 100, 0.15))!;
    expect(m.skordat).toBe(60);
    expect(m.gattHa).toBeGreaterThan(1); expect(m.gattHa).toBeLessThan(1.15);
    expect(m.gattHa + m.kvarHa).toBeCloseTo(2, 1);
    expect(m.uttag).toBeGreaterThan(0.26); expect(m.uttag).toBeLessThan(0.3);
    // hela trakten: 60 + kvarvarande laser × uttag ≈ 108–120 (sant värde 120 om resten gallras lika)
    expect(m.total).toBeGreaterThan(105); expect(m.total).toBeLessThanOrEqual(120);
    expect(m.total).toBe(Math.round(m.skordat + m.laserKvar * (60 / m.laserGatt)));
  });
  it('hela trakten gådd: inget kvar, total = skördat', () => {
    const m = matUttag(trakt(), stammar(0, 200, 0.15))!;
    expect(m.kvarHa).toBe(0);
    expect(m.total).toBe(Math.round(m.skordat));
  });
  it('för få stammar, för liten yta eller för många utan position: inget tal', () => {
    expect(matUttag(trakt(), stammar(0, 100, 0.15).slice(0, MIN_STAMMAR - 1))).toBeNull();
    const klump: Stam[] = Array.from({ length: 150 }, (_, i) => ({ x: X0 + 50 + (i % 3), y: Y0 + 50, vol: 0.1, t: i }));
    expect(matUttag(trakt(), klump)).toBeNull();                                  // allt på samma fläck: under 0,3 ha
    expect(matUttag(trakt(), stammar(0, 100, 0.15), { antal: 200, vol: 30 })).toBeNull();
  });
  it('stammar utan position räknas i skördat (få): total växer med dem', () => {
    const utan = matUttag(trakt(), stammar(0, 100, 0.15))!;
    const med = matUttag(trakt(), stammar(0, 100, 0.15), { antal: 20, vol: 3 })!;
    expect(med.skordat).toBe(63);
    expect(med.total).toBe(utan.total + 3);
  });
  it('ett orimligt uttag (mer skördat än 1,5 × lasern) är inget uttag', () => {
    expect(matUttag(trakt(20), stammar(0, 100, 0.15))).toBeNull();
  });
  it('stammar utanför trakten räknas i skördat men inte i uttaget', () => {
    const inne = stammar(0, 100, 0.15);
    const ute: Stam[] = Array.from({ length: 50 }, (_, i) => ({ x: X0 - 500 - i, y: Y0 + 50, vol: 1, t: 1e9 + i }));
    const m = matUttag(trakt(), [...inne, ...ute])!;
    expect(m.skordat).toBe(110);
    expect(m.uttag).toBe(matUttag(trakt(), inne)!.uttag);
  });
});

describe('provaUttag — facit på en färdig trakt', () => {
  it('jämnt gallrad trakt: provet vid 50 % landar nära det som faktiskt skördades', () => {
    const alla = stammar(0, 200, 0.15);                       // 120 m³fub
    const prov = provaUttag(trakt(), alla);
    const halv = prov.find((p) => p.andel === 0.5)!;
    expect(Math.abs(halv.total / 120 - 1)).toBeLessThan(0.12);
  });
  it('stammar utan tid kan inte ordnas: inget prov', () => {
    expect(provaUttag(trakt(), stammar(0, 200, 0.15).map((s) => ({ ...s, t: null })))).toEqual([]);
  });
});

describe('raknaUttag — det som sparas', () => {
  const nat = trakt().map(tillSparat);
  const svar = { stammar: stammar(0, 100, 0.15).map((s) => { const [lng, lat] = ll(s.x, s.y); return [lat, lng, s.vol, s.t] as [number, number, number, number | null]; }), utan: { antal: 0, vol: 0 } };
  const nu = new Date('2026-11-17T12:00:00Z');
  it('pågående trakt: antal, skördat och det uppmätta — inget prov', () => {
    const u = raknaUttag(nat, svar, false, false, nu);
    expect(u.antal).toBe(400); expect(u.skordat).toBe(60); expect(u.klar).toBe(false);
    expect(u.matt!.total).toBeGreaterThan(105);
    expect(u.prov).toBeUndefined();
  });
  it('avslutad trakt: klar och med prov', () => {
    const u = raknaUttag(nat, svar, true, true, nu);
    expect(u.klar).toBe(true);
    expect(Array.isArray(u.prov)).toBe(true);
  });
  it('inga stammar: antal 0, inget uppmätt', () => {
    const u = raknaUttag(nat, { stammar: [], utan: { antal: 0, vol: 0 } }, false, false, nu);
    expect(u).toMatchObject({ antal: 0, skordat: 0, matt: null });
  });
});
