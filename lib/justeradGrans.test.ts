// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { byggJusteradeDelar, justeradSignatur, JUSTERAD_MARGINAL_M, type LngLat } from './justeradGrans';
import { synkaJusteradGrans, raknaOmEfterGransandring } from './justeradGransSynk';

// Vidas del: en kvadrat vid Brokamåla. tillLatLon = sidans svgToLatLon i förenklad form (origo + meter).
const VIDA = [{ ringLngLat: [[14.470, 56.300], [14.472, 56.300], [14.472, 56.302], [14.470, 56.302]] as LngLat[] }];
const ORIGO = { lat: 56.301, lng: 14.471 };
const tillLatLon = (x: number, y: number) => ({ lat: ORIGO.lat - (y * 0.1) / 111320, lon: ORIGO.lng + (x * 0.1) / (111320 * Math.cos((ORIGO.lat * Math.PI) / 180)) });
const sv = (lat: number, lng: number) => ({ x: ((lng - ORIGO.lng) * 111320 * Math.cos((ORIGO.lat * Math.PI) / 180)) / 0.1, y: (-(lat - ORIGO.lat) * 111320) / 0.1 });
const marker = (id: number, fran: string, hornLngLat: LngLat[], extra: Record<string, unknown> = {}) => ({ id, isLine: true, lineType: 'boundary', fromVidaTd: fran, path: hornLngLat.map(([lng, lat]) => sv(lat, lng)), ...extra });

describe('byggJusteradeDelar', () => {
  it('inga kopior → ok och tom lista', () => {
    expect(byggJusteradeDelar([], VIDA, tillLatLon)).toEqual({ ok: true, delar: [] });
  });
  it('en kopia → partKey + ring i lng/lat (avrundad, utan dubblett-slutpunkt)', () => {
    const hornen: LngLat[] = [[14.4701, 56.3001], [14.4719, 56.3001], [14.4719, 56.3019], [14.4701, 56.3019]];
    const r = byggJusteradeDelar([marker(1, '9775:0', [...hornen, hornen[0]])], VIDA, tillLatLon);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delar).toHaveLength(1);
    expect(r.delar[0].partKey).toBe('9775:0');
    expect(r.delar[0].ring).toHaveLength(4);   // slutpunkten borta
    r.delar[0].ring.forEach(([lng, lat], i) => { expect(lng).toBeCloseTo(hornen[i][0], 6); expect(lat).toBeCloseTo(hornen[i][1], 6); expect(String(lng).split('.')[1].length).toBeLessThanOrEqual(7); });
  });
  it('koordinaterna avrundas till 7 decimaler (signaturen darrar inte av flyttalsbrus)', () => {
    const brus = (x: number) => ({ lat: 56.30012345678912 + x * 0.0001, lon: 14.47012345678901 + x * 0.0001 });
    const r = byggJusteradeDelar([{ id: 1, isLine: true, lineType: 'boundary', fromVidaTd: 'a:0', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }], VIDA, brus);
    expect(r.ok && r.delar[0].ring[0]).toEqual([14.4701235, 56.3001235]);
  });
  it('en ring som efter slutpunkten bara har två hörn skickas inte', () => {
    const a: LngLat[] = [[14.4701, 56.3001], [14.4719, 56.3001], [14.4701, 56.3001]];   // a, b, a = två olika hörn
    const r = byggJusteradeDelar([marker(1, 'x:0', a)], VIDA, tillLatLon);
    expect(r).toEqual({ ok: true, delar: [] });
  });
  it('flera delar sorteras på partKey; egna områden (utan fromVidaTd), korta och fel linjer räknas inte', () => {
    const k: LngLat[] = [[14.4701, 56.3001], [14.4719, 56.3001], [14.4719, 56.3019]];
    const r = byggJusteradeDelar([
      marker(3, '9772:0', k), marker(2, '9372:0', k),
      { id: 4, isLine: true, lineType: 'boundary', path: k.map(([lng, lat]) => sv(lat, lng)) },          // eget område
      marker(5, '1:0', [[14.4701, 56.3001], [14.4719, 56.3001]]),                                        // två hörn
      { ...marker(6, '2:0', k), lineType: 'mainRoad' },                                                  // en väg
    ], VIDA, tillLatLon);
    expect(r.ok && r.delar.map((d) => d.partKey)).toEqual(['9372:0', '9772:0']);
  });
  it('två markörer för samma del: den senast ändrade gäller', () => {
    const a: LngLat[] = [[14.4701, 56.3001], [14.4719, 56.3001], [14.4719, 56.3019]];
    const b: LngLat[] = [[14.4702, 56.3002], [14.4718, 56.3002], [14.4718, 56.3018]];
    const r = byggJusteradeDelar([marker(1, 'x:0', a, { andradTs: 100 }), marker(2, 'x:0', b, { andradTs: 200 })], VIDA, tillLatLon);
    expect(r.ok && r.delar[0].ring[0][0]).toBeCloseTo(14.4702, 6);
  });
  it('origot fel (hörn långt från Vidas delar) → skriver INGET', () => {
    const ute: LngLat[] = [[14.4701 + 10 * (JUSTERAD_MARGINAL_M / 111320), 56.3001], [14.4719, 56.3001], [14.4719, 56.3019]];
    const r = byggJusteradeDelar([marker(1, 'x:0', ute)], VIDA, tillLatLon);
    expect(r.ok).toBe(false);
  });
  it('lite utanför (några tiotals meter) är en vanlig justering', () => {
    const lite: LngLat[] = [[14.4701 - 40 / 62000, 56.3001], [14.4719, 56.3001], [14.4719, 56.3019]];
    expect(byggJusteradeDelar([marker(1, 'x:0', lite)], VIDA, tillLatLon).ok).toBe(true);
  });
  it('Vidas delar inte lästa → vägrar; ogiltigt tal → vägrar', () => {
    const k: LngLat[] = [[14.4701, 56.3001], [14.4719, 56.3001], [14.4719, 56.3019]];
    expect(byggJusteradeDelar([marker(1, 'x:0', k)], [], tillLatLon)).toEqual({ ok: false, skal: 'Vidas traktdelar är inte lästa' });
    expect(byggJusteradeDelar([marker(1, 'x:0', k)], VIDA, () => ({ lat: NaN, lon: 14.47 })).ok).toBe(false);
  });
});

describe('justeradSignatur', () => {
  it('tom lista = tom text; samma delar = samma text', () => {
    expect(justeradSignatur([])).toBe('');
    const d = [{ partKey: 'a:0', ring: [[1, 2], [3, 4], [5, 6]] as LngLat[] }];
    expect(justeradSignatur(d)).toBe(justeradSignatur(JSON.parse(JSON.stringify(d))));
    expect(justeradSignatur(d)).not.toBe('');
  });
});

describe('synkaJusteradGrans', () => {
  const D = [{ partKey: 'a:0', ring: [[14.47, 56.3], [14.472, 56.3], [14.472, 56.302]] as LngLat[] }];
  const klient = (fel: { message: string } | null = null) => { const rpc = vi.fn(async () => ({ error: fel })); return { rpc, sb: { rpc } as any }; };
  beforeEach(() => { window.localStorage.clear(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  it('första gången med delar → skickar RPC och minns signaturen', async () => {
    const { rpc, sb } = klient();
    expect(await synkaJusteradGrans(sb, 'o1', D)).toBe('skickad');
    expect(rpc).toHaveBeenCalledWith('satt_justerad_traktgrans', { p_objekt: 'o1', p_delar: D });
    expect(window.localStorage.getItem('justerad_grans_synk_v1:o1')).toBe(justeradSignatur(D));
  });
  it('samma delar igen → skickar inget', async () => {
    const { rpc, sb } = klient();
    await synkaJusteradGrans(sb, 'o1', D);
    expect(await synkaJusteradGrans(sb, 'o1', D)).toBe('oforandrad');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('aldrig skickat och inget att skicka → skickar inget (ingen onödig radering)', async () => {
    const { rpc, sb } = klient();
    expect(await synkaJusteradGrans(sb, 'o2', [])).toBe('oforandrad');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('kopiorna raderade efter en sändning → tom lista skickas (Vidas gräns gäller igen)', async () => {
    const { rpc, sb } = klient();
    await synkaJusteradGrans(sb, 'o1', D);
    expect(await synkaJusteradGrans(sb, 'o1', [])).toBe('skickad');
    expect(rpc).toHaveBeenLastCalledWith('satt_justerad_traktgrans', { p_objekt: 'o1', p_delar: [] });
    expect(window.localStorage.getItem('justerad_grans_synk_v1:o1')).toBe('');
  });
  it('fel från servern (eller kast) → "fel", minnet orört så nästa försök skickar igen', async () => {
    const f = klient({ message: 'nej' });
    expect(await synkaJusteradGrans(f.sb, 'o1', D)).toBe('fel');
    expect(window.localStorage.getItem('justerad_grans_synk_v1:o1')).toBeNull();
    const kast = { rpc: vi.fn(() => { throw new Error('nät'); }) } as any;
    expect(await synkaJusteradGrans(kast, 'o1', D)).toBe('fel');
    expect((await (async () => { const k = klient(); return synkaJusteradGrans(k.sb, 'o1', D); })())).toBe('skickad');
  });
  it('en ändrad ring skickas om', async () => {
    const { rpc, sb } = klient();
    await synkaJusteradGrans(sb, 'o1', D);
    const ändrad = [{ partKey: 'a:0', ring: [[14.4701, 56.3], [14.472, 56.3], [14.472, 56.302]] as LngLat[] }];
    expect(await synkaJusteradGrans(sb, 'o1', ändrad)).toBe('skickad');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('räkna om: anropar traktanalysen och skogsdatan, och kastar aldrig', () => {
    const urler: string[] = [];
    raknaOmEfterGransandring((u) => { urler.push(u); return Promise.reject(new Error('nät')); });
    expect(urler).toEqual(['/api/cron/traktanalys', '/api/cron/skogsdata']);
    expect(() => raknaOmEfterGransandring(() => { throw new Error('x'); })).not.toThrow();
  });
});
