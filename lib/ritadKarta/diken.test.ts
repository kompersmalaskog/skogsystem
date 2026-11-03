import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { rutaArgument, dikeSlag, raderTillDiken, visasDike, arDikeFC } from './diken';
import { RITAD_DIKE_ID, RITAD_LAGER, grundKallor, grundLager } from './lager';
import { DIKE_FARG, VAG_FARG } from './stil';
import { lagerRang } from '../lagerOrdning';
import { arVagdike, lanUrFil, radId, tillRad } from '../../scripts/diken-import.mjs';

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

  it('rutan går till dike_i_ruta med rätt axlar, och routen frågar via rutans index (inte fyra kolumnfilter)', () => {
    expect(rutaArgument({ minLat: 56, maxLat: 57, minLon: 15, maxLon: 16 })).toEqual({ p_min_lng: 15, p_min_lat: 56, p_max_lng: 16, p_max_lat: 57 });
    const route = fs.readFileSync(path.resolve(__dirname, '../../app/api/ritad-karta/diken/route.ts'), 'utf8');
    expect(route).toContain("rpc('dike_i_ruta'");
    expect(route).not.toContain(".from('dike')");
    const mig = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261103150307_ritad_dike_ruta.sql'), 'utf8');
    expect(mig).toContain('using gist (box(point(min_lng, min_lat), point(max_lng, max_lat)))');
  });

  it('importen sparar inte vägdiken — samma regel som appens (Naturvårdsverkets riktiga typer)', () => {
    for (const typ of ['Skogsdike', 'Vägdike', 'Övrigt dike', 'Dike på åkermark', 'Dike på öppen våtmark', null, '']) {
      expect(arVagdike(typ)).toBe(!visasDike(dikeSlag(typ)));
    }
    expect(arVagdike('Vägdike')).toBe(true);
    expect(arVagdike('Skogsdike')).toBe(false);
    expect(dikeSlag('Dike på öppen våtmark')).toBe('myr');
    expect(dikeSlag('Dike på åkermark')).toBe('aker');
  });

  it('importen: en feature → en rad med ruta, multilinjer behålls, utan id ingen rad', () => {
    const r = tillRad({ properties: { DIKE_ID: '42', TYP: 'Skogsdike', LANGD_M: 120.5 }, geometry: { type: 'MultiLineString', coordinates: [[[15.1234567, 56.1], [15.2, 56.2]], [[15.3, 56.0], [15.31, 56.05]]] } }, 'G')!;
    expect(r.id).toBe(70_000_042);
    expect(r.typ).toBe('Skogsdike');
    expect(r.coords[0][0]).toEqual([15.123457, 56.1]);
    expect([r.min_lat, r.max_lat, r.min_lng, r.max_lng]).toEqual([56.0, 56.2, 15.123457, 15.31]);
    expect(tillRad({ properties: {}, geometry: { type: 'LineString', coordinates: [[15, 56], [15.1, 56.1]] } }, 'G')).toBeNull();
    expect(tillRad({ properties: { DIKE_ID: 1 }, geometry: { type: 'LineString', coordinates: [[15, 56], [15.1, 56.1]] } }, undefined)).toBeNull();
  });

  it('Dike_ID börjar om i varje län: samma nummer i två län blir två rader (Martin 2026-11-03, 1,7 miljoner diken blev 975 000)', () => {
    expect(radId('G', 1)).not.toBe(radId('H', 1));
    expect(radId('K', 1059661)).toBe(101_059_661);
    expect(radId('G', 9_999_999)).toBeLessThan(radId('H', 0)!);
    expect(radId('G', 10_000_000)).toBeNull();
    expect(radId('Q', 1)).toBeNull();
    expect(lanUrFil('diken/dike_H.geojsonl')).toBe('H');
    expect(lanUrFil('diken/dike_AC.geojsonl')).toBe('AC');
    expect(lanUrFil('diken/annat.geojsonl')).toBeNull();
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
