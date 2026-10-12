import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  byggKandidater, startaKandidatLaddning, hamtaKandidatSvar, KANDIDAT_STATUS, KANDIDAT_KOLUMNER,
  KANDIDAT_TIDSGRANS_MS, KANDIDAT_OMFORSOK_MS, KANDIDAT_UPPDATERA_MS, type KandidatSvar, type KandidatResultat,
} from './objektKandidater';

// KANDIDATLADDNINGEN. supabase-js KASTAR inte vid fel — den returnerar { data: null, error }. Förut lästes `data || []` och en tom lista räknades som
// "laddat", så avstämningen utvärderades mot tomma kandidater (Oskar, Rottne 2026-10-07). Dessutom ger objekt_geometri (RLS: bara `authenticated`) TOMT
// utan fel för en utgången session, och ett hängande anrop gav ingenting alls.

const OBJ = [{ id: 'a', namn: 'A', status: 'pagaende' }, { id: 'b', namn: 'B', status: 'planerad' }];
const GEO = [{ objekt_id: 'a', geometri: { type: 'FeatureCollection', features: [] } }];
const OK: KandidatSvar = { objekt: { data: OBJ, error: null }, geometri: { data: GEO, error: null } };

afterEach(() => { vi.useRealTimers(); });

describe('byggKandidater: bara ett svar utan fel och med geometri räknas som laddat', () => {
  it('lyckat: geometrin slås ihop per objekt; objekt utan geometri-rad får null', () => {
    const r = byggKandidater(OK);
    expect(r.ok).toBe(true);
    expect(r.orsak).toBeNull();
    expect(r.kandidater.map((k) => [k.id, k.geometri !== null])).toEqual([['a', true], ['b', false]]);
  });
  it('fel i objekt-frågan → ej ok (aldrig en tom lista som ser laddad ut)', () => {
    const r = byggKandidater({ ...OK, objekt: { data: null, error: { message: 'Failed to fetch' } } });
    expect(r).toEqual({ ok: false, orsak: 'objekt-fel', kandidater: [] });
  });
  it('fel i geometri-frågan → ej ok', () => {
    const r = byggKandidater({ ...OK, geometri: { data: null, error: { message: 'timeout' } } });
    expect(r).toEqual({ ok: false, orsak: 'geometri-fel', kandidater: [] });
  });
  it('TOMT geometri-svar UTAN fel fast objekt finns (utgången session / RLS) → ej ok', () => {
    const r = byggKandidater({ ...OK, geometri: { data: [], error: null } });
    expect(r).toEqual({ ok: false, orsak: 'geometri-tom', kandidater: [] });
    expect(byggKandidater({ ...OK, geometri: { data: null, error: null } }).orsak).toBe('geometri-tom');
  });
  it('inga objekt alls och ingen geometri är ett legitimt, tomt läge (ingen planerad/pågående trakt) → ok', () => {
    expect(byggKandidater({ objekt: { data: [], error: null }, geometri: { data: [], error: null } })).toEqual({ ok: true, orsak: null, kandidater: [] });
  });
});

describe('hamtaKandidatSvar: samma frågor som förut (status planerad/pagaende, objekt_geometri)', () => {
  it('läser planerad+pagaende och hela objekt_geometri, och lägger felen i svaret', async () => {
    const anrop: string[] = [];
    const sb = {
      from: (t: string) => ({
        select: (kol: string) => {
          anrop.push(`${t}:${kol}`);
          const svar = t === 'objekt' ? { data: OBJ, error: null } : { data: null, error: { message: 'x' } };
          return { in: (k: string, v: string[]) => { anrop.push(`in:${k}:${v.join(',')}`); return Promise.resolve(svar); }, then: (f: any) => Promise.resolve(svar).then(f) };
        },
      }),
    };
    const s = await hamtaKandidatSvar(sb);
    expect(anrop).toContain(`objekt:${KANDIDAT_KOLUMNER}`);
    expect(anrop).toContain('in:status:planerad,pagaende');
    expect(anrop).toContain('objekt_geometri:objekt_id,geometri');
    expect(KANDIDAT_STATUS).toEqual(['planerad', 'pagaende']);
    expect(s.geometri.error).toEqual({ message: 'x' });
  });
});

describe('startaKandidatLaddning: försöker igen tills det går', () => {
  const tid = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };

  it('lyckas direkt: ett anrop, vid(ok), laddar om efter uppdateringsintervallet, och inget efter stopp', async () => {
    vi.useFakeTimers();
    const hamta = vi.fn(async () => OK);
    const vid = vi.fn<(r: KandidatResultat) => void>();
    const stopp = startaKandidatLaddning({ hamta, vid });
    await tid(0);
    expect(hamta).toHaveBeenCalledTimes(1);
    expect(vid).toHaveBeenCalledTimes(1);
    expect(vid.mock.calls[0][0].ok).toBe(true);
    await tid(KANDIDAT_UPPDATERA_MS - 1);
    expect(hamta).toHaveBeenCalledTimes(1);
    await tid(1);
    expect(hamta).toHaveBeenCalledTimes(2);   // ladda om var 5:e minut (tilldelning/status ändras medan maskinen kör)
    stopp();
    await tid(KANDIDAT_UPPDATERA_MS * 3);
    expect(hamta).toHaveBeenCalledTimes(2);
  });

  it('KODBEVIS: ett fel (som supabase returnerar det, utan att kasta) → vid(ej ok), omförsök efter 3 s, sedan lyckat → vid(ok) — "laddat" sätts först då', async () => {
    vi.useFakeTimers();
    let n = 0;
    const hamta = vi.fn(async (): Promise<KandidatSvar> => (++n === 1 ? { ...OK, geometri: { data: null, error: { message: 'Failed to fetch' } } } : OK));
    const resultat: boolean[] = [];
    startaKandidatLaddning({ hamta, vid: (r) => resultat.push(r.ok) });
    await tid(0);
    expect(resultat).toEqual([false]);
    await tid(KANDIDAT_OMFORSOK_MS[0] - 1);
    expect(hamta).toHaveBeenCalledTimes(1);
    await tid(1);
    expect(resultat).toEqual([false, true]);
  });

  it('tomt geometri-svar utan fel (utgången session) → omförsök tills sessionen är tillbaka', async () => {
    vi.useFakeTimers();
    let n = 0;
    const hamta = vi.fn(async (): Promise<KandidatSvar> => (++n <= 2 ? { ...OK, geometri: { data: [], error: null } } : OK));
    const orsaker: (string | null)[] = [];
    startaKandidatLaddning({ hamta, vid: (r) => orsaker.push(r.orsak) });
    await tid(0); await tid(KANDIDAT_OMFORSOK_MS[0]); await tid(KANDIDAT_OMFORSOK_MS[1]);
    expect(orsaker).toEqual(['geometri-tom', 'geometri-tom', null]);
  });

  it('ett anrop som HÄNGER (4G-tapp) avbryts efter tidsgränsen och görs om', async () => {
    vi.useFakeTimers();
    let n = 0;
    const hamta = vi.fn((): Promise<KandidatSvar> => (++n === 1 ? new Promise<KandidatSvar>(() => { /* hänger för alltid */ }) : Promise.resolve(OK)));
    const orsaker: (string | null)[] = [];
    startaKandidatLaddning({ hamta, vid: (r) => orsaker.push(r.orsak) });
    await tid(KANDIDAT_TIDSGRANS_MS - 1);
    expect(orsaker).toEqual([]);
    await tid(1);
    expect(orsaker).toEqual(['tidsgrans']);
    await tid(KANDIDAT_OMFORSOK_MS[0]);
    expect(orsaker).toEqual(['tidsgrans', null]);
  });

  it('ett anrop som kastar (nätverksfel) → ej ok, omförsök; anroparens eget fel i vid() stoppar inte laddningen', async () => {
    vi.useFakeTimers();
    let n = 0;
    const hamta = vi.fn(async (): Promise<KandidatSvar> => { if (++n === 1) throw new TypeError('Failed to fetch'); return OK; });
    const orsaker: (string | null)[] = [];
    startaKandidatLaddning({ hamta, vid: (r) => { orsaker.push(r.orsak); throw new Error('anroparen är trasig'); } });
    await tid(0); expect(orsaker).toEqual(['undantag']);
    await tid(KANDIDAT_OMFORSOK_MS[0]); expect(orsaker).toEqual(['undantag', null]);
  });

  it('backoff 3 → 6 → 12 → 30 → 60 s och sedan var 60:e s (aldrig tätare än så, aldrig uppgivet)', async () => {
    vi.useFakeTimers();
    const hamta = vi.fn(async (): Promise<KandidatSvar> => ({ ...OK, objekt: { data: null, error: { message: 'nere' } } }));
    startaKandidatLaddning({ hamta, vid: () => { /* */ } });
    await tid(0);
    let totalt = 0;
    for (const v of [...KANDIDAT_OMFORSOK_MS, 60_000, 60_000]) { totalt += v; await tid(v); }
    expect(hamta).toHaveBeenCalledTimes(1 + KANDIDAT_OMFORSOK_MS.length + 2);
    expect(KANDIDAT_OMFORSOK_MS).toEqual([3_000, 6_000, 12_000, 30_000, 60_000]);
    expect(totalt).toBe(3_000 + 6_000 + 12_000 + 30_000 + 60_000 + 120_000);
  });

  it('stopp avbryter väntande omförsök', async () => {
    vi.useFakeTimers();
    const hamta = vi.fn(async (): Promise<KandidatSvar> => ({ ...OK, objekt: { data: null, error: { message: 'nere' } } }));
    const stopp = startaKandidatLaddning({ hamta, vid: () => { /* */ } });
    await tid(0); stopp();
    await tid(10 * 60_000);
    expect(hamta).toHaveBeenCalledTimes(1);
  });
});
