/**
 * GET /api/lon/arsovertid: frånvaron läses (ledighet_ansokningar via lib/franvaro) och sänker basen i genomsnittsmodellen.
 * Kan den inte läsas räknas utan den OCH svaret säger det (franvaro_fel): talen är då för höga, aldrig "ingen frånvaro".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;
vi.mock("@/lib/auth/server", () => ({ kravRoll: async () => ({ ok: true, session: {} }), ADMIN_ROLLER: ["admin"] }));
vi.mock("@/lib/lonesystem/server", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    constructor(public t: string) {}
    select() { return this; } order() { return this; } limit() { return this; }
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
    maybeSingle() { (this as any).enkel = true; return this; }
    then(res: any, rej: any) {
      if (g.__fel?.[this.t]) return Promise.resolve({ data: null, error: { message: g.__fel[this.t] } }).then(res, rej);
      const rader = ((g.__db[this.t] || []) as any[]).filter(r => this.f.every(fn => fn(r)));
      return Promise.resolve({ data: (this as any).enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
    }
  }
  return { serverSupabase: () => ({ from: (t: string) => new Q(t) }) };
});

import { GET } from "./route";

const anropa = () => GET({ nextUrl: new URL("https://app.example/api/lon/arsovertid?ar=2026") } as any);
const dag = (datum: string, h: number) => ({ medarbetare_id: "s", datum, arbetad_min: h * 60, dagtyp: "Produktion", start_tid: "06:00:00" });

beforeEach(() => {
  g.__fel = {};
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
