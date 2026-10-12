// @vitest-environment jsdom
/**
 * RENDERINGSTEST för racet i Redigera (gamla PR #316, 2026-08-01, gjord om mot nuvarande kod):
 *
 * Kalendern laddar arbetsdag för EN månad åt gången, asynkront. Byter man månad
 * ritas den nya månaden direkt men dagData fylls först när hämtningen landat. Ett
 * tryck på en dag däremellan läste den tomma cachen → "Ingen data för den här
 * dagen" + "Lägg till manuellt" över en komplett rad i databasen (Martin 31 juli).
 *
 * Regeln nu: DATABASEN avgör om en dag är tom, aldrig cachen. Redigera öppnas i
 * laddläge, hämtar dagens rad, och visar tomt först när databasen sagt att raden
 * saknas. Ett läsfel visar aldrig "Ingen data" — cache om den finns, annars ett ärligt fel.
 *
 * Fake: minnesdatabas med två grindar — __holdMonth fördröjer månadshämtningen
 * (gte+lte på datum), __holdDag fördröjer dagens egen hämtning (maybeSingle på
 * medarbetare+datum) — och __lasFel som får dagshämtningen att svara med fel.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const IDAG = "2026-10-05";
const MASKIN = "PONS20SDJAA270231";
const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: MASKIN, user_id: "u-1", hemadress: "" };

vi.mock("@/lib/supabase", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    enkel = false;
    eqs: Record<string, any> = {};
    har: Record<string, boolean> = {};
    constructor(public t: string) {}
    eq(k: string, v: any) { this.eqs[k] = v; this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.har["gte" + k] = true; this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.har["lte" + k] = true; this.f.push(r => r[k] != null && r[k] <= v); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    then(res: any, rej: any) {
      const g = globalThis as any;
      const db = g.__db as Record<string, any[]>;
      const rader = (db[this.t] || []).filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
      const manadsfraga = this.t === "arbetsdag" && this.har.gtedatum && this.har.ltedatum;
      const dagsfraga = this.t === "arbetsdag" && this.enkel && this.eqs.datum && this.eqs.medarbetare_id;
      let svar: any = { data: this.enkel ? (rader[0] ?? null) : rader, error: null, count: rader.length };
      if (dagsfraga && g.__lasFel) svar = { data: null, error: { message: "nät" }, count: 0 };
      const grind = (manadsfraga && g.__holdMonth) ? g.__heldMonth : (dagsfraga && g.__holdDag) ? g.__heldDag : null;
      if (grind) {
        return new Promise(r => { grind.push({ datum: this.eqs.datum, slapp: () => r(svar) }); }).then(res, rej);
      }
      return Promise.resolve(svar).then(res, rej);
    }
  }
  for (const m of ["select", "order", "limit", "or", "in", "not", "delete", "neq", "gt", "lt", "ilike", "range", "match", "contains", "filter", "textSearch", "update", "upsert", "insert"]) {
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
  g.__holdMonth = false; g.__holdDag = false; g.__lasFel = false; g.__heldMonth = []; g.__heldDag = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: /reduce/.test(q), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
  (window as any).matchMedia = g.matchMedia;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T17:30:00Z"));
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
async function klickEl(e: HTMLElement | null, namn: string) {
  if (!e) throw new Error("hittar inte: " + namn);
  await act(async () => { e.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(3, 30);
}
const klick = (sub: string) => klickEl(hitta(sub), sub);
const knappMedIkon = (ikon: string) => Array.from(behallare!.querySelectorAll<HTMLElement>("button")).find(b => b.textContent === ikon) || null;
const klickDag = (d: number) => klickEl(Array.from(behallare!.querySelectorAll<HTMLElement>("main span")).find(s => s.textContent === String(d)) || null, "dag " + d);
const slappAlla = async (lista: any[]) => { const k = lista.splice(0); for (const x of k) { x.slapp(); } await vänta(4, 30); };

const dagRad = (datum: string, o: any = {}) => ({
  id: "ad-" + datum, medarbetare_id: "m-1", datum, maskin_id: MASKIN, objekt_id: "OBJ1", start_tid: "06:50:00", slut_tid: "16:05:00",
  rast_min: 30, km_morgon: 56, km_kvall: 56, km_totalt: 112, traktamente: false, bekraftad: true, bekraftad_tid: datum + "T15:30:00Z", brandrisk_beordrad: null, ...o,
});
function fixtur(rader: any[]) {
  g.__db = {
    medarbetare: [FORARE],
    gs_avtal: [{ id: 1, giltigt_fran: "2026-01-01", giltigt_till: null, traktamente_hel_kr: 300, traktamente_halv_kr: 150, km_grans_per_dag: 60 }],
    dim_objekt: [{ objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 }],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    arbetsdag: rader, arbetsdag_objekt: [], extra_tid: [], vilobrott: [],
  };
}

/** Kalendern på oktober, sedan en månad bakåt MED månadshämtningen fördröjd. */
async function tillSeptemberMedFordrojdManad() {
  await montera();
  await klick("Kalender");
  await vänta(6, 40);
  g.__holdMonth = true;
  await klickEl(knappMedIkon("chevron_left"), "föregående månad");
  expect(text().toLowerCase()).toContain("september");
}

describe("Redigera: databasen avgör om en dag är tom, inte månadscachen", () => {
  it("tryck på en komplett dag innan månadshämtningen landat: aldrig 'Ingen data', sedan hela dagen", async () => {
    fixtur([dagRad("2026-09-30"), dagRad("2026-10-04")]);
    await tillSeptemberMedFordrojdManad();
    await klickDag(30);
    // Direkt efter trycket: aldrig tomt över en komplett rad
    expect(text()).not.toMatch(/Ingen data för den här dagen/);
    await vänta(6, 40);
    // Månadshämtningen är FORTFARANDE fördröjd; dagen kommer ur databasen
    expect(g.__heldMonth.length).toBeGreaterThan(0);
    expect(text()).not.toMatch(/Ingen data för den här dagen/);
    expect(text()).toMatch(/06:50 → 16:05/);
    expect(text()).toMatch(/Hössjömåla/);
    expect(text()).toMatch(/Körning112 km/);
    await slappAlla(g.__heldMonth);
    expect(text()).toMatch(/06:50 → 16:05/);
  });

  it("visar 'Laddar…' medan databasen svarar, aldrig tom editor", async () => {
    fixtur([dagRad("2026-09-30"), dagRad("2026-10-04")]);
    await tillSeptemberMedFordrojdManad();
    g.__holdDag = true;
    await klickDag(30);
    expect(text()).toMatch(/Laddar/);
    expect(text()).not.toMatch(/Ingen data för den här dagen/);
    expect(text()).not.toMatch(/Lägg till manuellt/);
    await slappAlla(g.__heldDag);
    expect(text()).not.toMatch(/Laddar/);
    expect(text()).toMatch(/06:50 → 16:05/);
  });

  it("en äkta tom dag (databasen svarar: ingen rad) visar 'Ingen data' efter svaret", async () => {
    fixtur([dagRad("2026-10-04")]);
    await tillSeptemberMedFordrojdManad();
    await klickDag(29);
    await vänta(6, 40);
    expect(text()).toMatch(/Ingen data för den här dagen/);
    expect(text()).not.toMatch(/Laddar/);
  });

  it("läsfel utan cache: ärligt fel, aldrig 'Ingen data / Lägg till manuellt'", async () => {
    fixtur([dagRad("2026-09-30"), dagRad("2026-10-04")]);
    await tillSeptemberMedFordrojdManad();
    g.__lasFel = true;
    await klickDag(30);
    await vänta(6, 40);
    expect(text()).toMatch(/Kunde inte läsa dagen/);
    expect(text()).not.toMatch(/Ingen data för den här dagen/);
    expect(text()).not.toMatch(/Lägg till manuellt/);
  });

  it("läsfel MED cache: dagen visas ur cachen i stället för att visas tom", async () => {
    fixtur([dagRad(IDAG, { bekraftad: true, bekraftad_tid: "2026-10-05T15:30:00Z", slut_tid: "16:12:00", start_tid: "06:48:00" })]);
    await montera();
    g.__lasFel = true;
    await klick("Ändra rapport");
    await vänta(6, 40);
    expect(text()).toMatch(/06:48 → 16:12/);
    expect(text()).not.toMatch(/Ingen data för den här dagen/);
    expect(text()).not.toMatch(/Kunde inte läsa dagen/);
  });

  it("två dagar i följd: ett sent svar för första dagen skriver inte över den andra", async () => {
    fixtur([dagRad("2026-09-30"), dagRad("2026-10-04")]);
    await tillSeptemberMedFordrojdManad();
    g.__holdDag = true;
    await klickDag(30);
    const forsta = g.__heldDag.splice(0);
    expect(forsta.length).toBe(1);
    // tillbaka till kalendern och öppna den tomma dagen 29
    await klickEl(Array.from(behallare!.querySelectorAll<HTMLElement>("button")).find(b => b.textContent === "" && !!b.querySelector("svg")) || null, "tillbaka (BackBtn)");
    await klickDag(29);
    const andra = g.__heldDag.splice(0);
    expect(andra.length).toBe(1);
    andra[0].slapp();           // svaret för 29 (tomt) landar först
    await vänta(4, 30);
    forsta[0].slapp();          // sedan det sena svaret för 30 (komplett)
    await vänta(6, 40);
    expect(text()).toMatch(/Ingen data för den här dagen/);
    expect(text()).not.toMatch(/06:50 → 16:05/);
  });
});
