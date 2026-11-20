/**
 * Scania-cron:en kör lassdetekteringen VARJE cykel — också när Scania inte svarar (429/5xx) eller svaret saknar vin: ett väntande lass
 * kan få sina bevis (maskinernas GPS-spår importeras timmar efter transporten) utan att bilen skickat något.
 * Detekteringen och rundlogiken är mockade; vad som vaktas här är KOPPLINGEN och att ett fel i dem aldrig fäller svaret.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  status: null as any,
  lass: vi.fn(async () => ({ ok: true, nya: 0 })),
  runda: vi.fn(async () => ({ ok: true })),
  upserts: [] as any[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ upsert: () => ({ select: async () => { h.upserts.push(1); return { data: [{ id: 1 }], error: null }; } }) }) }),
}));
vi.mock('@/lib/scania', () => ({
  hamtaStatusRatt: async () => h.status,
  loggFalt: (rad: any) => ({ vin: rad?.vin ?? null, tidpunkt: rad?.tidpunkt ?? null, lat: 1, lng: 2, hastighet: 0, odometer_m: 5, bransle_ml: 1 }),
}));
vi.mock('@/lib/lastbilRunda', () => ({ koraRundlogik: h.runda }));
vi.mock('@/lib/lastbil/lass/kor', () => ({ koraLassdetektering: h.lass }));

process.env.CRON_SECRET = 'hemlig';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

import { NextRequest } from 'next/server';
import { GET } from './route';

const kor = async () => (await GET(new NextRequest('http://x/api/scania/cron', { headers: { authorization: 'Bearer hemlig' } }))).json();

beforeEach(() => { h.lass.mockClear(); h.runda.mockClear(); h.upserts = []; });

describe('/api/scania/cron — lassdetekteringen', () => {
  it('körs efter en ny loggrad, och resultatet står i rapporten', async () => {
    h.status = { httpStatus: 200, rateLimit: null, hamtadTid: 't', rad: { vin: 'V1', tidpunkt: '2026-10-12T10:00:00Z' } };
    const r = await kor();
    expect(h.lass).toHaveBeenCalledTimes(1);
    expect(r.lass).toEqual({ ok: true, nya: 0 });
    expect(r.runda).toEqual({ ok: true });
  });

  it('körs också när Scania inte svarar (429) — ett väntande lass utvärderas ändå', async () => {
    h.status = { httpStatus: 429, rateLimit: null, hamtadTid: 't', rad: null };
    const r = await kor();
    expect(r.ok).toBe(false);
    expect(h.lass).toHaveBeenCalledTimes(1);
  });

  it('körs också när svaret saknar vin/tidpunkt', async () => {
    h.status = { httpStatus: 200, rateLimit: null, hamtadTid: 't', rad: {} };
    await kor();
    expect(h.lass).toHaveBeenCalledTimes(1);
  });

  it('utan CRON_SECRET-header körs ingenting', async () => {
    h.status = { httpStatus: 200, rad: { vin: 'V1', tidpunkt: 't' } };
    const res = await GET(new NextRequest('http://x/api/scania/cron'));
    expect(res.status).toBe(401);
    expect(h.lass).not.toHaveBeenCalled();
  });
});
