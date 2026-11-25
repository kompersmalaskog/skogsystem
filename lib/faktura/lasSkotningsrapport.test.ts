// Läsningen bakom skotningsrapportens karta.
//
// Två saker vaktas: att den frågar efter de kolumner PROD faktiskt har
// (`detalj_stam.latitude/longitude`, `hyttspar.points` — båda var fel i första
// versionen), och att varje del kan falla för sig utan att rapporten faller.
// En rapport utan karta är bättre än ingen rapport; en rapport som tiger om
// att kartan är halv är värre än båda.
import { describe, it, expect, vi } from 'vitest';
import { lasSkotningsrapport } from './lasSkotningsrapport';

/** Vidas tilläggspunkter för Skälviken, som de står i prod 2026-11-25. */
const TILLAGGSPUNKTER = [
  {
    properties: { _lager: 'L_TILLAGGSPUNKTER', EXTRA_LABE: '01-1', LOPNR: '0', FLBESKR: 'Virkesavlägg' },
    geometry: { type: 'Point', coordinates: [15.375599723827962, 56.287619465578196] },
  },
  {
    properties: { _lager: 'L_TILLAGGSPUNKTER', EXTRA_LABE: 'N6238159,  E523265', LOPNR: '0', FLBESKR: 'Larmkoordinat' },
    geometry: { type: 'Point', coordinates: [15.375833309081953, 56.28765191008223] },
  },
];

const gransOk = {
  typ: 'ok' as const,
  gran: {} as never,
  ringar: [[[15.37466, 56.28604], [15.3751, 56.28592], [15.37562, 56.28592]]],
  linjer: TILLAGGSPUNKTER,
};

vi.mock('@/lib/egenkontrollOrigo', () => ({
  lasVidaGrans: (...a: unknown[]) => gransMock(...a),
}));
const gransMock = vi.fn();

/** Minsta möjliga kedjebara Supabase-fake, som registrerar vad som frågas. */
function fake(svar: Record<string, { data?: unknown; error?: unknown }>) {
  const fragor: { tabell: string; kolumner: string }[] = [];
  const kedja = (tabell: string) => {
    const resultat = svar[tabell] ?? { data: [], error: null };
    const self: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'neq', 'not', 'order', 'range', 'limit']) {
      self[m] = () => self;
    }
    self.select = (kolumner: string) => { fragor.push({ tabell, kolumner }); return self; };
    self.then = (res: (v: unknown) => unknown) => Promise.resolve(resultat).then(res);
    return self;
  };
  return { sb: { from: (t: string) => kedja(t) } as never, fragor };
}

const HYTTSPAR = [{
  points: [
    { lat: 56.2875, lng: 15.37601, tid: '2026-11-03T08:00:00Z' },
    { lat: 56.2870, lng: 15.37590, tid: '2026-11-03T08:01:00Z' },
    { lat: 56.2860, lng: 15.37580, tid: '2026-11-03T08:02:00Z' },
  ],
}];

const LASS = [
  { datum: '2026-11-18', maskin_id: 'A130743', status: 'bekraftat', bekraftad_av: 'forare' },
  { datum: '2026-11-03', maskin_id: 'A130743', status: 'bekraftat', bekraftad_av: 'forare' },
  { datum: '2026-11-25', maskin_id: 'A130743', status: 'bekraftat', bekraftad_av: 'auto' },
];

const allt = () => fake({
  detalj_stam: { data: [{ latitude: 56.2857, longitude: 15.3742 }, { latitude: null, longitude: null }], error: null },
  hyttspar: { data: HYTTSPAR, error: null },
  skotar_lass: { data: LASS, error: null },
  dim_maskin: { data: [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26' }], error: null },
});

describe('kolumnerna som PROD har', () => {
  it('stammarna läses som latitude/longitude — inte lat/lng', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb, fragor } = allt();
    await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    const stam = fragor.find(f => f.tabell === 'detalj_stam')!;
    expect(stam.kolumner).toContain('latitude');
    expect(stam.kolumner).toContain('longitude');
    expect(stam.kolumner).not.toMatch(/\blat\b/);
  });

  it('hyttspåret läses som points — inte punkter', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb, fragor } = allt();
    await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(fragor.find(f => f.tabell === 'hyttspar')!.kolumner).toBe('points');
  });
});

describe('vad som kommer ut', () => {
  it('Vidas avlägg blir en pinne — LARMKOORDINATEN gör det inte', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.avlagg.map(a => a.namn)).toEqual(['01-1']);
    expect(r.karta.avlagg[0].plats.lat).toBeCloseTo(56.28762, 4);
  });

  it('perioden är första och sista lossningsdagen — automatiska lass räknas inte', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.period).toEqual({ fran: '2026-11-03', till: '2026-11-18' });
  });

  it('skotaren heter sitt namn, aldrig ett maskin_id', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.skotare).toEqual(['Elefant 26']);
  });

  it('stammar utan position räknas inte som (0, 0)', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.stammar).toHaveLength(1);
  });

  // HITTAT I PROD 2026-11-25, inte av ett test: `hyttspar` för Skälviken
  // sträcker sig 6 308 m i höjd (maskinen körde hem) mot traktens 448. Kartans
  // ram blev sex kilometer hög och trakten en klump i hörnet. Fixturen ovan
  // har 38 punkter, alla inne på trakten — den kunde aldrig visa felet.
  //
  // PUNKTERNA MÅSTE VARA TÄTA. Första versionen av det här testet la
  // hemresan som sex glesa punkter; då bröt `korsparLinjer` linjen vid varje
  // hopp över 200 m och varje punkt blev en egen linje som föll bort på
  // `length > 1` — testet gick igenom också UTAN klippningen. Prod har 12 000
  // punkter över 6,3 km, alltså en var halvmeter, och då bryts ingenting.
  it('HEMRESAN KLIPPS BORT: spåret ritas bara vid trakten', async () => {
    gransMock.mockResolvedValue(gransOk);
    // 120 punkter söderut, ~50 m isär — tätt nog att aldrig brytas som hopp.
    const hemresa: { lat: number; lng: number }[] = [];
    for (let i = 1; i <= 120; i++) {
      hemresa.push({ lat: 56.2864 - i * 0.00045, lng: 15.3760 - i * 0.00002 });
    }
    const { sb } = fake({
      detalj_stam: { data: [{ latitude: 56.2857, longitude: 15.3742 }], error: null },
      hyttspar: {
        data: [{
          points: [
            { lat: 56.2860, lng: 15.3758 }, { lat: 56.2862, lng: 15.3759 },
            { lat: 56.2864, lng: 15.3760 },
            ...hemresa,
          ],
        }],
        error: null,
      },
      skotar_lass: { data: LASS, error: null },
      dim_maskin: { data: [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26' }], error: null },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    const alla = r.karta.korspar.flat();
    expect(alla.length).toBeGreaterThan(1);
    // Inget kvar söder om trakten + marginalen.
    expect(Math.min(...alla.map(p => p.lat))).toBeGreaterThan(56.283);
    // Och kartans höjd är traktens, inte sex kilometer.
    const hojd = (Math.max(...alla.map(p => p.lat)) - Math.min(...alla.map(p => p.lat))) * 111320;
    expect(hojd).toBeLessThan(600);
  });

  it('körspåret blir en ritad linje', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.korspar.length).toBeGreaterThan(0);
    expect(r.karta.korspar[0].length).toBeGreaterThan(1);
  });
});

describe('KASTAR ALDRIG — varje del faller för sig, och det SÄGS', () => {
  it('traktgränsen kan inte läsas', async () => {
    gransMock.mockResolvedValue({ typ: 'fel', meddelande: 'nät' });
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.granser).toEqual([]);
    expect(r.fel.join(' ')).toContain('Traktgränsen kunde inte läsas');
    // Resten kom ändå.
    expect(r.karta.stammar).toHaveLength(1);
  });

  it('Vida har ingen traktgräns — det är något annat än ett läsfel', async () => {
    gransMock.mockResolvedValue({ typ: 'saknas' });
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.fel.join(' ')).toContain('ingen traktgräns');
    expect(r.fel.join(' ')).not.toContain('kunde inte läsas');
  });

  it('"laddar" från gränsläsningen faller stängt, aldrig som en gräns', async () => {
    gransMock.mockResolvedValue({ typ: 'laddar' });
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.granser).toEqual([]);
    expect(r.fel.length).toBeGreaterThan(0);
  });

  it('stammarna, spåret, lassen och namnen kan falla var för sig', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = fake({
      detalj_stam: { data: null, error: { message: 'x' } },
      hyttspar: { data: null, error: { message: 'x' } },
      skotar_lass: { data: null, error: { message: 'x' } },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    const f = r.fel.join(' ');
    expect(f).toContain('Stammarnas lägen');
    expect(f).toContain('körspår');
    expect(f).toContain('perioden saknas');
    // Gränsen och avläggen kom ändå — kartan är halv, inte borta.
    expect(r.karta.granser).toHaveLength(1);
    expect(r.karta.avlagg).toHaveLength(1);
    expect(r.period).toBeNull();
    expect(r.skotare).toEqual([]);
  });

  it('gränsläsningen kastar — fångas, rapporten görs ändå', async () => {
    gransMock.mockRejectedValue(new Error('trasig'));
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.fel.join(' ')).toContain('Traktgränsen kunde inte läsas');
    expect(r.karta.stammar).toHaveLength(1);
  });

  it('allt gick: ingen felrad alls', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.fel).toEqual([]);
  });
});
