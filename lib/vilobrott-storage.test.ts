import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Re-analysen mot NUVARANDE data (Martin 2026-10-05): ett vilobrott för testdata som raderats
 * stod kvar, och föraren fick "Varför bröts vilan? Mellan 29 september och 29 september hade
 * du som mest 0 h sammanhängande vila". Minnesdatabas med filter; skrivningar loggas.
 */

type Rad = Record<string, any>;
const g = globalThis as any;

vi.mock("@/lib/supabase", () => {
  class Q {
    f: ((r: Rad) => boolean)[] = [];
    enkel = false;
    mode: "select" | "delete" | "insert" | "update" = "select";
    vals: any = null;
    constructor(public t: string) {}
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    not(k: string, op: string, v: any) { if (op === "is" && v === null) this.f.push(r => r[k] != null); return this; }
    maybeSingle() { this.enkel = true; return this; }
    delete() { this.mode = "delete"; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    then(res: any, rej: any) {
      const db = g.__db as Record<string, Rad[]>;
      const tab = (db[this.t] = db[this.t] || []);
      let data: any;
      if (this.mode === "select") {
        const rader = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
        data = this.enkel ? (rader[0] ?? null) : rader;
      } else if (this.mode === "delete") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        db[this.t] = tab.filter(r => !traff.includes(r));
        g.__skriv.push({ tabell: this.t, op: "delete", rader: traff.map(r => ({ ...r })) });
        data = null;
      } else if (this.mode === "insert") {
        tab.push({ id: "ny-" + tab.length, besvarat_av_forare: false, ...this.vals });
        g.__skriv.push({ tabell: this.t, op: "insert", vals: this.vals });
        data = null;
      } else {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        traff.forEach(r => Object.assign(r, this.vals));
        g.__skriv.push({ tabell: this.t, op: "update", vals: this.vals });
        data = null;
      }
      const lasFel = g.__lasFelTabell === this.t && this.mode === "select";
      return Promise.resolve({ data: lasFel ? null : data, error: lasFel ? { message: "nät" } : null }).then(res, rej);
    }
  }
  for (const m of ["select", "order", "limit", "or", "in", "neq", "gt", "lt"]) (Q.prototype as any)[m] = function () { return this; };
  return { supabase: { from: (t: string) => new Q(t) } };
});

import { stadaVilobrott, raknaOmVilobrottEfterAndring, hamtaVilobrottForPeriod, hamtaVilobrottRaa, omanalyseraVilobrott } from "./vilobrott-storage";

const MED = "m-1";
const AVTAL = { id: 1, giltigt_fran: "2026-01-01", giltigt_till: null, dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };
const pass = (datum: string, start = "06:00:00", slut = "16:00:00") => ({ medarbetare_id: MED, datum, start_tid: start, slut_tid: slut });
const brott = (o: Rad) => ({ id: "v-" + o.typ + o.datum, medarbetare_id: MED, besvarat_av_forare: false, krav_h: 36, beskrivning: "x", ...o });
const skrivna = (op: string) => (g.__skriv as any[]).filter(s => s.tabell === "vilobrott" && s.op === op);
const kvar = () => (g.__db.vilobrott as Rad[]).map(r => `${r.typ}|${r.datum}`).sort();

beforeEach(() => {
  g.__skriv = []; g.__lasFelTabell = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  g.__db = { gs_avtal: [AVTAL], arbetsdag: [], extra_tid: [], vilobrott: [] };
});

describe("stadaVilobrott (vid öppning: bara radera, aldrig skapa)", () => {
  it("Martins fall: obesvarat 0 h-brott 'mellan 29 sep och 29 sep' raderas när ett enda pass är kvar", async () => {
    g.__db.arbetsdag = [pass("2026-09-29")];
    g.__db.vilobrott = [brott({ typ: "veckovila", datum: "2026-09-29", vila_h: 0, beskrivning: "Mellan 29 september och 29 september hade du som mest 0 h sammanhängande vila" })];
    await stadaVilobrott(MED);
    expect(kvar()).toEqual([]);
    expect(skrivna("delete").length).toBe(1);
  });

  it("obesvarat brott vars dagar raderats (inga pass alls) raderas", async () => {
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 8, krav_h: 11 })];
    await stadaVilobrott(MED);
    expect(kvar()).toEqual([]);
  });

  it("ett brott som nuvarande data fortfarande stöder BEHÅLLS orört", async () => {
    // slut 22:00 → start 04:00 nästa dag = 6 h vila (< 11 h)
    g.__db.arbetsdag = [pass("2026-09-28", "12:00:00", "22:00:00"), pass("2026-09-29", "04:00:00", "10:00:00")];
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 6, krav_h: 11 })];
    await stadaVilobrott(MED);
    expect(kvar()).toContain("dygnsvila|2026-09-28");
    expect(skrivna("delete").length).toBe(0);
  });

  it("BESVARADE brott raderas aldrig (revisionsspår), även om datan försvunnit", async () => {
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 8, krav_h: 11, besvarat_av_forare: true, orsak: "annat" })];
    await stadaVilobrott(MED);
    expect(kvar()).toEqual(["dygnsvila|2026-09-28"]);
  });

  it("skapar INGA nya brott och uppdaterar inga siffror (städläge)", async () => {
    g.__db.arbetsdag = [pass("2026-09-28", "12:00:00", "22:00:00"), pass("2026-09-29", "04:00:00", "10:00:00")]; // ger ett nytt dygnsvilebrott
    await stadaVilobrott(MED);
    expect(skrivna("insert").length).toBe(0);
    expect(skrivna("update").length).toBe(0);
    expect(kvar()).toEqual([]);
  });

  it("brott utanför fönstret (äldre än 30 dagar) rörs inte", async () => {
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-08-20", vila_h: 8, krav_h: 11 })];
    await stadaVilobrott(MED);
    expect(kvar()).toEqual(["dygnsvila|2026-08-20"]);
  });

  it("läsfel på arbetsdagarna KASTAR och raderar ingenting (ett tomt underlag av fel är inte 'inga dagar')", async () => {
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 8, krav_h: 11 })];
    g.__lasFelTabell = "arbetsdag";
    await expect(stadaVilobrott(MED)).rejects.toThrow(/arbetsdagarna/);
    expect(kvar()).toEqual(["dygnsvila|2026-09-28"]);
  });

  it("saknade trösklar: ingen analys, inget raderas", async () => {
    g.__db.gs_avtal = [];
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 8, krav_h: 11 })];
    await stadaVilobrott(MED);
    expect(kvar()).toEqual(["dygnsvila|2026-09-28"]);
  });
});

describe("raknaOmVilobrottEfterAndring (efter att ett pass eller en period ändrats eller raderats)", () => {
  it("en period raderas: brottet som perioden orsakade försvinner", async () => {
    // Perioddagen 29 sep (planering 04:00–10:00) gav 6 h dygnsvila efter passet 28 sep till 22:00.
    g.__db.arbetsdag = [pass("2026-09-28", "12:00:00", "22:00:00")];
    g.__db.extra_tid = []; // perioden är nu raderad
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 6, krav_h: 11 })];
    await raknaOmVilobrottEfterAndring(MED, "2026-09-29");
    expect(kvar()).toEqual([]);
  });

  it("en ändring som SKAPAR ett brott lägger till det (full omräkning, inte bara städning)", async () => {
    g.__db.arbetsdag = [pass("2026-09-28", "12:00:00", "22:00:00"), pass("2026-09-29", "04:00:00", "10:00:00")];
    await raknaOmVilobrottEfterAndring(MED, "2026-09-29");
    expect(kvar()).toContain("dygnsvila|2026-09-28"); // (två pass med 6 h emellan ger också veckovila: aldrig 36 h)
    expect(skrivna("insert").length).toBeGreaterThanOrEqual(1);
  });

  it("använder färska rader ur databasen: en raderad arbetsdag räknas inte med", async () => {
    g.__db.arbetsdag = [pass("2026-09-28", "12:00:00", "22:00:00")]; // 29 sep är raderad
    g.__db.vilobrott = [brott({ typ: "dygnsvila", datum: "2026-09-28", vila_h: 6, krav_h: 11 })];
    await omanalyseraVilobrott(MED, "2026-09-25", "2026-10-02");
    expect(kvar()).toEqual([]);
  });
});

describe("visning: hamtaVilobrottForPeriod döljer 0 h-rader, hamtaVilobrottRaa visar allt", () => {
  it("0 h-raden syns inte för föraren men finns kvar för re-analysen", async () => {
    g.__db.vilobrott = [
      brott({ typ: "veckovila", datum: "2026-09-29", vila_h: 0 }),
      brott({ typ: "dygnsvila", datum: "2026-09-30", vila_h: 8, krav_h: 11 }),
    ];
    const visas = await hamtaVilobrottForPeriod(MED, "2026-09-01", "2026-10-05");
    expect(visas.map(r => r.datum)).toEqual(["2026-09-30"]);
    const raa = await hamtaVilobrottRaa(MED, "2026-09-01", "2026-10-05");
    expect(raa.length).toBe(2);
  });
});
