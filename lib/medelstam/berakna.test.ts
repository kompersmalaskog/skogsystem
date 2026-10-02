import { describe, it, expect } from 'vitest';
import {
  tolkaMedelstam, heltalTill100, andelarAv, viktad, spannAv, fonsterObjekt, utfall, rotaLutning, rotaMedian,
  kurva, planarUt, vagdMinstaKvadrat, FONSTER, FONSTER_TYP, MIN_OBJEKT, type Objekt, type Lutning,
} from './berakna';

// Syntetiska objekt: räknelogiken, inte datan. Mot riktig data körs samma modul i PR:ens
// verifiering (61 slutavverkningar, 26 gallringar).
let nr = 0;
const obj = (medelstam: number, volym: number, t: number, k: number, m: number, rot20: number | null = null, typ: Objekt['typ'] = 'Slutavverkning'): Objekt => ({
  id: 'o' + ++nr, namn: 'Objekt ' + nr, typ, forsta: '2025-01-01',
  stammar: Math.round(volym / medelstam), volym, timmer: volym * t / 100, kubb: volym * k / 100, massa: volym * m / 100,
  medelstam, rot20, stammar20: rot20 == null ? null : 400,
});

describe('tolkaMedelstam', () => {
  it('tar komma och punkt, med blanksteg', () => {
    expect(tolkaMedelstam('0,47')).toBeCloseTo(0.47, 10);
    expect(tolkaMedelstam(' 0.47 ')).toBeCloseTo(0.47, 10);
    expect(tolkaMedelstam('1')).toBe(1);
  });
  it('avvisar tomt, text och orimligt', () => {
    for (const s of ['', ' ', 'abc', '0,4,7', '-0,3', '0', '0,01', '5']) expect(tolkaMedelstam(s)).toBeNull();
  });
});

describe('heltalTill100', () => {
  it('delarna summerar alltid till exakt 100', () => {
    const fall = [
      { timmer: 33.4, kubb: 33.3, massa: 33.3, ovrigt: 0 },          // 33+33+33 = 99 → en får +1
      { timmer: 50.5, kubb: 24.5, massa: 24.5, ovrigt: 0.5 },        // 50+24+24+0 = 98
      { timmer: 12.5, kubb: 12.5, massa: 12.5, ovrigt: 62.5 },
      { timmer: 99.6, kubb: 0.2, massa: 0.1, ovrigt: 0.1 },
    ];
    for (const a of fall) {
      const h = heltalTill100(a);
      expect(h.timmer + h.kubb + h.massa + h.ovrigt).toBe(100);
      for (const v of Object.values(h)) expect(Number.isInteger(v)).toBe(true);
    }
  });
  it('lämnar redan hela tal som de är', () => {
    expect(heltalTill100({ timmer: 52, kubb: 20, massa: 25, ovrigt: 3 })).toEqual({ timmer: 52, kubb: 20, massa: 25, ovrigt: 3 });
  });
});

describe('andelar', () => {
  it('ett objekts andelar summerar till 100 och övrigt är resten', () => {
    const a = andelarAv(obj(0.4, 1000, 50, 20, 25));
    expect(a.timmer).toBeCloseTo(50, 10); expect(a.ovrigt).toBeCloseTo(5, 10);
    expect(a.timmer + a.kubb + a.massa + a.ovrigt).toBeCloseTo(100, 10);
  });
  it('VOLYMVÄGT: ett stort objekt väger mer än ett litet — kvot av summor, inte snitt av procenttal', () => {
    const stort = obj(0.45, 2000, 60, 15, 20), litet = obj(0.45, 100, 20, 30, 45), mitt = obj(0.45, 100, 40, 20, 35);
    const v = viktad([stort, litet, mitt])!;
    // (1200 + 20 + 40) / 2200 = 57,27 %. Medianen av procenttalen (20, 40, 60) vore 40.
    expect(v.timmer).toBeCloseTo((1200 + 20 + 40) / 2200 * 100, 8);
    expect(v.timmer).not.toBeCloseTo(40, 0);
    const snittAvProcent = (60 + 20 + 40) / 3;
    expect(Math.abs(v.timmer - snittAvProcent)).toBeGreaterThan(10);
  });
  it('spannet är lägsta–högsta objektsandel', () => {
    const sp = spannAv([obj(0.4, 500, 44, 20, 30), obj(0.4, 500, 61, 15, 20), obj(0.4, 500, 52, 18, 25)])!;
    expect(sp.timmer[0]).toBeCloseTo(44, 8); expect(sp.timmer[1]).toBeCloseTo(61, 8);
    expect(sp.kubb).toEqual([15, 20]);
  });
});

describe('fönstret ±0,05', () => {
  const alla = [0.30, 0.41, 0.42, 0.47, 0.52, 0.53, 0.62].map(m => obj(m, 800, 50, 20, 25));
  it('tar objekt inom ±0,05, kanterna med', () => {
    expect(FONSTER).toBe(0.05);
    expect(fonsterObjekt(alla, 0.47).map(o => o.medelstam)).toEqual([0.42, 0.47, 0.52]);   // 0,42 och 0,52 ligger på kanten
  });
  it('färre än tre objekt → inget tal, bara "för få"', () => {
    const u = utfall(alla, 0.62);                      // 0,62 och 0,53? nej: bara 0,62 inom 0,05 → 1 objekt
    expect(u.n).toBe(1); expect(u.forFa).toBe(true);
    expect(u.andel).toBeNull(); expect(u.ra).toBeNull(); expect(u.spann).toBeNull();
  });
  it('exakt tre objekt räcker', () => {
    expect(MIN_OBJEKT).toBe(3);
    const u = utfall(alla, 0.47);
    expect(u.n).toBe(3); expect(u.forFa).toBe(false); expect(u.andel!.timmer).toBeCloseTo(50, 8);
  });
  it('en medelstam långt utanför datan ger "för få", inte ett tal', () => {
    expect(utfall(alla, 1.5).forFa).toBe(true);
  });
  it('fönstrets bredd är en parameter: båda typerna är ±0,05 enligt uppdraget, och ett smalare fönster ger färre objekt', () => {
    expect(FONSTER_TYP).toEqual({ Slutavverkning: 0.05, Gallring: 0.05 });
    expect(utfall(alla, 0.47).n).toBe(3);
    const smalt = utfall(alla, 0.47, null, null, 0.02);
    expect(smalt.n).toBe(1); expect(smalt.forFa).toBe(true);
    expect(smalt.fonster).toBe(0.02); expect(smalt.till - smalt.fran).toBeCloseTo(0.04, 10);
  });
});

describe('minsta kvadrat', () => {
  it('återfinner en känd lutning exakt på brusfri data', () => {
    const X: number[][] = [], y: number[] = [];
    for (let i = 0; i < 20; i++) { const a = i / 20, r = ((i * 7) % 10) / 10; X.push([1, a, a * a, r]); y.push(5 + 80 * a - 30 * a * a - 40 * r); }
    const fit = vagdMinstaKvadrat(X, y, y.map(() => 1))!;
    expect(fit.beta[0]).toBeCloseTo(5, 6); expect(fit.beta[1]).toBeCloseTo(80, 5);
    expect(fit.beta[2]).toBeCloseTo(-30, 4); expect(fit.beta[3]).toBeCloseTo(-40, 5);
  });
  it('singulär design → null, inte NaN', () => {
    expect(vagdMinstaKvadrat([[1, 1], [1, 1], [1, 1]], [1, 2, 3], [1, 1, 1])).toBeNull();
  });
});

describe('röta', () => {
  // 30 syntetiska slutavverkningar där timmer faller 0,5 pe per pe röta och kubb stiger 0,2.
  const gen = () => Array.from({ length: 30 }, (_, i) => {
    const ms = 0.25 + i * 0.015, rot = 0.10 + ((i * 11) % 30) / 100;          // 0,10–0,39
    const t = 20 + 80 * ms - 50 * rot, k = 30 - 20 * ms + 20 * rot, m = 100 - t - k - 3;
    return obj(ms, 500 + i * 20, t, k, m, rot);
  });
  it('skattar lutningen och håller summan på noll över sortimenten', () => {
    const lut = rotaLutning(gen())!;
    expect(lut.n).toBe(30);
    expect(lut.koef.timmer).toBeCloseTo(-50, 3); expect(lut.koef.kubb).toBeCloseTo(20, 3);
    expect(lut.koef.timmer + lut.koef.kubb + lut.koef.massa + lut.koef.ovrigt).toBeCloseTo(0, 8);
  });
  it('för få objekt med röta → ingen lutning', () => {
    expect(rotaLutning(gen().slice(0, 10))).toBeNull();
    expect(rotaLutning(gen().map(o => ({ ...o, rot20: null })))).toBeNull();
  });
  it('extrema och tunna rot20 hålls utanför lutningen', () => {
    const med = [...gen(), obj(0.45, 400, 5, 5, 85, 0.85), { ...obj(0.45, 400, 70, 10, 15, 0.1), stammar20: 20 }];
    expect(rotaLutning(med)!.n).toBe(30);
  });
  it('median av rot20', () => {
    expect(rotaMedian([obj(0.4, 500, 50, 20, 25, 0.1), obj(0.4, 500, 50, 20, 25, 0.3), obj(0.4, 500, 50, 20, 25, 0.2)])).toBeCloseTo(0.2, 10);
    expect(rotaMedian([obj(0.4, 500, 50, 20, 25)])).toBeNull();
  });
  it('vald röta = fönstrets röta → talet är fönstrets egna, ojusterat', () => {
    const lut = rotaLutning(gen())!;
    const fon = [obj(0.50, 700, 50, 20, 25, 0.2), obj(0.52, 700, 50, 20, 25, 0.2), obj(0.48, 700, 50, 20, 25, 0.2)];
    const u = utfall(fon, 0.5, 0.2, lut);
    expect(u.rotFonster).toBeCloseTo(0.2, 10);
    expect(u.andel!.timmer).toBeCloseTo(u.ra!.timmer, 8);
  });
  it('mer röta än fönstret → mindre timmer, mer kubb; summan förblir 100', () => {
    const lut = rotaLutning(gen())!;
    const fon = [obj(0.50, 700, 50, 20, 25, 0.2), obj(0.52, 700, 50, 20, 25, 0.2), obj(0.48, 700, 50, 20, 25, 0.2)];
    const u = utfall(fon, 0.5, 0.3, lut);
    expect(u.rotJusterad).toBe(true);
    expect(u.andel!.timmer).toBeCloseTo(50 - 50 * 0.1, 3);        // lutning −50 pe per 1,0 × +0,1
    expect(u.andel!.kubb).toBeCloseTo(20 + 20 * 0.1, 3);
    const s = u.andel!;
    expect(s.timmer + s.kubb + s.massa + s.ovrigt).toBeCloseTo(100, 8);
  });
  it('utan lutning eller utan rot20 i fönstret görs ingen justering — och det syns i svaret', () => {
    const fon = [obj(0.50, 700, 50, 20, 25), obj(0.52, 700, 50, 20, 25), obj(0.48, 700, 50, 20, 25)];
    expect(utfall(fon, 0.5, 0.3, rotaLutning(gen())).rotJusterad).toBe(false);
    const medRot = fon.map(o => ({ ...o, rot20: 0.2 }));
    expect(utfall(medRot, 0.5, 0.3, null).rotJusterad).toBe(false);
  });
  it('justeringen klipps så ingen andel blir negativ och summan förblir 100', () => {
    const lut: Lutning = { koef: { timmer: -500, kubb: 100, massa: 300, ovrigt: 100 }, n: 30 };
    const fon = [obj(0.50, 700, 10, 20, 65, 0.1), obj(0.52, 700, 10, 20, 65, 0.1), obj(0.48, 700, 10, 20, 65, 0.1)];
    const s = utfall(fon, 0.5, 0.5, lut).andel!;
    for (const v of Object.values(s)) expect(v).toBeGreaterThanOrEqual(0);
    expect(s.timmer + s.kubb + s.massa + s.ovrigt).toBeCloseTo(100, 8);
  });
});

describe('kurvan', () => {
  it('ett streck per objekt, sorterade på medelstam', () => {
    const k = kurva([obj(0.5, 500, 50, 20, 25), obj(0.3, 500, 40, 25, 30), obj(0.4, 500, 45, 22, 28)]);
    expect(k.map(p => p.objekt.medelstam)).toEqual([0.3, 0.4, 0.5]);
    for (const p of k) expect(p.andel.timmer + p.andel.kubb + p.andel.massa + p.andel.ovrigt).toBeCloseTo(100, 8);
  });
  // Deterministiskt "brus" utan slump.
  const brus = (i: number) => (((i * 37) % 11) - 5) * 0.4;
  it('hittar en platå som finns: stiger till 0,40, sedan jämnt', () => {
    const P = Array.from({ length: 40 }, (_, i) => {
      const ms = 0.15 + i * 0.0175, t = (ms < 0.4 ? 20 + 130 * (ms - 0.15) : 52.5) + brus(i);
      return obj(ms, 600, t, 20, 100 - t - 22);
    });
    const r = planarUt(P);
    expect(r.slag).toBe('planar');
    if (r.slag === 'planar') {
      expect(r.brytpunkt).toBeGreaterThan(0.33); expect(r.brytpunkt).toBeLessThan(0.47);
      expect(r.nivaOver.timmer).toBeGreaterThan(50); expect(r.nivaOver.timmer).toBeLessThan(55);
    }
  });
  it('säger "stiger" när kurvan fortsätter uppåt över brytpunkten', () => {
    const P = Array.from({ length: 40 }, (_, i) => {
      const ms = 0.15 + i * 0.0175, t = 20 + 90 * (ms - 0.15) + brus(i);
      return obj(ms, 600, t, 20, 100 - t - 22);
    });
    const r = planarUt(P);
    expect(r.slag).toBe('stiger');
    if (r.slag === 'stiger') expect(r.lutningOver).toBeGreaterThan(5);
  });
  it('för få objekt, eller för få över brytpunkten → oklart, inte ett påhittat tal', () => {
    const f = Array.from({ length: 8 }, (_, i) => obj(0.2 + i * 0.05, 600, 30 + i * 3, 20, 45));
    const r1 = planarUt(f);
    expect(r1.slag).toBe('oklart');
    expect(r1.slag === 'oklart' && r1.skal).toBe('fa-objekt');
  });
});
