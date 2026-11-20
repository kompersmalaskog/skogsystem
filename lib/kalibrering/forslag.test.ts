import { describe, it, expect } from 'vitest';
import fx from './__fixtures__/scorpion_forslag_2026-10-24.json';
import type { DiaPunkt } from './diameterpunkter';
import { beskedFor, byggForslagStammar, FORSLAG, klassIOrd, punktBesked, stamStatistik, t95, type ForslagStam } from './forslag';
import { andringarUr, type Andring } from './forslagMarkorer';
import type { StockRad } from './grovlek';

const IDAG = '2026-10-24';
const stammar: ForslagStam[] = (fx.stammar as [string, ForslagStam['klass'], string, string, number, number][]).map(([tradslag, klass, stam, dag, n, summa]) => ({ tradslag, klass, stam, dag, n, summa }));
const historik = (fx.historik as [string, string, number, boolean][]).map(([datum, tradslag, d, o]) => ({ datum, tradslag, typ: 'diameter', dia_justering_mm: d, omkalibrering: o }));
const punkt = (lista: ReturnType<typeof punktBesked>, art: string, p: string) => lista.find(x => x.tradslag === art && x.punkt === p)!;

describe('stamStatistik', () => {
  it('medelvärde, spridning och t-intervall med stammar som enhet', () => {
    const s = stamStatistik([1, 2, 3, 4, 5])!;
    expect(s.snitt).toBe(3);
    expect(s.sd).toBeCloseTo(1.5811, 3);
    expect(s.hi - s.snitt).toBeCloseTo(2.776 * (1.5811 / Math.sqrt(5)), 3); // t(4) = 2,776
  });
  it('en stam: ingen spridning, obegränsat intervall', () => {
    const s = stamStatistik([3])!;
    expect(s.sd).toBeNull();
    expect(s.lo).toBe(-Infinity);
  });
  it('inga stammar: inget', () => expect(stamStatistik([])).toBeNull());
  it('t-värdet faller med fler stammar och rundas aldrig mot ett för litet värde', () => {
    expect(t95(9)).toBe(2.262);
    expect(t95(29)).toBe(2.06); // 29 grader: tabellposten 25 (större t = försiktigare)
    expect(t95(500)).toBe(1.96);
    expect(t95(0)).toBe(Infinity);
  });
});

describe('beskedFor — reglerna', () => {
  const lika = (v: number, n: number) => Array.from({ length: n }, (_, i) => v + (i % 2 ? 0.3 : -0.3));
  it('Låt vara: medelfelet inom ±1,5 mm — även med många stammar', () => {
    const b = beskedFor(lika(1.4, 30))!;
    expect(b.besked).toBe('latavara');
    expect(b.andringMm).toBeNull();
  });
  it('gränsen 1,5 är inom (≤), 1,6 är större', () => {
    expect(beskedFor([1.5, 1.5, 1.5])!.besked).toBe('latavara');
    expect(beskedFor(lika(1.6, 30))!.besked).toBe('justera');
  });
  it('Justera: minst 10 stammar, hela osäkerheten på samma sida om noll och felet över 1,5 mm', () => {
    const b = beskedFor(lika(2.6, 10))!;
    expect(b).toMatchObject({ besked: 'justera', spak: 'kurva', stammar: 10, saknas: 0 });
    expect(b.lo!).toBeGreaterThan(0);
  });
  it('förslaget är felet avrundat NEDÅT till hela mm: 2,6 → sänk 2, −2,6 → höj 2', () => {
    expect(beskedFor(lika(2.6, 10))!.andringMm).toBe(-2);
    expect(beskedFor(lika(-2.6, 10))!.andringMm).toBe(2);
    expect(beskedFor(lika(3.99, 10))!.andringMm).toBe(-3);
  });
  it('Klava mer: samma sida men färre än 10 stammar — och hur många som fattas', () => {
    const b = beskedFor(lika(4, 7))!;
    expect(b).toMatchObject({ besked: 'klava', saknas: 3, andringMm: null });
    expect(beskedFor(lika(4, 9))!.saknas).toBe(1);
  });
  it('Vänta: osäkerheten korsar noll', () => {
    expect(beskedFor([-6, 8, 5, -4, 7])!.besked).toBe('vanta');
  });
  it('en enda stam med stort fel: Vänta (obegränsat intervall), aldrig Klava mer', () => {
    const b = beskedFor([5])!;
    expect(b.besked).toBe('vanta');
    expect(b.lo).toBeNull();
    expect(b.hi).toBeNull(); // JSON-säkert: ingen Infinity lämnar servern
  });
  it('Höj trycket: spridning över 4,5 mm mellan stammar (minst 10 stammar), även när felet i snitt är litet', () => {
    const b = beskedFor([8, -8, 7, -7, 6, -6, 5, -5, 8, -8])!;
    expect(b.sdMm!).toBeGreaterThan(FORSLAG.SPRIDNING_MM);
    expect(b).toMatchObject({ besked: 'latavara', spak: 'tryck', andringMm: null });
  });
  it('Båda: fel åt ett håll OCH stor spridning → trycket först, ingen kurvändring föreslås än', () => {
    const b = beskedFor([12, 8, 14, 3, 9, 11, 2, 13, 10, 7, 15, 1])!;
    expect(b).toMatchObject({ besked: 'justera', spak: 'bada', andringMm: null });
  });
  it('under 10 stammar bedöms spridningen inte: ingen Höj trycket', () => {
    expect(beskedFor([8, -8, 7, -7, 6, -6, 5, -5, 8])!.spak).toBeNull();
  });
  it('spridningen 4,5 exakt är normal (över krävs)', () => {
    const v = Array.from({ length: 10 }, (_, i) => (i % 2 ? 4.5 : -4.5) * Math.sqrt(9 / 10)); // sd = 4,5
    const sd = stamStatistik(v)!.sd!;
    expect(sd).toBeCloseTo(4.5, 6);
    expect(beskedFor(v)!.spak).toBeNull();
  });
});

describe('punktBesked — fönstret', () => {
  const s = (tradslag: string, klass: ForslagStam['klass'], dag: string, medel: number, id: string): ForslagStam => ({ tradslag, klass, stam: id, dag, n: 1, summa: medel });
  const tio = (tradslag: string, klass: ForslagStam['klass'], dag: string, medel: number) => Array.from({ length: 10 }, (_, i) => s(tradslag, klass, dag, medel + (i % 2 ? 0.2 : -0.2), `${tradslag}${klass}${dag}${i}`));
  const tryckAndring: Andring = { datum: '2026-10-10', slag: 'tryck', tradslag: null, klass: null, samtidig: true };

  it('stammar klavade samma dag som en åtgärd i appen räknas EFTER åtgärden', () => {
    const p = punktBesked({ stammar: [...tio('Tall', '200-249', '2026-10-09', 5), ...tio('Tall', '200-249', '2026-10-10', 2.6)], andringar: [tryckAndring], idag: IDAG });
    expect(punkt(p, 'Tall', '200').stammar).toBe(10);
    expect(punkt(p, 'Tall', '200').snittMm).toBeCloseTo(2.6, 1);
  });
  it('stammar klavade samma dag som en kalibrering ur historiken räknas FÖRE den (de ledde till justeringen)', () => {
    const kal: Andring = { datum: '2026-10-10', slag: 'kalibrering', tradslag: 'Tall', klass: null, samtidig: false };
    const p = punktBesked({ stammar: [...tio('Tall', '200-249', '2026-10-10', 5), ...tio('Tall', '200-249', '2026-10-11', 2.6)], andringar: [kal], idag: IDAG });
    expect(punkt(p, 'Tall', '200').stammar).toBe(10);
    expect(punkt(p, 'Tall', '200').snittMm).toBeCloseTo(2.6, 1);
  });
  it('en kalibrering av tall rör inte gran', () => {
    const kal: Andring = { datum: '2026-10-10', slag: 'kalibrering', tradslag: 'Tall', klass: null, samtidig: false };
    const p = punktBesked({ stammar: [...tio('Gran', '200-249', '2026-10-09', 3), ...tio('Tall', '200-249', '2026-10-09', 3)], andringar: [kal], idag: IDAG });
    expect(punkt(p, 'Gran', '200').stammar).toBe(10);
    expect(p.find(x => x.tradslag === 'Tall')).toBeUndefined(); // alla tallstammar var före kalibreringen
  });
  it('en kurvändring i appen gäller bara sin grovlek', () => {
    const kurva: Andring = { datum: '2026-10-10', slag: 'kurva', tradslag: 'Tall', klass: '200-249', samtidig: true };
    const p = punktBesked({ stammar: [...tio('Tall', '200-249', '2026-10-09', 3), ...tio('Tall', '250-299', '2026-10-09', 3)], andringar: [kurva], idag: IDAG });
    expect(p.find(x => x.punkt === '200')).toBeUndefined();
    expect(punkt(p, 'Tall', '250').stammar).toBe(10);
  });
  it('en tryckändring gäller alla trädslag och grovlekar', () => {
    const p = punktBesked({ stammar: [...tio('Tall', '200-249', '2026-10-09', 3), ...tio('Gran', '250-299', '2026-10-09', 3)], andringar: [tryckAndring], idag: IDAG });
    expect(p).toEqual([]);
  });
  it('aldrig längre bakåt än FONSTER_MAX_DAGAR, även utan ändring', () => {
    const p = punktBesked({ stammar: tio('Gran', '200-249', '2026-05-01', 3), andringar: [], idag: IDAG });
    expect(p).toEqual([]);
  });
  it('stammar efter idag räknas inte', () => {
    expect(punktBesked({ stammar: tio('Gran', '200-249', '2026-10-30', 3), andringar: [], idag: IDAG })).toEqual([]);
  });
  it('fönstrets början redovisas per punkt', () => {
    const p = punktBesked({ stammar: tio('Gran', '200-249', '2026-10-12', 3), andringar: [tryckAndring], idag: IDAG });
    expect(p[0].fonsterFran).toBe('2026-10-10');
  });
});

describe('byggForslagStammar — fysisk stam, inte stamnummer', () => {
  const stock = (id: number, over: Partial<StockRad> = {}): StockRad => ({
    id, filnamn: 'a.hqc', kontroll_datum: '2026-10-01', harvest_date: '2026-10-01T08:00:00', stam_nummer: 1, stock_nummer: 1,
    machine_measurement_date: 'm1', operator_measurement_date: 'o1', ...over,
  });
  const pt = (stockId: number, maskin: number, operator: number): DiaPunkt => ({ stockId, maskin_mm: maskin, operator_mm: operator, avvik: maskin - operator, kalla: 'matpunkt' });
  const filTr = new Map([['a.hqc', 'TALL'], ['b.hqc', 'TALL']]);

  it('samma stock i två kumulativa filer (olika stamnummer) räknas EN gång', () => {
    const r = byggForslagStammar({
      stockar: [stock(1), stock(2, { filnamn: 'b.hqc', stam_nummer: 7, kontroll_datum: '2026-10-02' })],
      punkter: [pt(1, 205, 200), pt(2, 205, 200)], filTradslag: filTr,
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tradslag: 'Tall', klass: '200-249', n: 1, summa: 5, dag: '2026-10-01' });
  });
  it('en stam med flera stockar är EN stam i grovleken, med alla sina punkter', () => {
    const r = byggForslagStammar({
      stockar: [stock(1), stock(2, { stock_nummer: 2, machine_measurement_date: 'm2', operator_measurement_date: 'o2' })],
      punkter: [pt(1, 203, 200), pt(2, 207, 205)], filTradslag: filTr,
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ n: 2, summa: 5 });
  });
  it('en stam kan stå i flera grovlekar — en rad per grovlek', () => {
    const r = byggForslagStammar({ stockar: [stock(1)], punkter: [pt(1, 303, 300), pt(1, 203, 200)], filTradslag: filTr });
    expect(r.map(x => x.klass).sort()).toEqual(['200-249', '300+']);
  });
  it('olika stammar (olika skördetid) är olika stammar även med samma stamnummer', () => {
    const r = byggForslagStammar({
      stockar: [stock(1), stock(2, { filnamn: 'b.hqc', harvest_date: '2026-10-02T09:00:00' })],
      punkter: [pt(1, 205, 200), pt(2, 205, 200)], filTradslag: filTr,
    });
    expect(r).toHaveLength(2);
  });
  it('kontroll utan trädslag ger ingen rad — vi gissar inte', () => {
    expect(byggForslagStammar({ stockar: [stock(1)], punkter: [pt(1, 205, 200)], filTradslag: new Map() })).toEqual([]);
  });
});

describe('Scorpionen — kontroll mot det som förväntades (prod 2026-10-24)', () => {
  const tryck = andringarUr({ atgarder: fx.atgarder, historik: [] });
  const med = andringarUr({ atgarder: fx.atgarder, historik });

  it('fixturen är hel: samma stammar och medelvärden som SQL-körningen mot databasen', () => {
    expect(stammar).toHaveLength(318);
    const p = punktBesked({ stammar, andringar: tryck, idag: IDAG });
    expect(p.map(x => [x.tradslag, x.punkt, x.stammar])).toEqual([
      ['Gran', '100', 48], ['Gran', '150', 54], ['Gran', '200', 54], ['Gran', '250', 47], ['Gran', '300+', 27],
      ['Tall', '100', 11], ['Tall', '150', 14], ['Tall', '200', 14], ['Tall', '250', 10], ['Tall', '300+', 9],
    ]);
    expect(punkt(p, 'Gran', '100').snittMm).toBeCloseTo(2.34, 2);
    expect(punkt(p, 'Gran', '300+').sdMm).toBeCloseTo(5.46, 2);
    expect(punkt(p, 'Tall', '250').sdMm).toBeCloseTo(4.3, 2);
  });

  it('sedan tryckändringen 18 juli är fönstret 18 juli för alla', () => {
    const p = punktBesked({ stammar, andringar: tryck, idag: IDAG });
    expect(new Set(p.map(x => x.fonsterFran))).toEqual(new Set(['2026-07-18']));
  });

  it('Gran 100: Justera, sänk 2 · Gran 300+: Båda (trycket först) · Gran 150/200/250: Låt vara', () => {
    const p = punktBesked({ stammar, andringar: tryck, idag: IDAG });
    expect(punkt(p, 'Gran', '100')).toMatchObject({ besked: 'justera', spak: 'kurva', andringMm: -2 });
    expect(punkt(p, 'Gran', '300+')).toMatchObject({ besked: 'justera', spak: 'bada', andringMm: null });
    for (const k of ['150', '200', '250']) expect(punkt(p, 'Gran', k).besked).toBe('latavara');
  });

  it('Tall 300+: Vänta (9 stammar, osäkerheten korsar noll)', () => {
    const p = punktBesked({ stammar, andringar: tryck, idag: IDAG });
    expect(punkt(p, 'Tall', '300+')).toMatchObject({ besked: 'vanta', stammar: 9 });
  });

  it('Tall 150 och 200: Justera — sänk 2 (felet är 2,6 och 2,5 mm, avrundat NEDÅT; förväntat "cirka −3" är det orunda talet)', () => {
    const p = punktBesked({ stammar, andringar: tryck, idag: IDAG });
    expect(punkt(p, 'Tall', '150')).toMatchObject({ besked: 'justera', andringMm: -2 });
    expect(punkt(p, 'Tall', '200')).toMatchObject({ besked: 'justera', andringMm: -2 });
    expect(punkt(p, 'Tall', '150').snittMm).toBeCloseTo(2.63, 2);
  });

  it('Tall 100 och 250 har 11 resp. exakt 10 stammar — "minst 10" betyder att båda redan är Justera, inte Klava mer', () => {
    const p = punktBesked({ stammar, andringar: tryck, idag: IDAG });
    expect(punkt(p, 'Tall', '100')).toMatchObject({ stammar: 11, besked: 'justera' });
    expect(punkt(p, 'Tall', '250')).toMatchObject({ stammar: 10, besked: 'justera', andringMm: -3 });
  });

  it('MEN: tallens diameter kalibrerades 7 okt (−1, −1) — med historikens ändringar räknas bara stammar efter den dagen', () => {
    const p = punktBesked({ stammar, andringar: med, idag: IDAG });
    for (const k of ['100', '150', '200', '250', '300+']) expect(punkt(p, 'Tall', k).fonsterFran).toBe('2026-10-08');
    // efter kalibreringen har varje grovlek högst 5 stammar och inget Justera finns kvar
    expect(p.filter(x => x.tradslag === 'Tall').every(x => x.stammar <= 5 && x.besked !== 'justera')).toBe(true);
    expect(punkt(p, 'Tall', '150').snittMm).toBeLessThan(2); // felet föll från ca 2,6 till ca 1,6
    expect(punkt(p, 'Tall', '200').snittMm).toBeLessThan(1.5);
    // gran rörs inte av tallens kalibrering
    expect(punkt(p, 'Gran', '100')).toMatchObject({ besked: 'justera', stammar: 48 });
  });
});

describe('klassIOrd', () => {
  it('grovlekarna som de läses', () => {
    expect(klassIOrd('<150')).toBe('under 150 mm');
    expect(klassIOrd('250-299')).toBe('250–299 mm');
    expect(klassIOrd('300+')).toBe('300 mm och grövre');
  });
});
