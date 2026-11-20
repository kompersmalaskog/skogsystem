// Planeringsvyns körspår går att tända och släcka per roll i + › Lager (Martin 2026-10-29).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANSPAR_LAGER, PLANSPAR_NYCKEL, planSparPa, vaxlaPlanSpar } from './planSparLager';
import { DEFAULT_MAP_LAYERS, lasSparadeLager } from './hooks/useMapLayers';

describe('planSparLager', () => {
  it('på från start, också utan sparad nyckel', () => {
    expect(planSparPa({}, 'skordare')).toBe(true);
    expect(planSparPa(undefined, 'skotare')).toBe(true);
    expect(planSparPa(DEFAULT_MAP_LAYERS, 'skordare')).toBe(true);
  });
  it('växla släcker och tänder bara sin egen roll', () => {
    const av = vaxlaPlanSpar({}, 'skordare');
    expect(planSparPa(av, 'skordare')).toBe(false);
    expect(planSparPa(av, 'skotare')).toBe(true);
    expect(planSparPa(vaxlaPlanSpar(av, 'skordare'), 'skordare')).toBe(true);
  });
  it('valet överlever en omladdning', () => {
    const av = vaxlaPlanSpar(DEFAULT_MAP_LAYERS, 'skotare');
    expect(planSparPa(lasSparadeLager(JSON.stringify(av)), 'skotare')).toBe(false);
  });
  it('två rader med egna namn', () => {
    expect(PLANSPAR_LAGER.map((l) => l.namn)).toEqual(['Skördarens spår', 'Skotarens spår']);
  });
});

describe('page.tsx — spåren styrs av lagret', () => {
  const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
  it('synligheten läser lagret per roll', () => {
    expect(sida).toContain('planSparPa(overlays, roll)');
    expect(sida).toContain(`(overlays as any)[PLANSPAR_NYCKEL.skordare]`);
  });
  it('raderna finns i Lager och växlar lagret', () => {
    expect(sida).toContain('PLANSPAR_LAGER.map(');
    expect(sida).toContain('vaxlaPlanSpar(prev, l.roll)');
  });
  it('nycklarna är de som sparas', () => {
    expect(Object.values(PLANSPAR_NYCKEL).every((k) => k in DEFAULT_MAP_LAYERS)).toBe(true);
  });
});
