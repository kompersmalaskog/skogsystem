import { describe, expect, it } from 'vitest';
import { VIDA_SAKNAS_TEXT, lasVidaLager } from './vidaLager';

const svar = (data: any, error: any = null) => () => Promise.resolve({ data, error });
const fc = (n: number) => ({ geometri: { features: Array.from({ length: n }, (_, i) => ({ id: i })) } });

describe('lasVidaLager — fel är aldrig "saknas"', () => {
  it('hämtfel → fel (med orsaken), även om data skulle följa med', async () => {
    expect(await lasVidaLager(svar(null, { message: 'Failed to fetch' }))).toEqual({ status: 'fel', orsak: 'Failed to fetch' });
    expect((await lasVidaLager(svar(fc(3), { message: 'x' }))).status).toBe('fel');
  });
  it('ett kast (nätet försvann mitt i anropet) → fel', async () => {
    expect(await lasVidaLager(() => Promise.reject(new Error('Network request failed')))).toEqual({ status: 'fel', orsak: 'Network request failed' });
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
