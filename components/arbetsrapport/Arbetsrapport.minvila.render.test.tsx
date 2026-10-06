// @vitest-environment jsdom
/**
 * RENDERINGSTESTER: Min tid → Vila (Martin 2026-10-06): ett BESVARAT vilobrott visades i rött som olöst.
 * Rött bara för obesvarade; besvarade tonas ned till grått med svaret under ("Besvarat: …").
 *
 * (Ursprungligt huvud:) väntar-raderna i Dag
 *
 * Raderna räknade saker som inte fanns (listan lästes ur ett tillstånd som aldrig uppdaterades när en
 * dag bekräftades i Redigera), ledde till fel ställe (Kalendern / Lön) och brandriskfrågan hade en
 * egen rad. Nu: EN rad per väntande dag-grupp, den leder till det som väntar (äldsta först, sedan
 * nästa tills alla är klara), och raderna räknas om direkt efter Stämmer.
 *
 * (Ursprungligt huvud:) ETT bekräftaflöde för ALLA dagar
 *
 * #707 gav "Saker att svara på" + Stämmer bara i Dag-vyn för IDAG. En äldre obekräftad dag
 * öppnas via väntar-raden eller Kalender i Redigera, som hade den gamla knappen "Bekräfta dagen":
 * brandriskfrågan ställdes aldrig och rastsvaret sparades aldrig. Nu: samma lista, samma regler,
 * samma Stämmer oavsett ingång.
 *
 * (Ursprungligt huvud:) "Saker att svara på" i kvällsvyn
 *
 * Förut låg frågorna på tre ställen som såg olika ut (vilobrott = röd remsa överst,
 * brandrisk = eget kort, saknat objekt = orange rad) och rastfrågan kom först efter
 * tryck på Stämmer. EN regel: kortet är bara information; allt man ska svara på står
 * samlat under "Saker att svara på", ovanför Stämmer.
 *
 * Obesvarat: Stämmer är grå med "Svara på frågorna först", men inte död (tryck öppnar
 * första obesvarade). Besvarat: rubriken blir "Besvarat", svaren står i grönt, Stämmer
 * blir vit — och dagen bekräftas ALDRIG automatiskt efter sista svaret.
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

const stammer = () => knapp("Stämmer") as HTMLButtonElement;
const opacity = (b: HTMLElement) => Number(b.style.opacity || 1);

const ROD = "rgb(255, 69, 58)"; // FARG.rod
const GRON = "rgb(48, 209, 88)";
/** 28/9 ger långt vilogap. 1/10 12–22 → 2/10 05:10 = 7,2 h (brott 1/10). 4/10 20–04 → 5/10 04:00 = 8 h (brott 4/10). */
function vilaData(brott: any[]) {
  g.__db = {
    medarbetare: [FORARE], gs_avtal: [AVTAL],
    dim_objekt: [{ objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 }],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    arbetsdag: [
      dagRad({ datum: "2026-09-28", start_tid: "10:00:00", slut_tid: "18:00:00" }),
      dagRad({ datum: "2026-10-01", start_tid: "12:00:00", slut_tid: "22:00:00" }),
      dagRad({ datum: "2026-10-02", start_tid: "05:10:00", slut_tid: "13:00:00", brandrisk_beordrad: false }),
      dagRad({ datum: "2026-10-04", start_tid: "12:00:00", slut_tid: "20:00:00" }),
      dagRad({ datum: "2026-10-05", start_tid: "04:00:00", slut_tid: "12:00:00", brandrisk_beordrad: false }),
    ],
    arbetsdag_objekt: [], extra_tid: [], vilobrott: brott,
  };
}
const besvarat = (o: any) => ({ ...o, besvarat_av_forare: true, orsak: o.orsak ?? "planerad_avtal", besvarat_tid: "2026-10-05T12:00:00Z" });
const dyg1 = (o: any = {}) => brott({ typ: "dygnsvila", datum: "2026-10-01", vila_h: 7.2, ...o });
const dyg4 = (o: any = {}) => brott({ typ: "dygnsvila", datum: "2026-10-04", vila_h: 8, ...o });

async function tillVila() {
  await montera();
  const flik = Array.from(behallare!.querySelectorAll<HTMLElement>("nav > *")).find(e => (e.textContent || "").trim().endsWith("Min tid"));
  await act(async () => { flik!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(6, 40);
  const vila = Array.from(behallare!.querySelectorAll<HTMLElement>("button, div, span")).filter(e => (e.textContent || "").trim() === "Vila").pop();
  await act(async () => { vila!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(8, 40);
}
/** Kortet för en viloperiod: förälder till raden "Slutade kl HH:MM". */
function vilaKort(slutKl: string): HTMLElement {
  const rad = Array.from(behallare!.querySelectorAll<HTMLElement>("p")).find(e => (e.textContent || "") === `Slutade kl ${slutKl}`);
  if (!rad?.parentElement) throw new Error("hittar inte viloperiod-kort för " + slutKl);
  return rad.parentElement;
}
const harFarg = (el: HTMLElement, farg: string) => [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].some(e => e.style.color === farg);

describe("Min tid → Vila: rött bara för obesvarade", () => {
  it("ett BESVARAT brott: svaret står under ('Besvarat: planerat undantag enligt avtal') och kortet är grått, inte rött", async () => {
    vilaData([dyg1(), besvarat(dyg4())]);
    await tillVila();
    const kort = vilaKort("20:00");                                   // 4/10, besvarat
    expect(kort.textContent).toMatch(/Besvarat: planerat undantag enligt avtal/);
    expect(harFarg(kort, ROD)).toBe(false);
    expect(kort.textContent).not.toMatch(/Inte besvarat/);
  });

  it("ett OBESVARAT brott förblir rött, utan 'Besvarat'", async () => {
    vilaData([dyg1(), besvarat(dyg4())]);
    await tillVila();
    const kort = vilaKort("22:00");                                   // 1/10, obesvarat
    expect(harFarg(kort, ROD)).toBe(true);
    expect(kort.textContent).not.toMatch(/Besvarat:/);
  });

  it("svaret visas utan att man behöver expandera kortet; fritext och kompensation följer med", async () => {
    vilaData([besvarat(dyg4({ orsak: "annat", orsak_fritext: "röjde väg", kompensation_h: 3 }))]);
    await tillVila();
    const kort = vilaKort("20:00");
    expect(kort.textContent).toMatch(/Besvarat: annat · röjde väg/);
    expect(harFarg(kort, ROD)).toBe(false);
  });

  it("andra orsaker har läsbar text (två besvarade brott, olika orsak)", async () => {
    vilaData([besvarat(dyg1({ orsak: "oforutsedd" })), besvarat(dyg4({ orsak: "akut_jour" }))]);
    await tillVila();
    expect(vilaKort("22:00").textContent).toMatch(/Besvarat: oförutsedd händelse/);
    expect(vilaKort("20:00").textContent).toMatch(/Besvarat: akut situation eller jour/);
  });

  it("sammanfattningskortet 'Senaste dygnsvila' är grått när brottet är besvarat, rött när det är obesvarat", async () => {
    vilaData([besvarat(dyg4())]);                                     // senaste (4→5/10) besvarat
    await tillVila();
    const sammanfattning = () => Array.from(behallare!.querySelectorAll<HTMLElement>("div")).filter(e => (e.textContent || "").startsWith("Senaste dygnsvila")).pop()!;
    expect(sammanfattning().textContent).toMatch(/besvarat/i);
    expect(harFarg(sammanfattning(), ROD)).toBe(false);
    act(() => { rot?.unmount(); }); rot = null;
    vilaData([dyg4()]);                                               // obesvarat
    await tillVila();
    expect(harFarg(sammanfattning(), ROD)).toBe(true);
  });

  it("veckovila: besvarat brott grått med svaret under", async () => {
    // (Ett OBESVARAT veckovilabrott utan stöd i passen städas bort vid öppning, #704 — därför bara det besvarade här.)
    vilaData([besvarat(brott({ typ: "veckovila", datum: "2026-10-01", vila_h: 20, krav_h: 36, beskrivning: "Mellan 1 oktober och 3 oktober hade du som mest 20 h sammanhängande vila." }))]);
    await tillVila();
    await klick("Visa alla");
    const rad = Array.from(behallare!.querySelectorAll<HTMLElement>("p")).find(e => (e.textContent || "").includes("20 h sammanhängande"))!.parentElement as HTMLElement;
    expect(rad.textContent).toMatch(/Veckovila: 20h/);
    expect(rad.textContent).toMatch(/Besvarat: planerat undantag enligt avtal/);
    expect(harFarg(rad, ROD)).toBe(false);
  });

  it("veckovila-raden i listan: 'alla besvarade' är grå utan rött varningstecken", async () => {
    vilaData([besvarat(brott({ typ: "veckovila", datum: "2026-10-01", vila_h: 20, krav_h: 36, beskrivning: "x" }))]);
    await tillVila();
    const sektion = Array.from(behallare!.querySelectorAll<HTMLElement>("section")).filter(e => (e.textContent || "").includes("brott mot veckovila")).pop()!;
    expect(sektion.textContent).toMatch(/besvarat/i);
    expect(harFarg(sektion, ROD)).toBe(false);
  });
});
