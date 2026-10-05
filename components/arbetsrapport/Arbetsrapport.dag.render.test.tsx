// @vitest-environment jsdom
/**
 * RENDERINGSTESTER för Dag-vyns kvällsläge (utredning 2026-10-05, två fel):
 *
 *  1. Körning visade 0 km fast arbetsdag hade km — raden läste bara det lokala
 *     tillståndet (kmM/kmK) som aldrig fylldes från databasen. Km-arket
 *     förifylldes 0/0 och Spara skrev 0 med km_kalla='forare'.
 *  2. "Ändra rapport" på en bekräftad dag gjorde ingenting (stängde ett ark som
 *     redan var stängt). Ska öppna redigeringen för dagen.
 *
 * Supabase är en minnesfake med filter (eq/gte/lte/is), så vyn läser en riktig
 * arbetsdag-rad; skrivningar loggas i __skriv så testen kan läsa det som
 * FAKTISKT skrevs.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const IDAG = "2026-10-05";
const IGAR = "2026-10-04";
const MASKIN = "PONS20SDJAA270231";
const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: MASKIN, user_id: "u-1", hemadress: "" };

vi.mock("@/lib/supabase", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    enkel = false;
    mode: "select" | "update" | "upsert" | "insert" = "select";
    vals: any = null;
    constructor(public t: string) {}
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    upsert(v: any) { this.mode = "upsert"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    then(res: any, rej: any) {
      const g = globalThis as any;
      const db = g.__db as Record<string, any[]>;
      const tab = (db[this.t] = db[this.t] || []);
      let rader: any[];
      if (this.mode === "select") {
        rader = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
      } else if (this.mode === "update") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        traff.forEach(r => Object.assign(r, this.vals));
        g.__skriv.push({ tabell: this.t, op: "update", vals: this.vals });
        rader = traff.map(r => ({ ...r }));
      } else {
        const ny = { id: "ny-" + g.__skriv.length, ...this.vals };
        g.__skriv.push({ tabell: this.t, op: this.mode, vals: this.vals });
        rader = [ny];
      }
      return Promise.resolve({ data: this.enkel ? (rader[0] ?? null) : rader, error: null, count: rader.length }).then(res, rej);
    }
  }
  for (const m of ["select", "order", "limit", "or", "in", "not", "delete", "neq", "gt", "lt", "ilike", "range", "match", "contains", "filter", "textSearch"]) {
    (Q.prototype as any)[m] = function () { return this; };
  }
  return {
    supabase: {
      from: (t: string) => new Q(t) as any,
      auth: {
        getUser: async () => ({ data: { user: { id: "u-1", email: "test@example.com" } } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      rpc: () => new Q("rpc") as any,
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).__skriv = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: /reduce/.test(q), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
  (window as any).matchMedia = (globalThis as any).matchMedia;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T17:30:00Z")); // måndag 19:30 svensk tid
  window.history.replaceState({}, "", "/arbetsrapport");
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.useRealTimers();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const vänta = async (n = 6, ms = 40) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

async function montera() {
  const { default: Arbetsrapport } = await import("./Arbetsrapport");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Arbetsrapport />); });
  await vänta(10, 40);
}

function hitta(sub: string): HTMLElement | null {
  const alla = Array.from(behallare!.querySelectorAll<HTMLElement>("button, div, span, p"));
  const traff = alla.filter(e => (e.textContent || "").includes(sub));
  return traff.filter(e => !Array.from(e.children).some(c => (c.textContent || "").includes(sub)))[0] || null;
}
async function klick(sub: string) {
  const e = hitta(sub);
  if (!e) throw new Error("hittar inte: " + sub);
  await act(async () => { e.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(4, 40);
}
async function klickKnapp(prefix: string) {
  const b = Array.from(behallare!.querySelectorAll<HTMLElement>("button")).find(x => (x.textContent || "").trim().startsWith(prefix));
  if (!b) throw new Error("hittar ingen knapp som börjar med: " + prefix);
  await act(async () => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(4, 40);
}const text = () => behallare!.textContent || "";

const dagRad = (o: any) => ({
  id: "ad-" + o.datum, medarbetare_id: "m-1", maskin_id: MASKIN, objekt_id: "OBJ1", rast_min: 30, km_morgon: 56, km_kvall: 56, km_totalt: 112,
  traktamente: false, bekraftad: true, bekraftad_tid: o.datum + "T15:30:00Z", brandrisk_beordrad: null, ...o,
});

function fixtur(idag: any) {
  (globalThis as any).__db = {
    medarbetare: [FORARE],
    gs_avtal: [{ id: 1, giltigt_fran: "2026-01-01", giltigt_till: null, traktamente_hel_kr: 300, traktamente_halv_kr: 150, km_grans_per_dag: 60 }],
    dim_objekt: [{ objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 }],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    arbetsdag: [idag, dagRad({ datum: IGAR, start_tid: "06:50:00", slut_tid: "16:05:00" })],
    arbetsdag_objekt: [], extra_tid: [], vilobrott: [],
  };
}
const klartPass = (o: any = {}) => dagRad({ datum: IDAG, start_tid: "06:48:00", slut_tid: "16:12:00", bekraftad: false, bekraftad_tid: null, ...o });
const skrivna = (tabell: string) => ((globalThis as any).__skriv as any[]).filter(s => s.tabell === tabell);

describe("Dag-vyn: Körning läser databasens km", () => {
  it("raden visar 112 km (56 + 56 i arbetsdag), inte 0 km", async () => {
    fixtur(klartPass());
    await montera();
    expect(text()).toMatch(/Körning112 km/);
    expect(text()).not.toMatch(/Körning0 km/);
    expect(text()).toMatch(/6 påbörjade mil/);
  });

  it("km-arket öppnas med databasens värden (112 km totalt), inte 0/0", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?");
    await klickKnapp("Körning");
    expect(text()).toMatch(/Totalt112 km/);
  });

  it("Spara i km-arket utan ändring skriver INGET (km låses inte som förarens i onödan) och stänger arket", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?");
    await klickKnapp("Körning");
    expect(text()).toMatch(/Ändra km/);
    await klick("Spara");
    expect(skrivna("arbetsdag").length).toBe(0);
    expect(text()).not.toMatch(/Ändra km/);
    expect(text()).toMatch(/Körning112 km/);
  });

  it("Spara efter en ändring skriver båda värdena och km_kalla='forare'", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?");
    await klickKnapp("Körning");
    const plus = Array.from(behallare!.querySelectorAll<HTMLElement>("button")).filter(b => b.textContent === "+")[0];
    await act(async () => { plus.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await klick("Spara");
    const skrivningar = skrivna("arbetsdag").filter(s => "km_morgon" in s.vals);
    expect(skrivningar.length).toBe(1);
    expect(skrivningar[0].vals.km_morgon).toBe(66);
    expect(skrivningar[0].vals.km_kvall).toBe(56);
    expect(skrivningar[0].vals.km_kalla).toBe("forare");
    expect(text()).toMatch(/Körning122 km/);
  });

  it("tomma km i databasen visar fortfarande 0 km (ärligt, ingen gissning)", async () => {
    fixtur(klartPass({ km_morgon: 0, km_kvall: 0, km_totalt: 0 }));
    await montera();
    expect(text()).toMatch(/Körning0 km/);
  });

  it("Bekräfta dagen behåller databasens km (56/56)", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Stämmer"); // kvällsvyns knapp (förr "Bekräfta dagen") — samma skrivning
    const upserts = skrivna("arbetsdag").filter(s => s.op === "upsert");
    expect(upserts.length).toBe(1);
    expect(upserts[0].vals.km_morgon).toBe(56);
    expect(upserts[0].vals.km_kvall).toBe(56);
    expect(upserts[0].vals.bekraftad).toBe(true);
  });
});

describe("Dag-vyn: Ändra rapport på en bekräftad dag", () => {
  it("öppnar redigeringen för dagen i stället för att göra ingenting", async () => {
    fixtur(klartPass({ bekraftad: true, bekraftad_tid: "2026-10-05T15:30:00Z" }));
    await montera();
    expect(text()).toMatch(/Bekräftad kl/);
    const fore = text();
    await klick("Ändra rapport");
    const efter = text();
    expect(efter).not.toBe(fore);
    // Redigera-vyn: dagens rubrik, bekräftelseraden och Tillbaka — inte Dag-kortets knapp
    expect(efter).toMatch(/5 okt/);
    expect(efter).toMatch(/Tillbaka/);
    expect(efter).not.toMatch(/Ändra rapport/);
    // och inget skrevs av att bara öppna
    expect(skrivna("arbetsdag").length).toBe(0);
  });
});
