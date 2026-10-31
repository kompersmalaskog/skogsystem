// Den ritade kartan som femte kartlager: vilka lager som syns var, och att varje lager har en plats i lagerordningen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { RITAD_ID, RITAD_KALLA, RITAD_KORVY_LAGER, RITAD_LAGER, RITAD_VEKTOR_LAGER, arLutad, grundKallor, grundLager, kronorLager, ritadSynlighet, tradLager } from './lager';
import { harEgenRegel, lagerRang, RANG } from '../lagerOrdning';
import { LUTAD_PITCH } from './stil';

describe('ritadSynlighet', () => {
  it('inget syns när Ritad inte är vald', () => {
    for (const korvy of [true, false]) for (const lutad of [true, false]) {
      const s = ritadSynlighet({ vald: false, korvy, lutad });
      expect(Object.values(s).some(Boolean), `${korvy} ${lutad}`).toBe(false);
    }
  });
  it('körvyn (maskinen) är ALLTID platt: aldrig 3D-kronor, alltid träden — också när kartan är lutad', () => {
    for (const lutad of [true, false]) {
      const s = ritadSynlighet({ vald: true, korvy: true, lutad });
      expect(s[RITAD_ID.kronor]).toBe(false);
      expect(s[RITAD_ID.trad]).toBe(true);
      expect(s[RITAD_ID.skog]).toBe(true);
      expect(s[RITAD_ID.bakgrund]).toBe(true);
    }
  });
  it('planeringen: platt = träd, lutad = skogen står upp (kronor) och träden göms', () => {
    const platt = ritadSynlighet({ vald: true, korvy: false, lutad: false });
    expect(platt[RITAD_ID.kronor]).toBe(false); expect(platt[RITAD_ID.trad]).toBe(true);
    const lutad = ritadSynlighet({ vald: true, korvy: false, lutad: true });
    expect(lutad[RITAD_ID.kronor]).toBe(true); expect(lutad[RITAD_ID.trad]).toBe(false);
  });
  it('körvyns whitelist släpper igenom allt utom kronorna', () => {
    expect(RITAD_KORVY_LAGER).not.toContain(RITAD_ID.kronor);
    expect(RITAD_KORVY_LAGER.length).toBe(RITAD_LAGER.length - 1);
  });
  it('lutad = över LUTAD_PITCH', () => {
    expect(arLutad(LUTAD_PITCH)).toBe(false);
    expect(arLutad(LUTAD_PITCH + 1)).toBe(true);
    expect(arLutad(Number.NaN)).toBe(false);
  });
});

describe('lagren', () => {
  it('är giltiga enligt MapLibres stil-spec (ett fel här syns annars först i maskinen)', () => {
    const geo = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    const stil = {
      version: 8, sources: { ...grundKallor(), [RITAD_KALLA.trad]: geo, [RITAD_KALLA.kronor]: geo, [RITAD_KALLA.skog]: { type: 'image', url: 'x.png', coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] } },
      layers: [...grundLager(), { id: RITAD_ID.skog, type: 'raster', source: RITAD_KALLA.skog }, kronorLager(), tradLager()],
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
    expect(lagerRang({ id: 'ritad-trad' })).toBeGreaterThan(lagerRang({ id: 'ritad-vag' }));
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
    expect(page).toContain("if (korvyBasKarta === 'ritad') for (const id of RITAD_KORVY_LAGER) SHOW.add(id);");
    expect(page).not.toMatch(/KEEP_PREFIX = \[[^\]]*'ritad-'/);
  });
  it('hooken anropas efter körvyns whitelist (dess synlighet ska sättas sist)', () => {
    expect(page.indexOf('useRitadKarta({')).toBeGreaterThan(page.indexOf("if (korvyBasKarta === 'ritad')"));
  });
});
