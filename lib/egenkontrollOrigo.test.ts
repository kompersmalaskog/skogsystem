import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import fixtur from './__fixtures__/origo_kvitto_prod_2026-10-19.json';
import {
  KVITTO,
  beslutaOrigo,
  lasVidaGrans,
  markeringsGranser,
  markeringsPunkter,
  origoForklaring,
  snapshotPunkter,
  type OrigoBeslut,
  type Punkt,
  type VidaGrans,
} from './egenkontrollOrigo';
import { objektStartKamera } from './objektFlyg';

type FixObjekt = { lat: number; lng: number; vida: number[] | null; granser: number[][][]; punkter: number[][] };
const OBJEKT = fixtur.objekt as unknown as Record<string, FixObjekt>;
const SUMMOR = fixtur._summor as unknown as Record<string, [number, number, number]>;

const punkter = (f: FixObjekt): Punkt[] => f.punkter.map(([x, y]) => ({ x, y }));
const granser = (f: FixObjekt): Punkt[][] => f.granser.map((g) => g.map(([x, y]) => ({ x, y })));
const vidaAv = (f: FixObjekt): VidaGrans =>
  f.vida ? { typ: 'ok', gran: [[f.vida[0], f.vida[1]], [f.vida[2], f.vida[3]]] } : { typ: 'saknas' };

function beslut(namn: string, andra: Partial<{ punkter: Punkt[]; granser: Punkt[][]; vida: VidaGrans }> = {}): OrigoBeslut {
  const f = OBJEKT[namn];
  return beslutaOrigo({
    objekt: { lat: f.lat, lng: f.lng, kartbild_bounds: null },
    punkter: andra.punkter ?? punkter(f),
    granser: andra.granser ?? granser(f),
    vida: andra.vida ?? vidaAv(f),
  });
}

const skala = (p: Punkt[], k: number): Punkt[] => p.map((q) => ({ x: q.x * k, y: q.y * k }));
const flytta = (p: Punkt[], dx: number, dy: number): Punkt[] => p.map((q) => ({ x: q.x + dx, y: q.y + dy }));

// Meter per pixel på zoom 16 vid latituden — samma tal som planeringen räknar med.
const mPerPx = (lat: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, 16);

describe('fixturen ur prod är orörd', () => {
  it('antal punkter och kontrollsummor stämmer mot det som lästes ur prod 2026-10-19', () => {
    for (const [namn, [n, sx, sy]] of Object.entries(SUMMOR)) {
      const p = OBJEKT[namn].punkter;
      expect(p.length, namn).toBe(n);
      expect(Math.round(p.reduce((a, q) => a + q[0], 0) * 10) / 10, namn).toBeCloseTo(sx, 1);
      expect(Math.round(p.reduce((a, q) => a + q[1], 0) * 10) / 10, namn).toBeCloseTo(sy, 1);
    }
  });
});

describe('beslutaOrigo — de åtta objekten utan kartbild_bounds (prod 2026-10-19)', () => {
  it.each(['Betet gallring 2026', 'Hallaslätt AU 2026', 'Räveboda gallring 2026', 'Hålabäck gallring 2026'])(
    '%s: gränsmarkeringarna har Vidas storlek och mitt → STARKT kvitto, ritas (samlat)',
    (namn) => {
      const b = beslut(namn);
      expect(b.ok).toBe(true);
      if (!b.ok || b.kalla !== 'latlng') throw new Error('förväntade lat/lng-origo');
      expect(b.kvitto.styrka).toBe('stark');
      expect(b.kvitto.via).toBe('samlat');
      expect(b.kvitto.granser).not.toBeNull();
    },
  );

  it.each(['Östra-Hoka 1:7 A-C -25', 'Hålabäck au 2025'])(
    '%s: inga gränsmarkeringar, punkterna ligger i Vidas ruta → SVAGT kvitto, ritas',
    (namn) => {
      const b = beslut(namn);
      expect(b.ok).toBe(true);
      if (!b.ok || b.kalla !== 'latlng') throw new Error('förväntade lat/lng-origo');
      expect(b.kvitto.styrka).toBe('svag');
      expect(b.kvitto.andelInom).toBeGreaterThanOrEqual(KVITTO.ANDEL_INOM);
    },
  );

  it('Bjällerhult (au + ga): samlat 157×238 m mot Vidas 61×93 m stämmer inte, men FÖRSTA gränsen är 61×93 m med Vidas mitt → STARKT kvitto via enskild gräns, ritas', () => {
    const b = beslut('Bjällerhult au + ga');
    expect(b.ok).toBe(true);
    if (!b.ok || b.kalla !== 'latlng') throw new Error('förväntade lat/lng-origo');
    expect(b.kvitto.styrka).toBe('stark');
    expect(b.kvitto.via).toBe('enskild');
    const g = b.kvitto.granser!;
    expect(Math.round(g.bredd)).toBe(61);
    expect(Math.round(g.hojd)).toBe(93);
    expect(Math.round(g.vidaBredd)).toBe(61);
    expect(Math.round(g.vidaHojd)).toBe(93);
    expect(Math.abs(g.dx)).toBeLessThan(5);
    expect(Math.abs(g.dy)).toBeLessThan(5);
  });

  it('Brokamåla (zip, ingen geometrirad): Vidas traktgräns saknas → ritas inte', () => {
    expect(beslut('Brokamåla 1:5 V')).toEqual({ ok: false, skal: 'ingen_vida_grans' });
  });

  it('kvittots mått är de uppmätta: Betet gallring 308×528 m mot Vidas 305×523, mitt inom 2 m', () => {
    const b = beslut('Betet gallring 2026');
    if (!b.ok || b.kalla !== 'latlng' || !b.kvitto.granser) throw new Error('förväntade stark kontroll');
    const g = b.kvitto.granser;
    expect(Math.round(g.bredd)).toBe(308);
    expect(Math.round(g.hojd)).toBe(528);
    expect(Math.round(g.vidaBredd)).toBe(305);
    expect(Math.round(g.vidaHojd)).toBe(523);
    expect(Math.abs(g.dx)).toBeLessThan(2);
    expect(Math.abs(g.dy)).toBeLessThan(2);
  });
});

describe('beslutaOrigo — samlat ELLER enskild gräns (båda sätten behövs; se huvudet i egenkontrollOrigo.ts)', () => {
  // REGRESSIONEN: flera traktdelar som var för sig är för små men tillsammans är Vidas ruta. "Minst en gräns" ensamt hade gjort dem blinda.
  it.each(['Hålabäck gallring 2026', 'Hallaslätt AU 2026'])('%s: ingen enskild gräns stämmer, men alla tillsammans gör det → ritas, via samlat', (namn) => {
    const f = OBJEKT[namn];
    expect(f.granser.length).toBeGreaterThan(1);
    for (const [i, g] of granser(f).entries()) {
      const bara = beslut(namn, { granser: [g] });
      expect(bara, `${namn} gräns ${i + 1} ensam`).toMatchObject({ ok: false, skal: 'stammer_inte' });
    }
    const b = beslut(namn);
    expect(b.ok && b.kalla === 'latlng' && b.kvitto.via).toBe('samlat');
  });

  // Bjällerhult: en del utanför Vidas traktdel. "Bara samlat" kan aldrig uppfyllas.
  it('Bjällerhult: samlat faller (157×238), enskilt går via första gränsen — och den andra gränsen ensam (111×238, utanför Vidas ruta) räcker inte', () => {
    const namn = 'Bjällerhult au + ga';
    const f = OBJEKT[namn];
    expect(f.granser).toHaveLength(2);
    const [forsta, andra] = granser(f);
    expect(beslut(namn, { granser: [forsta, andra] }).ok).toBe(true);
    const bara1 = beslut(namn, { granser: [forsta] });
    expect(bara1.ok && bara1.kalla === 'latlng' && bara1.kvitto.via).toBe('samlat');   // en gräns ensam = samlat och enskild är samma sak
    const bara2 = beslut(namn, { granser: [andra] });
    expect(bara2).toMatchObject({ ok: false, skal: 'stammer_inte' });
    if (bara2.ok) throw new Error('ska falla');
    expect(bara2.detalj).toMatch(/111×238 m mot Vidas 61×93 m/);
  });

  it('Bjällerhult med fel zoom (alla markeringar ×2) och med förskjutet origo (400 px) → faller, detaljen säger att ingen gräns stämmer enskilt', () => {
    const namn = 'Bjällerhult au + ga';
    const f = OBJEKT[namn];
    const fel = [
      beslut(namn, { punkter: skala(punkter(f), 2), granser: granser(f).map((g) => skala(g, 2)) }),
      beslut(namn, { punkter: flytta(punkter(f), 400, 0), granser: granser(f).map((g) => flytta(g, 400, 0)) }),
    ];
    for (const b of fel) {
      expect(b).toMatchObject({ ok: false, skal: 'stammer_inte' });
      if (b.ok) throw new Error('ska falla');
      expect(b.detalj).toMatch(/och ingen av de 2 gränserna stämmer enskilt/);
    }
  });

  it('en enskild gräns som stämmer räcker även när en annan ligger kilometer bort (verklig geografi, inte ett origofel)', () => {
    const namn = 'Bjällerhult au + ga';
    const f = OBJEKT[namn];
    const [forsta, andra] = granser(f);
    // Ordningen ska inte spela roll: den som stämmer kan vara först eller sist.
    for (const g of [[forsta, flytta(andra, 3000, 3000)], [flytta(andra, 3000, 3000), forsta], [andra, forsta], [forsta, andra]]) {
      const b = beslut(namn, { granser: g });
      expect(b.ok && b.kalla === 'latlng' && b.kvitto.via).toBe('enskild');
    }
  });

  it('en liten gräns som inte har Vidas storlek räcker inte, även om den ligger mitt i rutan (slumpträff kräver både storlek och mitt)', () => {
    const namn = 'Betet gallring 2026';
    const lilla: Punkt[] = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }];
    const b = beslut(namn, { granser: [lilla] });
    expect(b).toMatchObject({ ok: false, skal: 'stammer_inte' });
  });
});

describe('beslutaOrigo — origot ÄR objektStartKamera, ingen egen variant', () => {
  it('lat/lng-origot är lat/lng på zoom 16, exakt det planeringen räknar med', () => {
    for (const namn of Object.keys(OBJEKT)) {
      const f = OBJEKT[namn];
      const b = beslut(namn);
      const origo = b.ok ? b.origo : objektStartKamera({ lat: f.lat, lng: f.lng });
      expect(origo, namn).toEqual({ lat: f.lat, lng: f.lng, zoom: 16 });
      expect(origo, namn).toEqual(objektStartKamera({ lat: f.lat, lng: f.lng, kartbild_bounds: null }));
    }
  });

  it('med kartbild_bounds: bildens mitt på zoom 15, kalla "bounds", INGET kvitto och ingen väntan på Vida', () => {
    const bounds = [[56.0, 14.0], [56.2, 14.2]];
    for (const vida of [{ typ: 'laddar' }, { typ: 'saknas' }, { typ: 'fel' }] as VidaGrans[]) {
      const b = beslutaOrigo({ objekt: { lat: 56.4, lng: 14.7, kartbild_bounds: bounds }, punkter: [{ x: 1e6, y: 1e6 }], granser: [], vida });
      expect(b).toEqual({ ok: true, origo: { lat: 56.1, lng: 14.1, zoom: 15 }, kalla: 'bounds' });
      expect(b).toEqual({ ok: true, origo: objektStartKamera({ lat: 56.4, lng: 14.7, kartbild_bounds: bounds })!, kalla: 'bounds' });
    }
  });

  it('bounds med tomma värden räknas inte: origot faller tillbaka på lat/lng (som planeringen)', () => {
    const f = OBJEKT['Betet gallring 2026'];
    const b = beslutaOrigo({ objekt: { lat: f.lat, lng: f.lng, kartbild_bounds: [[null, null], [null, null]] }, punkter: punkter(f), granser: granser(f), vida: vidaAv(f) });
    expect(b.ok && b.kalla).toBe('latlng');
    expect(b.ok && b.origo.zoom).toBe(16);
  });

  it('varken bounds eller lat/lng → saknar_position, och Vida läses inte ens', () => {
    expect(beslutaOrigo({ objekt: { lat: null, lng: null, kartbild_bounds: null }, punkter: [], granser: [], vida: { typ: 'laddar' } })).toEqual({ ok: false, skal: 'saknar_position' });
    expect(beslutaOrigo({ objekt: null, punkter: [], granser: [], vida: { typ: 'laddar' } })).toEqual({ ok: false, skal: 'saknar_position' });
    expect(beslutaOrigo({ objekt: undefined, punkter: [], granser: [], vida: { typ: 'laddar' } })).toEqual({ ok: false, skal: 'saknar_position' });
  });
});

describe('beslutaOrigo — fel som ska fångas (aldrig flera mil fel, aldrig dubbelt så långt från mitten)', () => {
  const BETET = 'Betet gallring 2026';
  const f = OBJEKT[BETET];

  it('STARKT: fel zoom fälls — markeringar ritade på zoom 15 men lästa på zoom 16 (halva avstånd) och tvärtom (dubbla)', () => {
    for (const k of [0.5, 2]) {
      const b = beslut(BETET, { punkter: skala(punkter(f), k), granser: granser(f).map((g) => skala(g, k)) });
      expect(b, `×${k}`).toMatchObject({ ok: false, skal: 'stammer_inte' });
    }
  });

  it('STARKT: förskjutet origo fälls — en lat/lng som flyttats 400 px (cirka 520 m)', () => {
    const b = beslut(BETET, { punkter: flytta(punkter(f), 400, 0), granser: granser(f).map((g) => flytta(g, 400, 0)) });
    expect(b).toMatchObject({ ok: false, skal: 'stammer_inte' });
    const c = beslut(BETET, { punkter: flytta(punkter(f), 0, -300), granser: granser(f).map((g) => flytta(g, 0, -300)) });
    expect(c).toMatchObject({ ok: false, skal: 'stammer_inte' });
  });

  it('SVAGT: ett förskjutet origo fälls (Östra-Höka 300 px åt väster, cirka 395 m)', () => {
    const o = OBJEKT['Östra-Hoka 1:7 A-C -25'];
    const b = beslut('Östra-Hoka 1:7 A-C -25', { punkter: flytta(punkter(o), -300, 0) });
    expect(b).toMatchObject({ ok: false, skal: 'stammer_inte' });
  });

  it('SVAGT: dokumenterad svaghet — ett rent skalfel (halva avstånden) syns inte utan gränsmarkeringar, eftersom allt ligger kvar i rutan', () => {
    const o = OBJEKT['Östra-Hoka 1:7 A-C -25'];
    const b = beslut('Östra-Hoka 1:7 A-C -25', { punkter: skala(punkter(o), 0.5) });
    // Det här ÄR en begränsning, inte ett önskat beteende: kvittot säger "svag" så att läsaren vet. Faller testet har kontrollen blivit starkare — bra, uppdatera.
    expect(b.ok && b.kalla === 'latlng' && b.kvitto.styrka).toBe('svag');
  });
});

describe('beslutaOrigo — tröskelvärdena, kant mot kant (så att en ändrad siffra fälls)', () => {
  const lat = 56.5;
  const lng = 14.9;
  const M = mPerPx(lat);
  const mLng = 111320 * Math.cos((lat * Math.PI) / 180);
  // Vidas ruta: 1000 × 800 m centrerad på origot.
  const W = 1000;
  const H = 800;
  const vida: VidaGrans = { typ: 'ok', gran: [[lng - W / 2 / mLng, lat - H / 2 / 111320], [lng + W / 2 / mLng, lat + H / 2 / 111320]] };
  const objekt = { lat, lng, kartbild_bounds: null };
  const ruta = (b: number, h: number, dx = 0, dy = 0): Punkt[] => {
    const x0 = (-b / 2 + dx) / M, x1 = (b / 2 + dx) / M, y0 = (-h / 2 - dy) / M, y1 = (h / 2 - dy) / M;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  };
  const stark = (b: number, h: number, dx = 0, dy = 0) => beslutaOrigo({ objekt, punkter: [], granser: [ruta(b, h, dx, dy)], vida }).ok;

  it('storlek per axel: Vidas mått ± det största av 25 m och 20 % — 1200 m går, 1201 m går inte (bredd)', () => {
    expect(stark(W + 0.2 * W - 0.5, H)).toBe(true);
    expect(stark(W + 0.2 * W + 1.5, H)).toBe(false);
    expect(stark(W - 0.2 * W + 0.5, H)).toBe(true);
    expect(stark(W - 0.2 * W - 1.5, H)).toBe(false);
  });

  it('storlek per axel: samma i höjd (800 m → 160 m tolerans)', () => {
    expect(stark(W, H + 0.2 * H - 0.5)).toBe(true);
    expect(stark(W, H + 0.2 * H + 1.5)).toBe(false);
    expect(stark(W, H - 0.2 * H - 1.5)).toBe(false);
  });

  it('små trakter får ett fast golv på 25 m: 50 m bred trakt tål 74 m men inte 76 m', () => {
    const smal: VidaGrans = { typ: 'ok', gran: [[lng - 25 / mLng, lat - 200 / 111320], [lng + 25 / mLng, lat + 200 / 111320]] };
    const ok = (b: number) => beslutaOrigo({ objekt, punkter: [], granser: [ruta(b, 400)], vida: smal }).ok;
    expect(ok(74)).toBe(true);
    expect(ok(76)).toBe(false);
    expect(ok(50 - 24)).toBe(true);
    expect(ok(50 - 26)).toBe(false);
  });

  it('mitt: tolerans det största av 25 m och 20 % av Vidas längsta sida (200 m här) — 190 m går, 210 m går inte, i båda led', () => {
    expect(stark(W, H, 190, 0)).toBe(true);
    expect(stark(W, H, 210, 0)).toBe(false);
    expect(stark(W, H, -210, 0)).toBe(false);
    expect(stark(W, H, 0, 190)).toBe(true);
    expect(stark(W, H, 0, 210)).toBe(false);
    expect(stark(W, H, 0, -210)).toBe(false);
  });

  // SVAGT: 1000×800 → marginal max(75, 150) = 150 m. Punkter i en rad längs x.
  const medAndel = (inom: number, totalt: number, utanforX = (W / 2 + 150 + 5) / M): Punkt[] => [
    ...Array.from({ length: inom }, () => ({ x: 0, y: 0 })),
    ...Array.from({ length: totalt - inom }, () => ({ x: utanforX, y: 0 })),
  ];
  const svag = (p: Punkt[]) => beslutaOrigo({ objekt, punkter: p, granser: [], vida }).ok;

  it('svagt: minst 80 % av punkterna inom rutan + marginal — 80 av 100 går, 79 av 100 går inte', () => {
    expect(svag(medAndel(80, 100))).toBe(true);
    expect(svag(medAndel(79, 100))).toBe(false);
    expect(svag(medAndel(100, 100))).toBe(true);
    expect(svag(medAndel(0, 100))).toBe(false);
  });

  it('svagt: marginalen är 15 % av längsta sidan (150 m här): en punkt 145 m utanför kanten ligger inom, 155 m utanför gör det inte', () => {
    const innanfor = ((W / 2 + 145) / M);
    const utanfor = ((W / 2 + 155) / M);
    expect(svag([{ x: innanfor, y: 0 }])).toBe(true);
    expect(svag([{ x: utanfor, y: 0 }])).toBe(false);
    expect(svag([{ x: -innanfor, y: 0 }])).toBe(true);
    expect(svag([{ x: -utanfor, y: 0 }])).toBe(false);
    const inY = ((H / 2 + 145) / M), utY = ((H / 2 + 155) / M);
    expect(svag([{ x: 0, y: inY }])).toBe(true);
    expect(svag([{ x: 0, y: utY }])).toBe(false);
    expect(svag([{ x: 0, y: -inY }])).toBe(true);
    expect(svag([{ x: 0, y: -utY }])).toBe(false);
  });

  it('svagt: marginalen har golvet 75 m när rutan är liten (100×100 m trakt: 70 m utanför går, 80 m går inte)', () => {
    const liten: VidaGrans = { typ: 'ok', gran: [[lng - 50 / mLng, lat - 50 / 111320], [lng + 50 / mLng, lat + 50 / 111320]] };
    const s = (m: number) => beslutaOrigo({ objekt, punkter: [{ x: (50 + m) / M, y: 0 }], granser: [], vida: liten }).ok;
    expect(s(70)).toBe(true);
    expect(s(80)).toBe(false);
  });
});

describe('beslutaOrigo — tillstånd och specialfall', () => {
  const f = OBJEKT['Hallaslätt AU 2026'];
  const objekt = { lat: f.lat, lng: f.lng, kartbild_bounds: null };

  it('Vida läses än: laddar. Läsfel: las_fel (med meddelandet). Ingen rad: ingen_vida_grans', () => {
    expect(beslutaOrigo({ objekt, punkter: punkter(f), granser: granser(f), vida: { typ: 'laddar' } })).toEqual({ ok: false, skal: 'laddar' });
    expect(beslutaOrigo({ objekt, punkter: punkter(f), granser: granser(f), vida: { typ: 'fel', meddelande: 'nätfel' } })).toEqual({ ok: false, skal: 'las_fel', detalj: 'nätfel' });
    expect(beslutaOrigo({ objekt, punkter: punkter(f), granser: granser(f), vida: { typ: 'saknas' } })).toEqual({ ok: false, skal: 'ingen_vida_grans' });
  });

  it('inga punkter och inga gränser: inget att placera — giltigt beslut utan kontroll, men ändå med Vidas traktgräns inläst', () => {
    const b = beslutaOrigo({ objekt, punkter: [], granser: [], vida: vidaAv(f) });
    expect(b).toMatchObject({ ok: true, kalla: 'latlng', kvitto: { styrka: 'inga_punkter', punkter: 0 } });
    // …men saknas Vida ändå, eller går inte att läsa, är beslutet inte ok (kontrolleras före "inget att placera").
    expect(beslutaOrigo({ objekt, punkter: [], granser: [], vida: { typ: 'saknas' } })).toEqual({ ok: false, skal: 'ingen_vida_grans' });
  });

  it('bara gränsmarkeringar utan övriga punkter räcker för starkt kvitto', () => {
    const b = beslutaOrigo({ objekt, punkter: [], granser: granser(f), vida: vidaAv(f) });
    expect(b).toMatchObject({ ok: true, kvitto: { styrka: 'stark' } });
  });
});

describe('origoForklaring — varje skäl har sin egen text som säger vad som saknas', () => {
  it('ok → ingen text', () => {
    expect(origoForklaring({ ok: true, origo: { lat: 1, lng: 1, zoom: 15 }, kalla: 'bounds' })).toBeNull();
  });
  it('fem skäl, fem olika texter', () => {
    const texter = (['saknar_position', 'laddar', 'las_fel', 'ingen_vida_grans', 'stammer_inte'] as const).map((skal) => origoForklaring({ ok: false, skal }));
    expect(new Set(texter).size).toBe(5);
    for (const t of texter) expect(t).toBeTruthy();
    expect(texter[0]).toMatch(/saknar position/);
    expect(texter[3]).toMatch(/Vidas traktgräns saknas/);
    expect(texter[4]).toMatch(/stämmer inte med Vidas traktgräns/);
    expect(texter[4]).toMatch(/Be planeraren/);
  });
});

describe('markeringsPunkter / markeringsGranser / snapshotPunkter', () => {
  it('tar symbolens x/y, path och risaPath, och hoppar över ogiltigt', () => {
    const p = markeringsPunkter([
      { data: { x: 1, y: 2, isMarker: true } },
      { data: { path: [{ x: 3, y: 4 }, { x: 'a', y: 5 }, null, { x: 6 }, { x: 7, y: 8 }] } },
      { data: { path: [{ x: 9, y: 10 }], risaPath: [{ x: 11, y: 12 }] } },
      { data: null },
      { data: 'text' },
      {},
    ]);
    expect(p).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 7, y: 8 }, { x: 9, y: 10 }, { x: 11, y: 12 }]);
  });

  it('en markering som sparar lng/lat direkt (geo-låst pil) hänger inte på origot och räknas inte', () => {
    expect(markeringsPunkter([{ data: { x: 5, y: 5, lng: 14.1, lat: 56.1, angle: 3 } }, { data: { x: 6, y: 6 } }])).toEqual([{ x: 6, y: 6 }]);
  });

  it('NaN och Infinity är inga punkter', () => {
    expect(markeringsPunkter([{ data: { x: NaN, y: 1 } }, { data: { x: Infinity, y: 1 } }, { data: { path: [{ x: 1, y: NaN }] } }])).toEqual([]);
  });

  it('gränser: bara lineType "boundary" med minst tre giltiga punkter', () => {
    const tre = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const g = markeringsGranser([
      { data: { lineType: 'boundary', path: tre } },
      { data: { lineType: 'boundary', path: tre.slice(0, 2) } },
      { data: { lineType: 'mainRoad', path: tre } },
      { data: { path: tre } },
      { data: { lineType: 'boundary', path: [...tre.slice(0, 2), { x: 'a', y: 1 }] } },
      { data: null },
    ]);
    expect(g).toEqual([tre]);
  });

  it('kontrollpunkternas snapshot: x/y eller path, inget annat', () => {
    const s = snapshotPunkter([
      { geometri_snapshot: { x: 1, y: 2 } },
      { geometri_snapshot: { path: [{ x: 3, y: 4 }, { x: 5, y: 6 }] } },
      { geometri_snapshot: null },
      { geometri_snapshot: 'x' },
      {},
    ]);
    expect(s).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
  });
});

describe('lasVidaGrans', () => {
  const klient = (svar: { data: unknown; error: { message: string } | null }, tabeller: string[] = []): SupabaseClient =>
    ({
      from: (t: string) => {
        tabeller.push(t);
        return { select: () => ({ eq: async () => svar }) };
      },
    }) as unknown as SupabaseClient;
  const fc = (lager: string, coords: unknown) => ({ type: 'Feature', properties: { _lager: lager }, geometry: { type: 'Polygon', coordinates: coords } });

  it('rutan runt L_TRAKTDEL — andra lager räknas inte', async () => {
    const t: string[] = [];
    const r = await lasVidaGrans(
      klient({ data: [{ geometri: { features: [fc('L_TRAKTDEL', [[[14.0, 56.0], [14.1, 56.0], [14.1, 56.1], [14.0, 56.1], [14.0, 56.0]]]), fc('SV_FASTIGHET', [[[10, 50], [20, 50], [20, 60], [10, 60], [10, 50]]])] } }], error: null }, t),
      'obj-1',
    );
    // ringar = traktgränsens yttre ring (PR 8a: lagret "Vidas traktgräns") - FASTIGHETEN räknas inte, som för rutan.
    expect(r).toEqual({ typ: 'ok', gran: [[14.0, 56.0], [14.1, 56.1]], ringar: [[[14.0, 56.0], [14.1, 56.0], [14.1, 56.1], [14.0, 56.1], [14.0, 56.0]]] });
    expect(t).toEqual(['objekt_geometri']);
  });

  it('flera geometrirader läggs ihop till EN ruta', async () => {
    const r = await lasVidaGrans(
      klient({ data: [{ geometri: { features: [fc('L_TRAKTDEL', [[[14.0, 56.0], [14.1, 56.0], [14.1, 56.1], [14.0, 56.0]]])] } }, { geometri: { features: [fc('L_TRAKTDEL', [[[14.2, 56.2], [14.3, 56.2], [14.3, 56.3], [14.2, 56.2]]])] } }], error: null }),
      'obj-1',
    );
    expect(r).toEqual({
      typ: 'ok', gran: [[14.0, 56.0], [14.3, 56.3]],
      ringar: [[[14.0, 56.0], [14.1, 56.0], [14.1, 56.1], [14.0, 56.0]], [[14.2, 56.2], [14.3, 56.2], [14.3, 56.3], [14.2, 56.2]]],
    });
  });

  it('läsfel är "fel" (med meddelandet), aldrig "saknas"', async () => {
    expect(await lasVidaGrans(klient({ data: null, error: { message: 'nätet' } }), 'obj-1')).toEqual({ typ: 'fel', meddelande: 'nätet' });
  });

  it('inga rader, rad utan geometri eller utan L_TRAKTDEL: saknas', async () => {
    expect(await lasVidaGrans(klient({ data: [], error: null }), 'o')).toEqual({ typ: 'saknas' });
    expect(await lasVidaGrans(klient({ data: null, error: null }), 'o')).toEqual({ typ: 'saknas' });
    expect(await lasVidaGrans(klient({ data: [{ geometri: null }], error: null }), 'o')).toEqual({ typ: 'saknas' });
    expect(await lasVidaGrans(klient({ data: [{ geometri: { features: [fc('SV_FASTIGHET', [[[1, 1], [2, 2]]])] } }], error: null }), 'o')).toEqual({ typ: 'saknas' });
  });
});
