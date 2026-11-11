import { describe, it, expect } from 'vitest';
import { beraknaFramsteg, ringArealHa, punktIRing, omradeVid, bordeFor, KLART_ANDEL, type Omrade, type SparDag } from './omradeFramsteg';
import { skordareVy, skotareVy, omradeRader, raknareText } from './produktionVy';
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
    expect(f.omraden[0].hogstubbar).toMatchObject({ antal: 3, krav: 6 });   // 2 ha × 3/ha
    expect(f.omraden[0].evighetstrad).toMatchObject({ antal: 0, krav: 20 });
    expect(f.omraden[1].hogstubbar).toMatchObject({ antal: 0, krav: 3 });
    expect(f.omraden[1].evighetstrad).toMatchObject({ antal: 4, krav: 10 });
  });

  it('ej certifierat: inget krav', () => {
    const f = beraknaFramsteg({ omraden: [A], spar: [], idag, markeringar: [], certifierat: false });
    expect(f.omraden[0].hogstubbar.krav).toBeNull();
  });
});

describe('"N nu": hur många som borde stå för det som är gallrat', () => {
  const idag = '2026-11-11';
  it('räknas först från 0,2 ha och aldrig över områdets krav', () => {
    expect(bordeFor(0.1, 10, 20)).toBe(0);
    expect(bordeFor(0.2, 3, 6)).toBe(0);      // 0,6 → golv 0
    expect(bordeFor(1.9, 10, 47)).toBe(19);
    expect(bordeFor(1.9, 3, 15)).toBe(5);
    expect(bordeFor(9, 10, 20)).toBe(20);
    expect(bordeFor(1.9, 10, null)).toBeNull();
  });
  it('halva område A gallrat, 3 högstubbar satta → 0 nu; inga evighetsträd → 10 nu', () => {
    const [l, b] = p(20, 20);
    const f = beraknaFramsteg({ omraden: [A, B], spar: [{ datum: '2026-11-10', segment: strak(0, 100, 0, 100) }], idag, certifierat: true,
      markeringar: [{ type: 'highstump', antal: 3, lng: l, lat: b }] });
    expect(f.omraden[0].hogstubbar).toMatchObject({ antal: 3, borde: 3, nu: 0 });
    expect(f.omraden[0].evighetstrad).toMatchObject({ antal: 0, borde: 10, nu: 10 });
    expect(f.omraden[1].evighetstrad.nu).toBe(0);   // inget gallrat i B
  });
  it('ej certifierat: aldrig "nu"', () => {
    const f = beraknaFramsteg({ omraden: [A], spar: [{ datum: '2026-11-10', segment: strak(0, 200, 0, 100) }], idag, markeringar: [], certifierat: false });
    expect(f.omraden[0].evighetstrad).toMatchObject({ borde: null, nu: 0 });
  });
  it('omradeVid hittar området maskinen står i', () => {
    const [l, b] = p(300, 50);
    expect(omradeVid([A, B], l, b)?.id).toBe('b');
    const [l2, b2] = p(225, 50);
    expect(omradeVid([A, B], l2, b2)).toBeNull();
  });
});

describe('Produktion — texterna', () => {
  const idag = '2026-11-11';
  const tvaDagar: SparDag[] = [
    { datum: '2026-11-09', segment: strak(0, 60, 0, 100) },
    { datum: '2026-11-10', segment: strak(60, 120, 0, 100) },
  ];

  it('skördaren: ringen, klar-dagen, tempot och bara det som avviker', () => {
    const f = beraknaFramsteg({ omraden: [A, B], spar: tvaDagar, idag, markeringar: [], certifierat: true });
    const v = skordareVy(f, { typ: 'Gallring', idag });
    expect(v.tal).toMatch(/^\d+,\d ha$/);
    expect(v.talUnder).toBe('av 3,0 ha');
    expect(v.svar).toMatch(/^Klar ca /);
    expect(v.tempo).toMatch(/^ca \d+,\d ha per dag$/);
    expect(v.avvikelser.map((a) => a.titel)).toEqual(['Högstubbar efter i område 1', 'Evighetsträd efter i område 1']);
    expect(v.avvikelser[1].under).toMatch(/^0 satta – borde vara \d+ för det du gallrat$/);
    expect(v.iFas).toBeNull();
  });

  it('inget avviker på en certifierad trakt: "i fas"; ej certifierad: säger ingenting', () => {
    const [l, b] = p(20, 20);
    const mark = [{ type: 'highstump', antal: 10, lng: l, lat: b }, { type: 'eternitytree', antal: 30, lng: l, lat: b }];
    const f = beraknaFramsteg({ omraden: [A, B], spar: tvaDagar, idag, markeringar: mark, certifierat: true });
    expect(skordareVy(f, { typ: 'Gallring', idag }).iFas).toBe('Högstubbar och evighetsträd i fas');
    const g = beraknaFramsteg({ omraden: [A, B], spar: tvaDagar, idag, markeringar: [], certifierat: false });
    const v = skordareVy(g, { typ: 'Gallring', idag });
    expect(v.avvikelser).toEqual([]);
    expect(v.iFas).toBeNull();
  });

  it('inget spår: "Inget skördarspår än", ingen dag', () => {
    const f = beraknaFramsteg({ omraden: [A], spar: [], idag, markeringar: [], certifierat: false });
    const v = skordareVy(f, { typ: 'Gallring', idag });
    expect(v.svar).toBe('Inget skördarspår än');
    expect(v.tempo).toBeNull();
  });

  it('områdena: det du står i först, påbörjade, inte börjat, klara sist och dämpade', () => {
    const C: Omrade = { id: 'c', namn: 'Område 3', ring: ruta(0, 200, 100, 100) };
    const f = beraknaFramsteg({ omraden: [A, B, C], idag, markeringar: [], certifierat: false,
      spar: [{ datum: '2026-11-10', segment: [...strak(250, 350, 0, 100), ...strak(0, 40, 0, 100)] }] });
    const rader = omradeRader(f, 'c');
    expect(rader.map((r) => [r.titel, r.under])).toEqual([['Område 3', 'Här nu'], ['Område 1', 'Pågår'], ['Område 2', 'Klart']]);
    expect(rader[2]).toMatchObject({ hoger: '✓', dampad: true });
  });

  it('räknarens text i Här nu', () => {
    expect(raknareText({ antal: 0, krav: 47, borde: 19, nu: 19 })).toEqual({ varde: '0 · 19 nu', efter: true });
    expect(raknareText({ antal: 6, krav: 15, borde: 5, nu: 0 })).toEqual({ varde: '6 ✓', efter: false });
    expect(raknareText({ antal: 2, krav: null, borde: null, nu: 0 })).toEqual({ varde: '2', efter: false });
  });

  it('skotaren: kvar i ringen, skotat av skördat som andel, klar-dagen', () => {
    const v = skotareVy({ rader: [], skordat: 1000, skotat: 700, kvarTotal: 300 }, { kvarM3: 300, kvarText: 'Kvar ~300 m³', klarText: 'Klar ~fredag' });
    expect(v).toMatchObject({ tal: '~300 m³', talUnder: 'kvar att skota', andel: 0.7, svar: 'Klar ca fredag', avvikelser: [], iFas: null });
  });
});
