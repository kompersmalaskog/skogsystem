// Provytorna lottas EN gång, med origot från beslutaOrigo. Hela kedjan mot en fejkad klient, med prodens riktiga markeringar (fixturen).
// Slutresultatet kontrolleras mot Vidas traktgräns: varje lottad yta ska ligga INOM Vidas ruta — hade origot haft fel zoom eller fel mitt
// hade ytorna hamnat utanför, så det här fångar hela felfamiljen (#278, #322) i det som faktiskt skrivs.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import fixtur from './__fixtures__/origo_kvitto_prod_2026-10-19.json';
import { skapaProvytor } from './egenkontroll';
import { svgToLatLon } from './kartkoordinater';

type FixObjekt = { lat: number; lng: number; vida: number[] | null; granser: number[][][]; punkter: number[][] };
const OBJEKT = fixtur.objekt as unknown as Record<string, FixObjekt>;

/** Markeringarna som planering_markeringar-rader: gränserna som boundary-linjer, övriga punkter som symboler. */
function markeringsRader(f: FixObjekt) {
  const granser = f.granser.map((g) => ({ data: { lineType: 'boundary', isLine: true, path: g.map(([x, y]) => ({ x, y })) } }));
  return granser;
}

function fejk(opt: { rader: unknown[]; geometri: unknown; geometriFel?: string; markeringFel?: string }) {
  const loggar: { tabell: string; rader?: unknown[] }[] = [];
  const klient = {
    from: (tabell: string) => ({
      select: () => ({
        eq: (): PromiseLike<unknown> & { order: () => Promise<unknown> } => {
          const svar =
            tabell === 'objekt_geometri'
              ? opt.geometriFel ? { data: null, error: { message: opt.geometriFel } } : { data: opt.geometri, error: null }
              : opt.markeringFel ? { data: null, error: { message: opt.markeringFel } } : { data: opt.rader, error: null };
          const p = Promise.resolve(svar);
          return Object.assign(p, { order: async () => svar });
        },
      }),
      insert: async (rader: unknown[]) => {
        loggar.push({ tabell, rader });
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { klient, loggar };
}

/** Vidas traktgräns som en rektangel (L_TRAKTDEL) runt fixturens ruta. */
const vidaGeometri = (v: number[]) => [{ geometri: { features: [{ type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [[[v[0], v[1]], [v[2], v[1]], [v[2], v[3]], [v[0], v[3]], [v[0], v[1]]]] } }] } }];

const kor = (namn: string, areal: number, bounds: unknown = null, opt: Partial<Parameters<typeof fejk>[0]> = {}) => {
  const f = OBJEKT[namn];
  const { klient, loggar } = fejk({ rader: markeringsRader(f), geometri: f.vida ? vidaGeometri(f.vida) : [], ...opt });
  const ut = skapaProvytor(klient, 'rundan-1', 'objekt-1', 'gallring', { areal, kartbild_bounds: bounds, lat: f.lat, lng: f.lng, vo_nummer: null });
  return { f, loggar, ut };
};

describe('skapaProvytor — origot är planeringens, kontrollerat mot Vidas traktgräns', () => {
  it.each([
    ['Betet gallring 2026', 9.48],
    ['Hålabäck gallring 2026', 9.17],
  ])('%s (envz, inga bounds): provytor lottas, och varje yta ligger inom Vidas traktgräns', async (namn, areal) => {
    // Lottningen är slumpad (Math.random): kör den många gånger så att ett skalfel i origot (ytor dubbelt så långt från mitten) inte kan slinka igenom av en slump.
    for (let varv = 0; varv < 12; varv++) {
      const { f, loggar, ut } = kor(namn, areal);
      const n = await ut;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(loggar).toHaveLength(1);
      expect(loggar[0].tabell).toBe('egenkontroll_provyta');
      const rader = loggar[0].rader as { lat: number; lng: number; nummer: number; egenkontroll_id: string }[];
      expect(rader).toHaveLength(n);
      const [w, s, e, nn] = f.vida!;
      for (const r of rader) {
        expect(r.egenkontroll_id).toBe('rundan-1');
        expect(r.lng, `${namn} yta ${r.nummer}`).toBeGreaterThan(w);
        expect(r.lng).toBeLessThan(e);
        expect(r.lat).toBeGreaterThan(s);
        expect(r.lat).toBeLessThan(nn);
      }
    }
  });

  it('Bjällerhult (au + ga): samlat stämmer inte men första gränsen gör det → provytor lottas, inom gränsmarkeringarnas ruta', async () => {
    // Bjällerhult är slutavverkning i verkligheten; objektTyp 'gallring' här gör bara att funktionen kör — det är origokvittot som testas.
    for (let varv = 0; varv < 12; varv++) {
      const { f, loggar, ut } = kor('Bjällerhult au + ga', 0.42);
      expect(await ut).toBe(3);
      const rader = loggar[0].rader as { lat: number; lng: number }[];
      // Inte inom VIDAS ruta: Vidas traktdel (61×93 m) täcker bara avverkningen, gallringsdelen ligger utanför. Ytorna ska ligga inom
      // gränsmarkeringarnas gemensamma ruta, läst med planeringens origo (lat/lng, zoom 16).
      const ll = f.granser.flat().map(([x, y]) => svgToLatLon(x, y, { lat: f.lat, lng: f.lng, zoom: 16 }));
      const w = Math.min(...ll.map((q) => q.lng)), e = Math.max(...ll.map((q) => q.lng));
      const s = Math.min(...ll.map((q) => q.lat)), nn = Math.max(...ll.map((q) => q.lat));
      for (const r of rader) {
        expect(r.lng).toBeGreaterThan(w);
        expect(r.lng).toBeLessThan(e);
        expect(r.lat).toBeGreaterThan(s);
        expect(r.lat).toBeLessThan(nn);
      }
    }
  });

  it('gränsmarkeringar som inte stämmer med Vida, varken samlat eller enskilt (Bjällerhult med fel zoom): inga provytor och ingenting skrivs — en gallring blir ingen runda utan mätning av en slump', async () => {
    const f = OBJEKT['Bjällerhult au + ga'];
    const skalad = { ...f, granser: f.granser.map((g) => g.map(([x, y]) => [x * 2, y * 2])) };
    const { loggar, ut } = kor('Bjällerhult au + ga', 0.42, null, { rader: markeringsRader(skalad) });
    expect(await ut).toBe(0);
    expect(loggar).toHaveLength(0);
  });

  it('Brokamåla (zip utan geometrirad): inga provytor — det finns inget att kontrollera mot', async () => {
    const { loggar, ut } = kor('Brokamåla 1:5 V', 5.2);
    expect(await ut).toBe(0);
    expect(loggar).toHaveLength(0);
  });

  it('med kartbild_bounds: kvittot hoppas över (ingen Vida-rad behövs) och origot är bildens mitt på zoom 15 — samma som förut', async () => {
    const { f } = kor('Betet gallring 2026', 9.48);
    const { klient, loggar } = fejk({ rader: markeringsRader(f), geometri: [] });
    const bounds = [[f.vida![1], f.vida![0]], [f.vida![3], f.vida![2]]];
    const n = await skapaProvytor(klient, 'r', 'o', 'gallring', { areal: 9.48, kartbild_bounds: bounds, lat: f.lat, lng: f.lng, vo_nummer: null });
    expect(n).toBeGreaterThan(0);
    expect(loggar).toHaveLength(1);
  });

  it('ett LÄSFEL på Vidas traktgräns kastas — aldrig en tyst "0 ytor" (provytorna lottas en enda gång; generateEgenkontroll städar bort rundan)', async () => {
    const { ut, loggar } = kor('Betet gallring 2026', 9.48, null, { geometriFel: 'nätet föll' });
    await expect(ut).rejects.toThrow('Kunde inte läsa Vidas traktgräns: nätet föll');
    expect(loggar).toHaveLength(0);
  });

  it('en tom lista från objekt_geometri (utgången session ger tomt UTAN fel) faller stängt: inga ytor', async () => {
    const { ut, loggar } = kor('Betet gallring 2026', 9.48, null, { geometri: [] });
    expect(await ut).toBe(0);
    expect(loggar).toHaveLength(0);
  });

  it('slutavverkning lottas aldrig (provytor är bara gallring), och Vida läses då inte ens', async () => {
    const f = OBJEKT['Betet gallring 2026'];
    const { klient, loggar } = fejk({ rader: markeringsRader(f), geometri: vidaGeometri(f.vida!) });
    expect(await skapaProvytor(klient, 'r', 'o', 'slutavverkning', { areal: 9.48, kartbild_bounds: null, lat: f.lat, lng: f.lng, vo_nummer: null })).toBe(0);
    expect(loggar).toHaveLength(0);
  });

  it('ingen traktgräns ritad av planeraren: 0 ytor, som förut', async () => {
    const f = OBJEKT['Betet gallring 2026'];
    const { klient, loggar } = fejk({ rader: [], geometri: vidaGeometri(f.vida!) });
    expect(await skapaProvytor(klient, 'r', 'o', 'gallring', { areal: 9.48, kartbild_bounds: null, lat: f.lat, lng: f.lng, vo_nummer: null })).toBe(0);
    expect(loggar).toHaveLength(0);
  });

  it('saknad areal: 0 ytor (Räveboda har areal null)', async () => {
    const { ut, loggar } = kor('Räveboda gallring 2026', null as unknown as number);
    expect(await ut).toBe(0);
    expect(loggar).toHaveLength(0);
  });
});
