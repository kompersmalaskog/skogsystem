// @vitest-environment jsdom
/**
 * RENDERINGSTESTER för Redigera (Martin 2026-10-08):
 *
 *  1. ANLEDNINGEN till en ändring måste vara en anledning: minst 3 tecken och minst en bokstav eller siffra. Förr gick
 *     "." igenom (11 av 84 redigerade dagar i prod, alla sedan 2026-09-08). Gäller BARA anledningen i Redigera.
 *  2. redigerad_av = den som redigerade (medarbetarens id) skrivs vid VARJE redigering: i Redigera, i km-bladet och i
 *     "Det var fel — använd maskinens tider". Bakåt rörs inget (0 av 84 hade redigerad_av).
 *
 * Harnessen är densamma som för äldre dagar: minnesdatabas som loggar varje skrivning (g.__skriv).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const IDAG = "2026-10-05";
const IGAR = "2026-10-04";
const FORE = "2026-09-29";
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
    eqs: Record<string, any> = {};
    eq(k: string, v: any) { this.eqs[k] = v; this.f.push(r => r[k] === v); return this; }
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
        if (g.__failCol && this.vals && g.__failCol in this.vals) {
          return Promise.resolve({ data: null, error: { message: `column ${g.__failCol} does not exist` }, count: 0 }).then(res, rej);
        }
        traff.forEach(r => Object.assign(r, this.vals));
        g.__skriv.push({ tabell: this.t, op: "update", vals: this.vals, eqs: { ...this.eqs }, traffade: traff.map(r => r.datum) });
        rader = traff.map(r => ({ ...r }));
      } else if (this.mode === "delete") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        db[this.t] = tab.filter(r => !traff.includes(r));
        g.__skriv.push({ tabell: this.t, op: "delete", rader: traff.map(r => ({ ...r })) });
        rader = traff.map(r => ({ ...r }));
      } else {
        const ny = { id: "ny-" + g.__skriv.length, besvarat_av_forare: false, ...this.vals };
        if (this.mode === "upsert") {
          const hit = tab.find(r => r.medarbetare_id === ny.medarbetare_id && r.datum === ny.datum);
          if (hit) Object.assign(hit, this.vals); else tab.push(ny);
        } else tab.push(ny);
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
  g.__skriv = []; g.__failCol = null;
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
const knapp = (exakt: string) => Array.from(behallare!.querySelectorAll<HTMLButtonElement>("button")).find(b => (b.textContent || "").trim() === exakt) || null;
async function klickKnapp(exakt: string) {
  const b = knapp(exakt);
  if (!b) throw new Error("hittar ingen knapp: " + exakt);
  await act(async () => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(4, 40);
}
const skrivna = (tabell: string, op?: string) => (g.__skriv as any[]).filter(s => s.tabell === tabell && (!op || s.op === op));
const dagRad = (o: any) => ({
  id: "ad-" + o.datum, medarbetare_id: "m-1", maskin_id: MASKIN, objekt_id: "OBJ1", rast_min: 30, km_morgon: 56, km_kvall: 56, km_totalt: 112,
  traktamente: false, bekraftad: true, bekraftad_tid: o.datum + "T15:30:00Z", brandrisk_beordrad: null, ...o,
});
const brott = (o: any) => ({ id: "v-" + o.typ + o.datum, medarbetare_id: "m-1", besvarat_av_forare: false, krav_h: 11, beskrivning: "x", ...o });
// Äldre dagar. "Idag" i testet är 2026-10-05 (måndag). Fredag 2/10 är en äldre, obekräftad dag.
const D = "2026-10-02";
const FORE_D = "2026-10-01";
const pass = (datum: string, o: any = {}) => dagRad({ datum, start_tid: "10:00:00", slut_tid: "18:00:00", bekraftad: true, bekraftad_tid: datum + "T17:00:00Z", ...o });
/** En äldre obekräftad dag D (+ en bekräftad dag före, så vilan blir lång) — och INGEN dag idag. */
function aldreDag(o: any = {}, vilobrott: any[] = [], extra: Record<string, any[]> = {}) {
  g.__db = {
    medarbetare: [FORARE], gs_avtal: [AVTAL],
    dim_objekt: [{ objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 }],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    // en bekräftad dag 28/9: ger ett långt vilogap (>36 h) i veckofönstret, så testdagarna inte får ett veckovilabrott av fixturen
    arbetsdag: [pass(FORE_D), pass(D, { start_tid: "10:00:00", slut_tid: "18:00:00", bekraftad: false, bekraftad_tid: null, ...o }), pass("2026-09-28")],
    arbetsdag_objekt: [], extra_tid: [], vilobrott, ...extra,
  };
}
/** Öppna D via väntar-raden på startsidan (en obekräftad dag → raden öppnar Redigera direkt). */
async function oppnaFranVantarRaden() {
  await montera();
  await klick("väntar på bekräftelse");
  await vänta(8, 40);
}


const wheelKring = (label: string): HTMLElement => {
  const span = Array.from(behallare!.querySelectorAll<HTMLElement>("span")).find(s => (s.textContent || "").trim() === label);
  if (!span) throw new Error("hittar inget hjul för " + label);
  return span.parentElement!.querySelector<HTMLElement>('div[style*="overflow-y: scroll"]')!;
};
/** Vrid hjulet (Wheel) till ett värde: scrolla till index * 36 px och vänta in debounce (130 ms). */
async function vridHjul(label: string, index: number) {
  const el = wheelKring(label);
  // Hjulets första programmatiska scrollTop väntar på ett scroll-event som webbläsaren skickar men jsdom inte gör
  // (ignoreNext): ett första event släpper det flaggan, det andra är själva vridningen.
  await act(async () => { el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await act(async () => { el.scrollTop = index * 36; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await vänta(6, 40);
}
async function skrivAnledning(v: string) {
  const inp = behallare!.querySelector<HTMLInputElement>('input[placeholder="Kommentar"]');
  if (!inp) throw new Error("hittar inget anledningsfält — sidan säger: " + text().slice(0, 300));
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inp, v);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await vänta(2, 30);
}
/** Dagen D öppen i Redigera med rasten ändrad 30 → 35 (osparad). */
async function andraRast() {
  aldreDag();
  await oppnaFranVantarRaden();
  await klick("Maskinpass");
  await vridHjul("Rast", 7); // 7 * 5 = 35 min
  await klickKnapp("Klar");
}
const spara = () => knapp("Spara ändring") as HTMLButtonElement;

describe("Redigera: anledningen måste vara en anledning", () => {
  it("ändrad tid utan anledning: Spara ändring är inaktiv", async () => {
    await andraRast();
    expect(spara()).not.toBeNull();
    expect(spara().disabled).toBe(true);
  });

  it.each([["."], [".."], ["  .  "], ["ab"], ["!!!"], ["- -"]])("anledningen %j är för tunn: Spara ändring förblir inaktiv och inget skrivs", async (v) => {
    await andraRast();
    await skrivAnledning(v);
    expect(spara().disabled).toBe(true);
    expect(skrivna("arbetsdag", "upsert").length).toBe(0);
  });

  it("hjälptexten säger vad som krävs medan anledningen är för kort", async () => {
    await andraRast();
    await skrivAnledning(".");
    expect(text()).toMatch(/minst 3 tecken/i);
  });

  it.each([["fel"], ["Brandvakt"], ["810E"], ["  Flytt  "]])("anledningen %j duger: knappen blir aktiv och dagen sparas med anledningen", async (v) => {
    await andraRast();
    await skrivAnledning(v);
    expect(spara().disabled).toBe(false);
    expect(text()).not.toMatch(/minst 3 tecken/i);
    await klickKnapp("Spara ändring");
    const up = skrivna("arbetsdag", "upsert");
    expect(up.length).toBe(1);
    expect(up[0].vals.rast_min).toBe(35);
    expect(up[0].vals.redigerad_anl).toBe(v);
  });
});

describe("Redigera: redigerad_av skrivs vid varje redigering", () => {
  it("Redigera: Spara ändring skriver redigerad_av = medarbetarens id", async () => {
    await andraRast();
    await skrivAnledning("fel rast");
    await klickKnapp("Spara ändring");
    const up = skrivna("arbetsdag", "upsert");
    expect(up.length).toBe(1);
    expect(up[0].vals.redigerad).toBe(true);
    expect(up[0].vals.redigerad_av).toBe("m-1");
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === D).redigerad_av).toBe("m-1");
  });

  it("km-bladet: Ändra km → Spara skriver redigerad_av (och rör varken anledningen eller något annat nytt)", async () => {
    aldreDag();
    await oppnaFranVantarRaden();
    await klick("Körning");
    await klick("+"); // km-stegaren: +10 km morgon
    await klickKnapp("Spara");
    const upd = skrivna("arbetsdag", "update").filter(s => s.vals.redigerad === true);
    expect(upd.length).toBe(1);
    expect(upd[0].vals.redigerad_av).toBe("m-1");
    expect("redigerad_anl" in upd[0].vals).toBe(false);          // km-bladet kräver ingen anledning (rörs inte)
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === D).redigerad_av).toBe("m-1");
  });

  it("'Det var fel — använd maskinens tider': redigerad_av skrivs, utan krav på anledning", async () => {
    aldreDag({ bekraftad: true, bekraftad_tid: D + "T17:00:00Z", rast_min: 10, synk_avvikelse: { mom_start: "10:00", mom_slut: "18:00", mom_rast_min: 70, bekraftad_start: "10:00", bekraftad_slut: "18:00", bekraftad_rast_min: 10, upptackt: "2026-10-05T01:00:00Z" } });
    // en bekräftad dag öppnas via Kalender (den väntar inte på bekräftelse)
    await montera();
    await klick("Kalender");
    await vänta(6, 40);
    const cell = Array.from(behallare!.querySelectorAll<HTMLElement>("main span")).find(x => x.textContent === "2");
    await act(async () => { cell!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await vänta(8, 40);
    expect(text()).toMatch(/Maskintiden skiljer sig/);
    await klickKnapp("Det var fel — använd maskinens tider");
    const upd = skrivna("arbetsdag", "update").filter(s => s.vals.redigerad === true && "synk_avvikelse" in s.vals);
    expect(upd.length).toBe(1);
    expect(upd[0].vals.rast_min).toBe(70);
    expect(upd[0].vals.redigerad_av).toBe("m-1");
    expect("redigerad_anl" in upd[0].vals).toBe(false);
  });

  it("bakåt rörs inget: gamla redigerade rader behåller redigerad_av = null", async () => {
    aldreDag({ redigerad: true, redigerad_anl: ".", redigerad_av: null });
    await montera();
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === D).redigerad_av).toBeNull();
    expect(skrivna("arbetsdag").length).toBe(0);
  });
});
