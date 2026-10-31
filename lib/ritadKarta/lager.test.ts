// Den ritade kartan som femte kartlager: vilka lager som syns var, och att varje lager har en plats i lagerordningen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { RITAD_ID, RITAD_KALLA, RITAD_LAGER, RITAD_VEKTOR_LAGER, grundKallor, grundLager, RITAD_DOLJ_FYLLNING, brantLager, ritadSynlighet } from './lager';
import { harEgenRegel, lagerRang, RANG } from '../lagerOrdning';

describe('ritadSynlighet', () => {
  it('inget syns när Ritad inte är vald', () => {
    expect(Object.values(ritadSynlighet({ vald: false })).some(Boolean)).toBe(false);
  });
  it('vald: alla lager syns, och ingen av dem är 3D (skogen ligger under allt man planerar)', () => {
    const s = ritadSynlighet({ vald: true });
    expect(RITAD_LAGER.every((id) => s[id])).toBe(true);
    expect(grundLager().some((l: any) => l.type === 'fill-extrusion')).toBe(false);
    expect(RITAD_LAGER.some((id) => /kronor|trad/.test(id))).toBe(false);
  });
  it('planeringens tona över trakten släcks (trakten ska vara ljusast)', () => {
    expect([...RITAD_DOLJ_FYLLNING]).toEqual(['grans-fill', 'trakt-gr-fill']);
  });

});

describe('lagren', () => {
  it('är giltiga enligt MapLibres stil-spec (ett fel här syns annars först i maskinen)', () => {
    const geo = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    const stil = {
      version: 8, sources: { ...grundKallor(), [RITAD_KALLA.brant]: geo, [RITAD_KALLA.skog]: { type: 'image', url: 'x.png', coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] } },
      layers: [...grundLager(), { id: RITAD_ID.skog, type: 'raster', source: RITAD_KALLA.skog }, brantLager()],
    };
    const fel = validateStyleMin(stil as any).map((f: any) => f.message).filter((m: string) => !/sprite|glyphs/i.test(m));
    expect(fel).toEqual([]);
    expect(stil.layers.map((l: any) => l.id).sort()).toEqual([...RITAD_LAGER].sort());
  });
  it('vatten, vägar och hus har egna id:n (ritad-*) och egen källa — krockar aldrig med /karta-ritad eller planeringens lager', () => {
    for (const l of RITAD_VEKTOR_LAGER) { expect(l.id).toMatch(/^ritad-/); expect(l.source).toBe('ritad-vektor'); }
  });
  it('varje lager har en egen regel i lagerordningen och ligger i bakgrunden, under underlagen (WMS) och nedtoningen utanför trakten', () => {
    for (const id of RITAD_LAGER) {
      expect(harEgenRegel(id), id).toBe(true);
      const r = lagerRang({ id });
      expect(r, id).toBeGreaterThan(RANG.bakgrund);
      expect(r, id).toBeLessThan(lagerRang({ id: 'wms-layer-sks_markfuktighet' }));
      expect(r, id).toBeLessThan(lagerRang({ id: 'trakt-utanfor-ton' }));
    }
    expect(lagerRang({ id: 'ritad-bakgrund' })).toBeGreaterThan(lagerRang({ id: 'satellite-layer' }));
    expect(lagerRang({ id: 'ritad-vag' })).toBeGreaterThan(lagerRang({ id: 'ritad-skog' }));
  });
  it('grunden har ingen text (fast text på kartan är bara ytnamn och avläggsnummer)', () => {
    for (const l of grundLager()) expect((l as any).layout?.['text-field'], l.id).toBeUndefined();
  });
});

describe('page.tsx: Ritad är kopplad på ett ställe', () => {
  const page = readFileSync(join(__dirname, '../../app/planering/page.tsx'), 'utf8');
  it('raden Ritad finns i Bakgrundskarta och säger vad som syns', () => {
    expect(page).toContain("{ id: 'ritad', name: 'Ritad', desc: ritadStatusText(ritadStatus) },");
  });
  it('körvyn släpper igenom den ritade kartan bara när Ritad är vald', () => {
    expect(page).toContain("if (korvyBasKarta === 'ritad') for (const id of RITAD_LAGER) SHOW.add(id);");
    expect(page).not.toMatch(/KEEP_PREFIX = \[[^\]]*'ritad-'/);
  });
  it('hooken anropas efter körvyns whitelist (dess synlighet ska sättas sist)', () => {
    expect(page.indexOf('useRitadKarta({')).toBeGreaterThan(page.indexOf("if (korvyBasKarta === 'ritad')"));
  });
});
