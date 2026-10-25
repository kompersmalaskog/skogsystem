// Ritläges-spärren: logiken prövas här mot en kartlik händelsehanterare (samma on/off-signaturer som MapLibre, lagerlyssnare inkluderade). Att den fungerar i en riktig karta med riktiga
// tryck prövas i lib/fallTradKorUpp.hytt.test.ts (Chromium), och att sidan lägger den och märker rätt lyssnare i lib/ritlageSparr.vakter.test.ts.
import { describe, expect, it } from 'vitest';
import { arTillatenIRitlage, installeraRitlageSparr, tillatIRitlage } from './ritlageSparr';

/** Minimal Evented: on/off för 'typ' och 'typ, lagerId' (lagerlyssnaren får bara händelser med det lagret). */
function falskKarta() {
  const lyssnare: Array<{ typ: string; lager?: string; fn: (e: any) => void }> = [];
  const karta: any = {
    on(typ: string, a: any, b?: any) { if (typeof a === 'function') lyssnare.push({ typ, fn: a }); else lyssnare.push({ typ, lager: a, fn: b }); return this; },
    off(typ: string, a: any, b?: any) {
      const [lager, fn] = typeof a === 'function' ? [undefined, a] : [a, b];
      const i = lyssnare.findIndex((l) => l.typ === typ && l.lager === lager && l.fn === fn);
      if (i >= 0) lyssnare.splice(i, 1);
      return this;
    },
  };
  const skicka = (typ: string, e: any = {}, lager?: string) => lyssnare.filter((l) => l.typ === typ && (l.lager === undefined || l.lager === lager)).slice().forEach((l) => l.fn(e));
  return { karta, lyssnare, skicka };
}

describe('installeraRitlageSparr', () => {
  it('medan ritläget är PÅ körs ingen vanlig click- eller dblclick-lyssnare (kartlyssnare och lagerlyssnare), men väl de märkta', () => {
    const { karta, skicka } = falskKarta();
    let aktivt = false;
    installeraRitlageSparr(karta, () => aktivt);
    const n = { karta: 0, lager: 0, dbl: 0, tillaten: 0, annat: 0 };
    karta.on('click', () => { n.karta++; });
    karta.on('click', 'symboler', () => { n.lager++; });
    karta.on('dblclick', () => { n.dbl++; });
    karta.on('click', tillatIRitlage(() => { n.tillaten++; }));
    karta.on('mousemove', () => { n.annat++; });
    skicka('click', {}, 'symboler'); skicka('dblclick'); skicka('mousemove');
    expect(n).toEqual({ karta: 1, lager: 1, dbl: 1, tillaten: 1, annat: 1 });
    aktivt = true;
    skicka('click', {}, 'symboler'); skicka('dblclick'); skicka('mousemove');
    expect(n, 'bara det märkta körs, och andra händelser än click/dblclick rörs inte').toEqual({ karta: 1, lager: 1, dbl: 1, tillaten: 2, annat: 2 });
    aktivt = false;
    skicka('click', {}, 'symboler');
    expect(n.karta).toBe(2); expect(n.lager).toBe(2);
  });

  it('lyssnare som läggs till EFTER spärren (också senare tillkomna) omfattas; händelsen skickas vidare oförändrad', () => {
    const { karta, skicka } = falskKarta();
    installeraRitlageSparr(karta, () => false);
    const fick: any[] = [];
    karta.on('click', (e: any) => fick.push(e));
    skicka('click', { punkt: 1 });
    expect(fick).toEqual([{ punkt: 1 }]);
  });

  it('off tar bort den inslagna lyssnaren — för både kartlyssnare och lagerlyssnare — och två registreringar av samma funktion delar inslagning', () => {
    const { karta, lyssnare, skicka } = falskKarta();
    installeraRitlageSparr(karta, () => false);
    let n = 0; const fn = () => { n++; };
    karta.on('click', fn); karta.on('click', 'a', fn);
    expect(lyssnare).toHaveLength(2);
    karta.off('click', fn); karta.off('click', 'a', fn);
    expect(lyssnare).toHaveLength(0);
    skicka('click', {}, 'a');
    expect(n).toBe(0);
  });

  it('en märkt lyssnare läggs in oförändrad (ingen inslagning), och avinstallation återställer kartans egna on/off (de ligger på prototypen)', () => {
    class Karta { l: Array<() => void> = []; on(_t: string, fn: () => void) { this.l.push(fn); return this; } off() { return this; } }
    const karta: any = new Karta();
    const stang = installeraRitlageSparr(karta, () => true);
    expect(Object.prototype.hasOwnProperty.call(karta, 'on')).toBe(true);
    const m = tillatIRitlage(() => undefined);
    expect(arTillatenIRitlage(m)).toBe(true);
    expect(arTillatenIRitlage(() => undefined)).toBe(false);
    karta.on('click', m);
    expect(karta.l[0], 'den märkta läggs in som den är').toBe(m);
    karta.on('click', () => undefined);
    expect(karta.l[1]).not.toBe(undefined);
    stang();
    expect(Object.prototype.hasOwnProperty.call(karta, 'on')).toBe(false);
    expect(karta.on).toBe(Karta.prototype.on);
    // och den kan läggas på igen
    installeraRitlageSparr(karta, () => false);
    expect(Object.prototype.hasOwnProperty.call(karta, 'on')).toBe(true);
  });

  it('lagd två gånger på samma karta slår den inte in lyssnarna två gånger', () => {
    const { karta, skicka } = falskKarta();
    let aktivt = true;
    installeraRitlageSparr(karta, () => aktivt);
    installeraRitlageSparr(karta, () => false);   // ignoreras: den första gäller
    let n = 0;
    karta.on('click', () => { n++; });
    skicka('click');
    expect(n).toBe(0);
    aktivt = false;
    skicka('click');
    expect(n).toBe(1);
  });
});
