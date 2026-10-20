import { describe, expect, it, vi } from 'vitest';
import { VIDA_SAKNAS_TEXT, arVidaVo, lasVidaLager, skapaFornyare } from './vidaLager';

const svar = (data: any, error: any = null) => () => Promise.resolve({ data, error });
const fc = (n: number) => ({ geometri: { features: Array.from({ length: n }, (_, i) => ({ id: i })) } });

describe('lasVidaLager — fel är aldrig "saknas"', () => {
  it('hämtfel → fel (med orsaken), även om data skulle följa med', async () => {
    expect(await lasVidaLager(svar(null, { message: 'Failed to fetch' }))).toEqual({ status: 'fel', orsak: 'Failed to fetch', sessionMisstankt: false });
    expect((await lasVidaLager(svar(fc(3), { message: 'x' }))).status).toBe('fel');
  });
  it('ett kast (nätet försvann mitt i anropet) → fel', async () => {
    expect(await lasVidaLager(() => Promise.reject(new Error('Network request failed')))).toEqual({ status: 'fel', orsak: 'Network request failed', sessionMisstankt: false });
    expect((await lasVidaLager(() => { throw new Error('sync'); })).status).toBe('fel');
  });
  it('svaret kom men trakten har ingen geometri → saknas (ingen rad ska visas för det)', async () => {
    expect(await lasVidaLager(svar(null))).toEqual({ status: 'saknas' });
    expect(await lasVidaLager(svar({ geometri: null }))).toEqual({ status: 'saknas' });
    expect(await lasVidaLager(svar({ geometri: { features: [] } }))).toEqual({ status: 'saknas' });
    expect(await lasVidaLager(svar({ geometri: { features: 'trasig' } }))).toEqual({ status: 'saknas' });
  });
  it('geometri finns → finns, med samlingen', async () => {
    const r = await lasVidaLager(svar(fc(2)));
    expect(r.status).toBe('finns');
    expect(r.status === 'finns' && r.fc.features).toHaveLength(2);
  });
  it('texten säger vad som inte larmar', () => {
    expect(VIDA_SAKNAS_TEXT).toBe('Vidas lager saknas – kraftledning och hänsyn larmar inte');
  });
});

describe('Vida-trakt (numeriskt vo_nummer) vs P-VO: tomt svar', () => {
  it('arVidaVo: numeriskt = Vida, P-VO/k-nummer/tomt = inte', () => {
    expect(arVidaVo('11166440')).toBe(true);
    expect(arVidaVo(' 11271849 ')).toBe(true);
    for (const v of ['P-1018', 'p-1019', 'k123', '', '  ', null, undefined, '1116x6440']) expect(arVidaVo(v as any), String(v)).toBe(false);
  });
  it('Vida-trakt + tomt svar (utan fel) → FEL, inte saknas — för varje form av tomt', async () => {
    for (const tomt of [null, { geometri: null }, { geometri: { features: [] } }, { geometri: { features: 'x' } }]) {
      const r = await lasVidaLager(svar(tomt), { forvantas: true });
      expect(r.status).toBe('fel');
    }
  });
  it('P-VO + tomt svar → saknas på riktigt (ingen rad)', async () => {
    expect(await lasVidaLager(svar(null), { forvantas: false })).toEqual({ status: 'saknas' });
    expect(await lasVidaLager(svar({ geometri: { features: [] } }))).toEqual({ status: 'saknas' });
  });
  it('Vida-trakt med geometri → finns (forvantas ändrar inget för ett riktigt svar)', async () => {
    expect((await lasVidaLager(svar(fc(2)), { forvantas: true })).status).toBe('finns');
  });
});

describe('utgången session förnyas före nytt försök', () => {
  it('Vida-trakt: tomt → förnya → nytt försök ger geometri → finns', async () => {
    const hamta = vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: fc(2), error: null });
    const forny = vi.fn().mockResolvedValue({});
    const r = await lasVidaLager(hamta, { forvantas: true, forny });
    expect(forny).toHaveBeenCalledTimes(1);
    expect(hamta).toHaveBeenCalledTimes(2);
    expect(forny.mock.invocationCallOrder[0]).toBeLessThan(hamta.mock.invocationCallOrder[1]);   // förnyelsen FÖRE nya försöket
    expect(r.status).toBe('finns');
  });
  it('Vida-trakt: förnyelsen hjälper inte (geometrin saknas på riktigt) → fortfarande fel, och högst en förnyelse per hämtning', async () => {
    const hamta = vi.fn().mockResolvedValue({ data: null, error: null });
    const forny = vi.fn().mockResolvedValue({});
    const r = await lasVidaLager(hamta, { forvantas: true, forny });
    expect(r.status).toBe('fel');
    expect(forny).toHaveBeenCalledTimes(1);
    expect(hamta).toHaveBeenCalledTimes(2);
  });
  it('auth-fel (JWT expired) → förnya och försök igen', async () => {
    const hamta = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } }).mockResolvedValueOnce({ data: fc(1), error: null });
    const forny = vi.fn().mockResolvedValue({});
    expect((await lasVidaLager(hamta, { forny })).status).toBe('finns');
    expect(forny).toHaveBeenCalledTimes(1);
  });
  it('vanligt nätfel och P-VO-tomt förnyar INTE (ingen onödig förnyelse)', async () => {
    const forny = vi.fn().mockResolvedValue({});
    await lasVidaLager(svar(null, { message: 'Failed to fetch' }), { forvantas: true, forny });
    await lasVidaLager(svar(null), { forvantas: false, forny });
    await lasVidaLager(svar(fc(1)), { forvantas: true, forny });
    expect(forny).not.toHaveBeenCalled();
  });
  it('förnyelsen kastar (inget nät): hämtningen görs ändå om och felet består', async () => {
    const hamta = vi.fn().mockResolvedValue({ data: null, error: null });
    const r = await lasVidaLager(hamta, { forvantas: true, forny: () => Promise.reject(new Error('offline')) });
    expect(r.status).toBe('fel');
    expect(hamta).toHaveBeenCalledTimes(2);
  });
  it('skapaFornyare: högst en förnyelse per minut', async () => {
    let t = 0;
    const refresh = vi.fn().mockResolvedValue({});
    const forny = skapaFornyare(refresh, 60000, () => t);
    await forny(); await forny();
    expect(refresh).toHaveBeenCalledTimes(1);
    t = 59999; await forny();
    expect(refresh).toHaveBeenCalledTimes(1);
    t = 60000; await forny();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
