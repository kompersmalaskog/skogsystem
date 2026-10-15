import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DIMMA_FYLL_OPACITET, DIMMA_OPACITET, dimmaMal, framhavBounds, framhavGeoJson, framhavdFran, pulsFas } from './omTraktenFramhav';

const LINJE = framhavdFran({ id: 'l1', slag: 'linje', lat: 56.4, lng: 14.7, geometri: [{ lat: 56.4, lng: 14.7 }, { lat: 56.401, lng: 14.702 }, { lat: 56.402, lng: 14.701 }] });
const ZON = framhavdFran({ id: 'z1', slag: 'zon', lat: 56.4, lng: 14.7, geometri: [{ lat: 56.4, lng: 14.7 }, { lat: 56.401, lng: 14.7 }, { lat: 56.401, lng: 14.702 }] });
const SYMBOL = framhavdFran({ id: 's1', slag: 'symbol', lat: 56.4, lng: 14.7 });

describe('Visa › — vad som framhävs', () => {
  it('en LINJE framhävs som HELA linjen (alla punkter), inte en punkt', () => {
    const f = framhavGeoJson(LINJE).features;
    expect(f.length).toBe(1);
    expect(f[0].geometry.type).toBe('LineString');
    expect(f[0].geometry.coordinates).toEqual([[14.7, 56.4], [14.702, 56.401], [14.701, 56.402]]);
  });
  it('en yta framhävs som sluten kontur', () => {
    const g = framhavGeoJson(ZON).features[0].geometry;
    expect(g.type).toBe('Polygon');
    expect(g.coordinates[0][0]).toEqual(g.coordinates[0][g.coordinates[0].length - 1]);
    expect(g.coordinates[0].length).toBe(4);
  });
  it('en symbol är en punkt; saknas geometri faller även linjen tillbaka till sin punkt; inget val → tomt', () => {
    expect(framhavGeoJson(SYMBOL).features[0].geometry).toEqual({ type: 'Point', coordinates: [14.7, 56.4] });
    expect(framhavGeoJson({ ...LINJE, geometri: undefined }).features[0].geometry.type).toBe('Point');
    expect(framhavGeoJson(null).features).toEqual([]);
    expect(framhavGeoJson({ ...SYMBOL, lat: null, lng: null }).features).toEqual([]);
  });
  it('kameran rymmer hela linjen/ytan; en symbol har ingen ram (kameran flyger till punkten)', () => {
    expect(framhavBounds(LINJE)).toEqual([[14.7, 56.4], [14.702, 56.402]]);
    expect(framhavBounds(ZON)).toEqual([[14.7, 56.4], [14.702, 56.401]]);
    expect(framhavBounds(SYMBOL)).toBeNull();
    expect(framhavBounds(null)).toBeNull();
  });
});

describe('Visa › — vad som tonas ner', () => {
  const ALLA = ['basemap', 'markers-layer', 'markers-prick', 'markers-hit', 'arrows-layer', 'line-boundary-base', 'line-boundary-stripe', 'line-mainRoad-base', 'line-mainRoad-casing', 'line-sideRoadRed-base',
    'zone-fill', 'zone-outline', 'zone-outline-dash', 'omtrakten-framhav-ring', 'maskin-pos', 'trail-footprints'];
  it('symboler, prickar, pilar, väg-/naturlinjer och ytor tonas ner; traktgränsen, baskartan, förarens position och framhävningen själv rörs inte', () => {
    const m = dimmaMal(ALLA);
    expect(m.map((x) => x.id)).toEqual(['markers-layer', 'markers-prick', 'arrows-layer', 'line-mainRoad-base', 'line-mainRoad-casing', 'line-sideRoadRed-base', 'zone-fill', 'zone-outline', 'zone-outline-dash']);
    expect(m.find((x) => x.id === 'zone-fill')).toMatchObject({ prop: 'fill-opacity', dim: DIMMA_FYLL_OPACITET });
    expect(m.find((x) => x.id === 'markers-layer')).toMatchObject({ prop: 'icon-opacity', dim: DIMMA_OPACITET });
    expect(m.find((x) => x.id === 'markers-prick')).toMatchObject({ prop: 'circle-opacity' });
    expect(m.map((x) => x.id)).not.toContain('line-boundary-base');
    expect(m.map((x) => x.id)).not.toContain('markers-hit');
  });
});

describe('puls', () => {
  it('0 → 1 → 0 över en period; stilla på mitten vid minskad rörelse', () => {
    expect(pulsFas(0, 1000)).toBeCloseTo(0, 5);
    expect(pulsFas(500, 1000)).toBeCloseTo(1, 5);
    expect(pulsFas(1000, 1000)).toBeCloseTo(0, 5);
    expect(pulsFas(123, 1000, true)).toBe(0.5);
  });
});

describe('sidans koppling (page.tsx kan inte monteras — källvakt)', () => {
  const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  it('framhävningen släpps vid tryck på kartan eller nytt val — ingen timer — och ligger EFTER briefing-effekten (som annars skriver över nedtoningen)', () => {
    expect(page).not.toMatch(/setTimeout\(\(\) => setFramhavdMarkering\(null\), \d+\)/);
    expect(page).toContain('startaFramhavning(map as any, framhavdMarkering,');
    expect(readFileSync(resolve(__dirname, './omTraktenFramhavKarta.ts'), 'utf8')).toContain("map.once('click', o.onSlapp)");
    const briefing = page.indexOf('}, [briefingMode, briefingHighlightId, mapLibreReady, markers, checklistMapView]);');
    const framhav = page.indexOf('// Om trakten › Visa ›: markeringen framhävs');
    expect(briefing).toBeGreaterThan(0);
    expect(framhav).toBeGreaterThan(briefing);
    expect(page).toContain('useEffect(() => { setFramhavdMarkering(null); }, [valtObjekt?.id]);');
  });
  it('Visa › på en linje/yta rymmer HELA figuren (fitBounds), en symbol flyger till punkten; panelen på bred skärm räknas bort', () => {
    expect(page).toContain('const bounds = framhavBounds(framhavdFran(m));');
    expect(page).toContain('map.fitBounds(bounds,');
    expect(page).toContain('offset: [-panelPx / 2, 0]');
    expect(page).toContain("const panelPx = lage === 'panel' ? PANEL_BREDD_PX");
  });
  it('markeringarna bär hela linjen/ytan (geometri) och listans ikon är kartans (getIconDef: riktig färg + vit ring)', () => {
    expect(page).toContain('geometri = heltSpar(m.path)');
    expect(page).toContain('const def = getIconDef(m.typ);');
    expect(page).toContain('background: def.bg, border:');
    expect(page).not.toContain("const chipBg = (t: string) =>");
  });
});
