// Produktionshögarna är PÅ från början i skotarläget; planeringsvyn och övriga vyer rörs inte.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hogarSynliga, vaxlaSkotarHogar, SKOTAR_HOGAR_ID } from './skotarHogar';
import { DEFAULT_MAP_LAYERS } from './hooks/useMapLayers';

describe('hogarSynliga', () => {
  it('skotarläget, ny enhet (inget sparat val): PÅ — föraren slår inte på något', () => {
    expect(hogarSynliga({}, true)).toBe(true);
    expect(hogarSynliga(DEFAULT_MAP_LAYERS, true)).toBe(true);   // standardlistan har produktionshogar:false men det gäller inte skotarläget
    expect(hogarSynliga(null, true)).toBe(true);
    expect(hogarSynliga(undefined, true)).toBe(true);
  });
  it('skotarläget: bara ett uttryckligt false (förarens eget val) döljer dem', () => {
    expect(hogarSynliga({ [SKOTAR_HOGAR_ID]: false }, true)).toBe(false);
    expect(hogarSynliga({ [SKOTAR_HOGAR_ID]: true }, true)).toBe(true);
  });
  it('övriga vyer oförändrade: lagret produktionshogar styr, standard AV', () => {
    expect(hogarSynliga(DEFAULT_MAP_LAYERS, false)).toBe(false);
    expect(hogarSynliga({}, false)).toBe(false);
    expect(hogarSynliga({ produktionshogar: true }, false)).toBe(true);
    expect(hogarSynliga({ produktionshogar: false, [SKOTAR_HOGAR_ID]: true }, false)).toBe(false);   // skotarläges-valet läcker inte
  });
  it('skotarläget läser inte planeringens lager', () => {
    expect(hogarSynliga({ produktionshogar: false }, true)).toBe(true);
    expect(hogarSynliga({ produktionshogar: true, [SKOTAR_HOGAR_ID]: false }, true)).toBe(false);
  });
});

describe('vaxlaSkotarHogar', () => {
  it('PÅ → AV → PÅ i skotarläget, och rör aldrig planeringens lager', () => {
    const start = { produktionshogar: false, grothogar: true };
    const av = vaxlaSkotarHogar(start);
    expect(av).toEqual({ produktionshogar: false, grothogar: true, [SKOTAR_HOGAR_ID]: false });
    expect(hogarSynliga(av, true)).toBe(false);
    const pa = vaxlaSkotarHogar(av);
    expect(hogarSynliga(pa, true)).toBe(true);
    expect(pa.produktionshogar).toBe(false);
  });
  it('första trycket på en ny enhet slår AV (den visas ju redan)', () => {
    expect(hogarSynliga(vaxlaSkotarHogar({}), true)).toBe(false);
  });
});

describe('källvakt: page.tsx', () => {
  const page = readFileSync(path.resolve(process.cwd(), 'app/planering/page.tsx'), 'utf-8');
  it('lagrets synlighet, laddningen och Lager-knappen går genom hogarSynliga/hogarPa', () => {
    expect(page).toContain('const hogarPa = hogarSynliga(overlays, skotarKorvy);');
    expect(page).toContain("const vis = hogarPa ? 'visible' : 'none';");
    expect(page).toContain('const anyActive = hogarPa || overlays.grothogar;');
    expect(page).toContain('}, [valtObjekt?.id, hogarPa, overlays.grothogar, mapLibreReady, hogarReload]);');
    expect(page).toContain("skotarKorvy ? () => setOverlays((prev: any) => vaxlaSkotarHogar(prev)) : sla('produktionshogar')");
  });
  it('ingen kod läser overlays.produktionshogar direkt längre (bara planeringens knapp via sla())', () => {
    expect(page).not.toMatch(/overlays\.produktionshogar/);
  });
});
