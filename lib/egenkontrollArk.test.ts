import { describe, expect, it } from 'vitest';
import * as ark from './egenkontrollArk';
import {
  ARK_TARSKEL_PX, arkDragHojd, arkForskjutning, arkHojder, nastaGreppLage, valjArkLage, type ArkHojder,
} from './egenkontrollArk';

const H: ArkHojder = { dock: 260, hel: 688 };

describe('arkHojder — två lägen', () => {
  it('dock = uppmätt innehåll, hel = skärmen minus det som ska synas ovanför', () => {
    expect(arkHojder({ fonsterHojd: 760, dockPx: 260, toppReservPx: 72 })).toEqual({ dock: 260, hel: 688 });
  });

  it('det finns INGET halvt läge: varken i typen, i höjderna eller som konstant', () => {
    const h = arkHojder({ fonsterHojd: 760, dockPx: 260, toppReservPx: 72 });
    expect(Object.keys(h).sort()).toEqual(['dock', 'hel']);
    expect(Object.keys(ark).filter((k) => /HALV/i.test(k))).toEqual([]);
  });

  it('dock <= hel gäller alltid, även på en liten skärm (vriden telefon)', () => {
    for (const fonster of [300, 400, 500, 760, 900]) {
      for (const dock of [0, 150, 260, 380, 600]) {
        const h = arkHojder({ fonsterHojd: fonster, dockPx: dock, toppReservPx: 72 });
        expect(h.dock).toBeLessThanOrEqual(h.hel);
      }
    }
  });
});

describe('arkForskjutning', () => {
  it('hel ligger still (0), dock sänks så att bara dockans höjd syns', () => {
    expect(arkForskjutning('hel', H)).toBe(0);
    expect(arkForskjutning('dock', H)).toBe(428);
  });
});

describe('arkDragHojd', () => {
  it('följer fingret: drag uppåt (dy < 0) höjer, nedåt sänker — men aldrig under dockan eller över hel', () => {
    expect(arkDragHojd('dock', -100, H)).toBe(360);
    expect(arkDragHojd('hel', 100, H)).toBe(588);
    expect(arkDragHojd('dock', 500, H)).toBe(H.dock);
    expect(arkDragHojd('hel', -500, H)).toBe(H.hel);
  });
});

describe('valjArkLage', () => {
  it('ett kort drag (under tröskeln) lämnar arket där det är', () => {
    for (const nu of ['dock', 'hel'] as const) {
      expect(valjArkLage(nu, ARK_TARSKEL_PX - 1, H)).toBe(nu);
      expect(valjArkLage(nu, -(ARK_TARSKEL_PX - 1), H)).toBe(nu);
    }
  });

  it('dra upp från dockan förbi mitten landar i hel; ett kort drag uppåt (under mitten) tillbaka i dock', () => {
    expect(valjArkLage('dock', -300, H)).toBe('hel');     // 260 + 300 = 560: närmast hel (688)
    expect(valjArkLage('dock', -100, H)).toBe('dock');    // 360: närmast dock (260)
  });

  it('dra ned från hel förbi mitten landar i dock, och ett kort drag nedåt lämnar den i hel', () => {
    expect(valjArkLage('hel', 300, H)).toBe('dock');      // 688 - 300 = 388: närmast dock
    expect(valjArkLage('hel', 100, H)).toBe('hel');       // 588: närmast hel
  });

  it('dra ned från dockan ligger kvar (det finns inget under), upp från hel ligger kvar', () => {
    expect(valjArkLage('dock', 300, H)).toBe('dock');
    expect(valjArkLage('hel', -300, H)).toBe('hel');
  });

  it('ligger lägena nära varandra (en liten skärm) räcker det inte att draget hamnar närmare det andra: under tröskeln ligger arket kvar', () => {
    const nara: ArkHojder = { dock: 260, hel: 300 };
    expect(valjArkLage('dock', -30, nara)).toBe('dock');  // 30 px upp = närmast hel, men under tröskeln
    expect(valjArkLage('dock', -70, nara)).toBe('hel');   // över tröskeln: närmast
  });
});

describe('nastaGreppLage', () => {
  it('tryck på greppet växlar dock ↔ hel', () => {
    expect(nastaGreppLage('dock')).toBe('hel');
    expect(nastaGreppLage('hel')).toBe('dock');
  });
});
