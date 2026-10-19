import { describe, expect, it } from 'vitest';
import * as ark from './egenkontrollArk';
import {
  ARK_LAGEN, ARK_TARSKEL_PX, HEL_MIN_INNEHALL_PX, KARTA_MIN_PX, LAGE_JOBB, arkDragHojd, arkForskjutning, arkHojder, efterSymboltryck, nastaGreppLage,
  radFaltMax, valjArkLage, type ArkHojder, type ArkLage,
} from './egenkontrollArk';

/** Långt innehåll: hel är max (skärmen 760 minus huvudet 72). Sänkt = greppet + hemindikatorns luft. */
const H: ArkHojder = { sankt: 40, dock: 330, hel: 688, max: 688 };

describe('REGELN FÖR ETT LÄGE: exakt tre, vart och ett med ETT jobb som går att säga med ett ord', () => {
  it('exakt tre lägen, nerifrån och upp: sänkt, dock, hel', () => {
    expect([...ARK_LAGEN]).toEqual(['sankt', 'dock', 'hel']);
    expect(Object.keys(LAGE_JOBB).sort()).toEqual([...ARK_LAGEN].sort());
  });

  it('varje läges jobb är ETT ord — sänkt = gå, dock = svara, hel = rundan', () => {
    expect(LAGE_JOBB).toEqual({ sankt: 'gå', dock: 'svara', hel: 'rundan' });
    for (const l of ARK_LAGEN) expect(LAGE_JOBB[l], `jobbet för ${l}`).toMatch(/^\S+$/);
  });

  it('det finns INGET halvt läge: varken i lägena, i höjderna eller som konstant', () => {
    expect(ARK_LAGEN.some((l) => /halv/i.test(l))).toBe(false);
    expect(Object.keys(ark).filter((k) => /HALV/i.test(k))).toEqual([]);
    const h = arkHojder({ fonsterHojd: 760, sanktPx: 40, dockPx: 330, toppReservPx: 72, innehallPx: 300 });
    expect(Object.keys(h).sort()).toEqual(['dock', 'hel', 'max', 'sankt']);
  });
});

describe('arkHojder — tre lägen, hel följer sitt innehåll', () => {
  const bas = { fonsterHojd: 760, sanktPx: 40, dockPx: 330, toppReservPx: 72 };

  it('KORT innehåll: hel = dock + innehållet — kartan syns ovanför', () => {
    expect(arkHojder({ ...bas, innehallPx: 200 })).toEqual({ sankt: 40, dock: 330, hel: 530, max: 688 });
  });

  it('LÅNGT innehåll: hel = max (skärmen minus huvudet), aldrig högre', () => {
    expect(arkHojder({ ...bas, innehallPx: 900 })).toEqual({ sankt: 40, dock: 330, hel: 688, max: 688 });
    expect(arkHojder({ ...bas, innehallPx: 358 })).toEqual({ sankt: 40, dock: 330, hel: 688, max: 688 });   // exakt fullt
    expect(arkHojder({ ...bas, innehallPx: 359 }).hel).toBe(688);                                            // en pixel över: fortfarande max
  });

  it('TOM runda: minst dock + HEL_MIN_INNEHALL_PX — hel ser inte trasig ut och går att skilja från dockan', () => {
    expect(HEL_MIN_INNEHALL_PX).toBeGreaterThan(0);
    expect(arkHojder({ ...bas, innehallPx: 0 }).hel).toBe(330 + HEL_MIN_INNEHALL_PX);
    expect(arkHojder({ ...bas, innehallPx: 40 }).hel).toBe(330 + HEL_MIN_INNEHALL_PX);
    expect(arkHojder({ ...bas, innehallPx: HEL_MIN_INNEHALL_PX + 1 }).hel).toBe(330 + HEL_MIN_INNEHALL_PX + 1);
  });

  it('dockan och sänkt påverkas aldrig av innehållet', () => {
    for (const innehallPx of [0, 100, 300, 900, 5000]) {
      const h = arkHojder({ ...bas, innehallPx });
      expect(h.dock).toBe(330);
      expect(h.sankt).toBe(40);
    }
  });

  it('sankt <= dock <= hel <= max gäller alltid, även på en liten skärm (vriden telefon) och med enormt eller inget innehåll', () => {
    for (const fonster of [300, 400, 500, 760, 900]) {
      for (const dock of [0, 150, 330, 380, 600]) {
        for (const sanktPx of [0, 40, 500]) {
          for (const innehallPx of [0, 150, 500, 5000]) {
            const h = arkHojder({ fonsterHojd: fonster, sanktPx, dockPx: dock, toppReservPx: 72, innehallPx });
            expect(h.sankt).toBeLessThanOrEqual(h.dock);
            expect(h.dock).toBeLessThanOrEqual(h.hel);
            expect(h.hel).toBeLessThanOrEqual(h.max);
          }
        }
      }
    }
  });
});

describe('radFaltMax — kartan har minst KARTA_MIN_PX kvar i dock', () => {
  it('390 × 760 med dockbas 331: tak = max − 300 − bas (57 px)', () => {
    expect(KARTA_MIN_PX).toBe(300);
    expect(radFaltMax({ max: 688, bas: 331, golv: 34, tak: 228 })).toBe(57);
  });
  it('aldrig över taket (RAD_MAX_DVH) och aldrig under golvet (två rader) — på en liten skärm går kartan före inte', () => {
    expect(radFaltMax({ max: 2000, bas: 331, golv: 34, tak: 228 })).toBe(228);
    expect(radFaltMax({ max: 400, bas: 331, golv: 34, tak: 228 })).toBe(34);
  });
  it('lika mycket karta kvar som ramen kräver: bas + fält + 300 = max när fältet fyller sitt tak', () => {
    const max = 688, bas = 331;
    expect(bas + radFaltMax({ max, bas, golv: 34, tak: 228 }) + KARTA_MIN_PX).toBe(max);
  });
});

describe('arkForskjutning', () => {
  it('långt innehåll: hel ligger still (0), dock och sänkt sänks så att bara deras höjd syns', () => {
    expect(arkForskjutning('hel', H)).toBe(0);
    expect(arkForskjutning('dock', H)).toBe(358);
    expect(arkForskjutning('sankt', H)).toBe(648);
  });

  it('kort innehåll: arket är fortfarande max högt, så hel sänks med mellanskillnaden — det som syns är hel, inte max', () => {
    const kort: ArkHojder = { sankt: 40, dock: 330, hel: 530, max: 688 };
    expect(arkForskjutning('hel', kort)).toBe(158);
    expect(arkForskjutning('dock', kort)).toBe(358);
  });
});

describe('arkDragHojd', () => {
  it('följer fingret: drag uppåt (dy < 0) höjer, nedåt sänker — men aldrig under sänkt eller över hel', () => {
    expect(arkDragHojd('dock', -100, H)).toBe(430);
    expect(arkDragHojd('hel', 100, H)).toBe(588);
    expect(arkDragHojd('dock', 500, H)).toBe(H.sankt);
    expect(arkDragHojd('sankt', 500, H)).toBe(H.sankt);
    expect(arkDragHojd('hel', -500, H)).toBe(H.hel);
  });
});

describe('valjArkLage — drag fungerar åt BÅDA hållen, och ett drag över tröskeln flyttar minst ett läge', () => {
  it('ett kort drag (under tröskeln) lämnar arket där det är', () => {
    for (const nu of ARK_LAGEN) {
      expect(valjArkLage(nu, ARK_TARSKEL_PX - 1, H)).toBe(nu);
      expect(valjArkLage(nu, -(ARK_TARSKEL_PX - 1), H)).toBe(nu);
    }
  });

  it('UPPÅT: sänkt → dock med ett kort drag (handske), dock → hel, och ett långt drag från sänkt går hela vägen till hel', () => {
    expect(valjArkLage('sankt', -80, H)).toBe('dock');     // 80 px räcker — "närmast" vore fortfarande sänkt
    expect(valjArkLage('dock', -80, H)).toBe('hel');
    expect(valjArkLage('sankt', -700, H)).toBe('hel');
  });

  it('NEDÅT: hel → dock, dock → sänkt med ett kort drag, och ett långt drag från hel går hela vägen till sänkt', () => {
    expect(valjArkLage('hel', 80, H)).toBe('dock');
    expect(valjArkLage('dock', 80, H)).toBe('sankt');
    expect(valjArkLage('hel', 700, H)).toBe('sankt');
  });

  it('i ändlägena ligger arket kvar: nedåt från sänkt, uppåt från hel', () => {
    expect(valjArkLage('sankt', 300, H)).toBe('sankt');
    expect(valjArkLage('hel', -300, H)).toBe('hel');
  });

  it('ligger lägena nära varandra (en liten skärm) gäller samma sak: över tröskeln flyttas ett läge, under ligger arket kvar', () => {
    const nara: ArkHojder = { sankt: 40, dock: 260, hel: 300, max: 300 };
    expect(valjArkLage('dock', -30, nara)).toBe('dock');
    expect(valjArkLage('dock', -70, nara)).toBe('hel');
  });
});

describe('nastaGreppLage — tryck på greppet går vidare ett läge varje gång', () => {
  it('sänkt → dock → hel → sänkt → dock …', () => {
    let l: ArkLage = 'sankt';
    const sett: ArkLage[] = [];
    for (let i = 0; i < 6; i++) { l = nastaGreppLage(l); sett.push(l); }
    expect(sett).toEqual(['dock', 'hel', 'sankt', 'dock', 'hel', 'sankt']);
  });
});

describe('efterSymboltryck — det ENDA som höjer arket av sig självt', () => {
  it('sänkt → dock (raden måste gå att nå); dock och hel ligger kvar', () => {
    expect(efterSymboltryck('sankt')).toBe('dock');
    expect(efterSymboltryck('dock')).toBe('dock');
    expect(efterSymboltryck('hel')).toBe('hel');
  });
});
