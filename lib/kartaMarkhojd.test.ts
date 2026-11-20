import { describe, it, expect } from 'vitest';
import { jamkaMarkhojd, MARKHOJD_TOL_M } from './kartaMarkhojd';

function karta(o: { terrang?: boolean; rorSig?: boolean; markhojd?: number | null | undefined; centerHojd?: number }) {
  const anrop: unknown[] = [];
  return {
    anrop,
    getTerrain: () => (o.terrang === false ? null : { source: 'terrain-dem' }),
    isMoving: () => !!o.rorSig,
    getCenter: () => ({ lng: 15.05, lat: 56.35 }),
    queryTerrainElevation: () => o.markhojd,
    getCenterElevation: () => o.centerHojd ?? 0,
    jumpTo: (x: unknown) => { anrop.push(x); },
  };
}

describe('jamkaMarkhojd', () => {
  it('HÅLABÄCK: centerhöjden fastnade på 0 m medan marken är 97,5 m → sätts till markhöjden', () => {
    const m = karta({ markhojd: 97.52, centerHojd: 0 });
    expect(jamkaMarkhojd(m)).toBe(true);
    expect(m.anrop).toEqual([{ elevation: 97.52 }]);
  });

  it('redan rätt (inom toleransen) → rör inte kameran', () => {
    const m = karta({ markhojd: 97.5, centerHojd: 97.5 + MARKHOJD_TOL_M - 0.1 });
    expect(jamkaMarkhojd(m)).toBe(false);
    expect(m.anrop).toEqual([]);
  });

  it('utanför toleransen åt andra hållet (sjunker mot dalen) → rättas också', () => {
    const m = karta({ markhojd: 60, centerHojd: 97.5 });
    expect(jamkaMarkhojd(m)).toBe(true);
    expect(m.anrop).toEqual([{ elevation: 60 }]);
  });

  it('kameran rör sig → ALDRIG jumpTo (det avbryter flygning/följning)', () => {
    const m = karta({ rorSig: true, markhojd: 97.5, centerHojd: 0 });
    expect(jamkaMarkhojd(m)).toBe(false);
    expect(m.anrop).toEqual([]);
  });

  it('ingen 3D-terräng → gör inget', () => {
    const m = karta({ terrang: false, markhojd: 97.5, centerHojd: 0 });
    expect(jamkaMarkhojd(m)).toBe(false);
    expect(m.anrop).toEqual([]);
  });

  it('höjddata för centrum ej laddad (null/undefined/NaN) → gör inget (rättar först när den kommit)', () => {
    for (const h of [null, undefined, NaN]) {
      const m = karta({ markhojd: h as any, centerHojd: 0 });
      expect(jamkaMarkhojd(m)).toBe(false);
      expect(m.anrop).toEqual([]);
    }
  });

  it('en karta som kastar (stil ej klar) ger false, aldrig undantag', () => {
    expect(jamkaMarkhojd({ getTerrain: () => { throw new Error('stil'); } })).toBe(false);
    expect(jamkaMarkhojd(null)).toBe(false);
  });

  it('upprepade anrop efter rättning gör inget mer (ingen jumpTo-loop)', () => {
    let centerHojd = 0;
    const anrop: unknown[] = [];
    const m = { getTerrain: () => ({}), isMoving: () => false, getCenter: () => ({ lng: 1, lat: 2 }), queryTerrainElevation: () => 97.5, getCenterElevation: () => centerHojd, jumpTo: (x: any) => { anrop.push(x); centerHojd = x.elevation; } };
    expect(jamkaMarkhojd(m)).toBe(true);
    expect(jamkaMarkhojd(m)).toBe(false);
    expect(jamkaMarkhojd(m)).toBe(false);
    expect(anrop).toHaveLength(1);
  });
});

// Vashult 2026-11-11: rättningen kördes bara i körvyn med följet på → i planeringsvyn (och när föraren dragit kartan) stod centerhöjden på 0 m,
// marken låg på 163 m, och symbolerna ritades ~130 px ovanför sin plats medan trycket träffade rätt plats. Rättningen ska gälla ALLTID.
describe('markhöjden rättas i alla lägen (källvakt mot planeringssidan)', () => {
  it('effekten som anropar jamkaMarkhojd kräver bara en karta, inte körvyn', async () => {
    const { readFileSync } = await import('node:fs');
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    const i = sida.indexOf('jamkaMarkhojd(map)');
    expect(i).toBeGreaterThan(0);
    const fore = sida.slice(sida.lastIndexOf('useEffect(', i), i);
    expect(fore).toContain('if (!map || !mapLibreReady) return;');
    expect(fore).not.toContain('korvyActive');
    expect(fore).not.toContain('korvyFollowPaused');
  });
});
