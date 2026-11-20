import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  lastbil: { data: null as any, error: null as any },
  logg: { data: null as any, error: null as any },
  kast: false,
  anrop: [] as string[],
}));

vi.mock('@/lib/supabase', () => {
  class Q {
    constructor(private t: string) {}
    select() { return this; }
    eq(k: string, v: string) { db.anrop.push(`${this.t}.${k}=${v}`); return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.resolve(this.svar()); }
    then(res: any, rej: any) { return Promise.resolve(this.svar()).then(res, rej); }
    private svar() {
      if (db.kast) throw new Error('nätverket');
      return this.t === 'lastbil' ? db.lastbil : db.logg;
    }
  }
  return { supabase: { from: (t: string) => new Q(t) } };
});

import { bedomFramme, fmtAvstandKm, kontrolleraFramme, POSITION_MAX_ALDER_MIN, VARNA_OVER_KM } from './framme';

// Basen (LBC) och två punkter: en 0,4 km därifrån och en ~14 km därifrån.
const BAS = { lat: 56.4590, lng: 14.7020, radie_km: 0.3 };
const NARA = { lat: 56.4625, lng: 14.7020 };     // ≈ 0,39 km norrut
const LANGT = { lat: 56.5850, lng: 14.7020 };    // ≈ 14 km norrut
const NU = new Date('2026-10-15T10:00:00Z');
const tidFore = (min: number) => new Date(NU.getTime() - min * 60000).toISOString();

describe('bedomFramme', () => {
  it('bilen vid basen: ok, ingen fråga', () => {
    const b = bedomFramme({ ...NARA, tidpunkt: tidFore(1) }, BAS, NU);
    expect(b.lage).toBe('ok');
  });

  it('bilen ~14 km från basen: långt, med avståndet', () => {
    const b = bedomFramme({ ...LANGT, tidpunkt: tidFore(1) }, BAS, NU);
    expect(b.lage).toBe('langt');
    expect((b as { km: number }).km).toBeGreaterThan(13);
    expect((b as { km: number }).km).toBeLessThan(15);
  });

  it('gränsen: frågar först över VARNA_OVER_KM (2 km), också när basens radie är mindre', () => {
    const grad = (km: number) => ({ lat: BAS.lat + km / 111.19, lng: BAS.lng, tidpunkt: tidFore(1) });
    expect(bedomFramme(grad(VARNA_OVER_KM - 0.1), BAS, NU).lage).toBe('ok');
    expect(bedomFramme(grad(VARNA_OVER_KM + 0.1), BAS, NU).lage).toBe('langt');
  });

  it('en bas med stor radie (5 km) frågar inte förrän bilen är utanför den', () => {
    const stor = { ...BAS, radie_km: 5 };
    const p = (km: number) => ({ lat: BAS.lat + km / 111.19, lng: BAS.lng, tidpunkt: tidFore(1) });
    expect(bedomFramme(p(4), stor, NU).lage).toBe('ok');
    expect(bedomFramme(p(6), stor, NU).lage).toBe('langt');
  });

  it('en gammal position säger ingenting om var bilen står nu: okänt, ingen fråga', () => {
    const b = bedomFramme({ ...LANGT, tidpunkt: tidFore(POSITION_MAX_ALDER_MIN + 1) }, BAS, NU);
    expect(b).toEqual({ lage: 'okant', orsak: 'gammal_position' });
    expect(bedomFramme({ ...LANGT, tidpunkt: tidFore(POSITION_MAX_ALDER_MIN - 1) }, BAS, NU).lage).toBe('langt');
  });

  it('ingen position, ingen bas, trasig tid: okänt (aldrig en gissning)', () => {
    expect(bedomFramme(null, BAS, NU)).toEqual({ lage: 'okant', orsak: 'ingen_position' });
    expect(bedomFramme({ ...LANGT, tidpunkt: tidFore(1) }, null, NU)).toEqual({ lage: 'okant', orsak: 'ingen_bas' });
    expect(bedomFramme({ ...LANGT, tidpunkt: 'inte-en-tid' }, BAS, NU)).toEqual({ lage: 'okant', orsak: 'gammal_position' });
  });
});

describe('kontrolleraFramme (läser lastbil och lastbil_logg)', () => {
  beforeEach(() => {
    db.lastbil = { data: { hemmabas_lat: '56.4590', hemmabas_lng: '14.7020', hemmabas_radie_m: 300 }, error: null };
    db.logg = { data: [{ lat: LANGT.lat, lng: LANGT.lng, tidpunkt: tidFore(2) }], error: null };
    db.kast = false; db.anrop = [];
  });

  it('bilen långt hemifrån → långt, och frågar efter RÄTT bil', async () => {
    const b = await kontrolleraFramme('VIN123', NU);
    expect(b.lage).toBe('langt');
    expect(db.anrop).toEqual(expect.arrayContaining(['lastbil.vin=VIN123', 'lastbil_logg.vin=VIN123']));
  });

  it('bilen på basen → ok', async () => {
    db.logg = { data: [{ lat: NARA.lat, lng: NARA.lng, tidpunkt: tidFore(2) }], error: null };
    expect((await kontrolleraFramme('VIN123', NU)).lage).toBe('ok');
  });

  it('koordinater som text (numeric ur PostgREST) räknas lika', async () => {
    db.logg = { data: [{ lat: String(LANGT.lat), lng: String(LANGT.lng), tidpunkt: tidFore(2) }], error: null };
    expect((await kontrolleraFramme('VIN123', NU)).lage).toBe('langt');
  });

  it('basens radie saknas → 300 m som cron:en', async () => {
    db.lastbil = { data: { hemmabas_lat: 56.459, hemmabas_lng: 14.702, hemmabas_radie_m: null }, error: null };
    expect((await kontrolleraFramme('VIN123', NU)).lage).toBe('langt');
  });

  it('läsfel, nätfel, ingen bil, ingen bas, ingen loggpunkt: okänt — rundan går att stänga som förut', async () => {
    db.logg = { data: null, error: { message: 'boom' } };
    expect(await kontrolleraFramme('VIN123', NU)).toEqual({ lage: 'okant', orsak: 'lasfel' });
    db.logg = { data: [], error: null };
    expect(await kontrolleraFramme('VIN123', NU)).toEqual({ lage: 'okant', orsak: 'ingen_position' });
    db.lastbil = { data: { hemmabas_lat: null, hemmabas_lng: null, hemmabas_radie_m: 300 }, error: null };
    db.logg = { data: [{ lat: LANGT.lat, lng: LANGT.lng, tidpunkt: tidFore(2) }], error: null };
    expect(await kontrolleraFramme('VIN123', NU)).toEqual({ lage: 'okant', orsak: 'ingen_bas' });
    db.kast = true;
    expect(await kontrolleraFramme('VIN123', NU)).toEqual({ lage: 'okant', orsak: 'lasfel' });
    expect(await kontrolleraFramme(null, NU)).toEqual({ lage: 'okant', orsak: 'ingen_bil' });
  });
});

describe('fmtAvstandKm', () => {
  it('en decimal under 10 km, hela km över', () => {
    expect(fmtAvstandKm(1.44)).toBe('1,4 km');
    expect(fmtAvstandKm(9.96)).toBe('10 km');
    expect(fmtAvstandKm(14.2)).toBe('14 km');
  });
});
