// Rutten mot en RIKTIG GeoTIFF (skriven med geotiff.js) i stället för Skogsstyrelsen: begäran, tolkningen av
// svaret, uppslaget av rutorna och vakten mot orimliga värden. Själva tjänsten går inte att nå från testerna.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { tillSweref, utsnitt } from '@/lib/laserGrundytaRutnat';

const PUNKTER: [number, number][] = [[15.5, 57.0], [15.5001, 57.0], [15.5003, 57.0002]];

function tiff(bredd: number, hojd: number, g: (i: number) => number, dag: (i: number) => number, dia: (i: number) => number = () => 14): ArrayBuffer {
  const v = new Float32Array(bredd * hojd * 3);
  for (let i = 0; i < bredd * hojd; i++) { v[3 * i] = g(i); v[3 * i + 1] = dia(i); v[3 * i + 2] = dag(i); }
  return writeArrayBuffer(v as unknown as number[], {
    width: bredd, height: hojd, SamplesPerPixel: 3, BitsPerSample: [32, 32, 32], SampleFormat: [3, 3, 3], PlanarConfiguration: 1,
  }) as ArrayBuffer;
}

const anrop = (body: unknown) =>
  POST(new NextRequest('http://x/api/laser-grundyta', { method: 'POST', body: JSON.stringify(body) }));

let begard: string | null = null;
function svara(buf: ArrayBuffer | null, typ = 'image/tiff', status = 200) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    begard = url;
    return new Response(buf ?? 'fel', { status, headers: { 'content-type': typ } });
  }));
}

beforeEach(() => {
  process.env.SKS_WMS_USER = 'u';
  process.env.SKS_WMS_PASS = 'p';
  begard = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/api/laser-grundyta', () => {
  it('begär band 2, 3 och 7 på jämna 10 m och svarar med en rad per ruta', async () => {
    const u = utsnitt(tillSweref(PUNKTER))!;
    svara(tiff(u.bredd, u.hojd, (i) => 20 + i, () => 19000));
    const r = await anrop({ punkter: PUNKTER });
    expect(r.status).toBe(200);
    const data = await r.json();
    const q = new URL(begard!).searchParams;
    expect(q.get('bandIds')).toBe('2,3,7');
    expect(q.get('size')).toBe(`${u.bredd},${u.hojd}`);
    expect(q.get('bbox')!.split(',').every((t) => Number(t) % 10 === 0)).toBe(true);
    expect(data.rutor.length).toBeGreaterThan(0);
    expect(data.rutor.length).toBeLessThanOrEqual(PUNKTER.length);
    for (const [g, dia, d] of data.rutor) { expect(g).toBeGreaterThanOrEqual(20); expect(dia).toBe(14); expect(d).toBe(19000); }
  });

  it('nodata blir null, aldrig 0', async () => {
    const u = utsnitt(tillSweref(PUNKTER))!;
    svara(tiff(u.bredd, u.hojd, () => -9999, () => -9999, () => -9999));
    const data = await (await anrop({ punkter: PUNKTER })).json();
    expect(data.rutor.every(([g, dia, d]: [unknown, unknown, unknown]) => g === null && dia === null && d === null)).toBe(true);
  });

  it('orimliga värden (banden har bytt plats) är ett fel, aldrig ett tal', async () => {
    const u = utsnitt(tillSweref(PUNKTER))!;
    svara(tiff(u.bredd, u.hojd, () => 19000, () => 20));
    const r = await anrop({ punkter: PUNKTER });
    expect(r.status).toBe(502);
    // Diametern på dagens plats (ett datum som diameter) är också ett fel.
    svara(tiff(u.bredd, u.hojd, () => 20, () => 19000, () => 19000));
    expect((await anrop({ punkter: PUNKTER })).status).toBe(502);
  });

  it('en bild med fel storlek är ett fel', async () => {
    svara(tiff(1, 1, () => 20, () => 19000));
    expect((await anrop({ punkter: PUNKTER })).status).toBe(502);
  });

  it('ett felsvar från Skogsstyrelsen är ett fel', async () => {
    svara(null, 'application/json', 200);
    expect((await anrop({ punkter: PUNKTER })).status).toBe(502);
  });

  it('dålig begäran och saknad inloggning', async () => {
    expect((await anrop({ punkter: [] })).status).toBe(400);
    expect((await anrop({ punkter: [[1, 'x']] })).status).toBe(400);
    delete process.env.SKS_WMS_USER;
    expect((await anrop({ punkter: PUNKTER })).status).toBe(500);
  });
});
