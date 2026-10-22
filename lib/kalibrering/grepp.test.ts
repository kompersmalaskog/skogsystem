import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GREPP_MIN_CM, findGreppSlapp, klaveVid } from './grepp';
import { klavePunkter, stamGeometri } from './stam';
import { SKALVIKEN } from './stam.fixtur';
import fixtur from './__fixtures__/skalviken_stam1_profil.json';

const profil = (d: number[], steg = 10) => d.map((diameter_mm, i) => ({ position_cm: i * steg, diameter_mm }));
// Klaven mäter en gång per meter.
const klave = (...k: number[]) => k.map((v, i) => ({ posCm: i * 100, klave: v }));

describe('klaveVid — klavens mått mellan klavpunkterna', () => {
  it('räta linjen mellan närmaste punkter', () => {
    expect(klaveVid(klave(300, 290), 50)).toBe(295);
    expect(klaveVid(klave(300, 290, 270), 150)).toBe(280);
    expect(klaveVid(klave(300, 290), 0)).toBe(300);
    expect(klaveVid(klave(300, 290), 100)).toBe(290);
  });
  it('utanför första och sista klavpunkten vet vi inget', () => {
    expect(klaveVid(klave(300, 290), -1)).toBeNull();
    expect(klaveVid(klave(300, 290), 101)).toBeNull();
    expect(klaveVid([], 0)).toBeNull();
    expect(klaveVid([{ posCm: 0, klave: 300 }], 0)).toBeNull();
  });
});

describe('ett ställe = maskinens diameter står still minst 30 cm', () => {
  // Maskinen står på 300 mellan 10 och 50 cm (40 cm).
  const still = profil([310, 300, 300, 300, 300, 300, 290, 280, 270, 260, 250]);
  it('icke-minskande sträcka ≥ 30 cm är ett ställe; minskande diameter är det inte', () => {
    expect(findGreppSlapp(profil([300, 290, 280, 270]), [])).toEqual([]);
    expect(findGreppSlapp(profil([300, 290, 290, 290, 280, 270, 260]), [])).toEqual([]); // 20 cm
    expect(findGreppSlapp(profil([300, 290, 290, 290, 290, 280]), [])).toMatchObject([{ startCm: 10, endCm: 40, lengthCm: 30 }]);
    expect(GREPP_MIN_CM).toBe(30);
  });
  it('kortare än 30 cm räknas inte', () => {
    expect(findGreppSlapp(profil([310, 300, 300, 300, 290, 280, 270]), [])).toEqual([]);
  });
  it('maskinens mått får stiga: det är fortfarande ett ställe', () => {
    expect(findGreppSlapp(profil([310, 300, 302, 304, 304, 290, 280]), [])).toMatchObject([{ startCm: 10, endCm: 40 }]);
  });
  it('klaven avgör INTE om ett ställe räknas: platt, stigande eller saknad klave ger samma ställe', () => {
    for (const k of [klave(300, 300, 300, 300, 300, 300), klave(300, 310, 320, 330, 340, 350), klave(310, 300, 290, 280, 270, 260), []]) {
      expect(findGreppSlapp(still, k)).toHaveLength(1);
    }
  });
  it('profilen sorteras på position först', () => {
    expect(findGreppSlapp(still.slice().reverse(), [])).toHaveLength(1);
  });
  it('en profil med färre än 2 punkter ger inget', () => {
    expect(findGreppSlapp([], klave(300, 290))).toEqual([]);
    expect(findGreppSlapp(profil([300]), klave(300, 290))).toEqual([]);
  });
});

describe('felet per ställe — klaven visar, den avgör inte', () => {
  const still = profil([310, 300, 300, 300, 300, 300, 290, 280, 270, 260, 250]);
  it('maskin − klave vid sträckans slut', () => {
    const [p] = findGreppSlapp(still, klave(310, 300, 290, 280, 270, 260));
    // klaven vid 50 cm = 305 (310 → 300 över 100 cm); maskinen 300 → −5
    expect(p.felMm).toBeCloseTo(-5, 5);
    expect(p.glipa.map(g => g.posCm)).toEqual([10, 20, 30, 40, 50]);
  });
  it('felet mäts vid slutet, där maskinen hunnit stiga längst', () => {
    const [p] = findGreppSlapp(profil([310, 300, 302, 304, 304, 290, 280]), klave(310, 300, 290));
    expect(p.felMm).toBeCloseTo(304 - 306, 5); // klaven vid 40 cm = 306
  });
  it('slutet utanför klavpunkterna eller ingen klave: stället räknas, felet är null och glipan tom', () => {
    const kort = [{ posCm: 0, klave: 310 }, { posCm: 40, klave: 300 }];
    expect(findGreppSlapp(still, kort)).toMatchObject([{ felMm: null, glipa: [] }]);
    expect(findGreppSlapp(still, [])).toMatchObject([{ felMm: null, glipa: [] }]);
  });
  it('början utanför men slutet inne: felet finns, glipan ritas inte', () => {
    const sent = [{ posCm: 20, klave: 305 }, { posCm: 120, klave: 295 }];
    const [p] = findGreppSlapp(still, sent);
    expect(p.felMm).not.toBeNull();
    expect(p.glipa).toEqual([]);
  });
});

describe('Skälviken, stam 1 (riktig kontroll ur prod, Giant 2026-10-21)', () => {
  const prof = fixtur.stem_diameter_profile;
  const k = klavePunkter(stamGeometri(SKALVIKEN));
  it('21 klavpunkter, 218 profilpunkter', () => {
    expect(k).toHaveLength(21);
    expect(prof).toHaveLength(218);
  });
  it('8 ställen — alla där maskinen står still minst 30 cm, med eller utan klave', () => {
    const stallen = findGreppSlapp(prof, k);
    expect(stallen.map(p => [p.startCm, p.endCm])).toEqual([[250, 280], [480, 530], [560, 590], [920, 950], [980, 1010], [1040, 1070], [1150, 1180], [1240, 1270]]);
    expect(stallen.map(p => p.lengthCm)).toEqual([30, 50, 30, 30, 30, 30, 30, 30]);
    expect(findGreppSlapp(prof, [])).toHaveLength(8);
  });
  it('felet per ställe, avrundat: +5, +8, +2, −2, −1, −1, +1, +6', () => {
    expect(findGreppSlapp(prof, k).map(p => Math.round(p.felMm as number))).toEqual([5, 8, 2, -2, -1, -1, 1, 6]);
  });
});

describe('källvakt: stamvyn räknar ställena ur grepp.ts, tryckmätaren är orörd', () => {
  const les = (...delar: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...delar), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('stamvyn och planarket hämtar ställena ur findGreppSlapp', () => {
    expect(les('components', 'kalibrering', 'StamArk.tsx')).toContain('findGreppSlapp');
    expect(les('components', 'kalibrering', 'PlanArk.tsx')).toContain('findGreppSlapp');
  });
  it('diagnos-rutten (tryckmätaren) använder inte grepp.ts och läser ingen klave', () => {
    const route = les('app', 'api', 'kalibrering', 'diagnos', 'route.ts');
    expect(route).not.toContain('grepp');
    expect(route).toMatch(/d\s*>=\s*dPrev/);
  });
});
