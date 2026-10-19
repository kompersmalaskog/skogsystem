import { describe, expect, it } from 'vitest';
import {
  ARK_TARSKEL_PX, arkDragHojd, arkForskjutning, arkHojder, nastaGreppLage, valjArkLage, type ArkHojder,
} from './egenkontrollArk';

const H: ArkHojder = { dock: 260, halv: 456, hel: 688 };

describe('arkHojder', () => {
  it('dock = uppmätt innehåll, halv = dock + plats för innehållet (minst 60 % av skärmen), hel = skärmen minus det som ska synas ovanför', () => {
    expect(arkHojder({ fonsterHojd: 760, dockPx: 260, toppReservPx: 72 })).toEqual({ dock: 260, halv: 500, hel: 688 });
    // En hög skärm: 60 % är mer än dock + 240.
    expect(arkHojder({ fonsterHojd: 1000, dockPx: 260, toppReservPx: 72 })).toEqual({ dock: 260, halv: 600, hel: 928 });
  });

  it('ordningen dock <= halv <= hel gäller alltid, även på en liten skärm (vriden telefon)', () => {
    for (const fonster of [300, 400, 500, 760, 900]) {
      for (const dock of [0, 150, 260, 380, 600]) {
        const h = arkHojder({ fonsterHojd: fonster, dockPx: dock, toppReservPx: 72 });
        expect(h.dock).toBeLessThanOrEqual(h.halv);
        expect(h.halv).toBeLessThanOrEqual(h.hel);
      }
    }
  });

  it('en dock med markerad bricka och rad (högre) skjuter halv uppåt så att innehållet under brickorna alltid får minst 240 px', () => {
    const h = arkHojder({ fonsterHojd: 760, dockPx: 340, toppReservPx: 72 });
    expect(h.dock).toBe(340);
    expect(h.halv - h.dock).toBeGreaterThanOrEqual(240);
    // ...men aldrig över hel.
    const trang = arkHojder({ fonsterHojd: 500, dockPx: 340, toppReservPx: 72 });
    expect(trang.halv).toBe(trang.hel);
  });
});

describe('arkForskjutning', () => {
  it('hel ligger still (0), dock sänks så att bara dockans höjd syns', () => {
    expect(arkForskjutning('hel', H)).toBe(0);
    expect(arkForskjutning('halv', H)).toBe(232);
    expect(arkForskjutning('dock', H)).toBe(428);
  });
});

describe('arkDragHojd', () => {
  it('följer fingret: drag uppåt (dy < 0) höjer, nedåt sänker — men aldrig under dockan eller över hel', () => {
    expect(arkDragHojd('dock', -100, H)).toBe(360);
    expect(arkDragHojd('halv', 100, H)).toBe(356);
    expect(arkDragHojd('dock', 500, H)).toBe(H.dock);
    expect(arkDragHojd('hel', -500, H)).toBe(H.hel);
  });
});

describe('valjArkLage', () => {
  it('ett kort drag (under tröskeln) lämnar arket där det är', () => {
    for (const nu of ['dock', 'halv', 'hel'] as const) {
      expect(valjArkLage(nu, ARK_TARSKEL_PX - 1, H)).toBe(nu);
      expect(valjArkLage(nu, -(ARK_TARSKEL_PX - 1), H)).toBe(nu);
    }
  });

  it('dra upp från dockan landar i halv, och långt upp i hel', () => {
    expect(valjArkLage('dock', -190, H)).toBe('halv');
    expect(valjArkLage('dock', -420, H)).toBe('hel');
  });

  it('dra ned från hel landar i halv, och långt ned i dockan', () => {
    expect(valjArkLage('hel', 220, H)).toBe('halv');
    expect(valjArkLage('hel', 450, H)).toBe('dock');
  });

  it('dra ned från dockan ligger kvar (det finns inget under), upp från hel ligger kvar', () => {
    expect(valjArkLage('dock', 300, H)).toBe('dock');
    expect(valjArkLage('hel', -300, H)).toBe('hel');
  });
});

describe('valjArkLage — tröskeln', () => {
  it('ligger lägena nära varandra (en liten skärm) räcker det inte att draget hamnar närmare ett annat läge: under tröskeln ligger arket kvar', () => {
    const nara: ArkHojder = { dock: 260, halv: 300, hel: 340 };
    expect(valjArkLage('dock', -30, nara)).toBe('dock');   // 30 px upp = närmast halv, men under tröskeln
    expect(valjArkLage('dock', -70, nara)).toBe('hel');    // över tröskeln: närmast
  });
});

describe('nastaGreppLage', () => {
  it('tryck på greppet: dock ↔ halv. Hel nås bara genom att dra', () => {
    expect(nastaGreppLage('dock')).toBe('halv');
    expect(nastaGreppLage('halv')).toBe('dock');
    expect(nastaGreppLage('hel')).toBe('dock');
  });
});
