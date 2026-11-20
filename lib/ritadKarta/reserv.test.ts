// Ritad utan nät: nät först, det sparade som reserv (lib/ritadKarta/reserv).
import { describe, it, expect, beforeEach } from 'vitest';
import { medReserv, lasSparat } from './reserv';

let lager: Map<string, string>;
beforeEach(() => {
  lager = new Map();
  (globalThis as any).caches = {
    open: async () => ({
      match: async (k: string) => (lager.has(k) ? { json: async () => JSON.parse(lager.get(k)!) } : undefined),
      put: async (k: string, r: Response) => { lager.set(k, await r.text()); },
    }),
  };
});

describe('medReserv', () => {
  it('med nät: färskt svar, och det sparas', async () => {
    expect(await medReserv('laser/a', async () => ({ ok: true, varde: { ar: 2021 } }))).toEqual({ varde: { ar: 2021 }, sparat: false });
    expect(await lasSparat('laser/a')).toEqual({ ar: 2021 });
  });
  it('utan nät (kastar): det sparade', async () => {
    await medReserv('laser/a', async () => ({ ok: true, varde: { ar: 2021 } }));
    expect(await medReserv('laser/a', async () => { throw new Error('offline'); })).toEqual({ varde: { ar: 2021 }, sparat: true });
  });
  it('servern säger nej: det sparade; finns inget: null', async () => {
    expect(await medReserv('laser/b', async () => ({ ok: false }))).toBeNull();
    await medReserv('laser/b', async () => ({ ok: true, varde: 1 }));
    expect(await medReserv('laser/b', async () => ({ ok: false }))).toEqual({ varde: 1, sparat: true });
  });
  it('ett nytt svar ersätter det gamla', async () => {
    await medReserv('k', async () => ({ ok: true, varde: 'gammal' }));
    await medReserv('k', async () => ({ ok: true, varde: 'ny' }));
    expect(await lasSparat('k')).toBe('ny');
  });
});
