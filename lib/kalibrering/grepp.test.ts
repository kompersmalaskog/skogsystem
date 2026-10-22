import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GREPP_MIN_CM, KLAVE_SJUNKER_MM, analyseraGrepp, findGreppSlapp, klaveVid } from './grepp';
import { klavePunkter, stamGeometri } from './stam';
import { SKALVIKEN } from './stam.fixtur';
import fixtur from './__fixtures__/skalviken_stam1_profil.json';

const profil = (d: number[], steg = 10) => d.map((diameter_mm, i) => ({ position_cm: i * steg, diameter_mm }));
// Klaven mäter en gång per meter och sjunker jämnt om inget annat sägs.
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

describe('greppet släppte = maskinen står still medan klaven sjunker', () => {
  // Maskinen står på 300 mellan 20 och 60 cm (40 cm) medan klaven sjunker 300 → 290 över metern.
  const stillPlatta = profil([310, 300, 300, 300, 300, 300, 290, 280, 270, 260, 250]);
  it('maskinen still + klaven sjunker → ett ställe, med felet maskin − klave vid slutet', () => {
    const [p] = findGreppSlapp(stillPlatta, klave(310, 300, 290, 280, 270, 260));
    expect(p).toMatchObject({ startCm: 10, endCm: 50, lengthCm: 40 });
    // klaven vid 50 cm = 305 (310 → 300 över 100 cm); maskinen 300 → −5
    expect(p.felMm).toBeCloseTo(-5, 5);
    expect(p.klaveSjunkerMm).toBeCloseTo(4, 5);
    expect(p.glipa.map(g => g.posCm)).toEqual([10, 20, 30, 40, 50]);
  });
  it('maskinen still och klaven också still: stammen är platt på riktigt, räknas inte', () => {
    expect(findGreppSlapp(stillPlatta, klave(300, 300, 300, 300, 300, 300))).toEqual([]);
  });
  it('klaven sjunker mindre än en halv millimeter över sträckan: platt för klaven, räknas inte', () => {
    // 100 cm per mm → 40 cm = 0,4 mm
    expect(findGreppSlapp(stillPlatta, klave(300, 299, 298, 297, 296, 295))).toEqual([]);
    expect(KLAVE_SJUNKER_MM).toBe(0.5);
  });
  it('maskinen sjunker (följer med): inget ställe, även om klaven sjunker', () => {
    expect(findGreppSlapp(profil([310, 305, 300, 295, 290, 285, 280]), klave(310, 300, 290, 280, 270))).toEqual([]);
  });
  it('klaven STIGER över sträckan (stor knöl): räknas inte, klaven sjunker inte', () => {
    expect(findGreppSlapp(stillPlatta, klave(300, 310, 320, 330, 340, 350))).toEqual([]);
  });
  it('kortare än minsta sträcka räknas inte', () => {
    expect(GREPP_MIN_CM).toBe(30);
    expect(findGreppSlapp(profil([310, 300, 300, 300, 290, 280, 270]), klave(310, 300, 290, 280, 270, 260))).toEqual([]);
    expect(findGreppSlapp(profil([310, 300, 300, 300, 300, 290, 280]), klave(310, 300, 290, 280, 270, 260))).toHaveLength(1);
  });
  it('sträckan utanför klavpunkterna går inte att bedöma: räknas inte', () => {
    // klavpunkter bara 100–300 cm; maskinen står still 20–60 cm
    const sent = [{ posCm: 100, klave: 300 }, { posCm: 200, klave: 290 }, { posCm: 300, klave: 280 }];
    expect(findGreppSlapp(stillPlatta, sent)).toEqual([]);
    expect(findGreppSlapp(stillPlatta, [])).toEqual([]);
  });
  it('börjar sträckan inom klavpunkterna men slutar utanför: går inte att bedöma', () => {
    const kort = [{ posCm: 0, klave: 310 }, { posCm: 40, klave: 300 }];
    expect(findGreppSlapp(stillPlatta, kort)).toEqual([]);
  });
  it('maskinens mått får stiga inom sträckan: felet mäts vid slutet, där glipan vuxit mest', () => {
    // maskinen stiger 300 → 302 → 304 (icke-minskande) medan klaven sjunker 310 → 300 över metern
    const [p] = findGreppSlapp(profil([310, 300, 302, 304, 304, 290, 280]), klave(310, 300, 290));
    expect(p).toMatchObject({ startCm: 10, endCm: 40 });
    expect(p.felMm).toBeCloseTo(304 - 306, 5); // klaven vid 40 cm = 306
  });
  it('profilen sorteras på position först', () => {
    const blandad = stillPlatta.slice().reverse();
    expect(findGreppSlapp(blandad, klave(310, 300, 290, 280, 270, 260))).toHaveLength(1);
  });
  it('en profil med färre än 2 punkter ger inget', () => {
    expect(findGreppSlapp([], klave(300, 290))).toEqual([]);
    expect(findGreppSlapp(profil([300]), klave(300, 290))).toEqual([]);
  });
});

describe('stegen: underlaget för tryckmätaren', () => {
  it('bedömbart = klaven mätt på båda sidor; grepp = steget ligger i ett ställe', () => {
    const { steg, stallen } = analyseraGrepp(profil([310, 300, 300, 300, 300, 300, 290, 280, 270, 260, 250]), klave(310, 300, 290, 280, 270));
    expect(stallen).toHaveLength(1);
    expect(steg).toHaveLength(10);
    // klavpunkterna sträcker sig 0–400 cm; profilen 0–100 cm, alltså är alla steg bedömbara
    expect(steg.every(s => s.bedombar)).toBe(true);
    expect(steg.filter(s => s.grepp).map(s => s.posCm)).toEqual([20, 30, 40, 50]);
  });
  it('steg utanför klavens spann är inte underlag', () => {
    const { steg } = analyseraGrepp(profil([310, 300, 300, 300, 300, 300, 290]), [{ posCm: 30, klave: 300 }, { posCm: 130, klave: 290 }]);
    expect(steg.map(s => s.bedombar)).toEqual([false, false, false, true, true, true]);
  });
});

describe('Skälviken, stam 1 (riktig kontroll ur prod, Giant 2026-10-21)', () => {
  const prof = fixtur.stem_diameter_profile;
  const g = stamGeometri(SKALVIKEN);
  const k = klavePunkter(g);
  it('21 klavade punkter; profilen är maskinens täta (en punkt var 10:e cm)', () => {
    expect(k).toHaveLength(21);
    expect(prof).toHaveLength(218);
  });
  it('maskinen ensam hittade 8 planområden; mot klaven är det 7 ställen — 560–590 cm faller bort, klaven är 294 → 294', () => {
    const stallen = findGreppSlapp(prof, k);
    expect(stallen.map(p => [p.startCm, p.endCm])).toEqual([[250, 280], [480, 530], [920, 950], [980, 1010], [1040, 1070], [1150, 1180], [1240, 1270]]);
    expect(stallen.map(p => Math.round(p.felMm))).toEqual([5, 8, -2, -1, -1, 1, 6]);
    expect(stallen.map(p => p.lengthCm)).toEqual([30, 50, 30, 30, 30, 30, 30]);
  });
  it('tryckmätaren på samma stam: andelen steg där greppet släppte', () => {
    const steg = analyseraGrepp(prof, k).steg.filter(s => s.posCm > 130 && s.bedombar);
    expect(steg.length).toBe(197);
    expect(steg.filter(s => s.grepp).length).toBe(23);
  });
  it('listan och mätaren räknar samma ställen: stegen med grepp är exakt stället sträckornas steg', () => {
    const a = analyseraGrepp(prof, k);
    const forvantat = a.stallen.reduce((n, p) => n + p.lengthCm / 10, 0);
    expect(a.steg.filter(s => s.grepp).length).toBe(forvantat);
  });
});

describe('källvakt: båda ställena använder EN definition', () => {
  const les = (...delar: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...delar), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('stamvyn och diagnos-rutten hämtar ställena ur grepp.ts, ingen egen jämförelse av diametrar', () => {
    expect(les('components', 'kalibrering', 'StamArk.tsx')).toContain('findGreppSlapp');
    expect(les('components', 'kalibrering', 'PlanArk.tsx')).toContain('findGreppSlapp');
    const route = les('app', 'api', 'kalibrering', 'diagnos', 'route.ts');
    expect(route).toContain('analyseraGrepp');
    expect(route).not.toMatch(/d\s*>=\s*dPrev/);
  });
});
