import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fixtur from './__fixtures__/egenkontroll_hyttspar_2026-11-10.json';
import {
  fonsterUrKorspar, HYTTSPAR_MIN_PUNKTER, generateEgenkontroll, kompletteraVader,
  type HyttsparDag,
} from './egenkontroll';

// SKOTNINGSFONSTRET: tva kallor, i ordning, per roll.
//
// FELET SOM RATTAS (Martin 2026-11-10, Ostra-Hoka): rundvyn sa "Vi vet inte nar trakten skotades.
// Objektet ar inte kopplat till maskindatan" - medan hyttspar hela tiden hade tio skotardagar
// 5-16 oktober. dim_objekt_id var satt pa ETT av de elva objekt som hade en pagaende runda,
// sa tio av elva rundor fick ingen vaderrad alls. Ett tyst "vi vet inte" om nagot som star i
// databasen ar en olast tabell, inte arlighet.
//
// Facit ar prod: lib/__fixtures__/egenkontroll_hyttspar_2026-11-10.json.

type FixObjekt = {
  spar: HyttsparDag[];
  vantat: { skordare: [string, string] | null; skotare: [string, string] | null };
  varfor: string;
};
const objekten = (fixtur as unknown as { objekt: Record<string, FixObjekt> }).objekt;

// ---------------------------------------------------------------------------
// Gransen: en dag, inte en sekund med appen pa
// ---------------------------------------------------------------------------

describe('fonsterUrKorspar mot prod 2026-11-10', () => {
  for (const [namn, f] of Object.entries(objekten)) {
    it(`${namn}: ${f.varfor}`, () => {
      expect(fonsterUrKorspar(f.spar, 'skotare')).toEqual(f.vantat.skotare);
      expect(fonsterUrKorspar(f.spar, 'skordare')).toEqual(f.vantat.skordare);
    });
  }

  it('Ostra-Hoka: 16 okt (60 punkter) ar fonstrets sista dag - en kort avslutande dag raknas', () => {
    const f = objekten['Östra-Hoka 1:7 A-C -25'];
    expect(fonsterUrKorspar(f.spar, 'skotare')![1]).toBe('2026-10-16');
  });

  it('Ostra-Hoka: 13-15 okt (3, 2, 0 punkter) raknas inte som egna dagar', () => {
    const f = objekten['Östra-Hoka 1:7 A-C -25'];
    const utan = f.spar.filter((r) => r.datum >= '2026-10-13' && r.datum <= '2026-10-15');
    expect(utan).toHaveLength(3);
    expect(fonsterUrKorspar(utan, 'skotare')).toBeNull();
  });

  it('Akelius: fjorton dygn med 0-2 punkter ger INGET fonster - ett sant fonster hade blivit 6-20 sep', () => {
    expect(fonsterUrKorspar(objekten['400763 Akelius Tåget SA'].spar, 'skotare')).toBeNull();
  });
});

describe('fonsterUrKorspar: gransen och rollerna', () => {
  const dag = (roll: string, datum: string, antal_punkter: number | null): HyttsparDag => ({ roll, datum, antal_punkter });

  it('exakt gransen raknas, en under raknas inte', () => {
    expect(fonsterUrKorspar([dag('skotare', '2026-10-01', HYTTSPAR_MIN_PUNKTER)], 'skotare')).toEqual(['2026-10-01', '2026-10-01']);
    expect(fonsterUrKorspar([dag('skotare', '2026-10-01', HYTTSPAR_MIN_PUNKTER - 1)], 'skotare')).toBeNull();
  });

  it('okant antal (null) raknas inte - utan matningen vet vi inte om maskinen jobbade dar', () => {
    expect(fonsterUrKorspar([dag('skotare', '2026-10-01', null)], 'skotare')).toBeNull();
  });

  it('rollerna blandas aldrig', () => {
    const rader = [dag('skordare', '2026-09-01', 500), dag('skotare', '2026-10-01', 500)];
    expect(fonsterUrKorspar(rader, 'skordare')).toEqual(['2026-09-01', '2026-09-01']);
    expect(fonsterUrKorspar(rader, 'skotare')).toEqual(['2026-10-01', '2026-10-01']);
  });

  it('ordningen i indatan styr inte - forsta och sista dagen ar datumens', () => {
    const rader = [dag('skotare', '2026-10-16', 60), dag('skotare', '2026-10-05', 537), dag('skotare', '2026-10-08', 671)];
    expect(fonsterUrKorspar(rader, 'skotare')).toEqual(['2026-10-05', '2026-10-16']);
  });
});

// ---------------------------------------------------------------------------
// Hela genereringen: vilken kalla som vinner, och vad som skrivs
// ---------------------------------------------------------------------------

type Kedja = { tabell: string; ops: [string, ...any[]][] };

type Varld = {
  objekt: Record<string, unknown>;
  /** fakt_produktion: forsta och sista datum (maskindatan). */
  prod?: [string, string] | null;
  /** fakt_lass: forsta och sista datum (maskindatan). */
  lass?: [string, string] | null;
  hyttspar?: HyttsparDag[];
  hyttsparFel?: string;
};

function bygg(v: Varld) {
  const skrivetVader: any[] = [];
  const lasta: string[] = [];

  const svar = (k: Kedja) => {
    const ins = k.ops.find((o) => o[0] === 'insert');
    const upd = k.ops.find((o) => o[0] === 'update');
    lasta.push(k.tabell);
    switch (k.tabell) {
      case 'objekt':
        return { data: v.objekt, error: null };
      case 'dim_objekt':
        return { data: [], error: null };
      case 'egenkontroll':
        if (ins) return { data: { id: 'runda-ny', status: 'pagaende', ...ins[1] }, error: null };
        if (upd) { skrivetVader.push(upd[1].vader); return { data: { id: 'runda-ny', status: 'pagaende', vader: upd[1].vader }, error: null }; }
        return { data: null, error: null };
      case 'egenkontroll_punkt':
        return { data: ins ? null : [], error: null };
      case 'fakt_produktion': {
        const stigande = k.ops.find((o) => o[0] === 'order')?.[2]?.ascending !== false;
        const d = v.prod ? (stigande ? v.prod[0] : v.prod[1]) : null;
        return { data: d ? [{ datum: d }] : [], error: null };
      }
      case 'fakt_lass': {
        const stigande = k.ops.find((o) => o[0] === 'order')?.[2]?.ascending !== false;
        const d = v.lass ? (stigande ? v.lass[0] : v.lass[1]) : null;
        return { data: d ? [{ datum: d }] : [], error: null };
      }
      case 'hyttspar':
        if (v.hyttsparFel) return { data: null, error: { message: v.hyttsparFel } };
        return { data: v.hyttspar ?? [], error: null };
      default:
        return { data: [], error: null };
    }
  };

  const klient: any = {
    from(tabell: string) {
      const k: Kedja = { tabell, ops: [] };
      const b: any = new Proxy({}, {
        get(_t, op: string) {
          if (op === 'then') return (res: any, rej: any) => Promise.resolve(svar(k)).then(res, rej);
          return (...args: any[]) => { k.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return { klient, skrivetVader, lasta };
}

const objekt = (over: Record<string, unknown> = {}) => ({
  id: 'ob-1', namn: 'Testtrakt', typ: 'slutavverkning', areal: null, vo_nummer: '1',
  kartbild_bounds: null, lat: 56.2042, lng: 14.8945, dim_objekt_id: null,
  skordare_maskin: null, skotare_maskin: null,
  ...over,
});

const ostraHoka = objekten['Östra-Hoka 1:7 A-C -25'].spar;

// Arkivet svarar inte i ett test. En stubbad fetch ger dygnsvarden sa att
// status blir ok och vi kan se VILKA datum som fragades och vilken kalla som
// skrevs - talen i sig provas i egenkontrollvader-testerna.
let fragor: string[] = [];
beforeEach(() => {
  fragor = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fragor.push(String(url));
    const u = new URL(String(url));
    const fran = new Date(`${u.searchParams.get('start_date')}T00:00:00Z`);
    const till = new Date(`${u.searchParams.get('end_date')}T00:00:00Z`);
    const time: string[] = [];
    for (let d = fran; d <= till; d = new Date(d.getTime() + 86400000)) time.push(d.toISOString().slice(0, 10));
    return {
      ok: true,
      json: async () => ({ daily: { time, precipitation_sum: time.map(() => 1), temperature_2m_min: time.map(() => 5) } }),
    } as any;
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('generateEgenkontroll: kallan per roll', () => {
  it('Ostra-Hoka utan dim_objekt_id: skotningsfonstret kommer ur korsparet och MARKS som det', async () => {
    const w = bygg({ objekt: objekt(), hyttspar: ostraHoka });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    const v = w.skrivetVader.at(-1);
    expect(v.status).toBe('ok');
    expect([v.skot_start, v.skot_slut]).toEqual(['2026-10-05', '2026-10-16']);
    expect(v.skot_kalla).toBe('korspar');
    expect([v.skord_start, v.skord_slut]).toEqual(['2026-09-23', '2026-09-23']);
    expect(v.skord_kalla).toBe('korspar');
  });

  it('MASKINDATAN GAR FORE: finns fakt_lass lases korsparet inte for skotningen', async () => {
    const w = bygg({
      objekt: objekt({ dim_objekt_id: 'D1' }),
      prod: ['2026-09-01', '2026-09-20'],
      lass: ['2026-09-10', '2026-09-30'],
      hyttspar: ostraHoka,
    });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    const v = w.skrivetVader.at(-1);
    expect([v.skot_start, v.skot_slut]).toEqual(['2026-09-10', '2026-09-30']);
    expect(v.skot_kalla).toBe('maskindata');
    expect(v.skord_kalla).toBe('maskindata');
    // Bada rollerna klara ur filerna - ingen anledning att lasa hyttspar alls.
    expect(w.lasta).not.toContain('hyttspar');
  });

  it('MASKINDATAN GAR FORE AVEN NAR KORSPARET LASES: skotningen ur fakt_lass star kvar fast skordens fonster hamtas ur sparet', async () => {
    // Skillnaden mot testet ovan: har SAKNAS skordens fonster i filerna, sa
    // hyttspar MASTE lasas. Da ar det bara villkoret som haller skotningen -
    // och det ar precis det som gar sonder om nagon tar bort det.
    const w = bygg({
      objekt: objekt({ dim_objekt_id: 'D1' }),
      prod: null,
      lass: ['2026-09-10', '2026-09-30'],
      hyttspar: ostraHoka,
    });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    const v = w.skrivetVader.at(-1);
    expect(w.lasta).toContain('hyttspar');
    expect([v.skot_start, v.skot_slut]).toEqual(['2026-09-10', '2026-09-30']);
    expect(v.skot_kalla).toBe('maskindata');
    expect([v.skord_start, v.skord_slut]).toEqual(['2026-09-23', '2026-09-23']);
    expect(v.skord_kalla).toBe('korspar');
  });

  it('HALVT FONSTER ur maskindatan raknas inte som ett fonster - korsparet far ta over', async () => {
    // Bada fragorna gar mot samma tabell, sa prod kan inte ge ett halvt svar i
    // dag. Villkoret skyddar mot att en framtida lasare gor det: utan det satts
    // skot_kalla till maskindata med ett tomt datum, korsparet lases aldrig, och
    // rundan far "saknar_skotdatum" fast sparet finns.
    const w = bygg({ objekt: objekt({ dim_objekt_id: 'D1' }), lass: ['2026-09-10', null as unknown as string], hyttspar: ostraHoka });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    const v = w.skrivetVader.at(-1);
    expect(v.status).toBe('ok');
    expect([v.skot_start, v.skot_slut]).toEqual(['2026-10-05', '2026-10-16']);
    expect(v.skot_kalla).toBe('korspar');
  });

  it('BLANDAT: skorden ur filerna, skotningen ur korsparet - var kalla sags for sig', async () => {
    const w = bygg({
      objekt: objekt({ dim_objekt_id: 'D1' }),
      prod: ['2026-09-01', '2026-09-20'],
      lass: null,
      hyttspar: ostraHoka,
    });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    const v = w.skrivetVader.at(-1);
    expect([v.skord_start, v.skord_slut]).toEqual(['2026-09-01', '2026-09-20']);
    expect(v.skord_kalla).toBe('maskindata');
    expect([v.skot_start, v.skot_slut]).toEqual(['2026-10-05', '2026-10-16']);
    expect(v.skot_kalla).toBe('korspar');
  });

  it('inget korspar och ingen maskindata: saknar_skotdatum som forut, och ingen kalla', async () => {
    const w = bygg({ objekt: objekt(), hyttspar: [] });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    const v = w.skrivetVader.at(-1);
    expect(v.status).toBe('saknar_skotdatum');
    expect(v.skot_kalla).toBeNull();
  });

  it('bara dagar under gransen: saknar_skotdatum - ingen gissning ur 0-2 punkter', async () => {
    const w = bygg({ objekt: objekt(), hyttspar: objekten['400763 Akelius Tåget SA'].spar });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    expect(w.skrivetVader.at(-1).status).toBe('saknar_skotdatum');
  });

  it('ETT LASFEL AR ETT FEL: korsparet gar inte att lasa -> ingen vaderrad, aldrig ett tyst "vi vet inte"', async () => {
    const w = bygg({ objekt: objekt(), hyttsparFel: 'nat' });
    const res = await generateEgenkontroll('ob-1', { klient: w.klient });
    // Vadersteget ligger i en egen try: rundan skapas anda, men ingen snapshot skrivs.
    expect(res.nyskapad).toBe(true);
    expect(w.skrivetVader).toHaveLength(0);
  });

  it('arkivet fragas over korsparets fonster, inte over nagot annat', async () => {
    const w = bygg({ objekt: objekt(), hyttspar: ostraHoka });
    await generateEgenkontroll('ob-1', { klient: w.klient });
    expect(fragor).toHaveLength(1);
    // 14 dygn fore 5 okt = 21 sep, och till och med sista skotardagen.
    expect(fragor[0]).toContain('start_date=2026-09-21');
    expect(fragor[0]).toContain('end_date=2026-10-16');
  });
});

// ---------------------------------------------------------------------------
// kompletteraVader: fylla ETT HAL, aldrig skriva om ett varde
// ---------------------------------------------------------------------------

type KVarld = {
  status?: string;
  vader?: any;
  hyttspar?: HyttsparDag[];
  /** Antal rader update:en far tillbaka. 0 = nagon annan hann fore. */
  traffar?: number;
};

function byggK(v: KVarld) {
  const skrivet: any[] = [];
  const filter: [string, ...any[]][] = [];

  const svar = (k: Kedja) => {
    const upd = k.ops.find((o) => o[0] === 'update');
    if (k.tabell === 'egenkontroll') {
      if (upd) {
        skrivet.push(upd[1].vader);
        for (const o of k.ops) if (o[0] === 'is' || o[0] === 'filter' || o[0] === 'eq') filter.push(o);
        const n = v.traffar ?? 1;
        return { data: Array.from({ length: n }, () => ({ id: 'r1' })), error: null };
      }
      return { data: { id: 'r1', status: v.status ?? 'pagaende', objekt_id: 'ob-1', vader: v.vader ?? null }, error: null };
    }
    if (k.tabell === 'objekt') return { data: { lat: 56.2, lng: 14.9, dim_objekt_id: null }, error: null };
    if (k.tabell === 'hyttspar') return { data: v.hyttspar ?? [], error: null };
    return { data: [], error: null };
  };

  const klient: any = {
    from(tabell: string) {
      const k: Kedja = { tabell, ops: [] };
      const b: any = new Proxy({}, {
        get(_t, op: string) {
          if (op === 'then') return (res: any, rej: any) => Promise.resolve(svar(k)).then(res, rej);
          return (...args: any[]) => { k.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return { klient, skrivet, filter };
}

describe('kompletteraVader', () => {
  it('hal + fonster finns nu: snapshot skrivs', async () => {
    const w = byggK({ vader: null, hyttspar: ostraHoka });
    const res = await kompletteraVader('r1', { klient: w.klient });
    expect(res).toEqual({ fyllt: true, skal: null });
    expect(w.skrivet.at(-1).skot_kalla).toBe('korspar');
    expect([w.skrivet.at(-1).skot_start, w.skrivet.at(-1).skot_slut]).toEqual(['2026-10-05', '2026-10-16']);
  });

  it('saknar_skotdatum + fonster finns nu: snapshot skrivs, och filtret ar just det halet', async () => {
    const w = byggK({ vader: { status: 'saknar_skotdatum' }, hyttspar: ostraHoka });
    expect((await kompletteraVader('r1', { klient: w.klient })).fyllt).toBe(true);
    expect(w.filter.some((o) => o[0] === 'filter' && o[1] === 'vader->>status' && o[3] === 'saknar_skotdatum')).toBe(true);
    expect(w.filter.some((o) => o[0] === 'eq' && o[1] === 'status' && o[2] === 'pagaende')).toBe(true);
  });

  it('null-halet skrivs med .is(vader, null) - aldrig over nagot som redan finns', async () => {
    const w = byggK({ vader: null, hyttspar: ostraHoka });
    await kompletteraVader('r1', { klient: w.klient });
    expect(w.filter.some((o) => o[0] === 'is' && o[1] === 'vader' && o[2] === null)).toBe(true);
  });

  it('KLAR RUNDA ROERS ALDRIG', async () => {
    const w = byggK({ status: 'klar', vader: null, hyttspar: ostraHoka });
    expect(await kompletteraVader('r1', { klient: w.klient })).toEqual({ fyllt: false, skal: 'Rundan är klar.' });
    expect(w.skrivet).toHaveLength(0);
  });

  it('status ok roers aldrig - det ar ett varde, inte ett hal', async () => {
    const w = byggK({ vader: { status: 'ok' }, hyttspar: ostraHoka });
    expect((await kompletteraVader('r1', { klient: w.klient })).fyllt).toBe(false);
    expect(w.skrivet).toHaveLength(0);
  });

  it('api_fel roers aldrig - da fragade vi, och att fraga igen ar driften regeln skyddar mot', async () => {
    const w = byggK({ vader: { status: 'api_fel', fel: 'timeout' }, hyttspar: ostraHoka });
    expect((await kompletteraVader('r1', { klient: w.klient })).fyllt).toBe(false);
    expect(w.skrivet).toHaveLength(0);
  });

  it('saknar_koordinat roers aldrig (objektet ska fa en koordinat, inte ett korspar)', async () => {
    const w = byggK({ vader: { status: 'saknar_koordinat' }, hyttspar: ostraHoka });
    expect((await kompletteraVader('r1', { klient: w.klient })).fyllt).toBe(false);
    expect(w.skrivet).toHaveLength(0);
  });

  it('fonstret saknas fortfarande: INGENTING skrivs - en identisk snapshot med ny tidsstampel ar ingen uppgift', async () => {
    const w = byggK({ vader: { status: 'saknar_skotdatum' }, hyttspar: [] });
    const res = await kompletteraVader('r1', { klient: w.klient });
    expect(res.fyllt).toBe(false);
    expect(res.skal).toBe('Det finns fortfarande inga skotningsdatum.');
    expect(w.skrivet).toHaveLength(0);
    // Och arkivet fragas inte i onodan.
    expect(fragor).toHaveLength(0);
  });

  it('noll rader tillbaka: nagon annan hann fore, och det sags - aldrig fyllt: true utan en rad', async () => {
    const w = byggK({ vader: null, hyttspar: ostraHoka, traffar: 0 });
    const res = await kompletteraVader('r1', { klient: w.klient });
    expect(res.fyllt).toBe(false);
    expect(res.skal).toContain('hann');
  });

  it('arkivet svarar fel: ingenting skrivs, sa nasta oppning far forsoka igen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => null } as any)));
    const w = byggK({ vader: { status: 'saknar_skotdatum' }, hyttspar: ostraHoka });
    const res = await kompletteraVader('r1', { klient: w.klient });
    expect(res.fyllt).toBe(false);
    expect(w.skrivet).toHaveLength(0);
  });
});
