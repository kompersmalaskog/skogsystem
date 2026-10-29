// Rutten mot en RIKTIG GeoTIFF (skriven med geotiff.js) i stället för Skogsstyrelsen, som inte går att nå från testerna.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { NextRequest } from 'next/server';

let inloggad = true;
vi.mock('@/lib/auth/server', () => ({
  kravInloggad: async () => (inloggad ? { ok: true } : { ok: false, res: new Response('nej', { status: 401 }) }),
}));
import { POST } from './route';
import { utsnittForRingar } from '@/lib/ritadKarta/skog';

const RING: [number, number][] = [[14.6, 56.5], [14.605, 56.5], [14.605, 56.503], [14.6, 56.5]];

function tiff(bredd: number, hojd: number, h: (i: number) => number, dag: (i: number) => number): ArrayBuffer {
  const v = new Float32Array(bredd * hojd * 2);
  for (let i = 0; i < bredd * hojd; i++) { v[2 * i] = h(i); v[2 * i + 1] = dag(i); }
  return writeArrayBuffer(v as unknown as number[], { width: bredd, height: hojd, SamplesPerPixel: 2, BitsPerSample: [32, 32], SampleFormat: [3, 3], PlanarConfiguration: 1 }) as ArrayBuffer;
}
let begard: string | null = null;
function svara(buf: ArrayBuffer | null, typ = 'image/tiff', status = 200) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { begard = url; return new Response(buf ?? 'fel', { status, headers: { 'content-type': typ } }); }));
}
const anrop = (body: unknown) => POST(new NextRequest('http://x/api/ritad-karta/laser', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => { inloggad = true; process.env.SKS_WMS_USER = 'u'; process.env.SKS_WMS_PASS = 'p'; begard = null; vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/api/ritad-karta/laser', () => {
  it('begär höjd och skanningsdag (band 1 och 7) för trakten + 300 m och svarar med en höjd per ruta och året', async () => {
    const u = utsnittForRingar([RING])!;
    const dag2021 = Math.floor(Date.UTC(2021, 5, 1) / 86_400_000);
    svara(tiff(u.bredd, u.hojd, (i) => (i === 0 ? -9999 : 180), () => dag2021));
    const r = await anrop({ ringar: [RING] });
    expect(r.status).toBe(200);
    const d = await r.json();
    const q = new URL(begard!).searchParams;
    expect(q.get('bandIds')).toBe('1,7');
    expect(q.get('size')).toBe(`${u.bredd},${u.hojd}`);
    expect(d).toMatchObject({ minX: u.minX, maxY: u.maxY, bredd: u.bredd, hojd: u.hojd, ar: 2021 });
    expect(d.hojdDm[0]).toBeNull();
    expect(d.hojdDm[1]).toBe(180);
  });
  it('orimliga höjder (banden bytt plats) är ett fel, aldrig en karta', async () => {
    const u = utsnittForRingar([RING])!;
    svara(tiff(u.bredd, u.hojd, () => 19000, () => 19000));
    expect((await anrop({ ringar: [RING] })).status).toBe(502);
  });
  it('utloggad 401, fel indata 400, Skogsstyrelsen svarar fel 502', async () => {
    inloggad = false;
    expect((await anrop({ ringar: [RING] })).status).toBe(401);
    inloggad = true;
    expect((await anrop({ ringar: 'x' })).status).toBe(400);
    svara(null, 'text/html', 500);
    expect((await anrop({ ringar: [RING] })).status).toBe(502);
  });
});
