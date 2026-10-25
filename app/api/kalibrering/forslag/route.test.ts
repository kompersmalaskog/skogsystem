/**
 * /api/kalibrering/forslag — hämtar underlaget och sätter ihop kortet. Räknandet är rent och testat i lib/kalibrering/forslag*.test.ts; här prövas det rutten gör:
 * vem som får läsa, att fysiska stammar räknas, att förarens svar (markörerna) styr stegen, att greppet som inte går att läsa sägs, och att inget oändligt tal lämnar servern.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const g = globalThis as any;
vi.mock('@/lib/auth/server', () => ({
  kravInloggad: async () => (g.__inloggad === false ? { ok: false, res: new Response(JSON.stringify({ ok: false }), { status: 401 }) } : { ok: true, session: {} }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (namn: string, args?: { p_maskin?: string }) => {
      if (g.__rpcFel?.[namn]) return { data: null, error: g.__rpcFel[namn] };
      const perMaskin = g.__rpcMaskin?.[args?.p_maskin ?? '']?.[namn];
      // Standardsvaret gäller maskinen som frågas om (M1); en annan maskin har bara det testet ger den.
      return { data: perMaskin ?? (args?.p_maskin === 'M1' ? g.__rpc?.[namn] : undefined) ?? [], error: null };
    },
    from: (tabell: string) => {
      const b: any = {
        select: () => b, eq: () => b, gte: () => b, order: () => b, in: () => b, limit: () => b,
        range: (f: number, t: number) => ({ then: (ok: any) => ok({ data: (g.__tabeller[tabell] ?? []).slice(f, t + 1), error: g.__tabellFel?.[tabell] ?? null }) }),
        then: (ok: any) => ok({ data: g.__tabeller[tabell] ?? [], error: g.__tabellFel?.[tabell] ?? null }),
      };
      return b;
    },
  }),
}));

import { GET } from './route';

const dagSv = (plus = 0) => new Date(Date.now() + plus * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const anrop = (q = '?maskin_id=M1') => GET({ url: `https://app.example/api/kalibrering/forslag${q}` } as any);

/** n stammar av trädslaget TALL i 200–249 mm där maskinen mäter `fel` mm för grovt. Varje stam = en stock med toppdiameter (en punkt). */
function stammar(n: number, fel: number, dag = dagSv(-2)) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, filnamn: 'f1.hqc', kontroll_datum: dag, harvest_date: `2026-10-0${(i % 9) + 1}T0${i % 10}:00:00`, stam_nummer: i + 1, stock_nummer: 1,
    machine_measurement_date: `m${i}`, operator_measurement_date: `o${i}`, maskin_toppdia_mm: 200 + fel + (i % 2 ? 0.3 : -0.3), operator_toppdia_mm: 200,
  }));
}

beforeEach(() => {
  g.__inloggad = true; g.__rpcFel = {}; g.__tabellFel = {}; g.__rpcMaskin = {};
  g.__tabeller = {
    fakt_kalibrering: [{ filnamn: 'f1.hqc', tradslag: 'TALL' }],
    detalj_kontroll_stock: stammar(12, 5),
    detalj_kontroll_stock_matpunkt: [],
    kalibrering_atgard: [],
    fakt_kalibrering_historik: [],
    dim_maskin: [{ maskin_id: 'M1', visningsnamn: 'Scorpion' }, { maskin_id: 'M2', visningsnamn: 'H8E -26' }, { maskin_id: 'M3', visningsnamn: null }],
  };
  g.__rpc = {
    kalibrering_grepp_status: [{ objekt_id: 'o', antal_stammar: 10, antal_raknade: 10, aktuell: true }],
    kalibrering_grepp_sammanstall: [],
  };
});

describe('GET /api/kalibrering/forslag', () => {
  it('alla inloggade får läsa; ej inloggad: 401; maskin_id krävs', async () => {
    expect((await anrop()).status).toBe(200);
    g.__inloggad = false;
    expect((await anrop()).status).toBe(401);
    g.__inloggad = true;
    expect((await anrop('')).status).toBe(400);
  });

  it('tolv tallar där maskinen mäter 5 mm för grovt: "Sänk tall 5 mm"', async () => {
    const j = await (await anrop()).json();
    expect(j.ok).toBe(true);
    expect(j.kort.lage).toBe('steg');
    expect(j.kort.steg.map((s: any) => s.id)).toEqual(['kurva:Tall']);
    expect(j.kort.steg[0].punkter[0]).toMatchObject({ punkt: '200', andringMm: -5, stammar: 12 });
    expect(j.greppLast).toBe(true);
  });

  it('samma stam i två kumulativa filer räknas EN gång', async () => {
    const dubbel = stammar(12, 5).map(s => ({ ...s, id: s.id + 100, filnamn: 'f2.hqc', stam_nummer: s.stam_nummer + 40 }));
    g.__tabeller.detalj_kontroll_stock = [...stammar(12, 5), ...dubbel];
    g.__tabeller.fakt_kalibrering = [{ filnamn: 'f1.hqc', tradslag: 'TALL' }, { filnamn: 'f2.hqc', tradslag: 'TALL' }];
    const j = await (await anrop()).json();
    expect(j.punkter.find((p: any) => p.punkt === '200').stammar).toBe(12);
  });

  it('en markör "Höjt trycket" idag börjar fönstret om: de gamla stammarna räknas inte och kurvan väntar', async () => {
    g.__tabeller.kalibrering_atgard = [{ datum: dagSv(0), text: 'Höjt trycket på knivar och hjul' }];
    const j = await (await anrop()).json();
    expect(j.punkter).toEqual([]);
    expect(j.kort.lage).toBe('inget');
    expect(j.senasteAndring).toEqual({ datum: dagSv(0), slag: 'tryck' });
  });

  it('greppet har stigit: Kolla först — och "Klart, allt såg bra ut" (markören) tar bort steget', async () => {
    const m = (manad: string, stammar: number, andel: number) => ({ manad, tradslag: 'TALL', klass: '200-249', stammar, steg: 1000, still: 300, summa_andel: (stammar * andel) / 100 });
    const nu = dagSv(0).slice(0, 7);
    const forra = new Date(new Date(`${nu}-01T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 7);
    g.__rpc.kalibrering_grepp_sammanstall = [m(forra, 100, 20), m(nu, 100, 30)];
    let j = await (await anrop()).json();
    expect(j.kort.steg.map((s: any) => s.id)).toEqual(['kolla', 'kurva:Tall']);
    expect(j.grepp).toHaveLength(1);
    g.__tabeller.kalibrering_atgard = [{ datum: dagSv(0), text: 'Kollat knivar och valsar – allt såg bra ut' }];
    j = await (await anrop()).json();
    expect(j.kort.steg.map((s: any) => s.id)).toEqual(['kurva:Tall']);
  });

  describe('samma ökning på en annan skördare samma månad', () => {
    const nu = dagSv(0).slice(0, 7);
    const forra = new Date(new Date(`${nu}-01T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 7);
    const m = (manad: string, andel: number) => ({ manad, tradslag: 'TALL', klass: '200-249', stammar: 100, steg: 1000, still: 300, summa_andel: andel });
    const stigit = [m(forra, 20), m(nu, 30)];
    const status = [{ objekt_id: 'o', antal_stammar: 10, antal_raknade: 10, aktuell: true }];
    it('båda har ökat: kortet bär namnet på den andra maskinen', async () => {
      g.__rpc.kalibrering_grepp_sammanstall = stigit;
      g.__rpcMaskin = { M2: { kalibrering_grepp_status: status, kalibrering_grepp_sammanstall: stigit } };
      const j = await (await anrop()).json();
      expect(j.grepp[0].samma).toEqual(['H8E -26']);
    });
    it('den egna maskinen räknas aldrig som "samma", och en maskin utan namn heter sitt id', async () => {
      g.__rpc.kalibrering_grepp_sammanstall = stigit;
      g.__rpcMaskin = { M3: { kalibrering_grepp_status: status, kalibrering_grepp_sammanstall: stigit } };
      const j = await (await anrop()).json();
      expect(j.grepp[0].samma).toEqual(['M3']);
    });
    it('bara den här maskinen har ökat: ingen "samma"', async () => {
      g.__rpc.kalibrering_grepp_sammanstall = stigit;
      g.__rpcMaskin = { M2: { kalibrering_grepp_status: status, kalibrering_grepp_sammanstall: [m(forra, 20), m(nu, 21)] } };
      const j = await (await anrop()).json();
      expect(j.grepp).toHaveLength(1);
      expect(j.grepp[0].samma).toBeUndefined();
    });
    it('kan de andra inte läsas står kortet som förut — aldrig ett fel, aldrig en gissad "samma"', async () => {
      g.__rpc.kalibrering_grepp_sammanstall = stigit;
      g.__tabellFel.dim_maskin = { message: 'boom' };
      const r = await anrop();
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.grepp).toHaveLength(1);
      expect(j.grepp[0].samma).toBeUndefined();
      expect(j.kort.steg.map((s: any) => s.id)).toEqual(['kolla', 'kurva:Tall']);
    });
  });

  it('en kalibrering av tallens diameter ur historiken (värde ≠ 0) börjar fönstret dagen efter', async () => {
    g.__tabeller.fakt_kalibrering_historik = [{ datum: `${dagSv(-1)}T09:00:00+00`, tradslag: 'Tall', typ: 'diameter', dia_justering_mm: -1, orsak: 'Change in weather conditions' }];
    const j = await (await anrop()).json();
    expect(j.punkter).toEqual([]); // alla stammar klavades före (kontrolldag −2)
    g.__tabeller.fakt_kalibrering_historik = [{ datum: `${dagSv(-1)}T09:00:00+00`, tradslag: 'Tall', typ: 'diameter', dia_justering_mm: 0, orsak: 'Change in weather conditions' }];
    expect((await (await anrop()).json()).punkter).toHaveLength(1); // noll = ingen justering
  });

  it('kan greppet inte läsas sägs det (greppLast false) och ett läsfel i underlaget är ett fel', async () => {
    g.__rpcFel.kalibrering_grepp_status = { code: 'PGRST202', message: 'Could not find the function' };
    expect((await (await anrop()).json()).greppLast).toBe(false);
    g.__tabellFel.kalibrering_atgard = { message: 'boom' };
    g.__rpcFel = {};
    const r = await anrop();
    expect(r.status).toBe(500);
  });

  it('en enda stam: intervallet är obegränsat men lämnar servern som null, aldrig Infinity', async () => {
    g.__tabeller.detalj_kontroll_stock = stammar(1, 6);
    const text = await (await anrop()).text();
    const j = JSON.parse(text);
    const p = j.punkter.find((x: any) => x.punkt === '200');
    expect(p).toMatchObject({ stammar: 1, lo: null, hi: null, besked: 'vanta' });
  });
});

describe('källvakter', () => {
  const k = fs.readFileSync('app/api/kalibrering/forslag/route.ts', 'utf8');
  it('inloggad räcker, ingen nyckel i adressen, och rutten räknar aldrig om greppet', () => {
    expect(k).toContain('kravInloggad');
    expect(k).not.toMatch(/searchParams\.get\(["']key["']\)/);
    expect(k).not.toContain('kalibrering_grepp_rakna');
    expect(k).not.toContain('raknaOmGrepp');
  });
  it('appen skriver aldrig till maskinen och rutten skriver ingenting alls', () => {
    expect(k).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});
