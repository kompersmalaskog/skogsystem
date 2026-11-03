import { describe, it, expect } from 'vitest';
import { mergaLassPerDag, type LassRad } from './mergaSkotarLass';

const vol = (rader: LassRad[]) => rader.reduce((a, r) => a + (r.volym_m3sub || 0), 0);
const dagar = (rader: LassRad[]) => new Set(rader.map(r => r.datum)).size;

describe('mergaLassPerDag', () => {
  it('Skälviken: app vinner varje dag, Optis enda dag (lägre volym) faller bort', () => {
    // App: 26(20) 27(180) 28(148) 30(140) 2/11(80) 3/11(80) = 648, 6 dagar
    const app: LassRad[] = [
      { maskin_id: 'A130743', datum: '2026-10-26', volym_m3sub: 20 },
      ...Array.from({ length: 9 }, () => ({ maskin_id: 'A130743', datum: '2026-10-27', volym_m3sub: 20 })),
      ...Array.from({ length: 9 }, () => ({ maskin_id: 'A130743', datum: '2026-10-28', volym_m3sub: 148 / 9 })),
      ...Array.from({ length: 8 }, () => ({ maskin_id: 'A130743', datum: '2026-10-30', volym_m3sub: 140 / 8 })),
      ...Array.from({ length: 4 }, () => ({ maskin_id: 'A130743', datum: '2026-11-02', volym_m3sub: 20 })),
      ...Array.from({ length: 4 }, () => ({ maskin_id: 'A130743', datum: '2026-11-03', volym_m3sub: 20 })),
    ];
    // Opti: bara 2/11 = 40 (lägre än appens 80 samma dag)
    const opti: LassRad[] = [
      { maskin_id: 'A130743', datum: '2026-11-02', volym_m3sub: 20, korstracka_m: 300 },
      { maskin_id: 'A130743', datum: '2026-11-02', volym_m3sub: 20, korstracka_m: 300 },
    ];
    const merged = mergaLassPerDag(opti, app);
    expect(Math.round(vol(merged))).toBe(648);
    expect(dagar(merged)).toBe(6);
    // 2/11 ska komma från appen (80), inte Opti (40) — och ALDRIG summan (120)
    const nov2 = merged.filter(r => r.datum === '2026-11-02');
    expect(Math.round(vol(nov2))).toBe(80);
    expect(nov2.every(r => r.korstracka_m == null)).toBe(true); // app-rader, ingen korstracka
  });

  it('Opti vinner en dag där Opti har mer volym', () => {
    const opti: LassRad[] = [{ maskin_id: 'M', datum: '2026-10-20', volym_m3sub: 100, korstracka_m: 250 }];
    const app: LassRad[] = [{ maskin_id: 'M', datum: '2026-10-20', volym_m3sub: 60 }];
    const merged = mergaLassPerDag(opti, app);
    expect(vol(merged)).toBe(100);
    expect(merged[0].korstracka_m).toBe(250);
  });

  it('dagar som bara finns i en källa tas med', () => {
    const opti: LassRad[] = [{ maskin_id: 'M', datum: '2026-10-20', volym_m3sub: 50 }];
    const app: LassRad[] = [{ maskin_id: 'M', datum: '2026-10-21', volym_m3sub: 70 }];
    expect(vol(mergaLassPerDag(opti, app))).toBe(120);
    expect(dagar(mergaLassPerDag(opti, app))).toBe(2);
  });

  it('grot-lass (maskin_id null) behålls alltid från Opti', () => {
    const opti: LassRad[] = [{ maskin_id: null, datum: '2026-10-20', volym_m3sub: 15 }];
    const app: LassRad[] = [];
    expect(vol(mergaLassPerDag(opti, app))).toBe(15);
  });

  it('lika volym → Opti vinner (behåller korstracka)', () => {
    const opti: LassRad[] = [{ maskin_id: 'M', datum: '2026-10-20', volym_m3sub: 40, korstracka_m: 200 }];
    const app: LassRad[] = [{ maskin_id: 'M', datum: '2026-10-20', volym_m3sub: 40 }];
    const merged = mergaLassPerDag(opti, app);
    expect(merged[0].korstracka_m).toBe(200);
  });
});
