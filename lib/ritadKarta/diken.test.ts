import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { dikeFilter, dikeSlag, raderTillDiken, visasDike, arDikeFC } from './diken';
import { RITAD_DIKE_ID, RITAD_LAGER, grundKallor, grundLager } from './lager';
import { DIKE_FARG, VAG_FARG } from './stil';
import { lagerRang } from '../lagerOrdning';
// @ts-expect-error — skriptet är .mjs utan typer
import { tillRad } from '../../scripts/diken-import.mjs';

describe('dikena (Naturvårdsverkets dikeskarta)', () => {
  it('sorterna läses på ordet', () => {
    expect(dikeSlag('Skogsdike')).toBe('skog');
    expect(dikeSlag('Dike på jordbruksmark')).toBe('aker');
    expect(dikeSlag('Åkerdike')).toBe('aker');
    expect(dikeSlag('Dike på öppen våtmark')).toBe('myr');
    expect(dikeSlag('Vägdike')).toBe('vag');
    expect(dikeSlag(null)).toBe('ovrigt');
  });

  it('vägdiken ritas inte (de dubblade vägen)', () => {
    expect(visasDike('vag')).toBe(false);
    const fc = raderTillDiken([
      { typ: 'Skogsdike', coords: [[[15, 56], [15.001, 56.001]]] },
      { typ: 'Vägdike', coords: [[[15, 56], [15.001, 56.001]]] },
      { typ: 'Skogsdike', coords: [[[15, 56]]] },
      { typ: 'Övrigt dike', coords: [[[15, 56], [15.001, 56.001]], [[15.01, 56], [15.011, 56.001]]] },
    ]);
    expect(fc.features.map((f) => f.properties.s)).toEqual(['skog', 'ovrigt', 'ovrigt']);
    expect(arDikeFC(fc)).toBe(true);
  });

  it('filtret tar diken vars ruta överlappar trakten', () => {
    const f = dikeFilter({ minLat: 56, maxLat: 57, minLon: 15, maxLon: 16 });
    expect(f).toEqual([
      { kol: 'max_lat', op: 'gte', v: 56 }, { kol: 'min_lat', op: 'lte', v: 57 },
      { kol: 'max_lng', op: 'gte', v: 15 }, { kol: 'min_lng', op: 'lte', v: 16 },
    ]);
  });

  it('importen: en feature → en rad med ruta, multilinjer behålls, utan id ingen rad', () => {
    const r = tillRad({ properties: { DIKE_ID: '42', TYP: 'Skogsdike', LANGD_M: 120.5 }, geometry: { type: 'MultiLineString', coordinates: [[[15.1234567, 56.1], [15.2, 56.2]], [[15.3, 56.0], [15.31, 56.05]]] } });
    expect(r.id).toBe(42);
    expect(r.typ).toBe('Skogsdike');
    expect(r.coords[0][0]).toEqual([15.123457, 56.1]);
    expect([r.min_lat, r.max_lat, r.min_lng, r.max_lng]).toEqual([56.0, 56.2, 15.123457, 15.31]);
    expect(tillRad({ properties: {}, geometry: { type: 'LineString', coordinates: [[15, 56], [15.1, 56.1]] } })).toBeNull();
  });

  it('ljust blått, inte vägarnas grus; lagren ovanpå blött men under vägarna', () => {
    expect(Object.values(VAG_FARG)).not.toContain(DIKE_FARG);
    expect(RITAD_LAGER).toContain(RITAD_DIKE_ID.dike);
    expect(Object.keys(grundKallor())).toContain('ritad-diken');
    expect(grundLager().some((l: any) => l.id === RITAD_DIKE_ID.dike)).toBe(true);
    const r = (id: string) => lagerRang({ id } as any);
    expect(r('ritad-dike')).toBeGreaterThan(r('ritad-blott-tat'));
    expect(r('ritad-dike-kant')).toBeLessThan(r('ritad-dike'));
    expect(r('ritad-dike')).toBeLessThan(r('ritad-vag-kant'));
  });

  it('dikena läses på servern, tabellen skrivs bara av importen', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '../../app/api/ritad-karta/diken/route.ts'), 'utf8');
    expect(route).toContain('kravInloggad');
    const mig = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261103122449_ritad_dike.sql'), 'utf8');
    expect(mig).toContain('revoke insert, update, delete, truncate on public.dike from anon, authenticated');
  });

  it('det beräknade lagret heter inte längre Diken', () => {
    for (const f of ['../../app/planering/page.tsx', '../mapLayers.ts', '../../components/KartLagerMeny.tsx']) {
      expect(fs.readFileSync(path.resolve(__dirname, f), 'utf8')).not.toContain('Diken & vattendrag');
    }
  });
});
