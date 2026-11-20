import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  byggKandidater, startaKandidatLaddning, hamtaKandidatSvar, KANDIDAT_STATUS, KANDIDAT_KOLUMNER,
  KANDIDAT_TIDSGRANS_MS, KANDIDAT_OMFORSOK_MS, KANDIDAT_UPPDATERA_MS, type KandidatSvar, type KandidatResultat,
} from './objektKandidater';
import { minnesLager } from './geometriCache';

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

describe('hamtaKandidatSvar: status oplanerad/planerad/pagaende, och geometrin via enhetens sparade kopia', () => {
  const fejk = (geoFel = false) => {
    const anrop: string[] = [];
    const sb = {
      anrop,
      from: (t: string) => ({
        select: (kol: string) => {
          anrop.push(`${t}:${kol}`);
          const svar = t === 'objekt' ? { data: OBJ, error: null }
            : geoFel ? { data: null, error: { message: 'x' } }
            : kol.includes('geometri') ? { data: GEO, error: null } : { data: [{ objekt_id: 'a', id: 1, skapad: 't' }, { objekt_id: 'avslutad', id: 2, skapad: 't' }], error: null };
          return { in: (k: string, v: string[]) => { anrop.push(`in:${k}:${v.join(',')}`); return Promise.resolve(svar); }, then: (f: any) => Promise.resolve(svar).then(f) };
        },
      }),
    };
    return sb;
  };
  it('läser kandidaterna, EN versionsfråga, och bara kandidaternas geometri — aldrig hela tabellen', async () => {
    const sb = fejk(); const lager = minnesLager();
    const s = await hamtaKandidatSvar(sb, lager);
    expect(sb.anrop).toContain(`objekt:${KANDIDAT_KOLUMNER}`);
    expect(sb.anrop).toContain('in:status:oplanerad,planerad,pagaende');
    expect(sb.anrop).toContain('objekt_geometri:objekt_id,id,skapad');
    expect(sb.anrop).toContain('in:objekt_id:a');                 // inte 'avslutad', och inte objekt b som saknar geometri
    expect(KANDIDAT_STATUS).toEqual(['oplanerad', 'planerad', 'pagaende']);   // en maskin i en ännu oklarmarkerad trakt matchas ändå — planeringen spärrar aldrig förarna
    expect(byggKandidater(s).kandidater.map((k) => [k.id, k.geometri !== null])).toEqual([['a', true], ['b', false]]);
    // Nästa varv (var 5:e minut): ingen geometri hämtas.
    const fore = sb.anrop.filter((x) => x.includes('geometri:objekt_id,geometri')).length;
    const s2 = await hamtaKandidatSvar(sb, lager);
    expect(sb.anrop.filter((x) => x.includes('geometri:objekt_id,geometri')).length).toBe(fore);
    expect(byggKandidater(s2).ok).toBe(true);
  });
  it('felet läggs i svaret', async () => {
    const s = await hamtaKandidatSvar(fejk(true), minnesLager());
    expect(s.geometri.error).toEqual({ message: 'x' });
    expect(byggKandidater(s).orsak).toBe('geometri-fel');
  });
  it('kandidater finns men ingen av dem har geometri (bara privata jobb): ok, inte "geometri-tom"', () => {
    expect(byggKandidater({ objekt: { data: OBJ, error: null }, geometri: { data: [], error: null }, geometriPaServern: 12 }).ok).toBe(true);
    expect(byggKandidater({ objekt: { data: OBJ, error: null }, geometri: { data: [], error: null }, geometriPaServern: 0 }).orsak).toBe('geometri-tom');
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
