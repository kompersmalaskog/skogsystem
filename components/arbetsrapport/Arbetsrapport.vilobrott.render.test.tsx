// @vitest-environment jsdom
/**
 * RENDERINGSTESTER: gamla vilobrott räknas om (Martin 2026-10-05).
 *
 * Föraren fick frågan "Varför bröts vilan?" med texten "Mellan 29 september och 29 september
 * hade du som mest 0 h sammanhängande vila" — en rad i vilobrott från när det låg testdata
 * runt 29 september. Datan raderades, brottet stod kvar. Vilobrott räknades bara om efter
 * Avsluta/Starta/Ändra tider och vid Bekräfta, aldrig när en dag eller period raderades.
 *
 * Nu: (1) appen STÄDAR vid öppning (obesvarade brott som nuvarande data inte stöder raderas,
 * inga nya skapas), (2) en raderad/ändrad period räknar om vilan, (3) ett brott med 0 h visas
 * aldrig. Minnesdatabas med filter och radering; skrivningar loggas.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const IDAG = "2026-10-05";
const IGAR = "2026-10-04";
const MASKIN = "PONS20SDJAA270231";
const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: MASKIN, user_id: "u-1", hemadress: "" };
const AVTAL = { id: 1, giltigt_fran: "2026-01-01", giltigt_till: null, traktamente_hel_kr: 300, traktamente_halv_kr: 150, km_grans_per_dag: 60, dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };

vi.mock("@/lib/supabase", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    enkel = false;
    mode: "select" | "update" | "upsert" | "insert" | "delete" = "select";
    vals: any = null;
    constructor(public t: string) {}
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    not(k: string, op: string, v: any) { if (op === "is" && v === null) this.f.push(r => r[k] != null); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    upsert(v: any) { this.mode = "upsert"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    delete() { this.mode = "delete"; return this; }
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
      } else if (this.mode === "delete") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        db[this.t] = tab.filter(r => !traff.includes(r));
        g.__skriv.push({ tabell: this.t, op: "delete", rader: traff.map(r => ({ ...r })) });
        rader = traff.map(r => ({ ...r }));
      } else {
        const ny = { id: "ny-" + g.__skriv.length, besvarat_av_forare: false, ...this.vals };
        tab.push(ny);
        g.__skriv.push({ tabell: this.t, op: this.mode, vals: this.vals });
        rader = [ny];
      }
      return Promise.resolve({ data: this.enkel ? (rader[0] ?? null) : rader, error: null, count: rader.length }).then(res, rej);
    }
  }
  for (const m of ["select", "order", "limit", "or", "in", "neq", "gt", "lt", "ilike", "range", "match", "contains", "filter", "textSearch"]) {
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
const g = globalThis as any;

beforeEach(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.__skriv = [];
  try { localStorage.clear(); } catch { /* jsdom */ }
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: /reduce/.test(q), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
  (window as any).matchMedia = g.matchMedia;
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
const text = () => behallare!.textContent || "";
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
const skrivna = (tabell: string, op?: string) => (g.__skriv as any[]).filter(s => s.tabell === tabell && (!op || s.op === op));
const brott = (o: any) => ({ id: "v-" + o.typ + o.datum, medarbetare_id: "m-1", besvarat_av_forare: false, krav_h: 11, beskrivning: "x", ...o });
const dagRad = (o: any) => ({
  id: "ad-" + o.datum, medarbetare_id: "m-1", maskin_id: MASKIN, objekt_id: "OBJ1", rast_min: 30, km_morgon: 56, km_kvall: 56, km_totalt: 112,
  traktamente: false, bekraftad: true, bekraftad_tid: o.datum + "T15:30:00Z", brandrisk_beordrad: null, ...o,
});
function fixtur(arbetsdag: any[], vilobrott: any[], extra_tid: any[] = [], forare: any = FORARE) {
  g.__db = {
    medarbetare: [forare], gs_avtal: [AVTAL],
    dim_objekt: [{ objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 }],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    arbetsdag, arbetsdag_objekt: [], extra_tid, vilobrott,
  };
}
const kvarVilo = () => (g.__db.vilobrott as any[]).map(r => `${r.typ}|${r.datum}`).sort();
const klartPass = (o: any = {}) => dagRad({ datum: IDAG, start_tid: "06:48:00", slut_tid: "16:12:00", bekraftad: false, bekraftad_tid: null, ...o });

describe("Vilobrott räknas om mot nuvarande data", () => {
  it("Martins fall: obesvarat brott 'mellan 29 sep och 29 sep, 0 h' visas aldrig och städas bort vid öppning", async () => {
    fixtur([klartPass(), dagRad({ datum: IGAR, start_tid: "06:50:00", slut_tid: "16:05:00" })], [
      brott({ typ: "veckovila", datum: "2026-09-29", vila_h: 0, krav_h: 36, beskrivning: "Mellan 29 september och 29 september hade du som mest 0 h sammanhängande vila" }),
    ]);
    await montera();
    expect(text()).not.toMatch(/Veckovila/);
    expect(text()).not.toMatch(/0 tim/);
    expect(kvarVilo()).toEqual([]);
    expect(skrivna("vilobrott", "delete").length).toBe(1);
  });

  it("ett brott utan stöd i nuvarande data (raderad testdata) städas bort och visas inte", async () => {
    fixtur([klartPass(), dagRad({ datum: IGAR, start_tid: "06:50:00", slut_tid: "16:05:00" })], [
      brott({ typ: "dygnsvila", datum: IGAR, vila_h: 8.1 }),
    ]);
    await montera();
    expect(text()).not.toMatch(/Dygnsvila/);
    expect(kvarVilo()).toEqual([]);
  });

  it("ett brott som nuvarande data stöder visas som förut, och inget skrivs", async () => {
    // igår 12:00–22:00, idag början 04:00 → 6 h dygnsvila (< 11 h)
    fixtur([klartPass({ start_tid: "04:00:00", slut_tid: "13:00:00" }), dagRad({ datum: IGAR, start_tid: "12:00:00", slut_tid: "22:00:00" })], [
      brott({ typ: "dygnsvila", datum: IGAR, vila_h: 6 }),
    ]);
    await montera();
    // kvällen: vilobrottet är en rad i "Saker att svara på" (ingen remsa överst)
    expect(text()).toMatch(/Dygnsvila 6 tim/);
    expect(text()).toMatch(/Varför bröts vilan\?/);
    expect(skrivna("vilobrott").length).toBe(0);
  });

  it("ett BESVARAT brott raderas aldrig av städningen (revisionsspår)", async () => {
    fixtur([klartPass(), dagRad({ datum: IGAR, start_tid: "06:50:00", slut_tid: "16:05:00" })], [
      brott({ typ: "dygnsvila", datum: IGAR, vila_h: 8.1, besvarat_av_forare: true, orsak: "annat" }),
    ]);
    await montera();
    expect(kvarVilo()).toEqual(["dygnsvila|2026-10-04"]);
  });

  it("raderar föraren perioden som orsakade brottet räknas vilan om och brottet försvinner", async () => {
    // Perioddag idag (planering 04:00–10:00) efter att passet igår slutade 22:00 → 6 h dygnsvila.
    const skalrad = dagRad({ datum: IDAG, maskin_id: null, objekt_id: null, start_tid: null, slut_tid: null, rast_min: 0, km_morgon: 0, km_kvall: 0, km_totalt: 0, traktamente: true, bekraftad: false, bekraftad_tid: null }); // traktamente: raden är inte tom och står kvar efter att perioden tagits bort
    const period = { id: "p1", medarbetare_id: "m-1", datum: IDAG, arbetsdag_id: skalrad.id, start_tid: "04:00:00", slut_tid: "10:00:00", minuter: 360, aktivitet_typ: "planering", objekt_id: "OBJ1", debiterbar: true, kalla: "morgon" };
    fixtur([skalrad, dagRad({ datum: IGAR, start_tid: "12:00:00", slut_tid: "22:00:00" })], [brott({ typ: "dygnsvila", datum: IGAR, vila_h: 6 })], [period], { ...FORARE, maskin_id: null });
    await montera();
    expect(text()).toMatch(/Dygnsvila 6 tim/); // stöds av perioden → står kvar
    await klick("Planering ·");           // öppnar perioden
    await klick("Ta bort");               // tvåstegsval
    await klick("Ja, ta bort");
    await vänta(8, 40);
    expect(skrivna("extra_tid", "delete").length).toBe(1);
    expect(kvarVilo()).toEqual([]);       // brottet är borta ur databasen
    expect(text()).not.toMatch(/Dygnsvila 6 tim/); // och ur vyn
  });
});
