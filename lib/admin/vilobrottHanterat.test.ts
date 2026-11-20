/**
 * Admins "hanterat" på ett vilobrott: uppdatera raden om den finns, annars skapa den med brottets siffror, och läs ALLTID tillbaka.
 * Minnesdatabas där en trigger efterliknas (vem/när sätts av "databasen"); fel kan läggas på per operation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Rad = Record<string, any>;
const g = globalThis as any;

vi.mock("@/lib/supabase", () => {
  class Q {
    f: ((r: Rad) => boolean)[] = [];
    mode: "select" | "insert" | "update" = "select";
    vals: any = null; enkel = false;
    constructor(public t: string) {}
    select() { return this; }
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    maybeSingle() { this.enkel = true; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    then(res: any, rej: any) {
      const tab: Rad[] = g.__db;
      g.__logg.push(this.mode);
      const fel = g.__fel?.[this.mode];
      if (fel) { if (g.__felEnGang) g.__fel[this.mode] = null; return Promise.resolve({ data: null, error: fel }).then(res, rej); }
      const trigger = (r: Rad) => {
        if (g.__ingenTrigger) return;
        if (r.kvitterad_tid) { r.kvitterad_tid = "DB-NU"; r.kvitterad_av_chef = "admin"; } else { r.kvitterad_av_chef = null; r.kvitterad_anteckning = null; }
      };
      let data: any;
      if (this.mode === "insert") { const r = { ...this.vals }; trigger(r); tab.push(r); data = [{ id: "ny" }]; }
      else if (this.mode === "update") { const t = tab.filter(r => this.f.every(fn => fn(r))); t.forEach(r => { Object.assign(r, this.vals); trigger(r); }); data = t.map(() => ({ id: "x" })); }
      else { const t = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r })); data = this.enkel ? (t[0] ?? null) : t; }
      return Promise.resolve({ data, error: null }).then(res, rej);
    }
  }
  return { supabase: { from: (t: string) => new Q(t) } };
});

import { markeraHanterat, angraHanterat, anteckningGiltig, hanteratText, ANTECKNING_MAX } from "./vilobrottHanterat";

const BROTT = { medarbetare_id: "m", typ: "dygnsvila" as const, datum: "2026-10-12", vila_h: 8.5, krav_h: 11, beskrivning: "8,5 h vila" };

beforeEach(() => { g.__db = []; g.__logg = []; g.__fel = {}; g.__felEnGang = false; g.__ingenTrigger = false; });

describe("markeraHanterat", () => {
  it("raden finns: uppdateras, förarens svar orört, inget insert", async () => {
    g.__db = [{ ...BROTT, besvarat_av_forare: true, orsak: "annat" }];
    await markeraHanterat(BROTT, "  Kompledigt 3 h  ");
    expect(g.__db).toHaveLength(1);
    expect(g.__db[0]).toMatchObject({ kvitterad_tid: "DB-NU", kvitterad_anteckning: "Kompledigt 3 h", orsak: "annat", besvarat_av_forare: true });
    expect(g.__logg).toEqual(["update", "select"]);
  });

  it("raden saknas (föraren har inte öppnat appen): skapas med brottets siffror, obesvarad", async () => {
    await markeraHanterat(BROTT, "Kompledigt");
    expect(g.__db).toHaveLength(1);
    expect(g.__db[0]).toMatchObject({ ...BROTT, kvitterad_anteckning: "Kompledigt", kvitterad_tid: "DB-NU" });
    expect(g.__db[0].besvarat_av_forare).toBeUndefined(); // databasens default (false) gäller
    expect(g.__logg).toEqual(["update", "insert", "select"]);
  });

  it("tom anteckning sparas aldrig", async () => {
    await expect(markeraHanterat(BROTT, "   ")).rejects.toThrow(/Skriv vad som gjordes/);
    expect(g.__logg).toEqual([]);
    expect(anteckningGiltig("x".repeat(ANTECKNING_MAX))).toBe(true);
    expect(anteckningGiltig("x".repeat(ANTECKNING_MAX + 1))).toBe(false);
  });

  it("syns inte vid återläsningen → fel, aldrig tyst 'sparat'", async () => {
    // Raden finns inte, insert krockar (23505) och den andra uppdateringen träffar ändå ingen rad: inget landade.
    g.__fel = { insert: { code: "23505", message: "dubblett" } };
    await expect(markeraHanterat(BROTT, "Kompledigt")).rejects.toThrow(/syns inte/);
    expect(g.__logg).toEqual(["update", "insert", "update", "select"]);
  });

  it("migrationen inte körd: säger det i klartext", async () => {
    g.__fel = { update: { code: "PGRST204", message: "Could not find the 'kvitterad_anteckning' column" } };
    await expect(markeraHanterat(BROTT, "Kompledigt")).rejects.toThrow(/migrationen är inte körd/);
  });

  it("förare (42501): bara admin kan", async () => {
    g.__fel = { update: { code: "42501", message: "Bara admin" } };
    await expect(markeraHanterat(BROTT, "Kompledigt")).rejects.toThrow(/bara admin/);
  });
});

describe("angraHanterat", () => {
  it("tar bort markeringen och läser tillbaka", async () => {
    g.__db = [{ ...BROTT, kvitterad_tid: "t", kvitterad_av_chef: "admin", kvitterad_anteckning: "Kompledigt" }];
    await angraHanterat(BROTT);
    expect(g.__db[0]).toMatchObject({ kvitterad_tid: null, kvitterad_av_chef: null, kvitterad_anteckning: null });
  });
});

describe("hanteratText", () => {
  it("förnamn och dag i svensk tid (UTC 23:30 = nästa dag)", () => {
    expect(hanteratText({ tid: "2026-10-24T23:30:00Z", av: "Martin Lindqvist" })).toBe("Hanterat av Martin 25 okt");
  });
});
