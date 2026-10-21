import { describe, it, expect } from 'vitest';
import {
  aggregeraSprid, aggregeraSteg, diagnos, flaxSlutsats, fmtPeriod, perioderAv, periodKey, spridStiger, spridYMax,
  stabilitetCell, stabilitetManader, systWin, traffSerier,
} from './diagnos';
import type { DiagKlass, DiagnosResp } from './typer';

const klass = (o: Partial<DiagKlass> & { klass: string }): DiagKlass => ({
  min: 0, max: 149, n: 400, traffPct: 90, standardavv: 3, systMonthly: [], plateauShare: 10, plateauN: 300,
  traffMonthly: [], plateauMonthly: [], spridMonthly: [], ...o,
});
const resp = (klasser: DiagKlass[], extra: Partial<DiagnosResp> = {}): DiagnosResp => ({
  ok: true, maskin_id: 'G', profil: 'VIDA', golvDia: 75, fonster: { fran: '2026-07-24', till: '2026-10-21', dagar: 90 },
  klasser, plateauMonthly: [], markorer: [], ...extra,
});
const syst = (tecken: number[]) => tecken.map((t, i) => ({ manad: `2026-0${i + 1}`, systematik: t * 1.5, n: 40 }));

describe('periodKey / fmtPeriod', () => {
  it('månad, kvartal, år', () => {
    expect(periodKey('2026-08', 'manad')).toBe('2026-08');
    expect(periodKey('2026-08', 'kvartal')).toBe('2026-Q3');
    expect(periodKey('2026-12', 'kvartal')).toBe('2026-Q4');
    expect(periodKey('2026-08', 'ar')).toBe('2026');
  });
  it('etiketter', () => {
    expect(fmtPeriod('2026-08', 'manad')).toBe('08/26');
    expect(fmtPeriod('2026-Q3', 'kvartal')).toBe('Q3 ’26');
    expect(fmtPeriod('2026', 'ar')).toBe('2026');
  });
});

describe('aggregering per period', () => {
  it('träffprocent viktas på n (sann periodträff, inte medel av medel)', () => {
    const m = aggregeraSteg([{ manad: '2026-07', v: 50, n: 10 }, { manad: '2026-08', v: 100, n: 90 }, { manad: '2026-10', v: 70, n: 20 }], 'kvartal');
    expect(m.get('2026-Q3')).toEqual({ v: 95, n: 100 });
    expect(m.get('2026-Q4')).toEqual({ v: 70, n: 20 });
  });
  it('spridningen aggregeras exakt ur råa summor — inte som medel av månads-std', () => {
    // två månader med n=2: värden (0,0) → sum 0, sumsq 0 och (10,10) → sum 20, sumsq 200
    const m = aggregeraSprid([{ manad: '2026-07', n: 2, sum: 0, sumsq: 0 }, { manad: '2026-08', n: 2, sum: 20, sumsq: 200 }], 'kvartal');
    // pooled: n=4, mean 5, E[x²]=50 → var 25 → std 5 (medel av månads-std hade gett 0)
    expect(m.get('2026-Q3')!.v).toBeCloseTo(5, 10);
    expect(m.get('2026-Q3')!.n).toBe(4);
  });
  it('perioderAv tar bara perioder med underlag ≥ 30 i minst en serie', () => {
    const k = klass({ klass: '300+', traffMonthly: [{ manad: '2026-05', traffPct: 80, n: 10 }, { manad: '2026-08', traffPct: 80, n: 40 }] });
    expect(perioderAv(traffSerier([k], 'manad'))).toEqual(['2026-08']);
  });
  it('spridYMax: minst 8, annars 1,6 × golvet uppåt till jämnt tal', () => {
    expect(spridYMax(4.5)).toBe(8);
    expect(spridYMax(null)).toBe(8);
    expect(spridYMax(6.5)).toBe(12);
  });
  it('stabilitetsrutnätet: månaderna sorterade, cellen tunn/hot/hi/ok', () => {
    expect(stabilitetManader([klass({ klass: 'a', systMonthly: [{ manad: '2026-03', systematik: 1, n: 30 }, { manad: '2026-02', systematik: 1, n: 30 }] })])).toEqual(['2026-02', '2026-03']);
    expect(stabilitetCell({ systematik: 9, n: 19 })).toBe('tunn');
    expect(stabilitetCell({ systematik: -4, n: 20 })).toBe('hot');
    expect(stabilitetCell({ systematik: 2, n: 20 })).toBe('hi');
    expect(stabilitetCell({ systematik: 1.9, n: 20 })).toBe('ok');
  });
});

describe('diagnos — appen är tyst när den inte har något att säga', () => {
  it('saknad data, inget golv eller inga klasser → bra', () => {
    expect(diagnos(null).status).toBe('bra');
    expect(diagnos(resp([klass({ klass: '300+' })], { golvDia: null })).status).toBe('bra');
    expect(diagnos(resp([])).status).toBe('bra');
  });
  it('alla klasser över golvet → bra', () => {
    expect(diagnos(resp([klass({ klass: '300+', traffPct: 80 })])).mening1).toBe('Maskinen mäter bra.');
  });
  it('en klass under golvet men < 30 mätpunkter → tyst (grind)', () => {
    expect(diagnos(resp([klass({ klass: '300+', traffPct: 40, n: 29 })])).status).toBe('bra');
  });
  it('30–100 mätpunkter → tendens utan åtgärd, med bandzon', () => {
    const d = diagnos(resp([klass({ klass: '300+', traffPct: 60, n: 99 })]));
    expect(d).toMatchObject({ status: 'tendens', fel: null, bandZon: 0, mening1: 'Ser ut att brista på grova bitar.' });
  });
  it('≥ 100: systematiken VÄXLAR tecken → tryck', () => {
    const d = diagnos(resp([klass({ klass: '250-299', traffPct: 66, n: 140, systMonthly: syst([1, -1, 1, -1]) })]));
    expect(d).toMatchObject({ status: 'diagnos', fel: 'tryck', bandZon: 1, mening1: 'Maskinen mäter ostadigt på 250-299 mm-bitar.' });
    expect(d.mening3).toBe('Men känn efter: går det för trögt kostar det bränsle och produktion.');
  });
  it('≥ 100: konsekvent tecken → kurva (kontakta tekniker)', () => {
    const d = diagnos(resp([klass({ klass: '200-249', traffPct: 60, n: 120, systMonthly: syst([1, 1, 1, 1]) })]));
    expect(d).toMatchObject({ fel: 'kurva', mening2: 'Diameterkurvan behöver ses över — kontakta tekniker.' });
    expect(d.mening3).toBeUndefined();
  });
  it('glesa månader (n < 20) och småsystematik (< 0,05) räknas inte som teckenväxling', () => {
    const k = klass({ klass: '200-249', traffPct: 60, n: 120, systMonthly: [{ manad: '2026-01', systematik: 2, n: 40 }, { manad: '2026-02', systematik: -2, n: 19 }, { manad: '2026-03', systematik: -0.04, n: 40 }] });
    expect(diagnos(resp([k])).fel).toBe('kurva');
  });
  it('tryck + åtgärdsmarkör + planområden sjönk INTE efter den → slitage', () => {
    const k = klass({ klass: '250-299', traffPct: 60, n: 140, systMonthly: syst([1, -1, 1]) });
    const platt = [{ manad: '2026-05', share: 30, n: 50 }, { manad: '2026-08', share: 29, n: 50 }];
    const d = diagnos(resp([k], { plateauMonthly: platt, markorer: [{ datum: '2026-07-10', kalla: 'atgard', text: 'höjde trycket' }] }));
    expect(d.fel).toBe('slitage');
    // sjönk de efter markören (30 → 20) är det fortfarande tryck
    const sjonk = [{ manad: '2026-05', share: 30, n: 50 }, { manad: '2026-08', share: 20, n: 50 }];
    expect(diagnos(resp([k], { plateauMonthly: sjonk, markorer: [{ datum: '2026-07-10', kalla: 'atgard', text: 'x' }] })).fel).toBe('tryck');
  });
  it('värsta klassen = lägst träffprocent bland de med underlag', () => {
    const d = diagnos(resp([klass({ klass: '<150', traffPct: 70, n: 400 }), klass({ klass: '300+', traffPct: 50, n: 120, systMonthly: syst([1, 1]) })]));
    expect(d.klass?.klass).toBe('300+');
  });
});

describe('"Flaxar den?" — slutsatsen räknas ut', () => {
  const med = (k: string, min: number, std: number, extra: Partial<DiagKlass> = {}) => klass({ klass: k, min, standardavv: std, ...extra });
  it('för tunt underlag eller inget golv → tyst', () => {
    expect(flaxSlutsats([], 4.5, 1).status).toBe('tyst');
    expect(flaxSlutsats([med('a', 0, 3)], null, 1).status).toBe('tyst');
  });
  it('allt under golvet → jämnt', () => {
    expect(flaxSlutsats([med('<150', 0, 3), med('300+', 300, 4)], 4.5, 1)).toMatchObject({ status: 'jamn', atgard: 'Inget att åtgärda.' });
  });
  it('spridningen växer med grovleken → höj trycket', () => {
    const s = flaxSlutsats([med('<150', 0, 3.1), med('250-299', 250, 5.2), med('300+', 300, 5.9)], 4.5, 1);
    expect(s.status).toBe('flaxar');
    expect(s.rubrik).toBe('Flaxar värst på grova bitar — spridningen växer med grovleken.');
    expect(s.atgard).toMatch(/^Greppet räcker inte/);
  });
  it('lika överallt → givare och bussningar; "ökar över tid" när sista halvan är ≥ 0,5 mm högre', () => {
    const jamn = [med('<150', 0, 5), med('300+', 300, 5.4)];
    expect(flaxSlutsats(jamn, 4.5, 1).rubrik).toBe('Flaxar ungefär lika överallt.');
    const stiger = med('300+', 300, 5.4, { spridMonthly: [{ manad: '2026-01', n: 40, sum: 0, sumsq: 40 * 9 }, { manad: '2026-02', n: 40, sum: 0, sumsq: 40 * 9 }, { manad: '2026-03', n: 40, sum: 0, sumsq: 40 * 36 }, { manad: '2026-04', n: 40, sum: 0, sumsq: 40 * 36 }] });
    expect(spridStiger(stiger)).toBe(true);
    expect(flaxSlutsats([med('<150', 0, 5), stiger], 4.5, 1).rubrik).toBe('Flaxar ungefär lika överallt, och spridningen ökar över tid.');
  });
  it('utan grova klasser får tryck inte skiljas från givarfel — säg bara vad som finns', () => {
    const s = flaxSlutsats([med('<150', 0, 5.5), med('150-199', 150, 5.1)], 4.5, 1);
    expect(s.rubrik).toBe('Spridningen ligger över kravet på klena bitar och 150-199 mm-bitar.');
    expect(s.atgard).toBe('Underlaget saknar grova stammar — utan dem går tryck inte att skilja från givarfel.');
  });
  it('rak men taggig: systematiken under målet → tillägg att det inte är kalibrering', () => {
    const v = med('300+', 300, 5.9, { systMonthly: [{ manad: '2026-01', systematik: 0.2, n: 50 }] });
    expect(systWin(v)).toBeCloseTo(0.2);
    expect(flaxSlutsats([med('<150', 0, 3.1), v], 4.5, 1).tillagg).toBe('Linjen är rak men taggig — det är inte kalibrering. Kalibrering rätar inte en taggig linje.');
    expect(flaxSlutsats([med('<150', 0, 3.1), v], 4.5, 0.1).tillagg).toBeNull();
  });
});
