import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import { franSparat, inneMask, packaLaser, packaLutning, planeraUtsnitt, sammanfatta, tillSparat, SAKNAS16, SAKNAS8, type Plan } from './rutnat';
import { behov, korSkogsdata, VERSION } from './server';

const SWEREF = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const ll = (x: number, y: number) => proj4(SWEREF, 'EPSG:4326', [x, y]) as [number, number];
/** En ruta i SWEREF (jämna 10-tal) som ring i lng/lat. */
const ruta = (x0: number, y0: number, w: number, h: number) => [ll(x0, y0), ll(x0 + w, y0), ll(x0 + w, y0 + h), ll(x0, y0 + h), ll(x0, y0)];

function fyll(n: number, v: number) { return new Float32Array(n).fill(v); }
function band(p: Plan, o: Partial<Record<'volym' | 'hojd' | 'grundyta' | 'diameter' | 'dag', number>> = {}) {
  const n = p.u.bredd * p.u.hojd;
  return { volym: fyll(n, o.volym ?? 200), hojd: fyll(n, o.hojd ?? 150), grundyta: fyll(n, o.grundyta ?? 24), diameter: fyll(n, o.diameter ?? 18), dag: fyll(n, o.dag ?? 18_800) };
}

describe('planeraUtsnitt', () => {
  it('en trakt som ryms blir ETT utsnitt på jämna 10 m', () => {
    const p = planeraUtsnitt([ruta(500_000, 6_250_000, 100, 50)])!;
    expect(p).toHaveLength(1);
    expect(p[0].u.minX % 10).toBe(0);
    expect(p[0].u.bredd).toBeGreaterThanOrEqual(10);
  });
  it('bitar som ligger längre isär än 3 km blir ett utsnitt per bit', () => {
    const p = planeraUtsnitt([ruta(500_000, 6_250_000, 100, 100), ruta(505_000, 6_250_000, 100, 100)])!;
    expect(p).toHaveLength(2);
    expect(p.every((x) => x.ringar.length === 1)).toBe(true);
  });
  it('en enda bit över 3 km går inte', () => {
    expect(planeraUtsnitt([ruta(500_000, 6_250_000, 4_000, 100)])).toBeNull();
  });
});

describe('inneMask och sammanfatta', () => {
  const p = planeraUtsnitt([ruta(500_000, 6_250_000, 100, 100)])!;   // 1 ha = 100 rutor
  it('rutorna innanför gränsen räknas, inte de utanför', () => {
    const inne = inneMask(p[0]).reduce((a, b) => a + b, 0);
    expect(inne).toBeGreaterThanOrEqual(98);
    expect(inne).toBeLessThanOrEqual(102);
  });
  it('volym, grundyta, grovlek, höjd och år sammanfattas', () => {
    const nat = packaLaser(p[0], band(p[0]), -9999, new Date('2026-11-17'));
    const s = sammanfatta([nat]);
    expect(s.arealHa).toBeCloseTo(1, 1);
    expect(s.tackning).toBe(1);
    expect(s.laser).toEqual({ volymHa: 200, volym: Math.round(200 * s.arealHa), grundyta: 24, diameterCm: 18, hojdM: 15, ar: 2021 });
    expect(s.lutning).toBeNull();
    expect(s.fukt).toBeNull();
  });
  it('grovleken vägs med grundytan — en klen ruta med lite grundyta drar inte ner snittet lika mycket', () => {
    const b = band(p[0]);
    const inne = inneMask(p[0]);
    let forsta = true;
    for (let i = 0; i < inne.length; i++) if (inne[i]) { if (forsta) { b.diameter[i] = 30; b.grundyta[i] = 48; forsta = false; } else { b.diameter[i] = 10; b.grundyta[i] = 12; } }
    const s = sammanfatta([packaLaser(p[0], b, -9999, new Date('2026-11-17'))]);
    const n = inne.reduce((a, x) => a + x, 0);
    const vantat = (30 * 48 + 10 * 12 * (n - 1)) / (48 + 12 * (n - 1));
    expect(s.laser!.diameterCm).toBeCloseTo(vantat, 1);
  });
  it('för lite laserdata ger ingen sammanfattning — aldrig 0', () => {
    const b = band(p[0], { volym: -9999 });
    const s = sammanfatta([packaLaser(p[0], b, -9999)]);
    expect(s.laser).toBeNull();
    expect(s.tackning).toBe(0);
  });
  it('diameter 0 (låg skog) är saknas, inte 0 cm', () => {
    const nat = packaLaser(p[0], band(p[0], { diameter: 0 }), -9999, new Date('2026-11-17'));
    expect(nat.diameter.every((v) => v === SAKNAS8)).toBe(true);
    expect(sammanfatta([nat]).laser!.diameterCm).toBeNull();
  });
  it('orimliga värden är ett fel — banden har bytt plats', () => {
    expect(() => packaLaser(p[0], band(p[0], { grundyta: 250 }), -9999)).toThrow(/grundyta/);
    expect(() => packaLaser(p[0], band(p[0], { dag: 100 }), -9999)).toThrow(/skanningsår/);
    expect(() => packaLaser(p[0], band(p[0], { volym: 5000 }), -9999)).toThrow(/volym/);
  });
  it('lutning och fukt räknas bara innanför gränsen', () => {
    const nat = packaLaser(p[0], band(p[0]), -9999, new Date('2026-11-17'));
    const n = nat.bredd * nat.hojd;
    const lut = new Float32Array(n).fill(5);
    let k = 0;
    for (let i = 0; i < n; i++) if (nat.inne[i] && k++ < 10) lut[i] = 30;
    nat.lutning = packaLutning(lut, n);
    nat.fukt = new Uint8Array(n).fill(2);
    const s = sammanfatta([nat]);
    const inne = nat.inne.reduce((a, b) => a + b, 0);
    expect(s.lutning!.andelMycket).toBeCloseTo(10 / inne, 3);
    expect(s.lutning!.andelLite).toBe(0);
    expect(s.fukt).toEqual({ andelFuktig: 0, andelBlot: 1 });
  });
  it('det sparade rutnätet går att läsa tillbaka oförändrat', () => {
    const nat = packaLaser(p[0], band(p[0]), -9999, new Date('2026-11-17'));
    nat.volym[0] = SAKNAS16;
    const t = franSparat(JSON.parse(JSON.stringify(tillSparat(nat))));
    expect(Array.from(t.volym)).toEqual(Array.from(nat.volym));
    expect(Array.from(t.inne)).toEqual(Array.from(nat.inne));
    expect(t.lutning).toBeNull();
    expect(sammanfatta([t])).toEqual(sammanfatta([nat]));
  });
});

describe('behov', () => {
  const nu = Date.parse('2026-11-17T12:00:00Z');
  const s = (o: Partial<{ grans: string; version: number; hamtad_at: string; fel: string[] }>) => ({ objekt_id: 'a', grans: 'g', version: VERSION, hamtad_at: '2026-11-17T11:00:00Z', fel: [], ...o });
  it('aldrig hämtad → först', () => expect(behov(undefined, 'g', nu)).toBe(0));
  it('aktuell → rörs inte', () => expect(behov(s({}), 'g', nu)).toBeNull());
  it('ny gräns eller ny version → görs om', () => {
    expect(behov(s({}), 'annan', nu)).toBe(1);
    expect(behov(s({ version: VERSION - 1 }), 'g', nu)).toBe(1);
  });
  it('lutningen föll: nytt försök först efter sex timmar', () => {
    expect(behov(s({ fel: ['lutning: x'] }), 'g', nu)).toBeNull();
    expect(behov(s({ fel: ['lutning: x'], hamtad_at: '2026-11-17T05:00:00Z' }), 'g', nu)).toBe(2);
  });
});

// ---- körningen mot en låtsasdatabas ----
function fakeSb(tabeller: Record<string, any[]>, skrivna: any[], felI?: string) {
  return {
    from(t: string) {
      const svar = () => (felI === t ? { data: null, error: { message: 'trasig' } } : { data: tabeller[t] ?? [], error: null });
      const q: any = { select: () => q, in: () => q, then: (ok: any) => Promise.resolve(svar()).then(ok), upsert: (rad: any) => { skrivna.push(rad); return Promise.resolve({ error: null }); } };
      return q;
    },
  } as any;
}
const fc = (ring: [number, number][]) => ({ type: 'FeatureCollection', features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [ring] } }] });

describe('korSkogsdata', () => {
  const ring = ruta(500_000, 6_250_000, 100, 100);
  const tabeller = {
    objekt: [
      { id: 'klar', namn: 'Klar gallring', status: 'avslutat', typ: 'gallring', avslutad_timestamp: '2026-10-01' },
      { id: 'aktiv', namn: 'Santhe', status: 'pagaende', typ: 'gallring', avslutad_timestamp: null },
      { id: 'utan', namn: 'Utan gräns', status: 'planerad', typ: 'gallring', avslutad_timestamp: null },
    ],
    objekt_traktgrans: [{ objekt_id: 'klar', geometri: fc(ring) }, { objekt_id: 'aktiv', geometri: fc(ring) }],
    objekt_skogsdata: [],
  };
  const hamta = async (p: Plan) => ({ nat: packaLaser(p, band(p), -9999, new Date('2026-11-17')), fel: ['lutning: nere'] });

  it('aktiva trakter först, sedan avslutade; sammanfattning och rutnät sparas, felen följer med', async () => {
    const skrivna: any[] = [];
    const svar = await korSkogsdata(fakeSb(tabeller, skrivna), { budgetMs: 10_000, hamta });
    expect(svar.hamtade).toEqual(['Santhe', 'Klar gallring']);
    expect(svar.utanGrans).toBe(1);
    expect(skrivna[0].objekt_id).toBe('aktiv');
    expect(skrivna[0].sammanfattning.laser.volymHa).toBe(200);
    expect(skrivna[0].rutnat).toHaveLength(1);
    expect(skrivna[0].fel).toEqual(['lutning: nere']);
    expect(skrivna[0].version).toBe(VERSION);
  });
  it('tar tiden slut lämnas resten till nästa körning', async () => {
    const skrivna: any[] = [];
    let t = 0;
    const svar = await korSkogsdata(fakeSb(tabeller, skrivna), { budgetMs: 10, nu: () => (t += 20), hamta });
    expect(skrivna.length).toBeLessThan(2);
    expect(svar.kvar).toBeGreaterThan(0);
  });
  it('faller laserdatan sparas INGENTING för trakten — aldrig en tom rad', async () => {
    const skrivna: any[] = [];
    const svar = await korSkogsdata(fakeSb(tabeller, skrivna), { budgetMs: 10_000, hamta: async () => { throw new Error('laserdata: svar 502'); } });
    expect(skrivna).toHaveLength(0);
    expect(svar.ok).toBe(false);
    expect(svar.fel[0]).toContain('Santhe: laserdata');
  });
  it('ett läsfel är ett fel, aldrig "inga trakter"', async () => {
    const svar = await korSkogsdata(fakeSb(tabeller, [], 'objekt_skogsdata'), { budgetMs: 10_000, hamta });
    expect(svar.ok).toBe(false);
    expect(svar.fel[0]).toContain('objekt_skogsdata');
  });
});
