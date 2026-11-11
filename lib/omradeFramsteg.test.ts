import { describe, it, expect } from 'vitest';
import { beraknaFramsteg, ringArealHa, punktIRing, KLART_ANDEL, type Omrade, type SparDag } from './omradeFramsteg';
import { framstegVy } from './omradeFramstegVy';
import type { Punkt } from './avverkadAreal';

// Ett lokalt rutnät i meter runt en punkt i Småland → lng/lat.
const LAT0 = 56.7, LNG0 = 15.2;
const M_LAT = 111320, M_LNG = 111320 * Math.cos(LAT0 * Math.PI / 180);
const p = (x: number, y: number): Punkt => [LNG0 + x / M_LNG, LAT0 + y / M_LAT];
const ruta = (x0: number, y0: number, b: number, h: number): Punkt[] => [p(x0, y0), p(x0 + b, y0), p(x0 + b, y0 + h), p(x0, y0 + h), p(x0, y0)];
/** Spår i nord-sydliga stråk var 20:e meter (10 m buffert åt varje håll täcker allt mellan dem). */
const strak = (x0: number, x1: number, y0: number, y1: number): Punkt[][] => {
  const ut: Punkt[][] = [];
  for (let x = x0 + 10; x < x1; x += 20) ut.push([p(x, y0 - 5), p(x, y1 + 5)]);
  return ut;
};

// Två områden: A = 200 × 100 m (2 ha), B = 100 × 100 m (1 ha), 50 m isär.
const A: Omrade = { id: 'a', namn: 'Område 1', ring: ruta(0, 0, 200, 100) };
const B: Omrade = { id: 'b', namn: 'Område 2', ring: ruta(250, 0, 100, 100) };

describe('ringArealHa / punktIRing', () => {
  it('räknar ytan i hektar', () => {
    expect(ringArealHa(A.ring)).toBeCloseTo(2, 2);
    expect(ringArealHa(B.ring)).toBeCloseTo(1, 2);
  });
  it('vet om en punkt står i ringen', () => {
    const [lng, lat] = p(50, 50);
    expect(punktIRing(lng, lat, A.ring)).toBe(true);
    const [lng2, lat2] = p(300, 50);
    expect(punktIRing(lng2, lat2, A.ring)).toBe(false);
  });
});

describe('beraknaFramsteg', () => {
  const idag = '2026-11-11';   // onsdag

  it('gallrat per område och hela trakten = summan', () => {
    const spar: SparDag[] = [{ datum: '2026-11-09', segment: strak(0, 100, 0, 100) }];   // halva A
    const f = beraknaFramsteg({ omraden: [A, B], spar, idag, markeringar: [], certifierat: false });
    expect(f.omraden[0].gallratHa).toBeCloseTo(1, 1);
    expect(f.omraden[1].gallratHa).toBe(0);
    expect(f.gallratHa).toBeCloseTo(f.omraden[0].gallratHa + f.omraden[1].gallratHa, 6);
    expect(f.arealHa).toBeCloseTo(3, 1);
    expect(f.harSpar).toBe(true);
    expect(f.omraden[0].klart).toBe(false);
  });

  it('ett område är klart från 95 %, och kvar räknas mot 95 %', () => {
    const spar: SparDag[] = [{ datum: '2026-11-10', segment: strak(250, 350, 0, 100) }];   // hela B
    const f = beraknaFramsteg({ omraden: [A, B], spar, idag, markeringar: [], certifierat: false });
    expect(f.omraden[1].klart).toBe(true);
    expect(f.omraden[0].klart).toBe(false);
    expect(f.kvarHa).toBeCloseTo(f.arealHa * KLART_ANDEL - f.gallratHa, 6);
  });

  it('samma mark körd två dagar räknas en gång', () => {
    const seg = strak(0, 100, 0, 100);
    const en = beraknaFramsteg({ omraden: [A], spar: [{ datum: '2026-11-09', segment: seg }], idag, markeringar: [], certifierat: false });
    const tva = beraknaFramsteg({ omraden: [A], spar: [{ datum: '2026-11-09', segment: seg }, { datum: '2026-11-10', segment: seg }], idag, markeringar: [], certifierat: false });
    expect(tva.gallratHa).toBeCloseTo(en.gallratHa, 6);
  });

  it('tempo ur ny yta per dag och klar-dag; utan två dagar ingen dag', () => {
    const spar: SparDag[] = [
      { datum: '2026-11-09', segment: strak(0, 60, 0, 100) },
      { datum: '2026-11-10', segment: strak(60, 120, 0, 100) },
    ];
    const f = beraknaFramsteg({ omraden: [A, B], spar, idag, markeringar: [], certifierat: false });
    expect(f.tempoHaPerDag).not.toBeNull();
    expect(f.tempoHaPerDag!).toBeGreaterThan(0.4);
    expect(f.klarDatum).not.toBeNull();
    expect(f.klarDatum! >= idag).toBe(true);

    const en = beraknaFramsteg({ omraden: [A, B], spar: spar.slice(0, 1), idag, markeringar: [], certifierat: false });
    expect(en.tempoHaPerDag).toBeNull();
    expect(en.klarDatum).toBeNull();
  });

  it('inget spår = inget gallrat och ingen gissning', () => {
    const f = beraknaFramsteg({ omraden: [A, B], spar: [], idag, markeringar: [], certifierat: true });
    expect(f.harSpar).toBe(false);
    expect(f.gallratHa).toBe(0);
    expect(f.tempoHaPerDag).toBeNull();
  });

  it('högstubbar och evighetsträd räknas i sitt område, kravet på områdets areal', () => {
    const [l1, b1] = p(20, 20);
    const [l2, b2] = p(300, 50);
    const f = beraknaFramsteg({
      omraden: [A, B], spar: [], idag, certifierat: true,
      markeringar: [
        { type: 'highstump', lng: l1, lat: b1 },
        { type: 'highstump', antal: 2, lng: l1, lat: b1 },
        { type: 'eternitytree', lng: l2, lat: b2 },
        { type: 'naturecorner', antal: 3, lng: l2, lat: b2 },
      ],
    });
    expect(f.omraden[0].hogstubbar).toEqual({ antal: 3, krav: 6 });   // 2 ha × 3/ha
    expect(f.omraden[0].evighetstrad).toEqual({ antal: 0, krav: 20 });
    expect(f.omraden[1].hogstubbar).toEqual({ antal: 0, krav: 3 });
    expect(f.omraden[1].evighetstrad).toEqual({ antal: 4, krav: 10 });
  });

  it('ej certifierat: inget krav', () => {
    const f = beraknaFramsteg({ omraden: [A], spar: [], idag, markeringar: [], certifierat: false });
    expect(f.omraden[0].hogstubbar.krav).toBeNull();
  });
});

describe('framstegVy', () => {
  const idag = '2026-11-11';
  const hela = { hogstubbar: { antal: 3, krav: 9 }, evighetstrad: { antal: 30, krav: 30 } };

  it('säger hur långt det kommit, i ord', () => {
    const f = beraknaFramsteg({ omraden: [A, B], spar: [
      { datum: '2026-11-09', segment: strak(0, 60, 0, 100) },
      { datum: '2026-11-10', segment: strak(60, 120, 0, 100) },
    ], idag, markeringar: [], certifierat: true });
    const v = framstegVy(f, { typ: 'Gallring', idag, hela });
    expect(v.under).toMatch(/^Gallring · \d+,\d av 3,0 ha klart$/);
    expect(v.rubrik).toMatch(/^Klar ca /);
    expect(v.tempo).toMatch(/^Du gallrar ca \d+,\d ha per dag/);
    expect(v.omraden.map((o) => o.namn)).toEqual(['Område 1', 'Område 2']);
    expect(v.omraden[1].hoger).toBe('0,0 av 1,0 ha');
    expect(v.helaTrakten.map((r) => r.text)).toEqual(['Högstubbar 3 av 9', 'Evighetsträd 30 av 30 ✓']);
  });

  it('ett enda område: inga rader per område', () => {
    const f = beraknaFramsteg({ omraden: [A], spar: [], idag, markeringar: [], certifierat: false });
    const v = framstegVy(f, { typ: 'Gallring', idag, hela });
    expect(v.omraden).toEqual([]);
    expect(v.rubrik).toBe('Inget skördarspår än');
  });

  it('klart område säger Klart ✓', () => {
    const f = beraknaFramsteg({ omraden: [A, B], spar: [{ datum: '2026-11-10', segment: strak(250, 350, 0, 100) }], idag, markeringar: [], certifierat: false });
    const v = framstegVy(f, { typ: 'Gallring', idag, hela });
    expect(v.omraden[1].hoger).toBe('Klart ✓');
  });
});
