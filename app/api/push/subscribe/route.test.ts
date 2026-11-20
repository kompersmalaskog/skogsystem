/**
 * /api/push/subscribe skriver nu också NÄRVARON (push_subscriptions.senast_oppnad = när appen öppnades på enheten), som väljer vem
 * som får "Vilken maskin?" (lib/lastbil/lass/notis.ts). Närvaron är en bonus: ett fel där (kolumnen saknas = migrationen ej körd)
 * får aldrig fälla registreringen av push-prenumerationen.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  upserts: [] as any[],
  updates: [] as { varden: any; endpoint: string }[],
  updateSvar: { error: null as any },
  updateKastar: false,
  maskiner: ['A130743'] as string[],
}));

vi.mock('@/lib/auth/server', () => ({ målMedarbetareId: async () => ({ ok: true, id: 'm-1' }) }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabell: string) => ({
      select: () => ({ eq: (_k: string, id: string) => ({ maybeSingle: async () => ({ data: tabell === 'dim_maskin' && h.maskiner.includes(id) ? { maskin_id: id } : null, error: null }) }) }),
      upsert: async (rad: any) => { h.upserts.push(rad); return { error: null }; },
      update: (varden: any) => ({
        eq: async (_k: string, endpoint: string) => {
          if (h.updateKastar) throw new Error('nät');
          h.updates.push({ varden, endpoint });
          return h.updateSvar;
        },
      }),
    }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

import { NextRequest } from 'next/server';
import { POST } from './route';

const anrop = (extra: Record<string, unknown> = {}) => POST(new NextRequest('http://x/api/push/subscribe', {
  method: 'POST', body: JSON.stringify({ subscription: { endpoint: 'e-1' }, device_name: 'iPhone', ...extra }),
}));

beforeEach(() => { h.upserts = []; h.updates = []; h.updateSvar = { error: null }; h.updateKastar = false; h.maskiner = ['A130743']; });

describe('/api/push/subscribe — närvaro', () => {
  it('registrerar prenumerationen och stämplar när appen öppnades (en separat skrivning på samma enhet)', async () => {
    const res = await anrop();
    expect(res.status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]).toMatchObject({ medarbetare_id: 'm-1', endpoint: 'e-1' });
    expect(h.upserts[0]).not.toHaveProperty('senast_oppnad');                         // upserten rörs inte: den fungerar utan migrationen
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].endpoint).toBe('e-1');
    expect(Date.parse(h.updates[0].varden.senast_oppnad)).toBeGreaterThan(Date.now() - 5000);
  });

  it('kolumnen saknas (migrationen ej körd) → registreringen lyckas ändå', async () => {
    h.updateSvar = { error: { message: 'column "senast_oppnad" does not exist' } };
    const res = await anrop();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('nätfel på närvaron → registreringen lyckas ändå', async () => {
    h.updateKastar = true;
    const res = await anrop();
    expect(res.status).toBe(200);
  });
});


describe('/api/push/subscribe — prenumerationen hör till MASKINEN på en maskindator', () => {
  const maskinSkrivningar = () => h.updates.filter((u) => 'maskin_id' in u.varden);

  it('maskindatorn skickar sin maskin → maskin_id sparas på prenumerationen (medarbetare_id är fortfarande den inloggade, men det är maskinen som styr hyttnotiserna)', async () => {
    const res = await anrop({ maskin_id: 'A130743' });
    expect(res.status).toBe(200);
    expect(maskinSkrivningar()).toEqual([{ varden: { maskin_id: 'A130743' }, endpoint: 'e-1' }]);
    expect(h.upserts[0]).not.toHaveProperty('maskin_id');   // upserten fungerar utan migrationen
  });

  it('förarens telefon (maskin_id null) nollar kopplingen – en enhet som slutat vara maskin får aldrig hyttnotiser', async () => {
    await anrop({ maskin_id: null });
    expect(maskinSkrivningar()).toEqual([{ varden: { maskin_id: null }, endpoint: 'e-1' }]);
  });

  it('en äldre appversion som inte skickar fältet rör inte kopplingen', async () => {
    await anrop();
    expect(maskinSkrivningar()).toEqual([]);
  });

  it('ett påhittat eller förvanskat maskin_id blir null (maskinen måste finnas i registret)', async () => {
    await anrop({ maskin_id: 'FINNS-INTE' });
    await anrop({ maskin_id: "x'; drop table push_subscriptions;--" });
    await anrop({ maskin_id: 42 });
    expect(maskinSkrivningar().map((u) => u.varden.maskin_id)).toEqual([null, null, null]);
  });

  it('kolumnen saknas (migrationen ej körd) eller nätfel → registreringen lyckas ändå', async () => {
    h.updateSvar = { error: { message: 'column "maskin_id" does not exist' } };
    expect((await anrop({ maskin_id: 'A130743' })).status).toBe(200);
    h.updateKastar = true;
    const res = await anrop({ maskin_id: 'A130743' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
