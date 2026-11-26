import { describe, it, expect } from 'vitest';
import { vagRisk, narmastaPunktPaVag, byggVagVy, VAG_UTSEENDE, VAG_BAND_M, VAG_BAND_OPACITET } from './vagRisk';
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

describe('utseendet', () => {
  it('orange band + orange ⚠ / ingen band + grön ✓ / rött band + röd ⚠', () => {
    expect(VAG_UTSEENDE.obedomd).toMatchObject({ band: true, farg: FARG.orange, tecken: '⚠' });
    expect(VAG_UTSEENDE.lag).toMatchObject({ band: false, farg: FARG.gron, tecken: '✓' });
    expect(VAG_UTSEENDE.hog).toMatchObject({ band: true, farg: FARG.rod, tecken: '⚠' });
  });
  it('✓ är liten, ⚠ är stor; bandet är brett och halvgenomskinligt', () => {
    expect(VAG_UTSEENDE.lag.storlek).toBeLessThan(VAG_UTSEENDE.obedomd.storlek);
    expect(VAG_BAND_M).toBeGreaterThanOrEqual(15);
    expect(VAG_BAND_OPACITET).toBeGreaterThan(0);
    expect(VAG_BAND_OPACITET).toBeLessThan(0.6);
  });
});

// En lodrät "väg" 100 m lång (lat 56,3 → 56,3009) vid lon 14,46 — och en traktgräns öster om den.
const lat = (m: number) => 56.3 + m / 111000;
const lonOffset = (m: number) => 14.46 + m / (111000 * Math.cos((56.3 * Math.PI) / 180));
const VAG: LatLon[] = [0, 25, 50, 75, 100].map((m) => ({ lat: lat(m), lon: 14.46 }));

describe('⚠/✓ ligger PÅ vägen, där den ligger närmast traktgränsen', () => {
  it('gränsens närmaste hörn projiceras på vägen (mitt emellan vägens hörn)', () => {
    const grans: LatLon[] = [{ lat: lat(0), lon: lonOffset(80) }, { lat: lat(60), lon: lonOffset(12) }, { lat: lat(100), lon: lonOffset(70) }];
    const p = narmastaPunktPaVag([VAG], grans)!;
    expect(p.lon).toBeCloseTo(14.46, 9);                                 // på vägen, inte på gränsen
    expect((p.lat - 56.3) * 111000).toBeCloseTo(60, 1);                   // där gränshörnet (60 m) projicerar
  });
  it('en lång gränskant utan hörn nära vägen ger ändå rätt plats (vägens hörn mot gränsens kant)', () => {
    const grans: LatLon[] = [{ lat: lat(-200), lon: lonOffset(8) }, { lat: lat(300), lon: lonOffset(8) }];   // rak kant 8 m öster om vägen, hörn långt utanför
    const p = narmastaPunktPaVag([VAG], grans)!;
    expect(p.lon).toBeCloseTo(14.46, 9);
    const m = (p.lat - 56.3) * 111000;
    expect(VAG.some((q) => Math.abs((q.lat - 56.3) * 111000 - m) < 0.01)).toBe(true);   // ett av vägens hörn (kanten ligger lika nära överallt)
  });
  it('flera vägbitar: närmaste bit vinner', () => {
    const langt: LatLon[] = [{ lat: lat(0), lon: lonOffset(200) }, { lat: lat(100), lon: lonOffset(200) }];
    const grans: LatLon[] = [{ lat: lat(40), lon: lonOffset(190) }, { lat: lat(60), lon: lonOffset(190) }];
    const p = narmastaPunktPaVag([VAG, langt], grans)!;
    expect(p.lon).toBeCloseTo(lonOffset(200), 9);
  });
  it('saknad väg eller gräns = ingen punkt', () => {
    expect(narmastaPunktPaVag([], [{ lat: 56.3, lon: 14.46 }])).toBeNull();
    expect(narmastaPunktPaVag([VAG], [])).toBeNull();
  });
});

const traff = (over: Partial<VagTraff> = {}): VagTraff => ({ name: 'Väg 538', type: 'secondary', ref: '538', distance: 20, wayId: 100, wayGeom: VAG, nearbyIdx: [0, 1, 2, 3, 4], nearbyGeom: VAG, closestPoint: VAG[2], ...over });
const klar = (...roads: VagTraff[]): VagKontroll => ({ status: 'done', roads });
const grans = (id: string): LatLon[] | null => (id === 'a' ? [{ lat: lat(0), lon: lonOffset(80) }, { lat: lat(60), lon: lonOffset(12) }] : id === 'b' ? [{ lat: lat(10), lon: lonOffset(30) }] : null);
const vagar = (ids: string[]) => samlaVagvarningar(ids.map((id) => [id, klar(traff({ distance: id === 'a' ? 12 : 30 }))] as [string, VagKontroll]), () => true).vagar;

describe('vyn: ett band och en symbol per väg', () => {
  it('två delar längs samma väg ger ETT band (ägarens färg) och EN symbol', () => {
    const v = byggVagVy(vagar(['a', 'b']), {}, grans);
    expect(v.band).toHaveLength(1);
    expect(v.symboler).toHaveLength(1);
    expect(v.symboler[0].agare).toBe('a');                // närmast
    expect(v.symboler[0].risk).toBe('obedomd');
    expect(v.band[0].properties).toMatchObject({ markerId: 'a', risk: 'obedomd' });
  });
  it('ägarens bedömning styr: låg = inget band men ✓ kvar; hög = band + ⚠', () => {
    const lag = byggVagVy(vagar(['a', 'b']), { a: NEJ }, grans);
    expect(lag.band).toHaveLength(0);
    expect(lag.symboler).toEqual([expect.objectContaining({ agare: 'a', risk: 'lag' })]);
    const hog = byggVagVy(vagar(['a', 'b']), { a: med(1) }, grans);
    expect(hog.band).toHaveLength(1);
    expect(hog.band[0].properties.risk).toBe('hog');
    expect(hog.symboler[0].risk).toBe('hog');
  });
  it('en annan dels bedömning ändrar inte vägens färg (bara ägarens)', () => {
    const v = byggVagVy(vagar(['a', 'b']), { b: NEJ }, grans);
    expect(v.symboler[0].risk).toBe('obedomd');
  });
  it('symbolen ligger på vägen (inte på gränsen) och i punkten närmast gränsen', () => {
    const v = byggVagVy(vagar(['a']), {}, grans);
    const s = v.symboler[0].pos;
    expect(s.lon).toBeCloseTo(14.46, 9);
    expect((s.lat - 56.3) * 111000).toBeCloseTo(60, 1);
  });
  it('okänd gräns: symbolen faller tillbaka på vägkontrollens närmaste punkt', () => {
    const v = byggVagVy(vagar(['x']), {}, () => null);
    expect(v.symboler[0].pos).toEqual(VAG[2]);
  });
  it('bandet följer vägens geometri', () => {
    const v = byggVagVy(vagar(['a']), {}, grans);
    expect(v.band[0].geometry.coordinates).toEqual(VAG.map((p) => [p.lon, p.lat]));
  });
});

// ── Brokamåla 1:5 V-H -26, väg 538: riktiga vägar (OSM, ur objekt_vagdata) och traktdel 9772 ───────────────────────────────────────────────────────
import fixtur from './__fixtures__/brokamala_traktdelar_2026-11-25.json';
import vagFixtur from './__fixtures__/brokamala_vag538_2026-11-25.json';

const m2 = (a: LatLon, b: LatLon) => { const kx = 111000 * Math.cos((a.lat * Math.PI) / 180); return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 111000); };
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
const GRANS_9772: LatLon[] = (fixtur as any).traktdelar.find((t: any) => String(t.trdel) === '9772').ring.map(([lon, lat]: number[]) => ({ lat, lon }));
const VAGAR: { id: number; geometri: LatLon[] }[] = (vagFixtur as any).vagar;
const brokVagar = () => {
  const traffar = VAGAR.map((v): VagTraff => {
    const idx = v.geometri.map((_, i) => i).filter((i) => avstTillLinje(v.geometri[i], GRANS_9772, true) < 200);
    const narmast = v.geometri.reduce((a, b) => (avstTillLinje(a, GRANS_9772, true) <= avstTillLinje(b, GRANS_9772, true) ? a : b));
    return { name: '538', type: 'primary', ref: '538', distance: Math.round(avstTillLinje(narmast, GRANS_9772, true)), wayId: v.id, wayGeom: v.geometri, nearbyIdx: idx, nearbyGeom: idx.map((i) => v.geometri[i]), closestPoint: narmast };
  }).filter((t) => t.nearbyIdx!.length >= 2);
  return samlaVagvarningar([['9772', { status: 'done', roads: traffar } as VagKontroll]], () => true).vagar;
};

describe('Brokamåla väg 538 (riktiga vägar och traktdel)', () => {
  it('en väg = ett band (per vägsträcka) och EN symbol, vars färg följer ägarens bedömning', () => {
    const v = brokVagar();
    expect(v).toHaveLength(1);
    const obedomd = byggVagVy(v, {}, () => GRANS_9772);
    expect(obedomd.symboler).toHaveLength(1);
    expect(obedomd.band.length).toBeGreaterThanOrEqual(1);
    expect(new Set(obedomd.band.map((b) => b.properties.risk))).toEqual(new Set(['obedomd']));
    expect(byggVagVy(v, { '9772': NEJ }, () => GRANS_9772)).toMatchObject({ band: [], symboler: [{ risk: 'lag' }] });
    const hog = byggVagVy(v, { '9772': med(1) }, () => GRANS_9772);
    expect(new Set(hog.band.map((b) => b.properties.risk))).toEqual(new Set(['hog']));
    expect(hog.symboler).toHaveLength(1);
  });
  it('symbolen ligger PÅ vägen (inom 5 cm) och i den punkt på vägen som är närmast traktgränsen (inom 1 m av det bästa som finns)', () => {
    const v = brokVagar();
    const s = byggVagVy(v, {}, () => GRANS_9772).symboler[0].pos;
    const linjer = v[0].linjer;
    expect(Math.min(...linjer.map((l) => avstTillLinje(s, l)))).toBeLessThan(0.05);
    // brute force: täta punkter längs alla vägbitar → minsta avstånd till gränsen
    let bast = Infinity;
    for (const l of linjer) for (let i = 0; i + 1 < l.length; i++) { const n = Math.max(1, Math.ceil(m2(l[i], l[i + 1]) / 0.5)); for (let k = 0; k <= n; k++) { const p = { lat: l[i].lat + ((l[i + 1].lat - l[i].lat) * k) / n, lon: l[i].lon + ((l[i + 1].lon - l[i].lon) * k) / n }; bast = Math.min(bast, avstTillLinje(p, GRANS_9772, true)); } }
    expect(avstTillLinje(s, GRANS_9772, true)).toBeLessThanOrEqual(bast + 1);
  });
});
