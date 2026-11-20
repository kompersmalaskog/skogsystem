import { describe, it, expect } from 'vitest';
import { medMarkeringar, markeringTraffar, hogPrickar, lasMarkeringRad, type HogMarkering, type HogIn } from './skotarHogarKvar';

const M = 1 / 111_320; // en meter i latitud
const hog = (dy: number, sv: Record<string, number>): HogIn => ({ lat: 57 + dy * M, lng: 15, sortimentVolym: sv });
const orord = (h: HogIn[]) => h.map((x) => {
  const totalt = Object.values(x.sortimentVolym).reduce((s, v) => s + v, 0);
  return { kvar: { ...x.sortimentVolym }, totalt, andel: 1 };
});
const punkt = (dy: number, typ: 'tagen' | 'kvar', grupp: HogMarkering['grupp'] = null, tid = '2026-11-01T10:00:00Z'): HogMarkering =>
  ({ id: `${typ}${dy}${tid}`, typ, geometri: { type: 'Point', coordinates: [15, 57 + dy * M] }, bredd_m: 8, grupp, skapad_at: tid });

describe('markeringTraffar', () => {
  it('punkt träffar högen inom 4 m men inte 6 m', () => {
    expect(markeringTraffar(punkt(0, 'tagen'), hog(3, {}))).toBe(true);
    expect(markeringTraffar(punkt(0, 'tagen'), hog(6, {}))).toBe(false);
  });
  it('streck träffar inom halva bredden från linjen, också mitt på en sträcka', () => {
    const kx = M / Math.cos((57 * Math.PI) / 180);
    const linje: HogMarkering = { id: 'l', typ: 'tagen', bredd_m: 8, grupp: null, skapad_at: '', geometri: { type: 'LineString', coordinates: [[15 - 50 * kx, 57], [15 + 50 * kx, 57]] } };
    expect(markeringTraffar(linje, hog(3.9, {}))).toBe(true);
    expect(markeringTraffar(linje, hog(4.5, {}))).toBe(false);
    expect(markeringTraffar(linje, { lat: 57, lng: 15 + 60 * kx })).toBe(false); // bortom linjens ände
  });
});

describe('medMarkeringar', () => {
  const hogar = [hog(0, { 'Timmer: A': 4, 'Massa: B': 2 }), hog(30, { 'Timmer: A': 3 })];
  it('tagen tömmer högen under markeringen och bara den', () => {
    const r = medMarkeringar(hogar, orord(hogar), [punkt(0, 'tagen')]);
    expect(r[0].totalt).toBe(0);
    expect(r[1].totalt).toBe(3);
  });
  it('tagen med grupp tar bara det sortimentet', () => {
    const r = medMarkeringar(hogar, orord(hogar), [punkt(0, 'tagen', 'timmer')]);
    expect(r[0].kvar).toEqual({ 'Timmer: A': 0, 'Massa: B': 2 });
  });
  it('kvar gör högen hel igen även när appen räknat bort den', () => {
    const appen = [{ kvar: { 'Timmer: A': 0, 'Massa: B': 0 }, totalt: 0, andel: 0 }, orord(hogar)[1]];
    const r = medMarkeringar(hogar, appen, [punkt(0, 'kvar')]);
    expect(r[0].totalt).toBe(6);
  });
  it('senaste markeringen vinner, oavsett ordningen i listan', () => {
    const r = medMarkeringar(hogar, orord(hogar), [punkt(0, 'kvar', null, '2026-11-01T11:00:00Z'), punkt(0, 'tagen', null, '2026-11-01T10:00:00Z')]);
    expect(r[0].totalt).toBe(6);
  });
  it('rör inte indata', () => {
    const in0 = orord(hogar);
    medMarkeringar(hogar, in0, [punkt(0, 'tagen')]);
    expect(in0[0].totalt).toBe(6);
    expect(hogar[0].sortimentVolym['Timmer: A']).toBe(4);
  });
});

describe('hogPrickar med markeringar', () => {
  it('en hög som markerats tagen försvinner från kartan', () => {
    const f = [{ geometry: { coordinates: [15, 57] }, properties: { sortimentVolymJson: JSON.stringify({ 'Timmer: A': 4 }) } }];
    expect(hogPrickar(f, [], 'alla')).toHaveLength(1);
    expect(hogPrickar(f, [], 'alla', [punkt(0, 'tagen')])).toHaveLength(0);
  });
});

describe('lasMarkeringRad', () => {
  it('läser en riktig rad och avvisar okänd typ eller geometri', () => {
    expect(lasMarkeringRad({ id: 'a', typ: 'tagen', geometri: { type: 'Point', coordinates: [15, 57] }, bredd_m: 8, grupp: null, skapad_at: 't' })?.typ).toBe('tagen');
    expect(lasMarkeringRad({ id: 'a', typ: 'flyttad', geometri: { type: 'Point', coordinates: [15, 57] } })).toBeNull();
    expect(lasMarkeringRad({ id: 'a', typ: 'tagen', geometri: { type: 'MultiPolygon', coordinates: [] } })).toBeNull();
    expect(lasMarkeringRad({ id: 'a', typ: 'tagen', geometri: { type: 'Point', coordinates: [15, 57] }, grupp: 'ved' })).toBeNull();
  });
});

import { hogarIOmrade, iRing } from './skotarHogarKvar';
describe('hogarIOmrade', () => {
  const kx = M / Math.cos((57 * Math.PI) / 180);
  const ring: [number, number][] = [[15 - 20 * kx, 57 - 20 * M], [15 + 20 * kx, 57 - 20 * M], [15 + 20 * kx, 57 + 20 * M], [15 - 20 * kx, 57 + 20 * M]];
  const f = (dx: number, sv: Record<string, number>) => ({ geometry: { coordinates: [15 + dx * kx, 57] }, properties: { sortimentVolymJson: JSON.stringify(sv) } });
  it('summerar bara högarna inne i ringen, per grupp, och raderna går ihop', () => {
    const r = hogarIOmrade([f(0, { 'Timmer: A': 10.4, 'Massa: B': 3.4 }), f(5, { 'Massa: B': 2.4 }), f(50, { 'Timmer: A': 99 })], [], [], ring);
    expect(r.hogar).toBe(2);
    expect(r.grupper).toEqual([{ grupp: 'timmer', namn: 'Timmer', m3: 10 }, { grupp: 'massa', namn: 'Massaved', m3: 6 }]);
    expect(r.kvar).toBe(16);
    expect(r.skordat).toBe(16);
  });
  it('en markering tagen över området tömmer kvar men inte skördat', () => {
    const m: HogMarkering = { id: 'p', typ: 'tagen', bredd_m: 8, grupp: null, skapad_at: 't', geometri: { type: 'Polygon', coordinates: [ring] } };
    const r = hogarIOmrade([f(0, { 'Timmer: A': 10 })], [], [m], ring);
    expect(r.kvar).toBe(0);
    expect(r.grupper).toEqual([]);
    expect(r.skordat).toBe(10);
  });
  it('iRing: punkt utanför och för få hörn', () => {
    expect(iRing({ lng: 15, lat: 57 }, ring)).toBe(true);
    expect(iRing({ lng: 15 + 30 * kx, lat: 57 }, ring)).toBe(false);
    expect(iRing({ lng: 15, lat: 57 }, ring.slice(0, 2))).toBe(false);
  });
});
