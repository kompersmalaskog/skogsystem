/**
 * GET /api/lon/arsovertid: frånvaron läses (ledighet_ansokningar via lib/franvaro) och sänker basen i genomsnittsmodellen.
 * Kan den inte läsas räknas utan den OCH svaret säger det (franvaro_fel): basen drogs inte, så övertiden blir för LÅG, aldrig "ingen frånvaro".
 *
 * PAGINERING: PostgREST svarar högst 1000 rader per anrop. Årets arbetsdag-rader läses sida för sida (lib/lonesystem/allaRader); en läsning
 * utan paginering tappar tyst allt efter rad 1000 och ger för låg övertid. Prod hade 823 rader 2026-10-13, så felet slår till runt december.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;
vi.mock("@/lib/auth/server", () => ({ kravRoll: async () => ({ ok: true, session: {} }), ADMIN_ROLLER: ["admin"] }));
vi.mock("@/lib/lonesystem/server", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    constructor(public t: string) {}
    sida: [number, number] | null = null;
    select() { return this; } order() { return this; } limit() { return this; }
    range(a: number, b: number) { this.sida = [a, b]; return this; }
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
    maybeSingle() { (this as any).enkel = true; return this; }
    then(res: any, rej: any) {
      if (g.__fel?.[this.t]) return Promise.resolve({ data: null, error: { message: g.__fel[this.t] } }).then(res, rej);
      g.__anrop.push({ t: this.t, sida: this.sida });
      let rader = ((g.__db[this.t] || []) as any[]).filter(r => this.f.every(fn => fn(r)));
      // som PostgREST: `.range(a, b)` skär ut sidan, och utan range kommer högst 1000 rader
      rader = this.sida ? rader.slice(this.sida[0], this.sida[1] + 1) : rader.slice(0, 1000);
      return Promise.resolve({ data: (this as any).enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
    }
  }
  return { serverSupabase: () => ({ from: (t: string) => new Q(t) }) };
});

import { GET } from "./route";

const anropa = () => GET({ nextUrl: new URL("https://app.example/api/lon/arsovertid?ar=2026") } as any);
const dag = (datum: string, h: number) => ({ medarbetare_id: "s", datum, arbetad_min: h * 60, dagtyp: "Produktion", start_tid: "06:00:00" });

beforeEach(() => {
  g.__fel = {}; g.__anrop = [];
  g.__db = {
    medarbetare: [{ id: "s", namn: "Stefan Karlsson" }],
    // Vecka 6 (2–6/2): 5 × 9 tim = 45; vecka 7 (9–11/2 t.o.m. onsdag): 0
    arbetsdag: ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06"].map(d => dag(d, 9)),
    extra_tid: [], gs_avtal: [{ max_overtid_ar_h: 250, giltigt_fran: "2025-04-01" }],
    utjamningsperiod: [{ startdatum: "2026-02-02", slutdatum: "2026-02-08", medarbetare_id: null, anteckning: "Test" }],
    ledighet_ansokningar: [],
  };
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 1, 11, 12, 0));
});

describe("årsövertid-routen läser ALLA rader (paginering)", () => {
  /** De 100 första vardagarna från 4 maj 2026, 9 tim/dag för varje förare — enkelt och likartat, så en tappad rad syns direkt i timmarna. */
  const vardagar = () => { const ut: string[] = []; for (const d = new Date(2026, 4, 4); d <= new Date(2026, 8, 30); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) ut.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); return ut.slice(0, 100); };

  it("12 förare × 100 dagar = 1200 rader (över 1000): ingen förare tappas och den sista har hela sin övertid", async () => {
    const dagar = vardagar();
    g.__db.medarbetare = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, namn: `Förare ${i}` }));
    g.__db.arbetsdag = g.__db.medarbetare.flatMap((m: any) => dagar.map(d => ({ medarbetare_id: m.id, datum: d, arbetad_min: 540, dagtyp: "Produktion", start_tid: "06:00:00" })));
    g.__db.utjamningsperiod = [];
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0));
    expect(g.__db.arbetsdag.length).toBe(1200);
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.medarbetare).toHaveLength(12);
    const sista = j.medarbetare.find((m: any) => m.medarbetare_id === "m11");
    const forsta = j.medarbetare.find((m: any) => m.medarbetare_id === "m0");
    expect(sista.timmar).toBe(forsta.timmar);              // samma underlag → samma timmar; den sista förlorar inget
    expect(sista.timmar).toBe(900);                         // 100 dagar × 9 tim
    expect(sista.modeller.genomsnitt).toBe(forsta.modeller.genomsnitt);
  });

  it("läsningen sker i flera anrop med range, och extra_tid läses paginerat också", async () => {
    const dagar = vardagar();
    g.__db.medarbetare = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, namn: `Förare ${i}` }));
    g.__db.arbetsdag = g.__db.medarbetare.flatMap((m: any) => dagar.map(d => ({ medarbetare_id: m.id, datum: d, arbetad_min: 540, dagtyp: "Produktion", start_tid: "06:00:00" })));
    g.__db.extra_tid = Array.from({ length: 1100 }, (_, i) => ({ medarbetare_id: "m11", datum: dagar[i % dagar.length], minuter: 1 }));
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0));
    const j = await (await anropa()).json();
    expect(g.__anrop.filter((a: any) => a.t === "arbetsdag").map((a: any) => a.sida)).toEqual([[0, 999], [1000, 1999]]);
    expect(g.__anrop.filter((a: any) => a.t === "extra_tid").map((a: any) => a.sida)).toEqual([[0, 999], [1000, 1999]]);
    // 1100 extra minuter ligger på m11 — de efter rad 1000 räknas också
    expect(j.medarbetare.find((m: any) => m.medarbetare_id === "m11").timmar).toBe(900 + Math.round((1100 / 60) * 10) / 10);
  });

  it("ett läsfel på arbetsdag ger 500 med meddelande — aldrig 'ingen övertid'", async () => {
    g.__fel = { arbetsdag: "timeout" };
    const r = await anropa();
    expect(r.status).toBe(500);
    expect((await r.json()).meddelande).toContain("timeout");
  });
});

describe("årsövertid-routen läser frånvaron", () => {
  it("semester mån–ons i vecka 6 sänker basen med 24 tim: 45 tim mot bas 16 → 29", async () => {
    g.__db.arbetsdag = ["2026-02-05", "2026-02-06"].map(d => dag(d, 9)); // bara tors–fre arbetade
    g.__db.ledighet_ansokningar = [{ medarbetare_id: "s", typ: "semester", startdatum: "2026-02-02", slutdatum: "2026-02-04", status: "godkänd" }];
    const j = await (await anropa()).json();
    const p = j.medarbetare[0].perioder.find((x: any) => x.markerad);
    expect(p).toMatchObject({ fran: 6, till: 6, timmar: 18, bas: 16, franvaroTimmar: 24, overtid: 2 });
    expect(j.franvaro_fel).toBeNull();
  });

  it("väntande och nekad ledighet är ingen frånvaro", async () => {
    g.__db.ledighet_ansokningar = [
      { medarbetare_id: "s", typ: "semester", startdatum: "2026-02-02", slutdatum: "2026-02-06", status: "väntar" },
      { medarbetare_id: "s", typ: "semester", startdatum: "2026-02-02", slutdatum: "2026-02-06", status: "nekad" },
    ];
    const p = (await (await anropa()).json()).medarbetare[0].perioder.find((x: any) => x.markerad);
    expect(p).toMatchObject({ bas: 40, franvaroTimmar: 0, timmar: 45, overtid: 5 });
  });

  it("annans frånvaro räknas inte på Stefan", async () => {
    g.__db.ledighet_ansokningar = [{ medarbetare_id: "annan", typ: "semester", startdatum: "2026-02-02", slutdatum: "2026-02-06", status: "godkänd" }];
    const p = (await (await anropa()).json()).medarbetare[0].perioder.find((x: any) => x.markerad);
    expect(p.franvaroTimmar).toBe(0);
  });

  it("frånvaron går inte att läsa: räknat utan den, och svaret säger det (franvaro_fel) — inte 'ingen frånvaro'", async () => {
    g.__fel = { ledighet_ansokningar: "permission denied" };
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.franvaro_fel).toBe("permission denied");
    expect(j.medarbetare[0].perioder.find((x: any) => x.markerad)).toMatchObject({ bas: 40, franvaroTimmar: 0 });
  });

  it("svaret bär basavdraget per förare (för 'Så räknas det')", async () => {
    g.__db.arbetsdag = ["2026-02-02", "2026-02-03", "2026-02-05", "2026-02-06"].map(d => dag(d, 9)); // onsdag 4/2 ej arbetad
    g.__db.ledighet_ansokningar = [{ medarbetare_id: "s", typ: "sjuk", startdatum: "2026-02-04", slutdatum: "2026-02-04", status: "registrerad" }];
    const j = await (await anropa()).json();
    expect(j.medarbetare[0].basavdrag).toEqual({ franvaroTimmar: 8, rodaTimmar: 24 });
  });
});

describe("årsövertid-routen räknar per kalendermånad som lönen (modeller.manad)", () => {
  /** Alla vardagar i februari 2026 (20 st) med 8,5 tim/dag = 170 tim mot månadens ordinarie 160. */
  const feb = () => { const ut: string[] = []; for (let d = 1; d <= 28; d++) { const w = new Date(2026, 1, d).getDay(); if (w % 6) ut.push(`2026-02-${String(d).padStart(2, "0")}`); } return ut; };
  beforeEach(() => {
    g.__db.arbetsdag = feb().map(d => dag(d, 8.5));
    g.__db.utjamningsperiod = [];
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0));
  });

  it("februari: 170 − 160 = 10 tim; svaret bär modeller.manad, månadslistan och fördelningen per månad", async () => {
    const m = (await (await anropa()).json()).medarbetare[0];
    expect(m.modeller.manad).toBe(10);
    expect(m.manader.find((x: any) => x.manad === "2026-02")).toMatchObject({ modell: "manad", ordinarieH: 160, arbetadH: 170, overtid: 10, pagaende: false });
    expect(m.per_manad["2026-02"]).toEqual({ fast: 10, uppskattad: 0 });
  });

  it("anställningsdatum läses ur medarbetare: anställd 16 feb → 10 vardagar bort ur ordinarie", async () => {
    g.__db.medarbetare = [{ id: "s", namn: "Stefan Karlsson", anstallningsdatum: "2026-02-16" }];
    g.__db.arbetsdag = feb().filter(d => d >= "2026-02-16").map(d => dag(d, 9));
    const m = (await (await anropa()).json()).medarbetare[0];
    expect(m.manader.find((x: any) => x.manad === "2026-02")).toMatchObject({ ordinarieH: 80, arbetadH: 90, overtid: 10 });
  });

  it("röda dagar följer avtalets lista (gs_avtal.helglon_dagar): utan Trettondagen är januari 8 tim längre", async () => {
    g.__db.arbetsdag = [dag("2026-01-07", 8)];
    const med = (await (await anropa()).json()).medarbetare[0].manader.find((x: any) => x.manad === "2026-01").ordinarieH;
    g.__db.gs_avtal = [{ max_overtid_ar_h: 250, giltigt_fran: "2025-04-01", helglon_dagar: "Nyårsdagen,Julafton" }];
    const utan = (await (await anropa()).json()).medarbetare[0].manader.find((x: any) => x.manad === "2026-01").ordinarieH;
    expect(med).toBe(160);
    expect(utan).toBe(168);
  });

  it("en månad i en utjämningsperiod räknas som förut och får ingen månadsövertid", async () => {
    g.__db.utjamningsperiod = [{ startdatum: "2026-02-02", slutdatum: "2026-02-08", medarbetare_id: null, anteckning: "Test" }];
    const m = (await (await anropa()).json()).medarbetare[0];
    expect(m.manader.find((x: any) => x.manad === "2026-02")).toMatchObject({ modell: "utjamning", overtid: null });
  });

  it("en annans utjämningsperiod rör inte Stefan", async () => {
    g.__db.utjamningsperiod = [{ startdatum: "2026-02-02", slutdatum: "2026-02-08", medarbetare_id: "annan", anteckning: "Test" }];
    const m = (await (await anropa()).json()).medarbetare[0];
    expect(m.manader.find((x: any) => x.manad === "2026-02").modell).toBe("manad");
  });
});
