/**
 * GET /api/fortnox/employee-details: ATK-saldot i timmar = saldo (kr) / timlön. Timlönen är Fortnox HourlyPay och ingen annan källa:
 * avtalet har ingen timlön (gs_avtal.timlon_kr finns inte i prod — reserven läste alltid `undefined`). Saknas den blir timmar null.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;
vi.mock("@/lib/auth/server", () => ({ målMedarbetareId: async () => ({ ok: true, id: "m1" }) }));
vi.mock("@/lib/lonesystem/server", () => {
  class Q {
    constructor(public t: string) {}
    select() { return this; } eq() { return this; } lte() { return this; } or() { return this; } order() { return this; } limit() { return this; }
    maybeSingle() { g.__valda.push(this.t); return Promise.resolve({ data: g.__db[this.t] ?? null, error: null }); }
  }
  return { serverSupabase: () => ({ from: (t: string) => new Q(t) }), getFortnoxClient: async () => ({ accessToken: "tok" }) };
});

import { GET } from "./route";

const anropa = () => GET(new Request("https://app.example/api/fortnox/employee-details?medarbetare_id=m1") as any);
const fortnoxSvar = (emp: Record<string, unknown>) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Employee: emp }), text: async () => "" })));

beforeEach(() => {
  g.__valda = [];
  g.__db = {
    medarbetare_lonesystem: { anstallningsnummer: "1001" },
    // raden som i prod: ingen timlon_kr
    gs_avtal: { id: "a1", namn: "Skogsavtalet 2025-2027", giltigt_fran: "2025-04-01", giltigt_till: "2027-03-31" },
  };
  vi.unstubAllGlobals();
});

describe("employee-details: ATK i timmar", () => {
  it("timlön ur Fortnox → saldot delat på den, en decimal", async () => {
    fortnoxSvar({ ATKValue: 2650, HourlyPay: 200, VacationDaysPaid: 25, VacationDaysSaved: 5, VacationDaysRegisteredPaid: 10 });
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.atk).toEqual({ saldo_kr: 2650, timmar: 13.3 });
    expect(j.lon).toEqual({ timlon: 200 });
    expect(j.semester.kvar).toBe(20);
  });

  it("Fortnox saknar timlön: timmar och timlön är null — ingen gissad tid, ingen 0", async () => {
    fortnoxSvar({ ATKValue: 2650 });
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.atk).toEqual({ saldo_kr: 2650, timmar: null });
    expect(j.lon).toEqual({ timlon: null });
  });

  it("HourlyPay 0 räknas som saknad", async () => {
    fortnoxSvar({ ATKValue: 100, HourlyPay: 0 });
    const j = await (await anropa()).json();
    expect(j.atk.timmar).toBeNull();
    expect(j.lon.timlon).toBeNull();
  });

  it("avtalet ger ingen timlön ens när raden har ett timlon_kr-fält: den läses inte (kolumnen finns inte)", async () => {
    g.__db.gs_avtal = { ...g.__db.gs_avtal, timlon_kr: 999 };
    fortnoxSvar({ ATKValue: 999 });
    const j = await (await anropa()).json();
    expect(j.atk.timmar).toBeNull();
    expect(j.lon.timlon).toBeNull();
  });

  it("svaret säger fortfarande vilket avtal som gällde", async () => {
    fortnoxSvar({ ATKValue: 0, HourlyPay: 150 });
    const j = await (await anropa()).json();
    expect(j.gs_avtal_vald).toEqual({ id: "a1", namn: "Skogsavtalet 2025-2027", giltigt_fran: "2025-04-01", giltigt_till: "2027-03-31" });
  });
});
