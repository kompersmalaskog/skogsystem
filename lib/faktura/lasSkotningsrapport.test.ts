// Läsningen bakom skotningsrapportens karta.
//
// Två saker vaktas: att den frågar efter de kolumner PROD faktiskt har
// (`detalj_stam.latitude/longitude`, `hyttspar.points` — båda var fel i första
// versionen), och att varje del kan falla för sig utan att rapporten faller.
// En rapport utan karta är bättre än ingen rapport; en rapport som tiger om
// att kartan är halv är värre än båda.
import { describe, it, expect, vi } from 'vitest';
import { lasSkotningsrapport } from './lasSkotningsrapport';
import { HOG_TRADSLAG_FARG, KARTA_BLANDAT } from '@/lib/tradslag';
import { BRANT_GRANS, FUKT } from '@/lib/ritadKarta/mark';

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

/** En ring kring en punkt, ca `m` meter bred — nog för en yta med tre hörn. */
const ringRunt = (lat: number, lng: number, m = 40): [number, number][] => {
  const dLat = m / 111320, dLng = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat]];
};

/**
 * Vidas ytor: en hänsynsyta PÅ trakten, en fornlämning en halv kilometer bort.
 *
 * Den andra är Bondeskog i prod 2026-11-25 — tre fornlämningar söder och väster
 * OM trakten. De förklarar ingenting om skotningen och drar ut kartans ram.
 */
const VIDA_YTOR = [
  {
    properties: { _lager: 'L_TILLAGGSYTOR', LOPNR: '3', TYP: '24', FLBESKR: 'Kant mot vatten O' },
    geometry: { type: 'Polygon', coordinates: [ringRunt(56.28598, 15.3752)] },
  },
  {
    properties: { _lager: 'L_RAA_POLY_101', lamningsnu: 'L1234', lamningsty: 'Fossil åker' },
    geometry: { type: 'Polygon', coordinates: [ringRunt(56.2805, 15.3752)] },
  },
];

/** Traktgränsen: en ruta 150 × 150 m kring objektets punkt. */
const RINGAR: [number, number][][] = [[
  [15.37399, 56.28647], [15.37642, 56.28647], [15.37642, 56.28513], [15.37399, 56.28513],
]];

const gransOk = {
  typ: 'ok' as const,
  // `gran` är Vidas ruta, [[minLng, minLat], [maxLng, maxLat]] — det
  // origobeslutet mäter planerarens markeringar mot.
  gran: [[15.37399, 56.28513], [15.37642, 56.28647]] as [[number, number], [number, number]],
  ringar: RINGAR,
  // Avläggen ligger i `punkter` (`_typ: 'punkt'`), inte i `linjer` — det var
  // felet som gjorde att rapporten aldrig ritade ett avlägg.
  punkter: TILLAGGSPUNKTER,
  ytor: VIDA_YTOR,
};

// BARA läsningen av Vidas geometri mockas. Origobeslutet (`beslutaOrigo`,
// `markeringsPunkter`, `markeringsGranser`) är den RIKTIGA koden — det är det
// som avgör om planerarens hänsyn får ritas, och en mock där hade gjort
// kvittot till en formalitet.
vi.mock('@/lib/egenkontrollOrigo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/egenkontrollOrigo')>()),
  lasVidaGrans: (...a: unknown[]) => gransMock(...a),
}));
const gransMock = vi.fn();

/**
 * Minsta möjliga kedjebara Supabase-fake, som registrerar vad som frågas.
 *
 * `maybeSingle` ger raden själv (inte en lista), som PostgREST — en fake som
 * svarar med en lista där hade dolt att `objektSvar.data.lat` aldrig fanns.
 */
function fake(svar: Record<string, { data?: unknown; error?: unknown }>) {
  const fragor: { tabell: string; kolumner: string }[] = [];
  const kedja = (tabell: string) => {
    const resultat = svar[tabell] ?? { data: [], error: null };
    const self: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'neq', 'not', 'order', 'range', 'limit']) {
      self[m] = () => self;
    }
    self.select = (kolumner: string) => { fragor.push({ tabell, kolumner }); return self; };
    self.maybeSingle = () => Promise.resolve(
      resultat.error ? resultat
        : { data: Array.isArray(resultat.data) ? (resultat.data[0] ?? null) : (resultat.data ?? null), error: null },
    );
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

/**
 * Skördarens stammar: fyra granar tätt ihop (= en hög) och en rad utan
 * position. Volymen och trädslaget bär högens storlek och färg.
 */
const STAMMAR = [
  ...Array.from({ length: 4 }, (_, i) => ({
    id: i + 1, latitude: 56.28580 + i * 0.00001, longitude: 15.37500, total_volym: 0.6, tradslag_id: '1',
  })),
  { id: 9, latitude: null, longitude: null, total_volym: 0.5, tradslag_id: '1' },
];

const allt = (extra: Record<string, { data?: unknown; error?: unknown }> = {}) => fake({
  detalj_stam: { data: STAMMAR, error: null },
  dim_tradslag: { data: [{ tradslag_id: '1', namn: 'GRAN' }], error: null },
  hyttspar: { data: HYTTSPAR, error: null },
  skotar_lass: { data: LASS, error: null },
  dim_maskin: { data: [{ maskin_id: 'A130743', visningsnamn: 'Elefant 26' }], error: null },
  objekt: { data: { lat: 56.2858, lng: 15.3752, kartbild_bounds: null }, error: null },
  ...extra,
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
    // Fyra granar med position, en rad utan: bara de fyra räknas.
    expect(r.virke).toHaveLength(4);
    expect(r.karta.hogar.length).toBeGreaterThan(0);
    for (const h of r.karta.hogar) {
      expect(Math.abs(h.lat)).toBeGreaterThan(1);
      expect(Math.abs(h.lng)).toBeGreaterThan(1);
    }
  });

  // Martin 2026-11-25: "inga röda högar dom ska vara som appen titta dom".
  // Egenkontrollens stammoln (en liten röd prick per stam) är kvar i
  // egenkontrollens rapport; här ritas APPENS högar, och det här testet håller
  // dem åtskilda: `karta.stammar` ska vara tom, `karta.hogar` ska bära virket.
  it('virket blir HÖGAR, inte ett rött stammoln', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.stammar).toEqual([]);
    expect(r.karta.hogar).toHaveLength(1);
    // Appens granfärg, ur `hogTradslagFarger` — aldrig egenkontrollens röda.
    expect(r.karta.hogar[0].farg).toBe(HOG_TRADSLAG_FARG.GRAN);
    expect(r.karta.hogar[0].volym).toBeCloseTo(2.4, 5);
  });

  it('trädslagens namn kan falla — högarna ritas ändå, i blandfärgen', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt({ dim_tradslag: { data: null, error: { message: 'x' } } });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.hogar).toHaveLength(1);
    expect(r.karta.hogar[0].farg).toBe(KARTA_BLANDAT);
    expect(r.fel.join(' ')).toContain('Trädslagens namn');
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

// Martin 2026-11-25: "hänsyner ska vara med och om det är blött eller brant så
// dom förstå varför vi måste kört som vi gjort med virket". Kartan ska bära
// SKÄLEN till att vägen blev lång, inte bara längden.
describe('varför vägen blev så lång', () => {
  it('Vidas hänsynsyta ritas — och en fornlämning en halv km bort gör det inte', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    const zoner = r.karta.markeringar?.filter(m => m.slag === 'zon') ?? [];
    expect(zoner.map(z => z.typ)).toEqual(['protected']);
    // Bondeskog i prod: tre fornlämningar söder och väster OM trakten. De
    // förklarar ingenting om skotningen och drar ut kartans ram.
    expect(zoner.map(z => z.typ)).not.toContain('fornlamning');
  });

  it('en fornlämning PÅ trakten ritas — måttet är läget, inte sorten', async () => {
    gransMock.mockResolvedValue({
      ...gransOk,
      ytor: [{
        properties: { _lager: 'L_RAA_POLY_101', lamningsnu: 'L1', lamningsty: 'Fossil åker' },
        geometry: { type: 'Polygon', coordinates: [ringRunt(56.28585, 15.3754, 20)] },
      }],
    });
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect((r.karta.markeringar ?? []).map(m => m.typ)).toEqual(['fornlamning']);
  });

  it('planerarens egen hänsynsyta ritas när origot går att styrka', async () => {
    gransMock.mockResolvedValue(gransOk);
    // En zon ritad i planeringen: x/y mot objektets origo (zoom 16 på objektets
    // punkt, eftersom kartbild_bounds är null). Mitt i trakten → kvittot håller.
    const { sb } = allt({
      planering_markeringar: {
        data: [{ data: { isZone: true, zoneType: 'wet', path: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 14 }, { x: 0, y: 14 }] } }],
        error: null,
      },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect((r.karta.markeringar ?? []).map(m => m.typ)).toContain('wet');
    expect(r.fel).toEqual([]);
  });

  // BONDESKOG I PROD 2026-11-25. Punktkontrollen föll ("0 av 180 punkter inom
  // Vidas traktgräns") fast markeringarna låg rätt: två GPS-spårade basvägar
  // ut till allmän väg bar ~175 punkter och vägde mer än alla symboler
  // tillsammans. Då räknas varje MARKERING en gång i stället — en felplacerad
  // trakt flyttar alla markeringar åt samma håll och fångas fortfarande.
  it('en GPS-spårad basväg ut ur trakten får inte göra hänsynen blind', async () => {
    gransMock.mockResolvedValue(gransOk);
    const vag = Array.from({ length: 200 }, (_, i) => ({ x: 400 + i, y: 0 }));
    const { sb } = allt({
      planering_markeringar: {
        data: [
          { data: { isZone: true, zoneType: 'protected', path: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 14 }, { x: 0, y: 14 }] } },
          { data: { lineType: 'mainRoad', path: [{ x: 0, y: 2 }, ...vag] } },
        ],
        error: null,
      },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect((r.karta.markeringar ?? []).map(m => m.typ)).toContain('protected');
    expect(r.fel).toEqual([]);
  });

  // Kartan är halva A4-bredden och läses på en sekund. Den bär bara det som
  // förklarar skotningen; "Fäll inte ut här" och gallringszonen hindrar ingen
  // skotare och gör kartan rörig.
  it('bara ytor som hindrar skotningen ritas — inte varje yta planeraren ritat', async () => {
    gransMock.mockResolvedValue(gransOk);
    const ruta = (dx: number) => [{ x: dx, y: 0 }, { x: dx + 14, y: 0 }, { x: dx + 14, y: 14 }, { x: dx, y: 14 }];
    const { sb } = allt({
      planering_markeringar: {
        data: [
          { data: { isZone: true, zoneType: 'protected', path: ruta(0) } },
          { data: { isZone: true, zoneType: 'ungskog', path: ruta(20) } },
          { data: { isZone: true, zoneType: 'gallring', path: ruta(40) } },
        ],
        error: null,
      },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    const egna = (r.karta.markeringar ?? []).map(m => m.typ);
    expect(egna).toContain('protected');
    expect(egna).not.toContain('ungskog');
    expect(egna).not.toContain('gallring');
  });

  it('går origot inte att styrka ritas INGEN hänsyn — och det sägs', async () => {
    gransMock.mockResolvedValue(gransOk);
    // Samma zon, men långt utanför Vidas ruta: ett förskjutet origo.
    const { sb } = allt({
      planering_markeringar: {
        data: [{ data: { isZone: true, zoneType: 'wet', path: [{ x: 90000, y: 90000 }, { x: 90100, y: 90000 }, { x: 90100, y: 90100 }] } }],
        error: null,
      },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect((r.karta.markeringar ?? []).some(m => m.typ === 'wet')).toBe(false);
    expect(r.fel.join(' ')).toContain('går inte att kontrollera');
  });

  it('blött och brant kommer ur timjobbets skogsdata — ingen tjänst frågas här', async () => {
    gransMock.mockResolvedValue(gransOk);
    // 9×9 rutor om 10 m: blött i mitten, brant i en annan fläck.
    const inne: number[] = [], lutning: number[] = [], fukt: number[] = [];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      inne.push(1);
      lutning.push(y >= 6 ? BRANT_GRANS.mycket : 0);
      fukt.push(x >= 3 && x <= 5 && y >= 1 && y <= 3 ? FUKT.blot : FUKT.ingen);
    }
    const b64 = (v: number[]) => Buffer.from(Uint8Array.from(v)).toString('base64');
    const { sb, fragor } = allt({
      objekt_skogsdata: {
        data: { rutnat: [{ minX: 500000, maxY: 6300000, bredd: 9, hojd: 9, rutaM: 10, inne: b64(inne), lutning: b64(lutning), fukt: b64(fukt) }] },
        error: null,
      },
    });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    const slag = new Set((r.karta.mark ?? []).map(m => m.slag));
    expect(slag.has('blott')).toBe(true);
    expect(slag.has('mycket_brant')).toBe(true);
    // Läsningen går mot den sparade tabellen, aldrig mot Skogsstyrelsen.
    expect(fragor.find(f => f.tabell === 'objekt_skogsdata')!.kolumner).toBe('rutnat');
  });

  it('ingen skogsdata är ingen felrad — marken ritas bara inte', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt({ objekt_skogsdata: { data: null, error: null } });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.karta.mark ?? []).toEqual([]);
    expect(r.fel).toEqual([]);
  });

  it('skogsdatan kan falla för sig — och DET sägs, för marken är halva svaret', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt({ objekt_skogsdata: { data: null, error: { message: 'x' } } });
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.fel.join(' ')).toContain('Blöt och brant mark');
    expect(r.karta.hogar).toHaveLength(1);
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
    expect(r.karta.hogar).toHaveLength(1);
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
    expect(r.karta.hogar).toHaveLength(1);
  });

  it('allt gick: ingen felrad alls', async () => {
    gransMock.mockResolvedValue(gransOk);
    const { sb } = allt();
    const r = await lasSkotningsrapport(sb, { objektUuid: 'u', nummer: ['11271860'] });
    expect(r.fel).toEqual([]);
  });
});
