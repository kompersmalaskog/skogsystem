import { describe, it, expect, vi, beforeEach } from 'vitest';

const kravRoll = vi.fn();
const hamtaVoUnderlag = vi.fn();

vi.mock('@/lib/auth/server', () => ({ kravRoll: (...a: any[]) => kravRoll(...a), ADMIN_ROLLER: ['admin'] }));
vi.mock('@/lib/lonesystem/server', () => ({ serverSupabase: () => ({}) }));
vi.mock('@/lib/faktura/hamtaUnderlag', () => ({ hamtaVoUnderlag: (...a: any[]) => hamtaVoUnderlag(...a) }));
// Raderna provas av lib/faktura/radbyggare.test.ts — här gäller det vad rutten
// gör av underlaget, inte vilka rader radbyggaren hittar.
vi.mock('@/lib/faktura/radbyggare', () => ({
  byggRader: () => [],
  garAttSkicka: () => ({ ok: true, hinder: [] }),
}));

import { POST } from './route';

const anropa = (body: any) => POST(new Request('https://app.example/api/faktura/underlag', {
  method: 'POST', body: JSON.stringify(body),
}) as any);

/** Skälviken RP J-Hus -25 som prod ser ut 2026-11-16. */
const skalviken = () => ({
  underlag: {
    vo_nummer: '11271860',
    objektnamn: 'Skälviken RP J-Hus -25',
    kontraktsnummer: '969670',
    bolag: 'Vida',
    fortnox_kundnr: 1,
    timpeng: false,
    avrakningsdatum: '2026-11-13',
    volymM3fub: 1725.2,
    terrangKr: 0,
  },
  noter: [],
  objektIds: ['11271860'],
  granskning: {
    sortiment: {
      rakning: { antal: 7 },
      anvant: 7,
      manuellt: false,
      grundantal: 6,
      krPerExtra: 2,
      giltigFran: '2025-06-03',
    },
    volym: 1725.2,
    prisdatum: '2026-11-13',
    // `null as number | null` med flit: ett naket null ger typen `null`, och
    // då går provet nedan inte att skriva om fältet till 450 m.
    avstand: { manuellt: null as number | null, lassVolym: 40, lassAntal: 2, kronor: 1680 },
  },
});

describe('POST /api/faktura/underlag — "Vad behöver du kolla?"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kravRoll.mockResolvedValue({ ok: true, session: {} });
  });

  it('kräver admin', async () => {
    kravRoll.mockResolvedValue({ ok: false, res: new Response('', { status: 403 }) });
    expect((await anropa({ vo_nummer: '11271860' })).status).toBe(403);
    expect(hamtaVoUnderlag).not.toHaveBeenCalled();
  });

  it('räknar posterna på SERVERNS underlag — vyn ritar bara', async () => {
    hamtaVoUnderlag.mockResolvedValue(skalviken());
    const j = await (await anropa({ vo_nummer: '11271860' })).json();
    const f = j.resultat[0].fattas;
    expect(f.map((p: any) => p.nyckel)).toEqual(['avstand', 'terrang', 'sortiment']);
    expect(f[0].rubrik).toBe('Skotningsavståndet bygger på 2 % av volymen');
    expect(f[2].varde?.replace(/ /g, ' ')).toBe('+2,00 kr/m³fub · 3 450 kr');
  });

  it('en ifylld trakt får en TOM lista, inte en rad som säger "allt bra"', async () => {
    const u = skalviken();
    u.underlag.terrangKr = 2;
    u.granskning.avstand = { manuellt: 450, lassVolym: 40, lassAntal: 2, kronor: 26241 };
    u.granskning.sortiment.manuellt = true;
    hamtaVoUnderlag.mockResolvedValue(u);
    const j = await (await anropa({ vo_nummer: '11271860' })).json();
    expect(j.resultat[0].fattas).toEqual([]);
  });

  it('ETT VO som inte går att läsa ger fattas: [] — aldrig påhittade poster', async () => {
    // Ärlig data eller ingen data: ett oläst underlag VET vi ingenting om, så
    // en post här hade varit en gissning presenterad som en uppgift.
    hamtaVoUnderlag.mockRejectedValue(new Error('RLS: inga rader'));
    const j = await (await anropa({ vo_nummer: '11271860' })).json();
    expect(j.resultat[0].fattas).toEqual([]);
    expect(j.resultat[0].fel).toContain('RLS');
    expect(j.resultat[0].hinder).toEqual(['RLS: inga rader']);
  });

  it('ett trasigt VO tystar inte de andra', async () => {
    hamtaVoUnderlag
      .mockRejectedValueOnce(new Error('trasigt'))
      .mockResolvedValueOnce(skalviken());
    const j = await (await anropa({ vo_nummer: ['A', '11271860'] })).json();
    expect(j.resultat).toHaveLength(2);
    expect(j.resultat[0].fattas).toEqual([]);
    expect(j.resultat[1].fattas).toHaveLength(3);
  });

  it('vo_nummer krävs', async () => {
    expect((await anropa({})).status).toBe(400);
  });
});
