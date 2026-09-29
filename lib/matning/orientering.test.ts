import { describe, expect, it } from 'vitest';
import {
  brannvidd,
  grundytaM2PerHa,
  kameraRiktning,
  relaskopRadiePx,
  slutVarv,
  tillSkarm,
  varvGrader,
  vinkelDiff,
} from './orientering';

// Matematiken här är lätt att skriva "nästan rätt". Första utkastet använde en
// rotationsmatris med fel axelordning — den gav ett trovärdigt tal för varje
// indata men pekade kameran rakt ned i marken vid upprätt telefon, alltså exakt
// det läge mätvyn används i. Testerna nedan är valda för att fånga just den
// sortens fel: kända lägen där svaret går att räkna ut för hand.

const bv = brannvidd(1080, 65);

describe('kameraRiktning', () => {
  it('upprätt telefon med kameran mot norr ger bäring 0', () => {
    const r = kameraRiktning({ alpha: 0, beta: 90, gamma: 0 });
    expect(r).not.toBeNull();
    expect(r!.baring).toBeCloseTo(0, 0);
    expect(r!.hojdvinkel).toBeCloseTo(0, 0);
  });

  it('vriden ett kvarts varv pekar mot öst', () => {
    const r = kameraRiktning({ alpha: 270, beta: 90, gamma: 0 });
    expect(r!.baring).toBeCloseTo(90, 0);
  });

  it('bäringen glider INTE när telefonen lutas', () => {
    // Det är det här felet en naiv alpha-avläsning gör: lutar man telefonen
    // vandrar bäringen tiotals grader utan att man vridit sig.
    const r = kameraRiktning({ alpha: 0, beta: 70, gamma: 0 });
    expect(r!.baring).toBeCloseTo(0, 0);
    expect(r!.hojdvinkel).toBeCloseTo(-20, 0);
  });

  it('beta över 90 lutar kameran uppåt', () => {
    expect(kameraRiktning({ alpha: 0, beta: 110, gamma: 0 })!.hojdvinkel).toBeCloseTo(20, 0);
  });

  it('iOS webkitCompassHeading sätter nollpunkten', () => {
    const r = kameraRiktning({ alpha: 0, beta: 90, gamma: 0, webkitCompassHeading: 123 });
    expect(r!.baring).toBeCloseTo(123, 0);
  });

  it('saknade vinklar ger null — aldrig en gissad riktning', () => {
    expect(kameraRiktning({ alpha: null, beta: 90, gamma: 0 })).toBeNull();
    expect(kameraRiktning({ alpha: NaN, beta: 90, gamma: 0 })).toBeNull();
  });
});

describe('relaskopet', () => {
  it('faktor 1 motsvarar 1:50, alltså 1,1459°', () => {
    const grader = (2 * Math.atan(relaskopRadiePx(bv, 1) / bv) * 180) / Math.PI;
    expect(grader).toBeCloseTo(1.1459, 3);
  });

  it('faktor 2 ger en bredare cirkel', () => {
    const g1 = 2 * Math.atan(relaskopRadiePx(bv, 1) / bv);
    const g2 = 2 * Math.atan(relaskopRadiePx(bv, 2) / bv);
    expect(g2).toBeGreaterThan(g1);
    expect((g2 * 180) / Math.PI).toBeCloseTo(1.6203, 3);
  });

  it('grundytan är antalet träd gånger faktorn', () => {
    expect(grundytaM2PerHa(18, 1)).toBe(18);
    expect(grundytaM2PerHa(13, 2)).toBe(26);
  });
});

describe('varvet', () => {
  it('slår inte över vid norr', () => {
    // 350 → 10 är +20 grader, inte −340.
    expect(varvGrader([350, 355, 0, 5, 10])).toBeCloseTo(20, 6);
  });

  it('summerar ett helt varv', () => {
    expect(varvGrader([0, 90, 180, 270, 359.9])).toBeCloseTo(359.9, 6);
  });
});

describe('slutVarv — driftkorrigering', () => {
  const trad = [0, 90, 180, 270].map((b) => ({ baring: b, hojdvinkel: 0 }));

  it('fördelar residualen proportionellt över varvet', () => {
    const k = slutVarv(trad, 368); // 8 graders drift
    expect(k[0].baring).toBeCloseTo(0, 2);
    expect(k[1].baring).toBeCloseTo(87.33, 2);
    expect(k[3].baring).toBeCloseTo(262, 2);
  });

  it('rör inte ett öppet varv — man sluter inte något som är öppet', () => {
    expect(slutVarv(trad, 120)[3].baring).toBe(270);
  });

  it('rör inte en orimlig residual — då är korrigeringen en gissning', () => {
    expect(slutVarv(trad, 460)[3].baring).toBe(270);
  });
});

describe('tillSkarm', () => {
  const kamera = { baring: 0, hojdvinkel: 0 };

  it('rakt fram hamnar i mitten', () => {
    expect(tillSkarm({ baring: 0, hojdvinkel: 0 }, kamera, bv, 1080, 1920)!.x).toBeCloseTo(540, 2);
  });

  it('åt höger hamnar till höger', () => {
    expect(tillSkarm({ baring: 10, hojdvinkel: 0 }, kamera, bv, 1080, 1920)!.x).toBeGreaterThan(540);
  });

  it('bakom kameran ritas inte', () => {
    expect(tillSkarm({ baring: 180, hojdvinkel: 0 }, kamera, bv, 1080, 1920)).toBeNull();
  });
});

describe('vinkelDiff', () => {
  it('ger kortaste vägen över norr', () => {
    expect(vinkelDiff(350, 10)).toBeCloseTo(20, 6);
    expect(vinkelDiff(10, 350)).toBeCloseTo(-20, 6);
  });
});
