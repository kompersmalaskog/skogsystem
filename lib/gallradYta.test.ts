import { describe, it, expect } from 'vitest';
import { beraknaGallradYta, medelbreddM, RUTA, type StamPos } from './gallradYta';
import { beraknaPerHa } from './gallringPerHa';
import type { Punkt } from './avverkadAreal';

// Lokala meter → [lng, lat].
const la0 = 56.4, lo0 = 15.0;
const g = (x: number, y: number): Punkt => [lo0 + x / (Math.cos((la0 * Math.PI) / 180) * 111320), la0 + y / 110540];
// Vidas gräns: 200 × 100 m = 2 ha.
const GRANS: Punkt[][] = [[g(0, 0), g(200, 0), g(200, 100), g(0, 100), g(0, 0)]];

let nesta = 1;
function rutnat(x0: number, x1: number, y0: number, y1: number, steg = 6): StamPos[] {
  const ut: StamPos[] = [];
  for (let x = x0; x <= x1; x += steg) for (let y = y0; y <= y1; y += steg) {
    const [lng, lat] = g(x, y);
    ut.push({ id: nesta++, lat, lng, dbhMm: 120 });
  }
  return ut;
}

describe('den gallrade ytan', () => {
  it('hela trakten gallrad = Vidas gräns, inga bitar', () => {
    const y = beraknaGallradYta({ ringar: GRANS, stammar: rutnat(3, 197, 3, 97) })!;
    expect(y.gallradHa / y.vidaHa).toBeCloseTo(1, 2);
    expect(y.utanfor).toHaveLength(0);
    expect(y.ejGallrat).toHaveLength(0);
  });

  it('gallring utanför gränsen (Sandåsen) läggs till ytan och räknas', () => {
    const inne = rutnat(3, 197, 3, 97);
    const ute = rutnat(210, 290, 3, 97); // 80 × 94 m bredvid gränsen
    const y = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, ...ute] })!;
    expect(y.utanfor).toHaveLength(1);
    const b = y.utanfor[0];
    expect(b.klass).toBe('gallring');
    expect(b.galler).toBe('gallring');
    expect(b.ha).toBeGreaterThan(0.8);
    expect(y.gallradHa).toBeCloseTo(y.vidaHa + b.ha, 5);
    expect(ute.every((s) => y.raknade.has(s.id))).toBe(true);
  });

  it('en väg in genom ett annat bestånd räknas inte', () => {
    const inne = rutnat(3, 197, 3, 97);
    const vag: StamPos[] = [];
    for (let y = 110; y <= 400; y += 4) { const [lng, lat] = g(100, y); vag.push({ id: nesta++, lat, lng, dbhMm: 150 }); }
    const y = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, ...vag] })!;
    expect(y.utanfor).toHaveLength(1);
    expect(y.utanfor[0].klass).toBe('vag');
    expect(y.gallradHa / y.vidaHa).toBeCloseTo(1, 2);
    expect(vag.some((s) => y.raknade.has(s.id))).toBe(false);
  });

  it('enstaka träd (barkborre) räknas inte', () => {
    const inne = rutnat(3, 197, 3, 97);
    const [lng, lat] = g(300, 300);
    const y = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, { id: 'bark', lat, lng, dbhMm: 300 }] })!;
    expect(y.utanfor[0].klass).toBe('enstaka');
    expect(y.raknade.has('bark')).toBe(false);
  });

  it('svaret går före bedömningen', () => {
    const inne = rutnat(3, 197, 3, 97);
    const ute = rutnat(210, 290, 3, 97);
    const forsta = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, ...ute] })!;
    const nyckel = forsta.utanfor[0].nyckel;
    const y = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, ...ute], svarUtanfor: { [nyckel]: 'inte_hit' } })!;
    expect(y.utanfor[0].klass).toBe('gallring');
    expect(y.utanfor[0].galler).toBe('inte_hit');
    expect(y.gallradHa / y.vidaHa).toBeCloseTo(1, 2);
    expect(ute.some((s) => y.raknade.has(s.id))).toBe(false);
  });

  it('nyckeln är stabil när filen växer (samma minsta stam-id)', () => {
    const inne = rutnat(3, 197, 3, 97);
    const ute = rutnat(210, 290, 3, 97);
    const a = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, ...ute] })!;
    const mer = rutnat(210, 290, 99, 99);
    const b = beraknaGallradYta({ ringar: GRANS, stammar: [...inne, ...ute, ...mer] })!;
    expect(b.utanfor[0].nyckel).toBe(a.utanfor[0].nyckel);
  });

  it('en stor bit innanför utan stammar = inte gallrad, och dras bort', () => {
    const stammar = rutnat(3, 97, 3, 97); // bara vänstra halvan
    const y = beraknaGallradYta({ ringar: GRANS, stammar })!;
    expect(y.ejGallrat).toHaveLength(1);
    expect(y.ejGallrat[0].ha).toBeGreaterThan(0.5);
    expect(y.gallradHa).toBeCloseTo(y.vidaHa - y.ejGallrat[0].ha, 5);
  });

  it('stickvägsluckor (20 m mellan stråken) är aldrig "inte gallrat"', () => {
    const stammar: StamPos[] = [];
    for (const x of [10, 30, 50, 70, 90, 110, 130, 150, 170, 190]) stammar.push(...rutnat(x - 4, x + 4, 3, 97, 4));
    const y = beraknaGallradYta({ ringar: GRANS, stammar })!;
    expect(y.ejGallrat).toHaveLength(0);
  });

  it('luckor i stamdatan döljer aldrig mark som "inte gallrad"', () => {
    const y = beraknaGallradYta({ ringar: GRANS, stammar: rutnat(3, 97, 3, 97), hittaEjGallrat: false })!;
    expect(y.ejGallrat).toHaveLength(0);
    expect(y.gallradHa / y.vidaHa).toBeCloseTo(1, 2);
  });

  it('en stam precis innanför gränsen gör ingen remsa utanför till gallrat', () => {
    const y = beraknaGallradYta({ ringar: GRANS, stammar: rutnat(3, 197, 3, 97) })!;
    let utanforGallrat = 0;
    for (const c of y.karta.rutor) if (c === RUTA.utanforGallring || c === RUTA.utanforAnnat) utanforGallrat++;
    expect(utanforGallrat).toBe(0);
  });

  it('medelbredd: en remsa 4 × 100 rutor är 4 rutor bred', () => {
    const r: { x: number; y: number }[] = [];
    for (let x = 0; x < 100; x++) for (let y = 0; y < 4; y++) r.push({ x, y });
    expect(medelbreddM(r, 2)).toBeGreaterThan(7);
    expect(medelbreddM(r, 2)).toBeLessThan(9);
  });

  it('ingen gräns = ingen yta', () => {
    expect(beraknaGallradYta({ ringar: [], stammar: rutnat(0, 10, 0, 10) })).toBeNull();
  });
});

describe('per hektar på den gallrade ytan', () => {
  it('Sandåsen-fallet: arealen är den gallrade ytan och stammarna utanför räknas', () => {
    const inne = rutnat(3, 197, 3, 97);
    const ute = rutnat(210, 290, 3, 97);
    const alla = [...inne, ...ute];
    const p = beraknaPerHa({ ringar: GRANS, volymM3fub: 100, stammar: alla.length, stamrader: alla, spar: [] });
    if (p.lage !== 'ok') throw new Error(p.lage);
    expect(p.vidaHa).toBeCloseTo(2, 1);
    expect(p.arealHa).toBeGreaterThan(2.8);
    expect(p.andelUtanfor).toBe(0);
    expect(p.stammarPerHa * p.arealHa).toBeCloseTo(alla.length, 5);
  });

  it('svar "Hör inte hit" tar bort både yta och stammar', () => {
    const inne = rutnat(3, 197, 3, 97);
    const ute = rutnat(210, 290, 3, 97);
    const alla = [...inne, ...ute];
    const nyckel = beraknaGallradYta({ ringar: GRANS, stammar: alla })!.utanfor[0].nyckel;
    const p = beraknaPerHa({
      ringar: GRANS, volymM3fub: 100, stammar: alla.length, stamrader: alla, spar: [],
      svarUtanfor: { [nyckel]: 'inte_hit' },
    });
    if (p.lage !== 'ok') throw new Error(p.lage);
    expect(p.arealHa / p.vidaHa).toBeCloseTo(1, 2);
    expect(p.andelUtanfor).toBeCloseTo(ute.length / alla.length, 5);
  });
});
