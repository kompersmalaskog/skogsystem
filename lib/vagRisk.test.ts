import { describe, it, expect } from 'vitest';
import { vagRisk, vagRubrik, placeraVagSymbol, byggVagVy, VAG_UTSEENDE, VAG_BAND_M, VAG_BAND_OPACITET, VAG_FRI_M, VAG_UTANFOR_M } from './vagRisk';
import { samlaVagvarningar, type LatLon, type VagKontroll, type VagTraff } from './tmaVagar';
import type { TmaRiskSvar } from './tmaSpar';
import { FARG } from './design/tokens';

const NEJ: TmaRiskSvar = [false, false, false, false, false, false, false];
const med = (...ja: number[]): TmaRiskSvar => NEJ.map((_, i) => (ja.includes(i) ? true : false));

describe('riskstatus per väg', () => {
  it('ingen bedömning, tomt eller inte alla sju besvarade = ej riskbedömd', () => {
    expect(vagRisk(undefined)).toBe('obedomd');
    expect(vagRisk([null, null, null, null, null, null, null])).toBe('obedomd');
    expect(vagRisk([false, false, false, false, false, false, null])).toBe('obedomd');
    expect(vagRisk([])).toBe('obedomd');
  });
  it('alla sju nej = låg risk', () => {
    expect(vagRisk(NEJ)).toBe('lag');
  });
  it('ett eller två ja ("Förhöjd" i panelen) och tre ja eller maskin på vägen ("Hög") = hög risk', () => {
    expect(vagRisk(med(0))).toBe('hog');          // förhöjd
    expect(vagRisk(med(0, 2))).toBe('hog');       // förhöjd
    expect(vagRisk(med(0, 2, 3))).toBe('hog');    // hög (tre ja)
    expect(vagRisk(med(1))).toBe('hog');          // hög (maskiner på vägen)
  });
  it('"blåser mot vägen" ensamt ger hög risk (ett ja = förhöjd, vinden höjer ett steg)', () => {
    expect(vagRisk(med(4))).toBe('hog');
  });
});

describe('utseendet: låg risk är tyst på kartan', () => {
  it('orange band + orange ⚠ / ingenting på kartan / rött band + röd ⚠', () => {
    expect(VAG_UTSEENDE.obedomd).toMatchObject({ band: true, symbol: true, farg: FARG.orange, tecken: '⚠' });
    expect(VAG_UTSEENDE.lag).toMatchObject({ band: false, symbol: false });
    expect(VAG_UTSEENDE.hog).toMatchObject({ band: true, symbol: true, farg: FARG.rod, tecken: '⚠' });
  });
  it('orden på raden i objektinfon: ej riskbedömd / låg risk ✓ / hög risk', () => {
    expect(VAG_UTSEENDE.obedomd.rad).toBe('ej riskbedömd');
    expect(VAG_UTSEENDE.lag.rad).toBe('låg risk ✓');
    expect(VAG_UTSEENDE.hog.rad).toBe('hög risk');
  });
  it('bandet är brett och halvgenomskinligt', () => {
    expect(VAG_BAND_M).toBeGreaterThanOrEqual(15);
    expect(VAG_BAND_OPACITET).toBeGreaterThan(0);
    expect(VAG_BAND_OPACITET).toBeLessThan(0.6);
  });
});

// ── Syntetisk värld: en lodrät väg 400 m lång (lat 0 → 400 m) vid lon 14,46, och en traktyta som täcker vägens södra halva (0–200 m) ──────────────────
const LAT0 = 56.3;
const lat = (m: number) => LAT0 + m / 111000;
const KX = 111000 * Math.cos((LAT0 * Math.PI) / 180);
const lon = (m: number) => 14.46 + m / KX;
const VAG: LatLon[] = [0, 100, 200, 300, 400].map((m) => ({ lat: lat(m), lon: lon(0) }));
const ruta = (s: number, w: number, n: number, e: number): LatLon[] => [{ lat: lat(s), lon: lon(w) }, { lat: lat(s), lon: lon(e) }, { lat: lat(n), lon: lon(e) }, { lat: lat(n), lon: lon(w) }];
const TRAKT = [ruta(-50, -80, 200, 80)];                       // vägen går in i trakten (0–200 m) och ut norrut (200–400 m)
const sydM = (p: LatLon) => (p.lat - LAT0) * 111000;
const avstM = (a: LatLon, b: LatLon) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * 111000);

describe('⚠ ligger på vägen UTANFÖR traktgränsen, nära där vägen når avverkningen', () => {
  it('vägen går ut ur trakten vid 200 m: ⚠ ligger strax norr om gränsen, på vägen, aldrig innanför', () => {
    const r = placeraVagSymbol([VAG], TRAKT, [])!;
    expect(r.pos.lon).toBeCloseTo(lon(0), 9);                          // på vägen
    expect(sydM(r.pos)).toBeGreaterThanOrEqual(200 + VAG_UTANFOR_M - 0.01);   // utanför, med lite luft från gränsen
    expect(sydM(r.pos)).toBeLessThan(200 + VAG_UTANFOR_M + 5);         // och nära gränsen (där vägen når avverkningen)
    expect(r).toMatchObject({ utanfor: true, fri: true });
  });
  it('är platsen upptagen av en annan symbol flyttas ⚠ längs vägen till närmaste fria punkt (norrut, fortfarande utanför)', () => {
    const upptagen: LatLon = { lat: lat(206), lon: lon(5) };
    const r = placeraVagSymbol([VAG], TRAKT, [upptagen])!;
    expect(avstM(r.pos, upptagen)).toBeGreaterThanOrEqual(VAG_FRI_M - 0.01);
    expect(sydM(r.pos)).toBeGreaterThan(200);
    expect(sydM(r.pos)).toBeLessThan(200 + VAG_UTANFOR_M + VAG_FRI_M + 8);   // närmaste fria — inte långt bort
    expect(r.pos.lon).toBeCloseTo(lon(0), 9);
    expect(r).toMatchObject({ utanfor: true, fri: true });
  });
  it('symboler INNE i trakten spelar ingen roll för platsen utanför, och en symbol innanför flyttar aldrig ⚠ in', () => {
    const inne: LatLon[] = [100, 150, 190, 199].map((m) => ({ lat: lat(m), lon: lon(3) }));
    const r = placeraVagSymbol([VAG], TRAKT, inne)!;
    expect(sydM(r.pos)).toBeGreaterThanOrEqual(200 + VAG_UTANFOR_M - 0.01);
  });
  it('inga fria platser alls utanför: ⚠ stannar ändå utanför gränsen, på den plats som ligger längst från de andra', () => {
    const tata: LatLon[] = []; for (let m = 200; m <= 400; m += 10) tata.push({ lat: lat(m), lon: lon(2) });
    const r = placeraVagSymbol([VAG], TRAKT, tata)!;
    expect(r.fri).toBe(false);
    expect(sydM(r.pos)).toBeGreaterThan(200);
    expect(Math.min(...tata.map((h) => avstM(r.pos, h)))).toBeGreaterThan(1);
  });
  it('ingen fri plats alls: ⚠ ligger i den största luckan mellan symbolerna, inte bara närmast gränsen', () => {
    const hinder: LatLon[] = []; for (let m = 200; m <= 330; m += 10) hinder.push({ lat: lat(m), lon: lon(2) }); for (let m = 380; m <= 400; m += 10) hinder.push({ lat: lat(m), lon: lon(2) });
    const r = placeraVagSymbol([VAG], TRAKT, hinder)!;
    expect(r.fri).toBe(false);
    expect(sydM(r.pos)).toBeGreaterThan(335);                              // i luckan 330–380 m, långt från gränsen vid 200 m
    expect(sydM(r.pos)).toBeLessThan(375);
    expect(Math.min(...hinder.map((h) => avstM(r.pos, h)))).toBeGreaterThan(20);
  });
  it('vägen har ingen del utanför trakten: närmaste fria punkt på vägen (nära gränsen), inte på gränsen', () => {
    const kort: LatLon[] = [{ lat: lat(60), lon: lon(0) }, { lat: lat(120), lon: lon(0) }];
    const r = placeraVagSymbol([kort], TRAKT, [])!;
    expect(r.utanfor).toBe(false);
    expect(r.fri).toBe(true);
    expect(r.pos.lon).toBeCloseTo(lon(0), 9);
    expect(sydM(r.pos)).toBeGreaterThanOrEqual(60 - 0.01);
    expect(sydM(r.pos)).toBeLessThanOrEqual(120 + 0.01);
  });
  it('vägen helt inne i trakten och en symbol på den bästa platsen: ⚠ flyttas längs vägen', () => {
    const kort: LatLon[] = [{ lat: lat(0), lon: lon(0) }, { lat: lat(100), lon: lon(0) }];
    const forsta = placeraVagSymbol([kort], TRAKT, [])!;
    const flyttad = placeraVagSymbol([kort], TRAKT, [forsta.pos])!;
    expect(avstM(flyttad.pos, forsta.pos)).toBeGreaterThanOrEqual(VAG_FRI_M - 0.01);
    expect(flyttad.pos.lon).toBeCloseTo(lon(0), 9);
  });
  it('flera traktytor: ⚠ ligger utanför ALLA (en granndel räknas också som trakt)', () => {
    const grann = ruta(200, -80, 260, 80);                       // en andra del norr om den första — vägen är inne i den mellan 200 och 260 m
    const r = placeraVagSymbol([VAG], [...TRAKT, grann], [])!;
    expect(sydM(r.pos)).toBeGreaterThan(260);
    expect(r.utanfor).toBe(true);
  });
  it('okänd gräns: närmaste fria punkt från vägkontrollens närmaste punkt (referens)', () => {
    const r = placeraVagSymbol([VAG], [], [], VAG[3])!;
    expect(sydM(r.pos)).toBeCloseTo(300, 0);
    const flyttad = placeraVagSymbol([VAG], [], [VAG[3]], VAG[3])!;
    expect(avstM(flyttad.pos, VAG[3])).toBeGreaterThanOrEqual(VAG_FRI_M - 0.01);
  });
  it('slumpade symboler: ⚠ hamnar aldrig innanför trakten så länge vägen har en del utanför', () => {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 200; k++) {
      const hinder: LatLon[] = Array.from({ length: Math.floor(rnd() * 40) }, () => ({ lat: lat(rnd() * 450 - 25), lon: lon(rnd() * 20 - 10) }));
      const r = placeraVagSymbol([VAG], TRAKT, hinder)!;
      expect(sydM(r.pos)).toBeGreaterThan(200);
      expect(r.pos.lon).toBeCloseTo(lon(0), 9);
    }
  });
  it('saknad väg = ingen plats', () => {
    expect(placeraVagSymbol([], TRAKT, [])).toBeNull();
  });
});

const traff = (over: Partial<VagTraff> = {}): VagTraff => ({ name: 'Väg 538', type: 'secondary', ref: '538', distance: 20, wayId: 100, wayGeom: VAG, nearbyIdx: [0, 1, 2, 3, 4], nearbyGeom: VAG, closestPoint: VAG[2], ...over });
const klar = (...roads: VagTraff[]): VagKontroll => ({ status: 'done', roads });
const vagar = (ids: string[], over: Partial<VagTraff> = {}) => samlaVagvarningar(ids.map((id) => [id, klar(traff({ distance: id === 'a' ? 12 : 30, ...over }))] as [string, VagKontroll]), () => true).vagar;

describe('vyn: ett band, en ⚠ och en rad per väg', () => {
  it('två delar längs samma väg ger ETT band (ägarens färg), EN ⚠ och EN rad', () => {
    const v = byggVagVy(vagar(['a', 'b']), {}, TRAKT);
    expect(v.band).toHaveLength(1);
    expect(v.symboler).toHaveLength(1);
    expect(v.rader).toHaveLength(1);
    expect(v.symboler[0]).toMatchObject({ agare: 'a', risk: 'obedomd' });
    expect(v.band[0].properties).toMatchObject({ markerId: 'a', risk: 'obedomd' });
    expect(v.rader[0]).toMatchObject({ agare: 'a', rubrik: 'Väg 538', risk: 'obedomd', status: 'ej riskbedömd' });
  });
  it('låg risk = inget band och INGEN symbol på kartan — men raden "Väg 538 · låg risk ✓" finns', () => {
    const v = byggVagVy(vagar(['a']), { a: NEJ }, TRAKT);
    expect(v.band).toEqual([]);
    expect(v.symboler).toEqual([]);
    expect(v.rader).toEqual([expect.objectContaining({ rubrik: 'Väg 538', risk: 'lag', status: 'låg risk ✓', farg: FARG.gron })]);
  });
  it('hög risk = rött band + röd ⚠ utanför gränsen, och raden säger hög risk', () => {
    const v = byggVagVy(vagar(['a']), { a: med(1) }, TRAKT);
    expect(v.band[0].properties.risk).toBe('hog');
    expect(v.symboler).toEqual([expect.objectContaining({ risk: 'hog' })]);
    expect(sydM(v.symboler[0].pos)).toBeGreaterThan(200);
    expect(v.rader[0]).toMatchObject({ risk: 'hog', status: 'hög risk', farg: FARG.rod });
  });
  it('ej bedömd ger orange ⚠ utanför gränsen (inte där vägen ligger närmast gränsen inne i trakten)', () => {
    const v = byggVagVy(vagar(['a']), {}, TRAKT);
    expect(sydM(v.symboler[0].pos)).toBeGreaterThan(200);
  });
  it('en annan dels bedömning ändrar inte vägens läge (bara ägarens)', () => {
    const v = byggVagVy(vagar(['a', 'b']), { b: NEJ }, TRAKT);
    expect(v.rader[0].risk).toBe('obedomd');
    expect(v.symboler).toHaveLength(1);
  });
  it('bandet följer vägens geometri', () => {
    const v = byggVagVy(vagar(['a']), {}, TRAKT);
    expect(v.band[0].geometry.coordinates).toEqual(VAG.map((p) => [p.lon, p.lat]));
  });
  it('två vägar: den andra ⚠ undviker den första (en ⚠ som redan satts är ett hinder)', () => {
    const vag2: LatLon[] = [0, 100, 200, 300, 400].map((m) => ({ lat: lat(m), lon: lon(10) }));       // en parallell väg 10 m öster
    const v = byggVagVy(samlaVagvarningar([
      ['a', klar(traff({ name: 'Väg 538', ref: '538', wayId: 1, wayGeom: VAG, nearbyGeom: VAG, closestPoint: VAG[2] }), traff({ name: 'Väg 540', ref: '540', wayId: 2, wayGeom: vag2, nearbyGeom: vag2, closestPoint: vag2[2] }))],
    ], () => true).vagar, {}, TRAKT);
    expect(v.symboler).toHaveLength(2);
    expect(avstM(v.symboler[0].pos, v.symboler[1].pos)).toBeGreaterThanOrEqual(VAG_FRI_M - 0.01);
  });
  it('en annan symbol på den bästa platsen flyttar ⚠ (hinder skickas in)', () => {
    const forst = byggVagVy(vagar(['a']), {}, TRAKT).symboler[0].pos;
    const v = byggVagVy(vagar(['a']), {}, TRAKT, [forst]);
    expect(avstM(v.symboler[0].pos, forst)).toBeGreaterThanOrEqual(VAG_FRI_M - 0.01);
  });
  it('raderna: hög risk först, sedan ej bedömd, sist låg risk', () => {
    const lag = (n: string): VagTraff => traff({ name: n, ref: n, wayId: Number(n), wayGeom: VAG, nearbyGeom: VAG });
    const v = byggVagVy(samlaVagvarningar([['a', klar(lag('538'), lag('540'), lag('542'))], ['b', klar(lag('999'))]], () => true).vagar, { a: NEJ }, TRAKT);
    // (alla vägar tillhör närmaste del a eller b; a har bedömts låg)
    expect(v.rader.map((r) => r.risk)).toEqual([...v.rader.map((r) => r.risk)].sort((x, y) => ({ hog: 0, obedomd: 1, lag: 2 } as any)[x] - ({ hog: 0, obedomd: 1, lag: 2 } as any)[y]));
  });
});

describe('radens rubrik', () => {
  it('vägnummer → "Väg 538", annars vägens namn, annars "Väg"', () => {
    expect(vagRubrik({ ref: '538', namn: 'Brokamålavägen' })).toBe('Väg 538');
    expect(vagRubrik({ ref: undefined, namn: 'Brokamålavägen' })).toBe('Brokamålavägen');
    expect(vagRubrik({ ref: ' ', namn: 'Namnlös väg' })).toBe('Väg');
    expect(vagRubrik({ ref: undefined, namn: '' })).toBe('Väg');
  });
});

// ── Brokamåla 1:5 V-H -26, väg 538: riktiga vägar (OSM, ur objekt_vagdata), de tre traktdelarna och symbolerna ur prod ───────────────────────────────
import fixtur from './__fixtures__/brokamala_traktdelar_2026-11-25.json';
import vagFixtur from './__fixtures__/brokamala_vag538_2026-11-25.json';
import tryckFixtur from './__fixtures__/brokamala_tryck_2026-11-23.json';

function avstTillLinje(p: LatLon, linje: LatLon[], sluten = false): number {
  const kx = 111000 * Math.cos((p.lat * Math.PI) / 180);
  const t = (q: LatLon) => ({ x: (q.lon - p.lon) * kx, y: (q.lat - p.lat) * 111000 });
  let basta = Infinity;
  const n = sluten ? linje.length : linje.length - 1;
  for (let i = 0; i < n; i++) {
    const a = t(linje[i]), b = t(linje[(i + 1) % linje.length]);
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const u = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l2));
    basta = Math.min(basta, Math.hypot(a.x + u * dx, a.y + u * dy));
  }
  return basta;
}
const iRing = (p: LatLon, ring: LatLon[]): boolean => { let inne = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i].lat > p.lat) !== (ring[j].lat > p.lat) && p.lon < ((ring[j].lon - ring[i].lon) * (p.lat - ring[i].lat)) / (ring[j].lat - ring[i].lat) + ring[i].lon) inne = !inne; return inne; };
const RINGAR: LatLon[][] = (fixtur as any).traktdelar.map((t: any) => t.ring.map(([lng, la]: number[]) => ({ lat: la, lon: lng })));
const GRANS_9772: LatLon[] = (fixtur as any).traktdelar.find((t: any) => String(t.trdel) === '9772').ring.map(([lng, la]: number[]) => ({ lat: la, lon: lng }));
const VAGAR: { id: number; geometri: LatLon[] }[] = (vagFixtur as any).vagar;
const brokVagar = () => {
  const traffar = VAGAR.map((v): VagTraff => {
    const idx = v.geometri.map((_, i) => i).filter((i) => avstTillLinje(v.geometri[i], GRANS_9772, true) < 200);
    const narmast = v.geometri.reduce((a, b) => (avstTillLinje(a, GRANS_9772, true) <= avstTillLinje(b, GRANS_9772, true) ? a : b));
    return { name: '538', type: 'primary', ref: '538', distance: Math.round(avstTillLinje(narmast, GRANS_9772, true)), wayId: v.id, wayGeom: v.geometri, nearbyIdx: idx, nearbyGeom: idx.map((i) => v.geometri[i]), closestPoint: narmast };
  }).filter((t) => t.nearbyIdx!.length >= 2);
  return samlaVagvarningar([['9772', { status: 'done', roads: traffar } as VagKontroll]], () => true).vagar;
};
// Symbolerna på kartan: våra markeringar (x/y i meter från origo, zoom-16-skala som sidan) och Vidas punkter (avlägg, larmplatser).
const C = (tryckFixtur as any).origo;
const SK = (156543.03392 * Math.cos((C.lat * Math.PI) / 180)) / Math.pow(2, 16);
const svg = (x: number, y: number): LatLon => ({ lat: C.lat + (-y * SK) / 111320, lon: C.lng + (x * SK) / (111320 * Math.cos((C.lat * Math.PI) / 180)) });
const SYMBOLER: LatLon[] = [
  ...(tryckFixtur as any).markeringar.filter((m: any) => m.typ === 'symbol').map((m: any) => svg(m.x, m.y)),
  ...(tryckFixtur as any).features.filter((f: any) => f.geometry?.type === 'Point').map((f: any) => ({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] })),
];

describe('Brokamåla väg 538 (riktiga vägar, traktdelar och symboler)', () => {
  it('en väg = ett band och EN ⚠ (ej bedömd, hög) eller ingen alls (låg) — raden finns i alla tre lägen', () => {
    const v = brokVagar();
    expect(v).toHaveLength(1);
    const obedomd = byggVagVy(v, {}, RINGAR, SYMBOLER);
    expect(obedomd.symboler).toHaveLength(1);
    expect(new Set(obedomd.band.map((b) => b.properties.risk))).toEqual(new Set(['obedomd']));
    expect(obedomd.rader).toEqual([expect.objectContaining({ rubrik: 'Väg 538', status: 'ej riskbedömd' })]);
    const lag = byggVagVy(v, { '9772': NEJ }, RINGAR, SYMBOLER);
    expect(lag).toMatchObject({ band: [], symboler: [], rader: [{ rubrik: 'Väg 538', status: 'låg risk ✓' }] });
    const hog = byggVagVy(v, { '9772': med(1) }, RINGAR, SYMBOLER);
    expect(new Set(hog.band.map((b) => b.properties.risk))).toEqual(new Set(['hog']));
    expect(hog.symboler).toHaveLength(1);
    expect(hog.rader[0].status).toBe('hög risk');
  });
  it('⚠ ligger PÅ vägen (inom 5 cm), UTANFÖR alla tre traktdelar och fri från alla symboler (≥ 40 m)', () => {
    const v = brokVagar();
    const s = byggVagVy(v, {}, RINGAR, SYMBOLER).symboler[0].pos;
    expect(Math.min(...v[0].linjer.map((l) => avstTillLinje(s, l)))).toBeLessThan(0.05);
    expect(RINGAR.some((r) => iRing(s, r))).toBe(false);
    expect(Math.min(...RINGAR.map((r) => avstTillLinje(s, r, true)))).toBeGreaterThanOrEqual(VAG_UTANFOR_M - 0.5);
    expect(Math.min(...SYMBOLER.map((h) => avstM(s, h)))).toBeGreaterThanOrEqual(VAG_FRI_M - 0.01);
  });
  it('⚠ är den fria platsen utanför som ligger närmast gränsen: ingen annan fri plats utanför på vägen ligger närmare', () => {
    const v = brokVagar();
    const s = byggVagVy(v, {}, RINGAR, SYMBOLER).symboler[0].pos;
    const dS = Math.min(...RINGAR.map((r) => avstTillLinje(s, r, true)));
    let basta = Infinity;
    for (const l of v[0].linjer) for (let i = 0; i + 1 < l.length; i++) {
      const n = Math.max(1, Math.ceil(avstM(l[i], l[i + 1]) / 1));
      for (let k = 0; k <= n; k++) {
        const p = { lat: l[i].lat + ((l[i + 1].lat - l[i].lat) * k) / n, lon: l[i].lon + ((l[i + 1].lon - l[i].lon) * k) / n };
        if (RINGAR.some((r) => iRing(p, r))) continue;
        const d = Math.min(...RINGAR.map((r) => avstTillLinje(p, r, true)));
        if (d < VAG_UTANFOR_M) continue;
        if (Math.min(...SYMBOLER.map((h) => avstM(p, h))) < VAG_FRI_M) continue;
        basta = Math.min(basta, d);
      }
    }
    expect(dS).toBeLessThanOrEqual(basta + PROV_TOL);
  });
});
const PROV_TOL = 4.5;   // placeringen prövar var 4:e meter längs vägen; kontrollen är tätare
