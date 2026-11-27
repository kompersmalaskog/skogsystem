// Blött och brant på skotningsrapportens karta.
//
// Martin 2026-11-25: "om det är blött eller brant så dom förstå varför vi måste
// kört som vi gjort med virket". Testet vaktar att gränserna är APPENS egna
// (`BRANT_GRANS`, `FUKT` i lib/ritadKarta/mark) och att inget ritas utanför
// traktgränsen eller för en fläck som är mindre än tröskeln.

import { describe, it, expect } from 'vitest';
import { rapportMark, markSlagen, BLOTT_MIN, BRANT_MIN, type SparatMarkRutnat } from './rapportMark';
import { BRANT_GRANS, FUKT } from '@/lib/ritadKarta/mark';
import SKALVIKEN from './__fixtures__/skalviken_mark_2026-11-25.json';

/** base64 av en byte-array — samma kodning som `objekt_skogsdata.rutnat`. */
const b64 = (v: number[]) => Buffer.from(Uint8Array.from(v)).toString('base64');

/**
 * Ett rutnät på bredd × höjd rutor om 10 m, där `fyll(x, y)` ger
 * [innanför, lutning i grader, fuktkod] för varje ruta.
 */
function rutnat(
  bredd: number, hojd: number,
  fyll: (x: number, y: number) => [number, number, number],
): SparatMarkRutnat {
  const inne: number[] = [], lutning: number[] = [], fukt: number[] = [];
  for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
    const [i, l, f] = fyll(x, y);
    inne.push(i); lutning.push(l); fukt.push(f);
  }
  return { minX: 500000, maxY: 6300000, bredd, hojd, rutaM: 10, inne: b64(inne), lutning: b64(lutning), fukt: b64(fukt) };
}

const TORRT = FUKT.ingen;

describe('rapportMark — gränserna är appens egna', () => {
  it('blöt mark blir en yta när fläcken är minst BLOTT_MIN rutor', () => {
    // En 3×3-fläck blöt mark mitt i en torr trakt.
    const g = rutnat(9, 9, (x, y) => [1, 0, x >= 3 && x <= 5 && y >= 3 && y <= 5 ? FUKT.blot : TORRT]);
    const m = rapportMark([g]);
    expect(m.length).toBeGreaterThan(0);
    expect(markSlagen(m)).toEqual(['fuktigt', 'blott']);   // kumulativt, se nedan
    // Ytorna ligger inom fläcken, inte över hela trakten.
    for (const r of m) expect(r.ruta.length).toBeGreaterThanOrEqual(4);
  });

  it('en fläck mindre än tröskeln ritas inte — en rapport pekar inte ut en halv maskinbredd', () => {
    expect(BLOTT_MIN).toBeGreaterThan(1);
    // EN blöt ruta (1 < BLOTT_MIN).
    const g = rutnat(9, 9, (x, y) => [1, 0, x === 4 && y === 4 ? FUKT.blot : TORRT]);
    expect(rapportMark([g]).filter(r => r.slag === 'blott')).toEqual([]);
  });

  it('KUMULATIVT som i appen: blött är också fuktigt, mycket brant är också brant', () => {
    // Appen ritar glesa streck på allt fuktigt och täta OVANPÅ det blöta
    // ("tätt har varannan rad på samma plats som glest"). Papperet gör samma
    // sak, så graderingen syns som tätare mönster — inte som två skilda fält.
    const fuktig = rutnat(9, 9, () => [1, 0, FUKT.fuktig]);
    expect(markSlagen(rapportMark([fuktig]))).toEqual(['fuktigt']);
    const blott = rutnat(9, 9, () => [1, 0, FUKT.blot]);
    expect(markSlagen(rapportMark([blott]))).toEqual(['fuktigt', 'blott']);

    const lite = rutnat(9, 9, () => [1, BRANT_GRANS.lite, TORRT]);
    expect(markSlagen(rapportMark([lite]))).toEqual(['brant']);
    const mycket = rutnat(9, 9, () => [1, BRANT_GRANS.mycket, TORRT]);
    expect(markSlagen(rapportMark([mycket]))).toEqual(['brant', 'mycket_brant']);
  });

  it('platt och torrt ger INGA ytor — ingen rad på kartan som inte betyder något', () => {
    const g = rutnat(9, 9, () => [1, BRANT_GRANS.lite - 1, TORRT]);
    expect(rapportMark([g])).toEqual([]);
  });

  it('ingenting ritas utanför traktgränsen, hur blött det än är utanför', () => {
    // Allt är blött, men bara den vänstra halvan ligger innanför gränsen.
    const g = rutnat(10, 10, (x) => [x < 5 ? 1 : 0, 0, FUKT.blot]);
    const m = rapportMark([g]);
    expect(m.length).toBeGreaterThan(0);
    // Mitten mellan rutnätets vänstra kant och mitten — inget får ligga öster om den.
    const alla = m.flatMap(r => r.ruta.map(p => p.lng));
    const g2 = rutnat(10, 10, (x) => [x < 10 ? 1 : 0, 0, FUKT.blot]);
    const hela = rapportMark([g2]).flatMap(r => r.ruta.map(p => p.lng));
    expect(Math.max(...alla)).toBeLessThan(Math.max(...hela));
  });

  it('saknad lutning eller fukt är inget fel — den delen ritas bara inte', () => {
    const utanFukt: SparatMarkRutnat = { ...rutnat(9, 9, () => [1, BRANT_GRANS.mycket, TORRT]), fukt: null };
    expect(markSlagen(rapportMark([utanFukt]))).toEqual(['brant', 'mycket_brant']);
    const utanLutning: SparatMarkRutnat = { ...rutnat(9, 9, () => [1, 0, FUKT.blot]), lutning: null };
    expect(markSlagen(rapportMark([utanLutning]))).toEqual(['fuktigt', 'blott']);
    const varken: SparatMarkRutnat = { ...rutnat(9, 9, () => [1, 0, TORRT]), lutning: null, fukt: null };
    expect(rapportMark([varken])).toEqual([]);
  });

  it('flera utsnitt (en utspridd trakt) läses alla', () => {
    const a = rutnat(9, 9, () => [1, 0, FUKT.blot]);
    const b = { ...rutnat(9, 9, () => [1, BRANT_GRANS.mycket, TORRT]), minX: 520000 };
    expect(markSlagen(rapportMark([a, b]))).toEqual(['fuktigt', 'blott', 'brant', 'mycket_brant']);
  });

  it('markSlagen håller en fast ordning — teckenförklaringen får inte hoppa', () => {
    const alla = rutnat(20, 20, (x, y) => [1,
      y < 5 ? BRANT_GRANS.mycket : y < 10 ? BRANT_GRANS.lite : 0,
      y >= 10 && y < 15 ? FUKT.blot : y >= 15 ? FUKT.fuktig : TORRT]);
    expect(markSlagen(rapportMark([alla]))).toEqual(['fuktigt', 'blott', 'brant', 'mycket_brant']);
  });

  it('BRANT_MIN är strängare än BLOTT_MIN — brant i terrängen är vanligare än blöthål', () => {
    expect(BRANT_MIN).toBeGreaterThan(BLOTT_MIN);
  });
});

// RIKTIG PROD-DATA. Bondeskog (den trakt rapporten renderats på) har ingen
// brant mark alls, så utan det här testet var den branta vägen bara provad på
// påhittade rutnät. Skälviken är den trakt i prod som HAR brant mark —
// samma trakt Martins skiss gällde.
describe('Skälvikens riktiga rutnät ur prod (2026-11-25)', () => {
  const g = SKALVIKEN as unknown as SparatMarkRutnat;

  it('ger branta ytor på riktiga bytes — inte bara på påhittad data', () => {
    const m = rapportMark([g]);
    expect(m.filter(r => r.slag === 'brant')).toHaveLength(14);
    expect(m.filter(r => r.slag === 'fuktigt')).toHaveLength(9);
  });

  it('en spridd brant fläck ritas INTE — 22 rutor över 27° men största fläcken är 4', () => {
    // 731 rutor ligger i trakten, 22 av dem (3,0 %) är brantare än
    // BRANT_GRANS.mycket, men de ligger spridda: största sammanhängande
    // fläcken är 4 rutor, och BRANT_MIN är 8. Graderingen tystnar därför —
    // men rutorna ligger inne i de 14 branta ytorna, så ingenting försvinner
    // från kartan. En rapport pekar inte ut en halv maskinbredd.
    expect(rapportMark([g]).filter(r => r.slag === 'mycket_brant')).toEqual([]);
    expect(markSlagen(rapportMark([g]))).toEqual(['fuktigt', 'brant']);
  });

  it('allt ligger inom trakten, aldrig utanför rutnätet', () => {
    const p = rapportMark([g]).flatMap(r => r.ruta);
    expect(Math.min(...p.map(q => q.lat))).toBeGreaterThan(56.282);
    expect(Math.max(...p.map(q => q.lat))).toBeLessThan(56.286);
    expect(Math.min(...p.map(q => q.lng))).toBeGreaterThan(15.375);
    expect(Math.max(...p.map(q => q.lng))).toBeLessThan(15.382);
  });
});
