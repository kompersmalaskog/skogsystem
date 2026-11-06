import { afterEach, describe, expect, it, vi } from 'vitest';
import { utanCache } from './tjanst';

afterEach(() => vi.unstubAllGlobals());

describe('tjanstKlient läser aldrig ur Next.js datacache', () => {
  it('varje anrop går med cache: no-store, och det som skickades med följer med', async () => {
    const f = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', f);
    await utanCache('https://x/rest/v1/skotar_lank_avlagg', { method: 'GET', headers: { a: 'b' } });
    expect(f).toHaveBeenCalledWith('https://x/rest/v1/skotar_lank_avlagg', { method: 'GET', headers: { a: 'b' }, cache: 'no-store' });
  });
  it('klienten skapas med den fetchen', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('lib/besok/tjanst.ts', 'utf8'));
    expect(src).toMatch(/global:\s*\{\s*fetch:\s*utanCache\s*\}/);
  });
});
