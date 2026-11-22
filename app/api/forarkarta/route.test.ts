// Flygfotots 512-rutor genom den RIKTIGA proxyn (fejkad upstream-fetch): rätt WMS-anrop, cachen skiljer storlekarna åt, 256 är oförändrat.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

let anrop: string[] = [];
beforeEach(() => {
  anrop = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    anrop.push(String(url));
    const jpeg = String(url).includes('image/jpeg');
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': jpeg ? 'image/jpeg' : 'image/png' } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const be = (q: string) => GET(new NextRequest(`https://app.exempel.se/api/forarkarta?${q}`));
const del = (u: string, n: string) => new URL(u).searchParams.get(n);

describe('/api/forarkarta — flygfoto', () => {
  it('utan s: 256 × 256 PNG, precis som förut', async () => {
    const r = await be('layer=ortofoto&z=16&x=35440&y=20242');
    expect(r.status).toBe(200); expect(r.headers.get('content-type')).toBe('image/png');
    expect(del(anrop[0], 'WIDTH')).toBe('256'); expect(del(anrop[0], 'HEIGHT')).toBe('256'); expect(del(anrop[0], 'FORMAT')).toBe('image/png');
  });
  it('s=512: samma markyta (BBOX) i 512 × 512, som JPEG', async () => {
    await be('layer=ortofoto&z=16&x=35441&y=20242');
    await be('layer=ortofoto&z=16&x=35441&y=20242&s=512');
    expect(anrop).toHaveLength(2);
    expect(del(anrop[1], 'BBOX')).toBe(del(anrop[0], 'BBOX'));
    expect(del(anrop[1], 'WIDTH')).toBe('512'); expect(del(anrop[1], 'HEIGHT')).toBe('512'); expect(del(anrop[1], 'FORMAT')).toBe('image/jpeg');
    expect(del(anrop[1], 'LAYERS')).toBe('Ortofoto_0.5');
  });
  it('cachen skiljer storlekarna åt: en 256-förfrågan får aldrig en 512-ruta (och tvärtom), och en upprepad 512 kommer ur cachen', async () => {
    const q = 'layer=ortofoto&z=17&x=70882&y=40485';
    const a = await be(q + '&s=512'); expect(a.headers.get('x-cache')).toBe('MISS');
    const b = await be(q); expect(b.headers.get('x-cache')).toBe('MISS'); expect(b.headers.get('content-type')).toBe('image/png');
    const c = await be(q + '&s=512'); expect(c.headers.get('x-cache')).toBe('HIT'); expect(c.headers.get('content-type')).toBe('image/jpeg');
    const d = await be(q); expect(d.headers.get('x-cache')).toBe('HIT'); expect(d.headers.get('content-type')).toBe('image/png');
    expect(anrop).toHaveLength(2);
  });
  it('maxzoom: zoom 18 fungerar med båda storlekarna, och Cache-Control är oförändrat', async () => {
    for (const s of ['', '&s=512']) {
      const r = await be(`layer=ortofoto&z=18&x=141764&y=80970${s}`);
      expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toContain('s-maxage=604800');
    }
  });
  it('s påverkar bara flygfotot: kartan och topokartan är alltid 256 PNG, och okända värden på s är 256', async () => {
    await be('z=15&x=17720&y=10121&s=512'); await be('layer=farg&z=15&x=17720&y=10121&s=512'); await be('layer=ortofoto&z=15&x=17720&y=10121&s=999');
    for (const u of anrop) { expect(del(u, 'WIDTH'), u).toBe('256'); expect(del(u, 'FORMAT'), u).toBe('image/png'); }
  });
});
