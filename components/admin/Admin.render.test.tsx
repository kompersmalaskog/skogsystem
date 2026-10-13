// @vitest-environment jsdom
/**
 * RENDERINGSTESTER för admin-vyn efter kartläggningen 2026-10-06 (Martin: admin är till för att hålla
 * koll och koppla in nya medarbetare, sitter vid datorn, kronorna ska bort, bara rollen admin).
 *
 * Fake-supabasen här gör det prod gör: en skrivning mot en kolumn som inte finns avvisas
 * (`__avvisaKolumner`), och en skrivning som RLS stoppar träffar 0 rader utan fel (`__ingaRader`).
 * Det är de två lägen som gav tysta fel (#4, #7).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FARG } from "@/lib/design/tokens";
import { analyseraVilobrott, medPerioddagSpann } from "@/lib/vilobrott";
import { vilaTrosklarFromAvtal } from "@/lib/gs-avtal";

vi.mock("next/navigation", () => ({ useSearchParams: () => (globalThis as any).__sp }));

// Datahälsas leverans-regel är EN delad sanning (useDatahalsa). Testet styr vad den svarar.
vi.mock("@/app/datahalsa/useDatahalsa", () => ({
  LEV_GUL_DYGN: 10,
  useDatahalsa: () => ({ leverans: (globalThis as any).__leverans }),
}));

vi.mock("@/lib/supabase", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    enkel = false;
    head = false;
    count = false;
    mode: "select" | "update" | "insert" | "upsert" | "delete" = "select";
    vals: any = null;
    valjSkrivet = false;
    constructor(public t: string) {}
    select(_c?: string, o?: any) { if (this.mode !== "select") this.valjSkrivet = true; if (o?.count) this.count = true; if (o?.head) this.head = true; return this; }
    eq(k: string, v: any) { (globalThis as any).__eq.push([this.t, k, v]); this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    not(k: string, op: string, v: any) { if (op === "is" && v === null) this.f.push(r => r[k] != null); return this; }
    or() { return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    upsert(v: any) { this.mode = "upsert"; this.vals = v; return this; }
    delete() { this.mode = "delete"; return this; }
    then(res: any, rej: any) {
      const g = globalThis as any;
      const db = g.__db as Record<string, any[]>;
      const tab = (db[this.t] = db[this.t] || []);
      const klar = (o: any) => Promise.resolve(o).then(res, rej);
      if (this.mode === "select") {
        if (g.__dbFel?.[this.t]) return klar({ data: null, error: { message: g.__dbFel[this.t] }, count: null }); // läsfel (permission denied, timeout …)
        const rader = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
        return klar({ data: this.head ? null : this.enkel ? rader[0] ?? null : rader, error: null, count: this.count ? rader.length : null });
      }
      // skrivning
      const vals = this.vals && !Array.isArray(this.vals) ? this.vals : null;
      const avvisa = (g.__avvisaKolumner?.[this.t] || []) as string[];
      const bad = vals && Object.keys(vals).find(k => avvisa.includes(k));
      if (bad) return klar({ data: null, error: { message: `Could not find the '${bad}' column of '${this.t}' in the schema cache` }, count: null });
      g.__skriv.push({ tabell: this.t, op: this.mode, vals: this.vals });
      if (g.__ingaRader) return klar({ data: this.valjSkrivet ? [] : null, error: null, count: null }); // RLS: 0 rader, inget fel
      let traff: any[] = [];
      if (this.mode === "update") { traff = tab.filter(r => this.f.every(fn => fn(r))); traff.forEach(r => Object.assign(r, this.vals)); }
      else if (this.mode === "delete") { traff = tab.filter(r => this.f.every(fn => fn(r))); db[this.t] = tab.filter(r => !traff.includes(r)); }
      else { const nya = (Array.isArray(this.vals) ? this.vals : [this.vals]).map((v: any, i: number) => ({ id: `ny-${tab.length + i}`, ...v })); tab.push(...nya); traff = nya; }
      return klar({ data: this.valjSkrivet ? traff.map(r => ({ ...r })) : null, error: null, count: null });
    }
  }
  return { supabase: { from: (t: string) => new Q(t) } };
});

import AdminClient from "./AdminClient";

const g = globalThis as any;
const IDAG = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const MED = [
  { id: "m1", namn: "Anna Berg", epost: "anna@example.se", hemadress: "Björkvägen 4", roll: "forare", maskin_id: "R64101", anstallningsdatum: "2021-03-01", timlon_kr: 195, manadslon_kr: null, user_id: "u1", hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "gps", hem_geokod_status: "ok", hem_geokod_etikett: null, hem_geokod_precision: null, hem_geokod_lat: null, hem_geokod_lng: null },
  { id: "m2", namn: "Erik Lind", epost: "erik@example.se", hemadress: "Idekulla 6", roll: "admin", maskin_id: null, anstallningsdatum: null, timlon_kr: null, manadslon_kr: 41000, user_id: "u2", hem_lat: 56.5, hem_lng: 14.8, hem_koord_kalla: "gps", hem_geokod_status: "ok", hem_geokod_etikett: null, hem_geokod_precision: null, hem_geokod_lat: null, hem_geokod_lng: null },
];
const MASKINER = [
  { maskin_id: "R64101", visningsnamn: "Rottne H8E", tillverkare: "Rottne", modell: "H8E", maskin_typ: "Harvester", sander_filer: true, datakalla: "auto", aktiv_fran: "2022-05-01", aktiv_till: null, bekraftad: true },
];
// Raden som den ser ut i prod (2026-10-08): inga kolumner som sidan förr bad om utan att de fanns (timlon_kr, ob_lordag_kr,
// fardtid_kr, skifttillagg_kr, bortovaro_kr, atk_ledig_tim, atk_period, atk_faktor).
const AVTAL = { id: "a1", namn: "Skogsavtalet 2025-2027", giltigt_fran: "2025-04-01", giltigt_till: "2027-03-31", ordinarie_vecka_h: 40, max_overtid_ar_h: 250, km_ersattning_kr: 2.75, km_grans_per_dag: 60, fardmedel_kr_per_mil: 27.5, fardtid_kr_per_mil: 10.49, traktamente_hel_kr: 300, traktamente_halv_kr: 150, atk_procent: 3.62, atk_procent_nasta: 3.92, atk_ledig_tid_h: 65.2, overtid_vardag_kr: 54.94, overtid_helg_kr: 54.94, ob_kvall_kr: 43.77, ob_natt_kr: 56.82, ob_helg_kr: 68.95, ob_sondag_kr: 103.38, bortovaro_12h_kr: 8.03, skift_tillagg_kr: 8, dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };

const SALARY = {
  ok: true, arbetsperiod: "2026-09", totalt_rader: 2, oenighet: [],
  medarbetare: [{ medarbetare_id: "m1", namn: "Anna Berg", status: "utkast", anstallningsnummer: "1001", rader: [{ SalaryCode: "11", Number: 168 }, { SalaryCode: "821", Number: 14 }], dagar: [], synk: [], deldagar: [], ledighetskollision: [], vilobrott: [], rast_langa: [], kortpass: [], orimliga: [], utan_rast: { dagar: 0, timmar: 0, datum: [] }, helglon: { dagar: [], timmar: 0 }, byten: [], obekraftade: 0, ob: { timmar: 0, dagar: 0, obesvarade: 0 }, varningar: [] }],
};

function seed(extra: Record<string, any[]> = {}) {
  g.__db = {
    medarbetare: MED.map(m => ({ ...m })),
    operator_medarbetare: [],
    dim_operator: [],
    dim_maskin: MASKINER.map(m => ({ ...m })),
    arbetsdag: [],
    extra_tid: [],
    meta_importerade_filer: [{ filnamn: "R64101_1.mom", importerad_tid: "2026-10-06T05:12:00Z", maskin_id: "R64101", status: "OK" }],
    vilobrott: [],
    gs_avtal: [{ ...AVTAL }],
    atk_val: [],
    lonesystem_koppling: [{ id: "ls1", system_typ: "fortnox", aktiv: true, senast_synkad: null, skapad: "2026-04-17", token_utgar: null }],
    // Produktionens sju rader (2026-10), på Fortnox-kopplingen.
    lonesystem_artikelmappning: [
      ["timlon", "11", "Timlön"], ["premielon_skordare", "1355", "Premielön skördare"], ["premielon_skotare", "1354", "Premielön skotare"],
      ["overtid_skordare", "1435", "Övertid skördare"], ["overtid_skotare", "1436", "Övertid skotare"], ["valtlappar", "136", "Vältlappar mm"], ["korersattning", "821", "Körersättning skattefri"],
    ].map(([intern_typ, extern_kod, beskrivning], i) => ({ id: `x${i + 1}`, lonesystem_id: "ls1", intern_typ, extern_kod, beskrivning, skapad: "2026-04-20" })),
    medarbetare_lonesystem: [{ id: "l1", medarbetare_id: "m1", lonesystem_id: "ls1", anstallningsnummer: "1001", skapad: "2026-04-17" }],
    ...extra,
  };
  g.__skriv = []; g.__eq = []; g.__ingaRader = false; g.__avvisaKolumner = {}; g.__dbFel = null;
  g.__leverans = { laddar: false, fel: null, data: [{ maskinId: "R64101", namn: "Rottne H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-10-06", dagarSedan: 1 }] };
  g.__fetchAnrop = []; g.__kontroller = null; g.__geokod = null; g.__geokodAnrop = []; g.__kontroll = null; g.__kontrollAnrop = []; g.__hempunkt = null; g.__hempunktAnrop = []; g.__arsovertid = null;
  g.fetch = vi.fn(async (url: string, init?: any) => {
    const u = String(url); g.__fetchAnrop.push([u, init?.method || "GET"]);
    if (u.includes("/api/fortnox/kontrollera-anstallningsnummer")) {
      const b = JSON.parse(init?.body || "{}");
      g.__kontrollAnrop.push(b);
      return { ok: true, status: 200, json: async () => (g.__kontroll ? g.__kontroll(b) : { ok: true, status: "ej_ansluten" }) } as any;
    }
    if (u.includes("/api/medarbetare/hempunkt")) {
      const b = JSON.parse(init?.body || "{}");
      g.__hempunktAnrop.push(b);
      // Servern: Stämmer stämplar punkten, Flytta sätter en manuell, bekräftad punkt.
      const svar = g.__hempunkt ? g.__hempunkt(b) : (() => {
        const m = g.__db.medarbetare.find((x: any) => x.id === b.id);
        if (b.atgard === "stammer") Object.assign(m, { hem_bekraftad_tid: new Date().toISOString() });
        else Object.assign(m, { hem_lat: b.lat, hem_lng: b.lng, hem_koord_kalla: "manuell", hem_bekraftad_tid: new Date().toISOString(), hem_geokod_status: null });
        return { ok: true };
      })();
      return { ok: svar.ok !== false, status: svar.ok === false ? 422 : 200, json: async () => svar } as any;
    }
    if (u.includes("/api/medarbetare/geokoda")) {
      const b = JSON.parse(init?.body || "{}");
      g.__geokodAnrop.push(b);
      return { ok: true, status: 200, json: async () => (g.__geokod ? g.__geokod(b) : { ok: true }) } as any;
    }
    const body = u.includes("/api/lon/arsovertid") ? (g.__arsovertid ?? { ok: true, ar: 2026, tak: 250, tomDatum: "2026-09-30", modeller: [], medarbetare: [], utjamning: [] })
      : u.includes("/api/fortnox/salary-export") ? (g.__salary || SALARY)
      : u.includes("/api/fortnox/status") ? { connected: true, token_utgar: null, senast_synkad: null }
      : u.includes("/api/medarbetare/kontroller") ? (g.__kontroller || { ok: true, okandaOperatorer: [], forareUtanMaskin: [], saknarHempunkt: [], obekraftadHempunkt: [] })
      : {};
    return { ok: true, status: 200, json: async () => body } as any;
  });
}

/** MapLibre från CDN finns inte i jsdom: en liten fake med samma yta som hempunktskartan använder. */
function installeraKarta() {
  const k: any = { kartor: [], markorer: [] };
  class Marker {
    ll: [number, number] = [0, 0]; dragbar = false; h: Record<string, Function> = {};
    constructor(public opts: any) { this.dragbar = !!opts?.draggable; k.markorer.push(this); }
    setLngLat(ll: [number, number]) { this.ll = ll; return this; }
    addTo() { return this; }
    setDraggable(b: boolean) { this.dragbar = b; return this; }
    on(ev: string, fn: Function) { this.h[ev] = fn; return this; }
    getLngLat() { return { lng: this.ll[0], lat: this.ll[1] }; }
    remove() { k.markorer = k.markorer.filter((m: any) => m !== this); }
  }
  class Karta {
    h: Record<string, Function> = {}; centrum: [number, number]; avlagsnad = false;
    canvas = { style: { cursor: "" } as any };
    touchZoomRotate = { disableRotation() {} };
    constructor(public opts: any) { this.centrum = opts.center; k.kartor.push(this); }
    on(ev: string, fn: Function) { this.h[ev] = fn; return this; }
    addControl() {} resize() {} getCanvas() { return this.canvas; }
    jumpTo(o: any) { this.centrum = o.center; } easeTo(o: any) { this.centrum = o.center; }
    remove() { this.avlagsnad = true; k.kartor = k.kartor.filter((m: any) => m !== this); }
  }
  k.sista = () => k.kartor[k.kartor.length - 1];
  /** Pekaren över kartans yta ('' = ärvd från MapLibres egen stil: hand, och hand som griper under drag). */
  k.pekare = () => k.sista().canvas.style.cursor;
  /** Pekaren över nålen. */
  k.nalPekare = () => k.markorer[k.markorer.length - 1]?.opts.element.style.cursor;
  /** Draget av KARTAN börjar/slutar (nålen står kvar). */
  k.kartdragStart = () => k.sista().h.dragstart?.();
  k.kartdragSlut = () => k.sista().h.dragend?.();
  /** Draget av NÅLEN börjar. */
  k.nalDragStart = () => k.markorer[k.markorer.length - 1].h.dragstart?.();
  k.punkt = () => k.markorer[k.markorer.length - 1]?.ll;
  /** Ett tryck på kartan. */
  k.tryck = (lat: number, lng: number) => k.sista().h.click({ lngLat: { lat, lng } });
  /** Dra punkten till en ny plats och släpp. */
  k.dra = (lat: number, lng: number) => { const m = k.markorer[k.markorer.length - 1]; m.ll = [lng, lat]; m.h.dragend?.(); };
  (window as any).maplibregl = { Map: Karta, Marker, AttributionControl: class {} };
  g.__karta = k;
}

let root: any, cont: HTMLElement;
const text = () => (cont.textContent || "").replace(/\s+/g, " ");
async function lugn() {
  for (let i = 0; i < 50; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    if (!/Laddar|Räknar|Beräknar|Läser löneunderlag/.test(cont.textContent || "")) { await act(async () => { await new Promise(r => setTimeout(r, 40)); }); return; }
  }
}
async function monter(sp: string, el?: React.ReactElement) {
  g.__sp = new URLSearchParams(sp);
  g.IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root.render(el || <AdminClient currentUser={{ id: "m2", namn: "Inloggad Admin", roll: "admin" }} />); });
  await lugn();
}
const egenText = (e: Element) => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent || "").join("").trim();
const blad = (t: string) => Array.from(document.body.querySelectorAll<HTMLElement>("*")).filter(e => egenText(e) === t);
async function klick(t: string, narmast?: string) {
  const el = blad(t)[0];
  if (!el) throw new Error("hittar inte: " + t + " — sidan säger: " + text().slice(0, 400));
  const mal = (narmast ? (el.closest(narmast) as HTMLElement) : null) || (el.closest("button") as HTMLElement) || el;
  await act(async () => { mal.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await lugn();
}
async function skriv(input: HTMLInputElement, v: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const radMed = (t: string) => blad(t)[0].parentElement as HTMLElement;

vi.setConfig({ testTimeout: 30000 }); // jsdom + många fetchar på en långsam dator
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 7, 12, 0)); seed(); installeraKarta(); });
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); delete g.__salary; delete (window as any).maplibregl; });

describe("Skal och navigering", () => {
  it("fem flikar i menyn, ingen Inst.; ?flik=installningar faller tillbaka på Översikt", async () => {
    await monter("flik=installningar");
    for (const f of ["Översikt", "Medarbetare", "Maskiner", "Lön", "Avtal"]) expect(blad(f).length, f).toBeGreaterThan(0);
    expect(blad("Inst.").length).toBe(0);
    expect(text()).not.toContain("kommer i nästa steg");
    expect(text()).toContain("Stämmer");
  });
  it("flik och underflik skrivs i adressen, och en omladdning (ny montering på samma adress) stannar där man var", async () => {
    await monter("flik=oversikt");
    await klick("Lön");
    expect(window.location.search).toContain("flik=lon");
    await klick("Vilobrott");
    expect(window.location.search).toContain("underflik=vila");
    // "omladdning": montera om med adressens parametrar
    await act(async () => { root.unmount(); }); cont.remove();
    await monter(window.location.search.replace(/^\?/, ""));
    expect(text()).toContain("Analyserar arbetsdagar de senaste 3 månaderna");
  });
  it("det som är öppet står i adressen: ?flik=maskiner&maskin=… öppnar maskinen direkt", async () => {
    await monter("flik=maskiner&maskin=R64101");
    expect(text()).toContain("Identitet");
    expect(text()).toContain("R64101");
  });
  it("menyvalet 'Ny medarbetare' öppnar formuläret", async () => {
    await monter("flik=oversikt");
    await klick("Ny medarbetare");
    expect(window.location.search).toContain("ny=1");
    expect(text()).toContain("Steg 1 av 4");
  });
});

describe("Översikt = att-göra-lista", () => {
  const LEVERERAD = () => ({ laddar: false, fel: null, data: [{ maskinId: "R64101", namn: "Rottne H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-10-06", dagarSedan: 1 }] });
  /** Allt stämmer: bekräftade dagar, skickad lön, inget okopplat, avtal långt fram. */
  const allaStammer = () => {
    g.__db.arbetsdag = [{ medarbetare_id: "m1", datum: "2026-09-10", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: true }];
    g.__db.fortnox_export_logg = [{ medarbetare_id: "m1", status: "skickat", period: "2026-10" }];
  };

  it("inget väntar: bara Stämmer-listan, inget 'kräver dig' och ingen siffra i menyn", async () => {
    allaStammer();
    await monter("flik=oversikt");
    expect(text()).not.toContain("kräver dig");
    expect(text()).toContain("Stämmer");
    for (const rad of ["Lönen för september är skickad till Fortnox", "Alla dagar är bekräftade", "Inga obesvarade vilobrott", "Alla har maskin, hempunkt och inloggning", "Alla operatörer är kopplade", "Avtalet gäller till 31 mars 2027", "Alla maskiner har skickat fil inom 10 dygn"]) {
      expect(text(), rad).toContain(rad);
    }
    expect(cont.querySelector("aside")!.textContent).not.toMatch(/Översikt\s*\d/);
  });

  /** Allt på en gång. */
  function mangaSaker() {
    g.__db.medarbetare[1].user_id = null; // Erik: ingen inloggning
    g.__db.dim_maskin.push({ maskin_id: "R64999", visningsnamn: null, modell: "H8E", maskin_typ: "Harvester", sander_filer: true, datakalla: null, aktiv_fran: null, aktiv_till: null, bekraftad: false });
    // dagar: Anna 3 och 4 sep obekräftade, Erik 6 okt obekräftad (idag är 7 okt); en bekräftad dag + en dag utan klockslag räknas inte
    g.__db.arbetsdag = [
      { medarbetare_id: "m1", datum: "2026-09-03", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: false },
      { medarbetare_id: "m1", datum: "2026-09-04", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: false },
      { medarbetare_id: "m1", datum: "2026-09-05", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: true },
      { medarbetare_id: "m2", datum: "2026-09-08", start_tid: null, slut_tid: null, bekraftad: false },
      { medarbetare_id: "m2", datum: "2026-10-06", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: false },
      // vilobrott: Anna slutar 20:30 och börjar 05:00
      { medarbetare_id: "m1", datum: "2026-09-28", start_tid: "05:00:00", slut_tid: "20:30:00", bekraftad: true },
      { medarbetare_id: "m1", datum: "2026-09-29", start_tid: "05:00:00", slut_tid: "15:30:00", bekraftad: true },
    ];
    g.__db.gs_avtal[0].giltigt_till = "2026-10-20"; // inom en månad
    g.__leverans = { laddar: false, fel: null, data: [{ maskinId: "R64101", namn: "Rottne H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-09-20", dagarSedan: 17 }] };
    g.__kontroller = { ok: true, okandaOperatorer: [{ operator_id: "OP-9", operator_namn: "E Lind", maskin_id: "R64101", datum: ["2026-09-19", "2026-09-22"], medarbetare: { id: "m2", namn: "Erik Lind" } }], forareUtanMaskin: [{ id: "m2", namn: "Erik Lind" }], saknarHempunkt: [{ id: "m2", namn: "Erik Lind", orsak: "ingen_adress" }] };
  }

  it("väntande: en rad per sak, orange rubrik med antalet, siffran i menyn är samma tal, och Stämmer visar bara det som stämmer", async () => {
    mangaSaker();
    await monter("flik=oversikt");
    const t = text();
    expect(t).toContain("Lönen för september är klar att granska");
    expect(t).toContain("3 dagar väntar på bekräftelse");
    expect(t).toContain("Anna Berg: 3 sep, 4 sep");
    expect(t).toContain("Erik Lind: 6 okt");
    expect(t).toContain("Anna Berg: 2 obesvarade vilobrott"); // dygnsvila + veckovila över samma natt
    expect(t).toMatch(/Erik Lind.*saknar maskin · saknar hemadress · ingen inloggning kopplad/);
    expect(t).toContain('Operatören "E Lind" matchar Erik Lind');
    expect(t).toContain("Ny maskin i importen: H8E");
    expect(t).toContain("Avtalet går ut inom en månad");
    expect(t).toContain("Rottne H8E har inte skickat fil på 17 dygn");
    // 8 rader: lön, dagar, vilobrott, person, operatör, maskin, avtal, tyst maskin
    expect(t).toContain("8 saker kräver dig");
    expect(cont.querySelector("aside")!.textContent).toMatch(/Översikt\s*8/);
    // det som INTE stämmer står inte som "stämmer"
    for (const rad of ["Alla dagar är bekräftade", "Inga obesvarade vilobrott", "Alla operatörer är kopplade", "Alla maskiner har skickat fil"]) expect(t).not.toContain(rad);
  });

  it("knapparna leder dit det fixas: Granska → Löneunderlag, Se dagarna → Dagar filtrerat, Öppna → personen, Bekräfta → maskinen", async () => {
    mangaSaker();
    await monter("flik=oversikt");
    await klick("Granska");
    expect(window.location.search).toContain("flik=lon");
    expect(window.location.search).toContain("underflik=underlag");
    expect(text()).toContain("Går till Fortnox");
    await klick("Översikt");
    await klick("Se dagarna");
    expect(window.location.search).toContain("underflik=dagar");
    expect(window.location.search).toContain("avv=1");
    expect(window.location.search).toContain("dagoff=-1");
    expect(blad("Bara avvikelser")[0].closest("button")!.getAttribute("aria-pressed")).toBe("true");
    await klick("Översikt");
    await klick("Öppna");
    expect(window.location.search).toContain("person=m2");
    expect(text()).toContain("Personuppgifter");
    await klick("Översikt");
    await klick("Bekräfta");
    expect(window.location.search).toContain("maskin=R64999");
    expect(text()).toContain("Ny maskin upptäckt i importen");
  });

  it("en källa som inte går att läsa blir en egen rad med Försök igen — aldrig en tyst nolla", async () => {
    allaStammer();
    g.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/medarbetare/kontroller")) return { ok: false, status: 500, json: async () => ({ ok: false, error: "kontrollerna är nere" }) } as any;
      if (String(url).includes("/api/lon/arsovertid")) return { ok: true, status: 200, json: async () => ({ ok: true, ar: 2026, tak: 250, medarbetare: [], utjamning: [] }) } as any;
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    await monter("flik=oversikt");
    expect(text()).toContain("Kunde inte kontrollera personerna");
    expect(text()).toContain("kontrollerna är nere");
    expect(text()).toContain("1 sak kräver dig");
    expect(text()).not.toContain("Alla har maskin, hempunkt och inloggning");
    expect(blad("Försök igen").length).toBeGreaterThan(0);
  });

  it("'idag' är LOKALT: klockan 00:30 den 1 oktober är 30 september en passerad dag och 1 oktober inte", async () => {
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30));
    g.__db.arbetsdag = [
      { medarbetare_id: "m1", datum: "2026-09-30", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: false },
      { medarbetare_id: "m1", datum: "2026-10-01", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: false },
    ];
    await monter("flik=oversikt");
    expect(text()).toContain("1 dag väntar på bekräftelse");
    expect(text()).toContain("Anna Berg: 30 sep");
  });

  it("ändringen av aktuell leverans-regel: ur drift, filfria och obekräftade maskiner larmar aldrig", async () => {
    allaStammer();
    g.__leverans = { laddar: false, fel: null, data: [
      { maskinId: "A", namn: "Såld", aktivTill: "2026-03-31", sanderFiler: true, bekraftad: true, senasteData: "2026-01-01", dagarSedan: 200 },
      { maskinId: "B", namn: "Filfri", aktivTill: null, sanderFiler: false, bekraftad: true, senasteData: null, dagarSedan: null },
      { maskinId: "C", namn: "Ny", aktivTill: null, sanderFiler: true, bekraftad: false, senasteData: null, dagarSedan: 50 },
    ] };
    await monter("flik=oversikt");
    expect(text()).not.toContain("har inte skickat fil");
    expect(text()).toContain("Alla maskiner har skickat fil");
  });
});

describe("Medarbetare", () => {
  it("rollen visas som ord: Förare och Admin, aldrig databasvärdet", async () => {
    await monter("flik=medarbetare");
    expect(blad("Förare").length).toBe(1);
    expect(blad("Admin").length).toBeGreaterThan(0);
    expect(text()).not.toMatch(/forare/i.source === "forare" ? /\bforare\b/ : /x/);
  });

  it("rollvalet har bara Förare och Admin (ingen Chef) — i både detalj och ny medarbetare", async () => {
    await monter("flik=medarbetare");
    await klick("Anna Berg");
    const val = () => Array.from(cont.querySelectorAll("select")).map(s => Array.from(s.options).map(o => o.textContent));
    expect(val().some(o => o.includes("Förare") && o.includes("Admin"))).toBe(true);
    expect(val().flat()).not.toContain("Chef");
    await klick("Medarbetare"); // menyn: tillbaka till listan
    await klick("+ Ny");
    expect(val().flat()).not.toContain("Chef");
  });

  it("anställningsnumret hänvisas inte längre till 'steg 6' — det finns på personen", async () => {
    await monter("flik=medarbetare");
    await klick("Anna Berg");
    expect(text()).not.toContain("steg 6");
    expect(text()).toContain("Anställningsnummer (Fortnox)"); // numret finns nu på personen
  });

  it("ta bort: om RLS stoppar raderingen (0 rader) står det, och personen finns kvar — inget tyst 'borttagen'", async () => {
    await monter("flik=medarbetare");
    await klick("Anna Berg");
    await klick("Ta bort medarbetare");
    g.__ingaRader = true;
    await klick("Ja, ta bort");
    expect(text()).toContain("Inget raderades");
    expect(text()).toContain("Personuppgifter"); // kvar i detaljvyn, inte tillbaka i listan
    expect(g.__db.medarbetare.find((m: any) => m.id === "m1")).toBeTruthy();
  });

  it("ta bort: lyckas → tillbaka i listan utan personen", async () => {
    await monter("flik=medarbetare");
    await klick("Anna Berg");
    await klick("Ta bort medarbetare");
    await klick("Ja, ta bort");
    expect(g.__db.medarbetare.find((m: any) => m.id === "m1")).toBeFalsy();
    expect(text()).toContain("Medarbetare (1)");
  });
});

describe("Maskiner", () => {
  it("ta ur drift sätter LOKALT datum (00:30 den 1 juli → 2026-07-01)", async () => {
    vi.setSystemTime(new Date(2026, 6, 1, 0, 30));
    await monter("flik=maskiner");
    await klick("Rottne H8E");
    await klick("Ta ur drift / markera såld");
    await klick("Ja, ta ur drift");
    const skr = g.__skriv.find((s: any) => s.tabell === "dim_maskin");
    expect(skr.vals.aktiv_till).toBe("2026-07-01");
  });
});

describe("Avtal", () => {
  async function andraOvertid() {
    await monter("flik=avtal");
    await skriv(falt("Övertidsersättning vardag"), "55.5");
    await klick("Spara ändringar");
  }
  it("sparar → 'Sparat ✓' först när raden verkligen skrivits", async () => {
    await andraOvertid();
    expect(g.__db.gs_avtal[0].overtid_vardag_kr).toBe(55.5);
    expect(text()).toContain("Sparat ✓");
  });
  it("inga tekniska fel i sidan: ingen '(kolumn saknas)', inget grått fält, och Timlön finns inte här (den sätts per person)", async () => {
    await monter("flik=avtal");
    expect(text()).not.toContain("kolumn saknas");
    expect(cont.querySelectorAll("input:disabled").length).toBe(0);
    expect(blad("Timlön").length).toBe(0);
    expect(text()).not.toContain("Grundlön");
  });
  it("en kolumn som framtida avtalsrader saknar ger inget fel i sidan: fältet visas inte alls, och inget annat blir grått", async () => {
    delete g.__db.gs_avtal[0].skift_tillagg_kr;
    delete g.__db.gs_avtal[0].atk_procent_nasta;
    await monter("flik=avtal");
    expect(blad("Skifttillägg").length).toBe(0);
    expect(blad("Nästa period").length).toBe(0);
    expect(text()).not.toContain("kolumn saknas");
    expect(cont.querySelectorAll("input:disabled").length).toBe(0);
    expect(falt("Bortovaro >12h").value).toBe("8.03"); // gruppen med det andra fältet finns kvar
  });
  it("varje fält är kopplat till den kolumn som finns: färdtid, skifttillägg, bortovaro, ATK-tid och helg-OB visar avtalets värden", async () => {
    await monter("flik=avtal");
    expect(falt("Färdtidsersättning").value).toBe("10.49");
    expect(falt("Skifttillägg").value).toBe("8");
    expect(falt("Bortovaro >12h").value).toBe("8.03");
    expect(falt("Ledig tid").value).toBe("65.2");
    expect(falt("Helg").value).toBe("68.95");
  });
  it("och sparas till de kolumnerna — databasen avvisar allt annat (okänd kolumn = fel, som i prod)", async () => {
    g.__avvisaKolumner = { gs_avtal: ["timlon_kr", "ob_lordag_kr", "fardtid_kr", "skifttillagg_kr", "bortovaro_kr", "atk_ledig_tim", "atk_period", "atk_faktor"] };
    await monter("flik=avtal");
    await skriv(falt("Färdtidsersättning"), "11");
    await skriv(falt("Skifttillägg"), "9");
    await skriv(falt("Bortovaro >12h"), "8.5");
    await skriv(falt("Ledig tid"), "66");
    await skriv(falt("Helg"), "70");
    await klick("Spara ändringar");
    expect(text()).toContain("Sparat ✓");
    expect(g.__db.gs_avtal[0]).toMatchObject({ fardtid_kr_per_mil: 11, skift_tillagg_kr: 9, bortovaro_12h_kr: 8.5, atk_ledig_tid_h: 66, ob_helg_kr: 70 });
  });
  it("0 rader träffades (RLS) → inget 'Sparat ✓', felet står", async () => {
    g.__ingaRader = true;
    await andraOvertid();
    expect(text()).not.toContain("Sparat ✓");
    expect(text()).toContain("Ändringen sparades inte");
  });
  it("avtal som gick ut tidigare i månaden säger 'har gått ut', inte 'går ut om mindre än en månad'", async () => {
    g.__db.gs_avtal[0].giltigt_till = "2026-10-03"; // idag = 7 oktober
    await monter("flik=avtal");
    expect(text()).toContain("Avtalet har gått ut");
    expect(text()).not.toContain("mindre än en månad");
  });
  it("avtal som går ut om två månader varnar med antal månader", async () => {
    g.__db.gs_avtal[0].giltigt_till = "2026-12-20";
    await monter("flik=avtal");
    expect(text()).toContain("går ut om 2 månader");
  });
});

describe("Avtal → Utjämningsperioder", () => {
  // idag = 7 okt 2026 (onsdag, v41). Gävle v17–27 är avslutad (en grupp: Alla + Anna + Erik); "Anna" pågår; "Vinter" kommer.
  const G = { namn: "Gävle", startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: "Gävle, ordinarie tid utlagd ojämnt", skapad_av: "migration", skapad_at: "2026-09-18T10:00:00Z" };
  const GAVLE = { id: "g-alla", ...G, medarbetare_id: null };
  const GAVLE_ANNA = { id: "g-anna", ...G, medarbetare_id: "m1" };
  const GAVLE_ERIK = { id: "g-erik", ...G, medarbetare_id: "m2" };
  const NU = { id: "p-nu", namn: "Anna", startdatum: "2026-10-05", slutdatum: "2026-10-18", medarbetare_id: "m1", anteckning: "Anna, skogsbruksplan", skapad_av: "Erik Lind", skapad_at: "2026-10-01T10:00:00Z" };
  const SENARE = { id: "p-senare", namn: "Vinter", startdatum: "2026-11-02", slutdatum: "2026-11-15", medarbetare_id: null, anteckning: "Hela laget, vinterlager", overenskommen_datum: "2026-10-01", skapad_av: "Erik Lind", skapad_at: "2026-10-02T10:00:00Z" };
  // 17 veckor (v2–18): över 16 veckor kräver §5 mom 2 en överenskommelse med lokal facklig organisation
  const LANG = { id: "p-lang", namn: "Lång", startdatum: "2026-01-05", slutdatum: "2026-05-03", medarbetare_id: null, anteckning: "", skapad_av: "Erik Lind", skapad_at: "2026-01-02T10:00:00Z" };
  const kopia = (...r: any[]) => r.map(x => ({ ...x }));
  const sektion = () => cont.querySelector<HTMLElement>("[data-utjamning]")!;
  const sText = () => (sektion()?.textContent || "").replace(/\s+/g, " ");
  const rader = () => Array.from(cont.querySelectorAll<HTMLElement>("[data-utjamning-rad]"));
  const ark = () => document.querySelector<HTMLElement>("[data-utjamning-ark]");
  const overlay = () => document.querySelector<HTMLElement>("[data-utjamning-overlay]");
  const arkText = () => (ark()?.textContent || "").replace(/\s+/g, " ");
  /** Knappen uppe till höger i navigationsraden: "Lägg till" (ny period) eller "Spara" (ändra). */
  const sparaKnapp = () => document.querySelector<HTMLButtonElement>("[data-utjamning-ark] [data-spara]")!;
  const oppnaNy = async () => { await klick("Ny period"); };
  const skrivningar = () => g.__skriv.filter((x: any) => x.tabell === "utjamningsperiod");
  const radFalt = (k: string) => document.querySelector<HTMLElement>(`[data-utjamning-ark] [data-falt="${k}"]`)!;
  const varde = (k: string) => (radFalt(k).querySelector("[data-varde]")?.textContent || "").trim();
  const panel = (k: string) => document.querySelector<HTMLElement>(`[data-utjamning-ark] [data-panel="${k}"]`);
  const tryckRad = async (k: string) => { const el = radFalt(k); if (!el) throw new Error("ingen rad " + k); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
  const klickEl = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
  const dagEl = (d: string) => document.querySelector<HTMLElement>(`[data-utjamning-ark] [data-dag="${d}"]`);
  const kalender = () => document.querySelector<HTMLElement>("[data-utjamning-ark] [data-period-kalender]");
  /** Månaden som kalendern visar: '2026-10'. */
  const synligManad = () => document.querySelector<HTMLElement>("[data-utjamning-ark] [data-manad-nu]")?.getAttribute("data-manad-nu") || "";
  /** Vilken rads kalender som är öppen ('borjar' | 'slutar') eller null. */
  const oppenRad = () => kalender()?.getAttribute("data-period-kalender") || null;
  const knappMed = (etikett: string) => document.querySelector<HTMLButtonElement>(`[data-utjamning-ark] [aria-label="${etikett}"]`)!;
  /** Fäller ut radens kalender (stänger den andra). Gör inget om den redan är öppen. */
  const oppnaRad = async (rad: "borjar" | "slutar") => { if (oppenRad() !== rad) await tryckRad(rad); };
  const oppnaBorjar = () => oppnaRad("borjar");
  /** Visar månaden för datumet i radens kalender, med ‹ ›. */
  async function visaManad(datum: string, rad: "borjar" | "slutar" = "borjar") {
    await oppnaRad(rad);
    for (let i = 0; i < 80 && synligManad() !== datum.slice(0, 7); i++) await klickEl(knappMed(synligManad() < datum.slice(0, 7) ? "Nästa månad" : "Föregående månad"));
    if (synligManad() !== datum.slice(0, 7)) throw new Error("kom inte till " + datum + " — visar " + synligManad());
  }
  /** Ett tryck på en dag i bladet. Kalendern förblir öppen. */
  const tryckDag = async (dag: string) => { await klickEl(dagEl(dag)!); };
  /** Sätter Börjar: öppnar Börjar-kalendern, bläddrar dit och trycker på dagen. */
  const valjBorjar = async (dag: string) => { await visaManad(dag, "borjar"); await tryckDag(dag); };
  /** Sätter Slutar: öppnar Slutar-kalendern, bläddrar dit och trycker på dagen. */
  const valjSlut = async (dag: string) => { await visaManad(dag, "slutar"); await tryckDag(dag); };
  const iso = (k: "borjar" | "slutar") => radFalt(k).querySelector<HTMLElement>("[data-varde]")!.getAttribute("data-iso")!;
  /** Antal veckor, som '11 v' (raden under datumraderna säger '11 veckor'). */
  const langd = () => { const t = (document.querySelector("[data-veckor]")?.textContent || "").replace(/\s+/g, " ").trim(); return t.replace(/ veckor?$/, " v"); };
  /** Raden Slutar som text: 'Slutar sön 5 jul · v27'. */
  const slutar = () => "Slutar " + varde("slutar");
  const antalVeckorNu = () => parseInt(langd(), 10);
  const mandagMs = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const x = new Date(y, m - 1, dd); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); };
  const plusDagar = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  /** Genväg: Slutar så att perioden blir n veckor lång, räknat från Börjar (söndagen i vecka n). */
  const sattLangd = async (n: number) => { await valjSlut(plusDagar(iso("borjar"), 7 * n - 1)); if (antalVeckorNu() !== n) throw new Error("längd " + langd() + " ≠ " + n); };
  /** Välj Börjar (en dag i första veckan) och Slutar (en dag i sista veckan). Kalendern stängs efteråt: det är bara en genväg i testerna. */
  const valjPeriod = async (franDag: string, tillDag: string) => {
    await valjBorjar(franDag);
    await valjSlut(tillDag);
    if (kalender()) await tryckRad(oppenRad()!);
  };
  const bockar = () => Array.from(document.querySelectorAll<HTMLElement>('[data-utjamning-ark] [role="checkbox"]'));
  const bock = (namn: string) => { const b = bockar().find(e => e.getAttribute("data-namn") === namn); if (!b) throw new Error("ingen bock: " + namn + " — " + bockar().map(e => e.getAttribute("data-namn")).join("|")); return b; };
  const klickaBock = async (namn: string) => { await klickEl(bock(namn)); };
  const oppnaForare = async () => { if (!document.querySelector("[data-forare-vy]")) await tryckRad("forare"); };
  const tillbakaKnapp = () => document.querySelector<HTMLButtonElement>("[data-utjamning-ark] [data-tillbaka]");
  /** Tillbakapilen uppe till vänster i förarlistan. Valet sparas redan: state ligger i arket. */
  const tillbaka = async () => { const k = tillbakaKnapp(); if (!k) throw new Error("ingen tillbakapil"); await klickEl(k); };
  const klar = tillbaka;
  /** Bocka en förare i förarlistan och gå tillbaka till formuläret. */
  const tryckBock = async (namn: string) => { await oppnaForare(); await klickaBock(namn); await tillbaka(); };
  const ibockad = (namn: string) => bock(namn).getAttribute("aria-checked") === "true";
  /** Fältet med etiketten INOM arket: Avtal-sidan bakom har också ett fält som heter Namn (avtalets). */
  const arkFalt = (label: string) => {
    const l = Array.from(ark()!.querySelectorAll<HTMLLabelElement>("label")).find(e => (e.textContent || "").trim() === label);
    if (!l) throw new Error("hittar inget fält i arket: " + label);
    return document.getElementById(l.htmlFor) as HTMLInputElement;
  };
  const namnge = async (t: string) => { await skriv(arkFalt("Namn"), t); };
  const anteckna = async (t: string) => { await skriv(arkFalt("Anteckning (valfri)"), t); };
  const spara = async () => { await act(async () => { sparaKnapp().click(); }); await lugn(); };
  const status = () => (document.querySelector("[data-utjamning-status]")?.textContent || "").replace(/\s+/g, " ");
  const krockRad = () => document.querySelector<HTMLElement>("[data-krock-varning]");
  /** Färgen som webbläsaren/jsdom skriver ut för en hex-token (style.color normaliseras till rgb). */
  const farg = (hex: string) => { const e = document.createElement("span"); e.style.color = hex; return e.style.color; };

  // ── Listan: EN period = EN rad ──
  it("rader med samma namn, start och slut är EN rad: 'Gävle · v17–27 · Alla, Anna, Erik'; pågående överst, avslutade under egen rubrik", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA, GAVLE_ERIK, SENARE, NU);
    await monter("flik=avtal");
    expect(rader().map(r => r.getAttribute("data-utjamning-rad"))).toEqual(["Anna", "Vinter", "Gävle"]);   // inte fem rader
    const gavle = (rader()[2].textContent || "").replace(/\s+/g, " ");
    expect(gavle).toContain("Gävle");
    expect(gavle).toContain("v17–27");
    expect(gavle).toContain("Alla, Anna, Erik");                       // en NULL-rad och två personrader i samma period
    const t = sText();
    expect(t.indexOf("Avslutade")).toBeGreaterThan(t.indexOf("v45–46"));
    expect(t.indexOf("Avslutade")).toBeLessThan(t.indexOf("v17–27"));
    expect(t).toContain("Pågår");
    for (const lang of ["ordinarie tid utlagd ojämnt", "skogsbruksplan", "vinterlager"]) expect(t, lang).not.toContain(lang);   // anteckningen hör inte till listan
  });

  it("överenskommelsen i listan: högst 16 veckor visar INGET (inte 'Ej dokumenterad'); över 16 veckor orange varning utan datum, grått datum med", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, SENARE, LANG, { ...LANG, id: "p-lang2", namn: "Lång 2", overenskommen_datum: "2026-01-02" });
    await monter("flik=avtal");
    const radMed = (namn: string) => rader().find(r => r.getAttribute("data-utjamning-rad") === namn)!;
    const t = (namn: string) => (radMed(namn).textContent || "").replace(/\s+/g, " ");
    const rad = (namn: string, text: string) => Array.from(radMed(namn).querySelectorAll<HTMLElement>("*")).find(e => egenText(e) === text)!;
    // Gävle: 11 veckor, ingen överenskommelse krävs → ingen rad om det
    expect(t("Gävle").toLowerCase()).not.toContain("överenskomm");
    expect(sText()).not.toContain("Ej dokumenterad");
    // Vinter: 2 veckor men ett datum finns → det visas (ett faktum som finns döljs inte)
    expect(t("Vinter")).toContain("Överenskommen 1 okt 2026");
    // Lång: 17 veckor utan datum → orange varning
    const varning = rad("Lång", "Saknar överenskommelse med lokal facklig organisation");
    expect(varning).toBeTruthy();
    expect(varning.style.color).toBe(farg(FARG.orange));
    // Lång 2: 17 veckor med datum → datumet, grått (inte orange)
    const datum = rad("Lång 2", "Överenskommen 2 jan 2026");
    expect(datum.style.color).toBe(farg(FARG.text2));
    expect(t("Lång 2")).not.toContain("Saknar");
  });

  it("en rad utan namn visar de första 20 tecknen av anteckningen i stället för ett tomt namn", async () => {
    g.__db.utjamningsperiod = kopia({ ...GAVLE, namn: null, anteckning: "Gävle/Hedemora–Sandviken 22 apr–29 jun 2026" });
    await monter("flik=avtal");
    expect(sText()).toContain("Gävle/Hedemora–Sandv");
    expect(sText()).not.toContain("29 jun 2026");
  });

  it("tom lista förklarar varför och vad som fyller den", async () => {
    await monter("flik=avtal");
    expect(sText()).toContain("Inga utjämningsperioder");
    expect(sText()).toContain("Ny period");
  });

  it("kan listan inte läsas står felet, aldrig 'Inga utjämningsperioder'", async () => {
    g.__dbFel = { utjamningsperiod: "permission denied" };
    await monter("flik=avtal");
    expect(sText()).toContain("Kunde inte läsa utjämningsperioderna");
    expect(sText()).toContain("permission denied");
    expect(sText()).not.toContain("Inga utjämningsperioder");
  });

  // ── Arket ligger fast över skärmen där man är ──
  // Rotorsak: .tona-in har en transform-animation, och en transform gör föräldern till containing block för position: fixed.
  // Ett ark inne i sidan placeras därför mot sidans topp, inte mot fönstret. Arket ritas därför i en portal på document.body.
  async function arkFastOverSidan(oppna: () => Promise<void>) {
    await monter("flik=avtal");
    document.body.style.overflow = "";
    await oppna();
    const o = overlay()!;
    expect(o).toBeTruthy();
    expect(cont.contains(o)).toBe(false);                 // utanför sidans transformerade lager
    expect(o.parentElement).toBe(document.body);
    expect(o.style.position).toBe("fixed");
    expect(o.style.inset).toMatch(/^0(px)?( 0(px)?){0,3}$/);
    expect(o.contains(ark())).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");  // sidan bakom är låst för scroll
  }

  it("Ny period: arket är en fast ruta över hela fönstret (portal på body) och sidan bakom är låst för scroll", async () => {
    await arkFastOverSidan(oppnaNy);
  });

  it("en befintlig period: samma, arket ligger fast över skärmen", async () => {
    g.__db.utjamningsperiod = kopia(NU);
    await arkFastOverSidan(async () => { await klick("Anna"); });
  });

  it("scroll-låset släpps när arket stängs (Avbryt, tryck utanför, efter Spara) och skriver inte över sidans eget värde", async () => {
    await monter("flik=avtal");
    document.body.style.overflow = "";
    await oppnaNy();
    expect(document.body.style.overflow).toBe("hidden");
    await klick("Avbryt");
    expect(ark()).toBeNull();
    expect(document.body.style.overflow).toBe("");
    await oppnaNy();
    await act(async () => { overlay()!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });   // tryck på bakgrunden
    expect(ark()).toBeNull();
    expect(document.body.style.overflow).toBe("");
    await oppnaNy();                                                                                    // tryck INUTI arket stänger inte
    await act(async () => { ark()!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(ark()).toBeTruthy();
    await tryckBock("Alla");
    await namnge("Sparat");
    await spara();
    expect(ark()).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("avmonteras sidan med arket öppet släpps låset också (annars fastnar all scroll)", async () => {
    await monter("flik=avtal");
    document.body.style.overflow = "";
    await oppnaNy();
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => { root.unmount(); });
    expect(document.body.style.overflow).toBe("");
    root = createRoot(cont);                              // afterEach avmonterar igen
  });

  // ── Navigationsraden ──
  it("navigationsraden: 'Avbryt' vänster, titel i mitten, 'Lägg till' höger — grå tills namn och förare är satta; ingen Spara/Avbryt-knapp längst ner", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const nav = ark()!.querySelector<HTMLElement>("[data-ark-rubrik]")!;
    const text = (nav.textContent || "").replace(/\s+/g, " ");
    expect(text.indexOf("Avbryt")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Ny period")).toBeGreaterThan(text.indexOf("Avbryt"));
    expect(text.indexOf("Lägg till")).toBeGreaterThan(text.indexOf("Ny period"));
    expect(nav.contains(sparaKnapp())).toBe(true);
    expect((sparaKnapp().textContent || "").trim()).toBe("Lägg till");
    const knappar = Array.from(ark()!.querySelectorAll<HTMLButtonElement>("button")).map(b => (b.textContent || "").trim());
    expect(knappar.filter(t => t === "Avbryt")).toHaveLength(1);                // bara i navigationsraden
    expect(knappar.filter(t => t === "Spara" || t === "Lägg till")).toHaveLength(1);
    expect(sparaKnapp().disabled).toBe(true);                                   // grå: ingen förare, inget namn
    await namnge("Test");
    expect(sparaKnapp().disabled).toBe(true);                                   // förare saknas
    await tryckBock("Alla");
    expect(sparaKnapp().disabled).toBe(false);
  });

  it("'Ändra period' och 'Spara' när en befintlig period öppnas", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA);
    await monter("flik=avtal");
    await klick("Gävle");
    const nav = (ark()!.querySelector("[data-ark-rubrik]")!.textContent || "").replace(/\s+/g, " ");
    expect(nav).toContain("Ändra period");
    expect((sparaKnapp().textContent || "").trim()).toBe("Spara");
    expect(sparaKnapp().disabled).toBe(false);                                  // namn, Börjar och förare finns
  });

  // ── Börjar + Längd ──
  it("raderna i ordning: Namn · Börjar · Slutar · Förare · Anteckning (valfri); kalendern är stängd, ingen Längd-stegare, inga bockar", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const rader_ = Array.from(ark()!.querySelectorAll<HTMLElement>("[data-falt-rad]")).map(e => e.getAttribute("data-falt-rad"));
    expect(rader_).toEqual(["namn", "borjar", "slutar", "forare", "anteckning"]);
    expect(radFalt("fran")).toBeNull();
    expect(radFalt("till")).toBeNull();
    expect(radFalt("langd")).toBeNull();                                        // ingen Längd-rad
    expect(knappMed("Öka längd")).toBeNull();                                   // och ingen stegare
    expect(knappMed("Minska längd")).toBeNull();
    const text = arkText();
    let senast = -1;
    for (const l of ["Namn", "Börjar", "Slutar", "Förare", "Anteckning (valfri)"]) { const i = text.indexOf(l); expect(i, l).toBeGreaterThan(senast); senast = i; }
    expect(kalender()).toBeNull();
    expect(document.querySelectorAll("[data-utjamning-ark] [data-dag]").length).toBe(0);
    expect(document.querySelectorAll("[data-utjamning-ark] [role=\"checkbox\"]").length).toBe(0);
    expect(document.querySelectorAll("[data-utjamning-ark] select").length).toBe(0);
  });

  it("en ny period börjar på veckan vi är i: Börjar 'mån 5 okt · v41', Slutar 'sön 11 okt · v41', '1 vecka', förare 'Välj'", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    expect(varde("borjar")).toBe("mån 5 okt · v41");
    expect(varde("slutar")).toBe("sön 11 okt · v41");
    expect((document.querySelector("[data-veckor]")!.textContent || "").trim()).toBe("1 vecka");
    expect(varde("forare")).toBe("Välj");
    expect(arkFalt("Namn").maxLength).toBe(20);
    expect(arkFalt("Namn").value).toBe("");
  });

  it("tryck på en rad fäller ut ETT kalenderblad direkt under raden (i flödet), alltid på radens eget datum; bara ett blad åt gången; tryck igen stänger", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjPeriod("2026-10-12", "2026-11-22");                                // Börjar i oktober, Slutar i november
    await tryckRad("borjar");
    expect(document.querySelectorAll("[data-utjamning-ark] [data-period-kalender]")).toHaveLength(1);
    expect(radFalt("borjar").getAttribute("aria-expanded")).toBe("true");
    const rad = radFalt("borjar").closest("[data-falt-rad]")!;
    expect(rad.nextElementSibling!.contains(kalender())).toBe(true);            // direkt under raden
    expect(["", "static", "relative"]).toContain(kalender()!.style.position);   // aldrig absolute/fixed
    expect(synligManad()).toBe("2026-10");                                       // Börjar öppnas på startmånaden
    expect((document.querySelector("[data-manad-rubrik]")!.textContent || "").trim()).toBe("oktober 2026");
    await tryckRad("slutar");                                                    // den andra raden: ett blad åt gången
    expect(document.querySelectorAll("[data-utjamning-ark] [data-period-kalender]")).toHaveLength(1);
    expect(oppenRad()).toBe("slutar");
    expect(radFalt("borjar").getAttribute("aria-expanded")).toBe("false");
    expect(radFalt("slutar").getAttribute("aria-expanded")).toBe("true");
    expect(radFalt("slutar").closest("[data-falt-rad]")!.nextElementSibling!.contains(kalender())).toBe(true);
    expect(synligManad()).toBe("2026-11");                                       // Slutar öppnas på SLUTmånaden
    await klickEl(knappMed("Nästa månad"));                                      // bläddra bort från slutmånaden …
    expect(synligManad()).toBe("2026-12");
    await tryckRad("slutar");                                                    // stäng
    await tryckRad("slutar");                                                    // öppna igen: tillbaka på radens eget datum, inte där man bläddrade
    expect(synligManad()).toBe("2026-11");
    await tryckRad("slutar");
    expect(kalender()).toBeNull();
    expect(radFalt("slutar").getAttribute("aria-expanded")).toBe("false");
    // Börjar öppnas också alltid på sitt eget datum, även om Slutar-bladet var framme
    await tryckRad("borjar");
    expect(synligManad()).toBe("2026-10");
  });

  it("ETT tryck på en dag sätter bara den radens värde, snäppt: Börjar → måndagen, Slutar → söndagen; inga tryck-sekvenser, ingen start/slut-växling", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjBorjar("2026-10-14");                                              // onsdag
    expect(varde("borjar")).toBe("mån 12 okt · v42");
    await valjBorjar("2026-10-23");                                              // fredag
    expect(varde("borjar")).toBe("mån 19 okt · v43");
    await valjBorjar("2026-10-25");                                              // söndag hör till veckan som slutar på den
    expect(varde("borjar")).toBe("mån 19 okt · v43");
    await valjSlut("2026-11-18");                                                // onsdag → söndagen den veckan
    expect(varde("slutar")).toBe("sön 22 nov · v47");
    expect(varde("borjar")).toBe("mån 19 okt · v43");                            // Slutar rör inte Börjar
    await valjSlut("2026-11-21");                                                // lördag → samma söndag
    expect(varde("slutar")).toBe("sön 22 nov · v47");
    await valjBorjar("2026-10-05");                                              // Börjar tillbaka: Slutar rörs inte
    expect(varde("borjar")).toBe("mån 5 okt · v41");
    expect(varde("slutar")).toBe("sön 22 nov · v47");
    await valjBorjar("2026-10-06"); await valjBorjar("2026-10-06"); await valjBorjar("2026-10-06");   // tre tryck på samma dag: samma resultat
    expect(varde("borjar")).toBe("mån 5 okt · v41");
    expect(arkText()).not.toContain("Tryck på sista dagen");
    expect(kalender()).toBeTruthy();                                             // bladet förblir öppet
  });

  it("Slutar före Börjar flyttas till samma vecka som Börjar; och flyttas Börjar förbi Slutar följer Slutar med", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjBorjar("2026-10-19");                                              // Slutar var vecka 41 (före) → följer med: samma vecka
    expect(varde("borjar")).toBe("mån 19 okt · v43");
    expect(varde("slutar")).toBe("sön 25 okt · v43");
    await valjSlut("2026-12-06");
    expect(varde("slutar")).toBe("sön 6 dec · v49");
    await valjSlut("2026-10-06");                                                // en dag före Börjar → Börjars vecka
    expect(varde("slutar")).toBe("sön 25 okt · v43");
    expect(varde("borjar")).toBe("mån 19 okt · v43");                            // Börjar rörs inte
    expect((document.querySelector("[data-veckor]")!.textContent || "").trim()).toBe("1 vecka");
    await valjSlut("2026-11-29");
    await valjBorjar("2026-12-02");                                              // Börjar förbi Slutar → Slutar flyttas till samma vecka
    expect(varde("borjar")).toBe("mån 30 nov · v49");
    expect(varde("slutar")).toBe("sön 6 dec · v49");
  });

  it("raden under datumraderna säger antal veckor, grått: '1 vecka', '6 veckor'; uppdateras vid varje tryck", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const rad = () => document.querySelector<HTMLElement>("[data-veckor]")!;
    expect((rad().textContent || "").trim()).toBe("1 vecka");
    await valjSlut("2026-11-15");                                                // v41 – v46
    expect((rad().textContent || "").trim()).toBe("6 veckor");
    expect(varde("slutar")).toBe("sön 15 nov · v46");
    await sattLangd(11);
    expect((rad().textContent || "").trim()).toBe("11 veckor");
    expect(varde("slutar")).toBe("sön 20 dec · v51");
    expect(rad().style.color).toBe(farg(FARG.text2));                            // grå
    await sattLangd(1);
    expect((rad().textContent || "").trim()).toBe("1 vecka");
    expect(varde("slutar")).toBe("sön 11 okt · v41");
  });

  it("grå rad direkt under Slutar (inte en rad man väljer i): '6 veckor' är text, ingen knapp", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const el = document.querySelector<HTMLElement>("[data-veckor]")!;
    expect(el.tagName).not.toBe("BUTTON");
    expect(el.closest("button")).toBeNull();
    expect(el.style.color).toBe(farg(FARG.text2));
    expect(ark()!.querySelector('[data-falt-rad="slutar"]')!.nextElementSibling).toBe(el);   // direkt under Slutar
  });

  it("bladet visar HELA perioden som band, med dagen raden gäller som cirkel (Börjar: måndagen, Slutar: söndagen); bandet växer och krymper direkt när Slutar ändras", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjBorjar("2026-10-12");
    await valjSlut("2026-11-08");                                                // 12 okt–8 nov; Slutar-bladet står på november
    const markerade = () => Array.from(document.querySelectorAll<HTMLElement>('[data-utjamning-ark] [data-dag][aria-pressed="true"]')).map(e => e.getAttribute("data-dag"));
    expect(synligManad()).toBe("2026-11");
    expect(markerade()).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);   // bandet fortsätter över månadsskiftet
    expect(dagEl("2026-11-08")!.getAttribute("data-slut")).toBe("true");         // cirkel på söndagen i sista veckan
    expect(dagEl("2026-11-08")!.querySelector("span")!.style.background).toBe(farg(FARG.text));
    expect(dagEl("2026-11-02")!.querySelector("span")!.style.background).not.toBe(farg(FARG.text));
    await tryckDag("2026-11-15");                                                // bladet öppet: bandet växer direkt
    expect(markerade()).toHaveLength(15);
    expect(dagEl("2026-11-15")!.getAttribute("aria-pressed")).toBe("true");
    await tryckDag("2026-11-01");                                                // krymper direkt
    expect(dagEl("2026-11-09")!.getAttribute("aria-pressed")).toBe("false");
    expect(markerade()).toEqual(["2026-11-01"]);
    expect(slutar()).toBe("Slutar sön 1 nov · v44");
    await tryckRad("borjar");                                                    // Börjar-bladet: oktober, cirkeln på måndagen i första veckan
    expect(synligManad()).toBe("2026-10");
    expect(markerade()[0]).toBe("2026-10-12");
    expect(markerade()).toHaveLength(20);
    expect(dagEl("2026-10-12")!.getAttribute("data-start")).toBe("true");
    expect(dagEl("2026-10-12")!.querySelector("span")!.style.background).toBe(farg(FARG.text));
    expect(Array.from(document.querySelectorAll('[data-utjamning-ark] [data-start="true"]'))).toHaveLength(1);
    expect(dagEl("2026-10-11")!.getAttribute("aria-pressed")).toBe("false");
    expect(kalender()).toBeTruthy();
  });

  it("röda dagar markeras i bladet (julafton, juldagen, annandag jul …) med en egen markering och beskrivning, vardagar inte", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await visaManad("2026-12-24");
    for (const d of ["2026-12-24", "2026-12-25", "2026-12-26"]) {
      expect(dagEl(d)!.getAttribute("data-roda"), d).toBe("true");
      expect(dagEl(d)!.getAttribute("aria-label"), d).toMatch(/röd dag/i);
    }
    expect(dagEl("2026-12-22")!.getAttribute("data-roda")).toBeNull();
    expect(dagEl("2026-12-23")!.getAttribute("data-roda")).toBeNull();
    expect(dagEl("2026-12-24")!.getAttribute("aria-label")).toContain("Julafton");
    await visaManad("2027-01-01");                                              // månaden efter perioden ritas redan: ingen rullning behövs
    expect(dagEl("2027-01-01")!.getAttribute("data-roda")).toBe("true");        // nyårsdagen ligger i januari 2027
  });

  it("bandet löper över månadsskiftet och årsskiftet när man bläddrar; Slutar öppnas på slutmånaden, Börjar på startmånaden", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjPeriod("2026-12-21", "2027-01-11");                                // v52 – v2: 4 veckor, 21 dec–17 jan
    await oppnaRad("slutar");
    expect(synligManad()).toBe("2027-01");                                       // slutmånaden
    expect((document.querySelector("[data-manad-rubrik]")!.textContent || "").trim()).toBe("januari 2027");
    expect(dagEl("2027-01-01")!.getAttribute("aria-pressed")).toBe("true");      // bandet över årsskiftet …
    expect(dagEl("2027-01-17")!.getAttribute("aria-pressed")).toBe("true");
    expect(dagEl("2027-01-17")!.getAttribute("data-slut")).toBe("true");
    expect(dagEl("2027-01-18")!.getAttribute("aria-pressed")).toBe("false");
    await klickEl(knappMed("Föregående månad"));
    expect(synligManad()).toBe("2026-12");
    expect(dagEl("2026-12-31")!.getAttribute("aria-pressed")).toBe("true");      // … och i december
    expect(dagEl("2026-12-21")!.getAttribute("data-start")).toBe("true");
    expect(dagEl("2026-12-20")!.getAttribute("aria-pressed")).toBe("false");
    await oppnaRad("borjar");
    expect(synligManad()).toBe("2026-12");                                       // startmånaden
  });

  it("över 16 veckor: orange text direkt under veckoraden och raden Överenskommen; högst 16 veckor: ingen av dem", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await sattLangd(16);
    expect(radFalt("overenskommen")).toBeNull();
    expect(document.querySelector("[data-overenskommelse-krav]")).toBeNull();
    expect(arkText().toLowerCase()).not.toContain("överenskomm");
    await sattLangd(17);
    expect((document.querySelector("[data-veckor]")!.textContent || "").trim()).toBe("17 veckor");
    const krav = document.querySelector<HTMLElement>("[data-overenskommelse-krav]")!;
    expect(krav.textContent).toBe("Över 16 veckor kräver överenskommelse med lokal facklig organisation");
    expect(krav.style.color).toBe(farg(FARG.orange));
    const falt_ = Array.from(ark()!.querySelectorAll<HTMLElement>("[data-falt-rad]")).map(e => e.getAttribute("data-falt-rad"));
    expect(falt_).toEqual(["namn", "borjar", "slutar", "overenskommen", "forare", "anteckning"]);
    expect(varde("overenskommen")).toBe("—");
    // texten och raden ligger direkt under Slutar/veckoraden, före Förare
    const veckorEl = document.querySelector("[data-veckor]")!;
    expect(veckorEl.compareDocumentPosition(krav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(krav.compareDocumentPosition(radFalt("overenskommen")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(radFalt("overenskommen").compareDocumentPosition(radFalt("forare")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await sattLangd(16);
    expect(radFalt("overenskommen")).toBeNull();
    expect(document.querySelector("[data-overenskommelse-krav]")).toBeNull();
  });

  it("Längd 20 v: orange läge — texten är orange utan datum och grå med datum; Lägg till spärras aldrig", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await namnge("Lång");
    await tryckBock("Alla");
    await sattLangd(20);
    expect(langd()).toBe("20 v");
    const krav = () => document.querySelector<HTMLElement>("[data-overenskommelse-krav]")!;
    expect(krav().style.color).toBe(farg(FARG.orange));
    expect(sparaKnapp().disabled).toBe(false);
    await tryckRad("overenskommen");
    await skriv(panel("overenskommen")!.querySelector<HTMLInputElement>('input[type="date"]')!, "2026-10-02");
    expect(krav().style.color).toBe(farg(FARG.text2));
  });

  // ── Förare: push-vy med tillbakapil ──
  it("Förare öppnar en push-vy: ren tillbakapil '‹' uppe till vänster (utan text), titel 'Förare' i mitten, 'Klar' (blå) uppe till höger; Alla överst som egen grupp; formuläret göms", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await tryckRad("forare");
    expect(document.querySelector("[data-forare-vy]")).toBeTruthy();
    expect(ark()!.querySelector("[data-falt-rad]")).toBeNull();                 // formulärets rader är borta
    expect(sparaKnapp()).toBeNull();                                            // och Lägg till: här finns tillbakapilen och Klar
    const nav = ark()!.querySelector<HTMLElement>("[data-ark-rubrik]")!;
    const [vanster, mitt, hoger] = Array.from(nav.children) as HTMLElement[];
    expect((mitt.textContent || "").trim()).toBe("Förare");
    const pil = tillbakaKnapp()!;
    expect(vanster.contains(pil)).toBe(true);                                    // uppe till vänster
    expect((pil.textContent || "").replace("chevron_left", "").trim()).toBe(""); // ingen text: bara pilen
    expect(pil.getAttribute("aria-label")).toBe("Tillbaka till Ny period");
    expect(parseInt(pil.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    const klarKnapp = document.querySelector<HTMLButtonElement>("[data-utjamning-ark] [data-klar]")!;
    expect(hoger.contains(klarKnapp)).toBe(true);                                // uppe till höger
    expect((klarKnapp.textContent || "").trim()).toBe("Klar");
    expect(klarKnapp.style.color).toBe(farg(FARG.bla));                          // blå
    expect(parseInt(klarKnapp.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(Array.from(ark()!.querySelectorAll("button")).some(b => (b.textContent || "").includes("Ny period"))).toBe(false);   // inget som läses som 'skapa ny period'
    const grupper = Array.from(ark()!.querySelectorAll<HTMLElement>("[data-forare-grupp]"));
    expect(grupper.map(g => g.getAttribute("data-forare-grupp"))).toEqual(["alla", "forare"]);
    expect(Array.from(grupper[0].querySelectorAll("[role=checkbox]")).map(b => b.getAttribute("data-namn"))).toEqual(["Alla"]);
    expect(Array.from(grupper[1].querySelectorAll("[role=checkbox]")).map(b => b.getAttribute("data-namn"))).toEqual(["Anna Berg", "Erik Lind"]);
    expect(bockar().map(b => b.getAttribute("aria-checked"))).toEqual(["false", "false", "false"]);
    for (const b of bockar()) expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  for (const knapp of ["klar", "tillbaka"]) it(`${knapp === "klar" ? "Klar" : "‹"}: sparar valet och går tillbaka till formuläret, som visar namnen (samma sak som ${knapp === "klar" ? "‹" : "Klar"})`, async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await tryckRad("forare");
    await klickaBock("Anna Berg");
    await klickaBock("Erik Lind");
    await klickEl(document.querySelector<HTMLElement>(`[data-utjamning-ark] [data-${knapp}]`)!);
    expect(document.querySelector("[data-forare-vy]")).toBeNull();               // tillbaka i formuläret
    expect(varde("forare")).toBe("Anna, Erik");                                  // valet sparades
    await tryckRad("forare");                                                    // och står kvar när man öppnar listan igen
    expect(ibockad("Anna Berg")).toBe(true);
    expect(ibockad("Erik Lind")).toBe(true);
  });

  it("valet sparas vid tillbaka (och finns kvar om man går in igen)", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await oppnaForare();
    await klickaBock("Anna Berg");
    await tillbaka();
    expect(document.querySelector("[data-forare-vy]")).toBeNull();
    expect(varde("forare")).toBe("Anna");
    await tryckRad("forare");
    expect(ibockad("Anna Berg")).toBe(true);
    await tillbaka();
  });

  it("tillbakapilen säger vart den går: 'Tillbaka till Ändra period' (skärmläsare) när en befintlig period ändras", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA);
    await monter("flik=avtal");
    await klick("Gävle");
    await tryckRad("forare");
    expect(tillbakaKnapp()!.getAttribute("aria-label")).toBe("Tillbaka till Ändra period");
  });

  it("i förarlistan: Alla på rensar personerna, en person på tar bort Alla, Alla/person av rör inte de andra", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await oppnaForare();
    await klickaBock("Anna Berg");
    expect(ibockad("Anna Berg")).toBe(true);
    expect(ibockad("Alla")).toBe(false);
    await klickaBock("Erik Lind");
    expect(ibockad("Anna Berg") && ibockad("Erik Lind")).toBe(true);
    await klickaBock("Alla");                                   // Alla tömmer personerna
    expect(ibockad("Alla")).toBe(true);
    expect(ibockad("Anna Berg") || ibockad("Erik Lind")).toBe(false);
    await klickaBock("Anna Berg");                              // en person tar bort Alla
    expect(ibockad("Alla")).toBe(false);
    await klickaBock("Anna Berg");
    await tillbaka();
    expect(varde("forare")).toBe("Välj");
  });

  it("Förare-raden visar valda namn: 'Anna, Erik' när de får plats, 'Alla' för alla; Välj när ingen är vald", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    expect(varde("forare")).toBe("Välj");
    await tryckBock("Anna Berg");
    expect(varde("forare")).toBe("Anna");
    await tryckBock("Erik Lind");
    expect(varde("forare")).toBe("Anna, Erik");
    await tryckBock("Alla");
    expect(varde("forare")).toBe("Alla");
  });

  it("får namnen inte plats på raden visas 'N förare' (mätt: namnen är bredare än raden), och namnen kommer tillbaka när de får plats", async () => {
    g.__db.medarbetare.push(...[["m3", "Stefan Karlsson"], ["m4", "Daniel Johansson"], ["m5", "Joacim Ringberg"]].map(([id, namn]) => ({ ...MED[0], id, namn, epost: id + "@example.se", user_id: "u" + id })));
    const ärVärde = (e: any) => e.hasAttribute?.("data-varde");
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get() { return ärVärde(this) ? (this.textContent || "").length * 10 : 0; } });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return ärVärde(this) ? 150 : 0; } });
    try {
      await monter("flik=avtal");
      await oppnaNy();
      await tryckBock("Stefan Karlsson");
      await tryckBock("Daniel Johansson");
      expect(varde("forare")).toBe("Stefan, Daniel");                       // 14 tecken = 140 ≤ 150: får plats
      await tryckBock("Joacim Ringberg");
      expect(varde("forare")).toBe("3 förare");                             // "Stefan, Daniel, Joacim" = 22 tecken = 220 > 150
      await tryckBock("Joacim Ringberg");                                    // bocka ur: namnen får plats igen
      expect(varde("forare")).toBe("Stefan, Daniel");
      await tryckBock("Alla");
      expect(varde("forare")).toBe("Alla");
    } finally {
      delete (HTMLElement.prototype as any).scrollWidth; delete (HTMLElement.prototype as any).clientWidth;
    }
  });

  it("Anteckning ligger DIREKT under Förare, rullas i sikte när man kommer tillbaka från förarlistan och går att skriva i direkt", async () => {
    const anrop: Element[] = [];
    (Element.prototype as any).scrollIntoView = function () { anrop.push(this); };
    try {
      await monter("flik=avtal");
      await oppnaNy();
      const efter = (k: string) => (ark()!.querySelector(`[data-falt-rad="${k}"]`)!.nextElementSibling as HTMLElement | null)?.getAttribute("data-falt-rad");
      expect(efter("forare")).toBe("anteckning");
      await oppnaForare();
      await klickaBock("Anna Berg");
      await tillbaka();
      const rad = ark()!.querySelector('[data-falt-rad="anteckning"]')!;
      expect(anrop).toContain(rad);
      expect(efter("forare")).toBe("anteckning");
      await anteckna("Skrivet direkt efter förarvalet");
      expect(arkFalt("Anteckning (valfri)").value).toBe("Skrivet direkt efter förarvalet");
      await sattLangd(17);
      expect(efter("forare")).toBe("anteckning");                             // Överenskommen ligger före Förare, så Anteckning är fortfarande direkt under
    } finally { delete (Element.prototype as any).scrollIntoView; }
  });

  it("Överenskommen: tryck öppnar en datumväljare, datumet visas på raden (och går att ta bort); stängs inte av att man skriver datumet", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjPeriod("2026-10-05", "2027-01-25");               // över 16 veckor: raden finns
    await tryckRad("overenskommen");
    const d = panel("overenskommen")!.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(d).toBeTruthy();
    await skriv(d, "2026-10-12");
    expect(varde("overenskommen")).toBe("12 okt 2026");
    expect(panel("overenskommen")).toBeTruthy();
    expect((document.querySelector("[data-overenskommelse-krav]") as HTMLElement).style.color).toBe(farg(FARG.text2));   // datum finns: grått
    await klick("Ta bort datum");
    expect(varde("overenskommen")).toBe("—");
    expect((document.querySelector("[data-overenskommelse-krav]") as HTMLElement).style.color).toBe(farg(FARG.orange));  // saknas: orange
  });

  it("Spara är låst tills ett NAMN och minst en FÖRARE är valda — Från/Till är alltid giltiga, anteckning och överenskommelse behövs inte", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    expect(sparaKnapp().disabled).toBe(true);
    await namnge("abc");
    expect(sparaKnapp().disabled).toBe(true);                  // ingen förare
    expect(status()).toContain("Välj vilka perioden gäller");
    await tryckBock("Alla");
    expect(sparaKnapp().disabled).toBe(false);
    expect(status()).not.toContain("Välj vilka perioden gäller");
    await namnge("   ");
    expect(sparaKnapp().disabled).toBe(true);                  // bara blanksteg är inget namn
    await namnge("");
    expect(sparaKnapp().disabled).toBe(true);
    expect(skrivningar()).toHaveLength(0);
  });

  it("Spara skapar EN rad per vald förare i ett anrop: namn, veckor, anteckning, överenskommelse och skapad_av", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await namnge("  Skogsbruk  ");
    await valjPeriod("2026-10-19", "2027-02-08");               // 17 veckor: då finns Överenskommen-raden
    await tryckBock("Anna Berg");
    await tryckBock("Erik Lind");
    await anteckna("Skogsbruksplan, ojämn vecka");
    await tryckRad("overenskommen");
    await skriv(panel("overenskommen")!.querySelector<HTMLInputElement>('input[type="date"]')!, "2026-10-12");
    await spara();
    const s = skrivningar();
    expect(s).toHaveLength(1);
    expect(s[0].op).toBe("insert");
    const gemensamt = { startdatum: "2026-10-19", slutdatum: "2027-02-14", namn: "Skogsbruk", anteckning: "Skogsbruksplan, ojämn vecka", overenskommen_datum: "2026-10-12", skapad_av: "Inloggad Admin" };
    expect(s[0].vals).toEqual([{ ...gemensamt, medarbetare_id: "m1" }, { ...gemensamt, medarbetare_id: "m2" }]);
    expect(ark()).toBeNull();
    expect(rader().map(r => r.getAttribute("data-utjamning-rad"))).toEqual(["Skogsbruk"]);   // två rader, EN period i listan
  });

  it("Alla sparar EN rad med medarbetare_id NULL; utan anteckning och överenskommelse sparas '' och null", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await namnge("Hela laget");
    await tryckBock("Alla");
    await spara();
    expect(skrivningar()[0].vals).toEqual([{ startdatum: "2026-10-05", slutdatum: "2026-10-11", medarbetare_id: null, namn: "Hela laget", anteckning: "", overenskommen_datum: null, skapad_av: "Inloggad Admin" }]);
  });

  it("över 16 veckor: 'Kräver överenskommelse med lokal facklig organisation' vid fältet (orange utan datum, grått med) — aldrig en spärr, och inte 'arbetstagaren'", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await namnge("Lång");
    await tryckBock("Alla");
    await valjPeriod("2026-10-05", "2027-01-18");               // v41 2026 – v3 2027 = 16 veckor
    expect(langd()).toBe("16 v");
    expect(document.querySelector("[data-overenskommelse-krav]")).toBeNull();
    await valjPeriod("2026-10-05", "2027-01-25");
    expect(langd()).toBe("17 v");
    const krav = () => document.querySelector<HTMLElement>("[data-overenskommelse-krav]")!;
    expect(krav().textContent).toBe("Över 16 veckor kräver överenskommelse med lokal facklig organisation");
    expect(krav().style.color).toBe(farg(FARG.orange));        // datum saknas
    expect(arkText()).not.toContain("Längre än 16 veckor kräver lokal överenskommelse");   // den gamla, felaktiga texten
    expect(arkText()).not.toMatch(/arbetstagar/i);
    expect(sparaKnapp().disabled).toBe(false);                  // varning, aldrig spärr
    await tryckRad("overenskommen");
    await skriv(panel("overenskommen")!.querySelector<HTMLInputElement>('input[type="date"]')!, "2026-10-02");
    expect(krav().style.color).toBe(farg(FARG.text2));         // datum finns
  });

  // ── Befintliga perioder ──
  it("dagar i en annan period får en liten prick (periodens NAMN i data-krock, aldrig anteckningen); utan vald förare ingen", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA, NU);
    await monter("flik=avtal");
    await oppnaNy();
    await visaManad("2026-04-27");
    expect(dagEl("2026-04-27")!.getAttribute("data-krock")).toBeNull();
    await tryckBock("Alla");
    await visaManad("2026-04-27");                                    // månaden följer med tillbaka från förarlistan
    expect(dagEl("2026-04-27")!.getAttribute("data-krock")).toBe("Gävle");
    expect((dagEl("2026-04-27")!.textContent || "")).not.toContain("ordinarie tid utlagd ojämnt");
    expect(dagEl("2026-04-27")!.querySelector("[data-krock-prick]")).toBeTruthy();
    await visaManad("2026-07-06");
    expect(dagEl("2026-07-06")!.getAttribute("data-krock")).toBeNull();      // veckan efter Gävle
    await visaManad("2026-10-05");
    expect(dagEl("2026-10-05")!.getAttribute("data-krock")).toBe("Anna");
  });

  it("krockvarningen är EN grå rad: 'Krockar med Gävle v17–27 (alla)' — utan anteckning; Spara går att trycka", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, NU);
    await monter("flik=avtal");
    await oppnaNy();
    await tryckBock("Erik Lind");
    await valjPeriod("2026-04-13", "2026-04-27");
    expect(krockRad()!.textContent).toBe("Krockar med Gävle v17–27 (alla)");
    expect(document.querySelectorAll("[data-krock-varning]")).toHaveLength(1);
    expect(arkText()).not.toContain("ordinarie tid utlagd ojämnt");
    expect(krockRad()!.style.color).not.toBe(farg(FARG.orange));
    await namnge("Dubbel");
    expect(sparaKnapp().disabled).toBe(false);
    await spara();
    expect(skrivningar()).toHaveLength(1);
  });

  it("flera förare med samma period är EN post: 'Krockar med Gävle v17–27 (Anna, Erik)'", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await oppnaNy();
    await tryckBock("Alla");
    await valjPeriod("2026-04-20", "2026-04-27");
    expect(krockRad()!.textContent).toBe("Krockar med Gävle v17–27 (Anna, Erik)");
  });

  it("samma namn och samma veckor är ingen krock (samma period för andra förare); annat namn eller andra veckor är det", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA);
    await monter("flik=avtal");
    await oppnaNy();
    await tryckBock("Anna Berg");
    await valjPeriod("2026-04-20", "2026-06-29");               // 20 apr–5 jul, exakt som Gävle
    expect(krockRad()!.textContent).toBe("Krockar med Gävle v17–27 (Anna)");
    await namnge("gävle");                                       // samma namn (skiftläge spelar ingen roll) och samma veckor
    expect(krockRad()).toBeNull();
    await namnge("Annat");
    expect(krockRad()).not.toBeNull();
    await namnge("Gävle");
    await valjPeriod("2026-04-20", "2026-06-22");                // en vecka kortare
    expect(krockRad()!.textContent).toBe("Krockar med Gävle v17–27 (Anna)");
  });

  it("RLS stoppar skrivningen (0 rader utan fel): arket står kvar öppet med felet", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await namnge("RLS");
    await tryckBock("Alla");
    g.__ingaRader = true;
    await spara();
    expect(ark()).toBeTruthy();
    expect(arkText()).toContain("sparades inte");
    expect(arkText()).toContain("bara admin");
  });

  // ── Ändra: gäller hela gruppen ──
  it("ändra: arket visar gruppen som EN period — namn, Från/Till, 'N valda', överenskommelse; inga texter om 'den här raden'", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    expect(arkFalt("Namn").value).toBe("Gävle");
    expect(varde("borjar")).toBe("mån 20 apr · v17");           // Börjar = startdatum
    expect(langd()).toBe("11 v");                               // Längd = antal veckor
    expect(slutar()).toBe("Slutar sön 5 jul · v27");
    expect(kalender()).toBeNull();
    await oppnaBorjar();
    expect(synligManad()).toBe("2026-04");                      // Börjar öppnas på startmånaden …
    await oppnaRad("slutar");
    expect(synligManad()).toBe("2026-07");                      // … och Slutar på slutmånaden
    await oppnaBorjar();
    expect(dagEl("2026-04-20")!.getAttribute("data-start")).toBe("true");
    expect(dagEl("2026-04-30")!.getAttribute("aria-pressed")).toBe("true");
    expect(varde("forare")).toBe("Alla, Anna, Erik");            // Alla + Anna + Erik
    expect(radFalt("overenskommen")).toBeNull();                // 11 veckor: ingen överenskommelse krävs
    expect(arkFalt("Anteckning (valfri)").value).toBe("Gävle, ordinarie tid utlagd ojämnt");
    expect(arkText()).not.toContain("Ändringen gäller bara den här raden");
    expect(arkText()).not.toContain("Gäller ");
    expect(krockRad()).toBeNull();                              // gruppens egna rader krockar inte med varandra
  });

  it("ändra en period på högst 16 veckor som redan har ett datum: ingen Överenskommen-rad och ingen text om att det krävs (listan visar datumet)", async () => {
    g.__db.utjamningsperiod = kopia({ ...GAVLE_ANNA, overenskommen_datum: "2026-04-10" });
    await monter("flik=avtal");
    expect(sText()).toContain("Överenskommen 10 apr 2026");
    await klick("Gävle");
    expect(radFalt("overenskommen")).toBeNull();
    expect(document.querySelector("[data-overenskommelse-krav]")).toBeNull();
    await spara();
    expect(g.__db.utjamningsperiod[0].overenskommen_datum).toBe("2026-04-10");     // datumet rörs inte av ett sparande
  });

  it("ändra en grupp med bara personer: 'Anna Berg' och 'Erik Lind' bockade i listan", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    await tryckRad("forare");
    expect(ibockad("Anna Berg") && ibockad("Erik Lind")).toBe(true);
    expect(ibockad("Alla")).toBe(false);
  });

  it("ändra: EN uppdatering för alla rader i gruppen (namn, veckor, anteckning, överenskommelse), inga infogningar eller raderingar", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK, NU);
    await monter("flik=avtal");
    await klick("Gävle");
    await namnge("Gävle 2026");
    await valjPeriod("2026-04-20", "2026-08-17");               // 18 veckor: då finns Överenskommen-raden
    await anteckna("Ny anteckning");
    await tryckRad("overenskommen");
    await skriv(panel("overenskommen")!.querySelector<HTMLInputElement>('input[type="date"]')!, "2026-04-10");
    await spara();
    const s = skrivningar();
    expect(s).toHaveLength(1);
    expect(s[0].op).toBe("update");
    expect(s[0].vals).toEqual({ startdatum: "2026-04-20", slutdatum: "2026-08-23", namn: "Gävle 2026", anteckning: "Ny anteckning", overenskommen_datum: "2026-04-10" });
    const db = g.__db.utjamningsperiod;
    for (const id of ["g-anna", "g-erik"]) expect(db.find((r: any) => r.id === id)).toMatchObject({ namn: "Gävle 2026", slutdatum: "2026-08-23", overenskommen_datum: "2026-04-10" });
    expect(db.find((r: any) => r.id === "p-nu").namn).toBe("Anna");   // andra perioder rörs inte
    expect(db).toHaveLength(3);
    expect(ark()).toBeNull();
    expect(rader().map(r => r.getAttribute("data-utjamning-rad"))).toContain("Gävle 2026");
  });

  it("bocka ur en förare raderar den raden; de andra uppdateras", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    await tryckBock("Erik Lind");
    expect(varde("forare")).toBe("Anna");
    await spara();
    const ops = skrivningar().map((x: any) => x.op);
    expect(ops).toEqual(["update", "delete"]);
    expect(g.__db.utjamningsperiod.map((r: any) => r.id)).toEqual(["g-anna"]);
    expect(g.__db.utjamningsperiod[0].namn).toBe("Gävle");
  });

  it("bocka i en förare skapar en NY rad med gruppens namn, veckor, anteckning, överenskommelse och skapad_av", async () => {
    g.__db.utjamningsperiod = kopia({ ...GAVLE_ANNA, overenskommen_datum: "2026-04-10" });
    await monter("flik=avtal");
    await klick("Gävle");
    await tryckBock("Erik Lind");
    expect(varde("forare")).toBe("Anna, Erik");
    await spara();
    const ops = skrivningar().map((x: any) => x.op);
    expect(ops).toEqual(["update", "insert"]);
    const ny = skrivningar()[1].vals;
    expect(ny).toEqual([{ startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: "m2", namn: "Gävle", anteckning: "Gävle, ordinarie tid utlagd ojämnt", overenskommen_datum: "2026-04-10", skapad_av: "Inloggad Admin" }]);
    expect(g.__db.utjamningsperiod).toHaveLength(2);
    expect(rader()).toHaveLength(1);                             // fortfarande EN period i listan
  });

  it("Alla ur bocken raderar NULL-raden (Gävle-gruppens dubblett) och lämnar personraderna; Alla på rensar personerna", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    await tryckRad("forare");
    expect(ibockad("Alla") && ibockad("Anna Berg") && ibockad("Erik Lind")).toBe(true);   // som i prod: en NULL-rad OCH personrader
    await klickaBock("Alla");
    expect(ibockad("Alla")).toBe(false);
    expect(ibockad("Anna Berg") && ibockad("Erik Lind")).toBe(true);                     // personerna rörs inte
    await klar();
    expect(varde("forare")).toBe("Anna, Erik");
    await spara();
    expect(skrivningar().map((x: any) => x.op)).toEqual(["update", "delete"]);
    expect(g.__db.utjamningsperiod.map((r: any) => r.id)).toEqual(["g-anna", "g-erik"]);
  });

  it("en person ur bocken rör inte Alla (annars försvinner NULL-raden av misstag)", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    await oppnaForare();
    await klickaBock("Erik Lind");
    expect(ibockad("Alla")).toBe(true);
    expect(ibockad("Erik Lind")).toBe(false);
    await klar();
    await spara();
    expect(g.__db.utjamningsperiod.map((r: any) => r.id).sort()).toEqual(["g-alla", "g-anna"]);
  });

  it("RLS stoppar uppdateringen (0 rader): felet står, inget raderas eller läggs till", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    await tryckBock("Erik Lind");
    g.__ingaRader = true;
    await spara();
    expect(ark()).toBeTruthy();
    expect(arkText()).toContain("sparades inte");
    expect(skrivningar().map((x: any) => x.op)).toEqual(["update"]);        // stannar efter första misslyckade steget
    g.__ingaRader = false;
    expect(g.__db.utjamningsperiod).toHaveLength(2);
  });

  // ── Ta bort = alla rader i gruppen ──
  it("ta bort tar bort ALLA rader i gruppen, med bekräftelse; Avbryt raderar inget", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE, GAVLE_ANNA, GAVLE_ERIK, NU);
    await monter("flik=avtal");
    await klick("Gävle");
    await klick("Ta bort");
    expect(arkText()).toContain("Ta bort perioden Gävle v17–27");
    expect(arkText()).toContain("3 rader");
    expect(g.__skriv.filter((x: any) => x.op === "delete")).toHaveLength(0);
    await klick("Behåll");
    expect(g.__db.utjamningsperiod).toHaveLength(4);
    await klick("Ta bort");
    await klick("Ja, ta bort");
    const dels = g.__skriv.filter((x: any) => x.op === "delete");
    expect(dels).toHaveLength(1);                                // ett anrop
    expect(g.__db.utjamningsperiod.map((r: any) => r.id)).toEqual(["p-nu"]);
    expect(ark()).toBeNull();
    expect(rader().map(r => r.getAttribute("data-utjamning-rad"))).toEqual(["Anna"]);
  });

  it("en period med en enda rad: bekräftelsen säger inte 'rader'", async () => {
    g.__db.utjamningsperiod = kopia(NU);
    await monter("flik=avtal");
    await klick("Anna");
    await klick("Ta bort");
    expect(arkText()).toContain("Ta bort perioden Anna v41–42");
    expect(arkText()).not.toMatch(/\d+ rader/);
  });

  it("ta bort nekas om NÅGON rad i gruppen berört en redan exporterad löneperiod: ingenting raderas och skälet står", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK);
    g.__db.fortnox_export_logg = [{ medarbetare_id: "m2", status: "skickat", period: "2026-06" }];
    await monter("flik=avtal");
    await klick("Gävle");
    await klick("Ta bort");
    expect(arkText()).toContain("kan inte tas bort");
    expect(arkText()).toContain("2026-06");
    expect(blad("Ja, ta bort").length).toBe(0);
    expect(g.__skriv.filter((x: any) => x.op === "delete")).toHaveLength(0);
    expect(g.__db.utjamningsperiod).toHaveLength(2);
  });

  it("export för en förare som INTE finns i gruppen hindrar inte borttagningen", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA);
    g.__db.fortnox_export_logg = [{ medarbetare_id: "m2", status: "skickat", period: "2026-06" }];
    await monter("flik=avtal");
    await klick("Gävle");
    await klick("Ta bort");
    expect(blad("Ja, ta bort").length).toBe(1);
  });

  it("kan exportloggen inte läsas nekas borttagningen också (ett okänt läge är inte 'ingen export')", async () => {
    g.__db.utjamningsperiod = kopia(NU);
    g.__dbFel = { fortnox_export_logg: "timeout" };
    await monter("flik=avtal");
    await klick("Anna");
    await klick("Ta bort");
    expect(arkText()).toContain("Kunde inte kontrollera om lönen är exporterad");
    expect(blad("Ja, ta bort").length).toBe(0);
    expect(g.__db.utjamningsperiod).toHaveLength(1);
  });

  it("borttagning som RLS stoppar (0 rader) säger det och behåller raderna i listan", async () => {
    g.__db.utjamningsperiod = kopia(GAVLE_ANNA, GAVLE_ERIK);
    await monter("flik=avtal");
    await klick("Gävle");
    await klick("Ta bort");
    g.__ingaRader = true;
    await klick("Ja, ta bort");
    expect(arkText()).toContain("togs inte bort");
    expect(g.__db.utjamningsperiod).toHaveLength(2);
  });

  // ── Martins tre fel i preview jxt707f10 (2026-10-12) ──
  it("Lägg till är GRÅ — inte blå — tills namn, Börjar och förare är satta; blå först när alla tre finns (testen kollade förut bara disabled, aldrig färgen)", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const grå = farg(FARG.text3), blå = farg(FARG.bla);
    expect(grå).not.toBe(blå);
    const knappFarg = () => sparaKnapp().style.color;
    // Börjar är satt från början (veckan vi är i) — det är namnet och förarna som saknas
    expect(varde("borjar")).toContain("v41");
    expect(sparaKnapp().disabled).toBe(true);
    expect(knappFarg()).toBe(grå);
    expect(sparaKnapp().style.opacity).toBe("");                      // grå text, inte blå som dämpats
    await namnge("Test");
    expect(sparaKnapp().disabled).toBe(true);                         // förare saknas
    expect(knappFarg()).toBe(grå);
    await tryckBock("Alla");
    expect(sparaKnapp().disabled).toBe(false);
    expect(knappFarg()).toBe(blå);
    await tryckBock("Alla");                                          // förarna bort igen → grå igen
    expect(knappFarg()).toBe(grå);
    await tryckBock("Anna Berg");
    expect(knappFarg()).toBe(blå);
    await namnge("");                                                 // namnet bort → grå igen
    expect(sparaKnapp().disabled).toBe(true);
    expect(knappFarg()).toBe(grå);
  });

  it("Spara i en befintlig period är också grå när namnet tas bort, och blå när det finns", async () => {
    g.__db.utjamningsperiod = kopia(SENARE);
    await monter("flik=avtal");
    await klick("Vinter");
    expect(sparaKnapp().style.color).toBe(farg(FARG.bla));
    await namnge("");
    expect(sparaKnapp().disabled).toBe(true);
    expect(sparaKnapp().style.color).toBe(farg(FARG.text3));
    await namnge("Vinter");
    expect(sparaKnapp().style.color).toBe(farg(FARG.bla));
  });

  it("Namn-fältet är tomt: ingen platshållare (inget 't.ex. Gävle' som ser ifyllt ut)", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    expect(arkFalt("Namn").value).toBe("");
    expect(arkFalt("Namn").getAttribute("placeholder")).toBeNull();
    expect(arkText()).not.toContain("t.ex.");
  });

  it("Börjar v42, Slutar v47 (22 nov): ‹ › byter månad, bandet löper över månadsskiftet (12 okt–22 nov); två snabba tryck på › ger två månader", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    await valjBorjar("2026-10-12");                                   // måndag v42
    await valjSlut("2026-11-22");                                     // söndag v47
    expect((document.querySelector("[data-veckor]")!.textContent || "").trim()).toBe("6 veckor");
    expect(slutar()).toBe("Slutar sön 22 nov · v47");
    await oppnaRad("borjar");
    expect(synligManad()).toBe("2026-10");
    const tryckt = (d: string) => dagEl(d)?.getAttribute("aria-pressed");
    expect(dagEl("2026-10-12")!.getAttribute("data-start")).toBe("true");
    expect(tryckt("2026-10-11")).toBe("false");
    expect(tryckt("2026-10-31")).toBe("true");                        // bandet når oktobers slut …
    await klickEl(knappMed("Nästa månad"));                           // › : november
    expect(synligManad()).toBe("2026-11");
    for (let d = 1; d <= 22; d++) expect(tryckt(`2026-11-${String(d).padStart(2, "0")}`), `${d} nov`).toBe("true");   // … och fortsätter över skiftet
    expect(tryckt("2026-11-23")).toBe("false");
    await klickEl(knappMed("Nästa månad"));                           // december: inget band
    expect(Array.from(document.querySelectorAll("[data-utjamning-ark] [data-dag]")).filter(e => e.getAttribute("aria-pressed") === "true")).toHaveLength(0);
    await klickEl(knappMed("Föregående månad")); await klickEl(knappMed("Föregående månad"));   // ‹ ‹ : oktober
    expect(synligManad()).toBe("2026-10");
    await act(async () => { knappMed("Nästa månad").click(); knappMed("Nästa månad").click(); });   // två tryck innan något ritats om
    expect(synligManad()).toBe("2026-12");
    await act(async () => { knappMed("Föregående månad").click(); knappMed("Föregående månad").click(); knappMed("Föregående månad").click(); });
    expect(synligManad()).toBe("2026-09");
  });

  it("raden Förare öppnar förarlistan INNE i arket med '‹' — den navigerar aldrig bort (varken till Ny medarbetare eller något annat)", async () => {
    await monter("flik=avtal");
    const adressFore = window.location.search;
    await oppnaNy();
    await tryckRad("forare");
    expect(ark()).not.toBeNull();
    expect(document.querySelector("[data-forare-vy]")).not.toBeNull();
    expect(tillbakaKnapp()!.getAttribute("aria-label")).toBe("Tillbaka till Ny period");
    expect(arkText()).toContain("Förare");
    expect(window.location.search).toBe(adressFore);                  // adressen rörd: ingen ?ny=1, ingen annan flik
    expect(window.location.search).not.toContain("ny=1");
    expect(document.body.textContent).not.toContain("Steg 1 av 4");   // Ny medarbetare-guiden
    expect(document.body.textContent).toContain("Utjämningsperioder"); // Avtal-fliken ligger kvar bakom
    await tillbaka();
    expect(document.querySelector("[data-forare-vy]")).toBeNull();
    expect(arkText()).toContain("Ny period");
    expect(window.location.search).not.toContain("ny=1");
  });

  it("medan arket är öppet är sidan bakom (sidomenyn med 'Ny medarbetare', bottenmenyn, innehållet) inert + aria-hidden, och fokus ligger i dialogen; stängs arket är allt som förut och fokus tillbaka", async () => {
    await monter("flik=avtal");
    const nyPeriod = Array.from(cont.querySelectorAll<HTMLButtonElement>("button")).find(b => (b.textContent || "").trim() === "Ny period")!;
    const gomdaFore = document.querySelectorAll("[aria-hidden='true']").length;     // ikoner o.d. som redan var dolda
    nyPeriod.focus();
    expect(document.activeElement).toBe(nyPeriod);
    await oppnaNy();
    const sidomeny = cont.querySelector<HTMLElement>("aside.adm-meny")!;
    const nyMedarbetare = Array.from(sidomeny.querySelectorAll<HTMLButtonElement>("button")).find(b => (b.textContent || "").includes("Ny medarbetare"))!;
    expect(nyMedarbetare).toBeTruthy();
    const bakom = (el: Element) => { for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) if (n.hasAttribute("inert")) return n; return null; };
    expect(bakom(nyMedarbetare), "Ny medarbetare ska ligga bakom inert").not.toBeNull();
    expect(nyMedarbetare.closest("[aria-hidden='true']")).not.toBeNull();
    expect(bakom(ark()!)).toBeNull();                                   // arket självt är aldrig inert
    expect(overlay()!.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(ark());                         // fokus in i dialogen
    expect(ark()!.getAttribute("role")).toBe("dialog");
    // förarlistan (innehållet byts i samma ark) behåller skyddet
    await tryckRad("forare");
    expect(bakom(nyMedarbetare)).not.toBeNull();
    await tillbaka();
    expect(bakom(nyMedarbetare)).not.toBeNull();
    // stäng → tillbaka som förut
    await klickEl(Array.from(ark()!.querySelectorAll<HTMLButtonElement>("button")).find(b => (b.textContent || "").trim() === "Avbryt")!);
    expect(ark()).toBeNull();
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
    expect(document.querySelectorAll("[aria-hidden='true']").length).toBe(gomdaFore);
    expect(document.activeElement).toBe(nyPeriod);                       // fokus till knappen som öppnade arket
  });

  it("arket SITTER FAST: förankrat uppifrån, aldrig centrerat, fast höjd — samma stil i formuläret, med kalendern utfälld, vid Längd 20 v och i förarlistan; rubrikraden står still och innehållet rullar inuti", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const ovl = () => overlay()!;
    const lage = () => ({ overlay: ovl().getAttribute("style"), dialog: ark()!.getAttribute("style"), klass: ark()!.className });
    const forsta = lage();
    // förankrad uppifrån under toppfältet, inte centrerad
    expect(ovl().style.alignItems).toBe("flex-start");
    expect(ovl().style.alignItems).not.toBe("center");
    // fast höjd ur en klass (inte ur innehållet): ingen inline height/max-height som kan följa innehållet
    expect(ark()!.className).toContain("ark-dialog");
    expect(ark()!.style.height).toBe("");
    expect(ark()!.style.maxHeight).toBe("");
    const css = ovl().querySelector("style")!.textContent || "";
    expect(css).toMatch(/\.ark-dialog\s*\{[^}]*height:\s*calc\(100dvh/);            // telefon: nästan hela fönstret under toppfältet
    expect(css).toMatch(/min-width:\s*760px[^}]*\{[^}]*height:\s*min\(85dvh/);        // dator: högst 85 %
    // rubrikraden ligger utanför det som rullar; innehållet rullar inuti
    const rubrik = ark()!.querySelector<HTMLElement>("[data-ark-rubrik]")!;
    const innehall = ark()!.querySelector<HTMLElement>("[data-ark-innehall]")!;
    expect(innehall.style.overflowY).toBe("auto");
    expect(innehall.contains(rubrik)).toBe(false);
    expect(sparaKnapp() && rubrik.contains(sparaKnapp())).toBe(true);        // Lägg till rullar aldrig bort
    // kalendern utfälld
    await oppnaBorjar();
    expect(lage()).toEqual(forsta);
    // Längd 20 v (orange läge, överenskommelse-raden dyker upp)
    await sattLangd(20);
    expect(lage()).toEqual(forsta);
    await tryckRad("overenskommen");
    expect(lage()).toEqual(forsta);
    // förarlistan och tillbaka
    await tryckRad("forare");
    expect(document.querySelector("[data-forare-vy]")).not.toBeNull();
    expect(lage()).toEqual(forsta);
    await tillbaka();
    expect(lage()).toEqual(forsta);
  });

  it("andra trycket i ett DUBBELKLICK sväljs strax efter ett vybyte: Förare → ingen förare vald, ‹ Ny period → Avbryt stänger inte arket; senare snabba tryck (›) går igenom", async () => {
    await monter("flik=avtal");
    await oppnaNy();
    const dubbel = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 })); }); };
    // Förare-raden: andra klicket hamnar på listan (en förare ligger på samma plats)
    await tryckRad("forare");
    await dubbel(bock("Anna Berg"));
    expect(ibockad("Anna Berg")).toBe(false);
    await klickaBock("Anna Berg");                                           // ett enkelt tryck räknas
    expect(ibockad("Anna Berg")).toBe(true);
    // ‹ Ny period: andra klicket hamnar på Avbryt
    await tillbaka();
    await dubbel(Array.from(ark()!.querySelectorAll<HTMLButtonElement>("button")).find(b => (b.textContent || "").trim() === "Avbryt")!);
    expect(ark()).not.toBeNull();
    // … och arket byter höjd när innehållet byts (förarlistan är lägre), så andra klicket kan hamna UTANFÖR dialogen, på bakgrunden, som annars stänger arket
    // (mätt i Chrome: 13 ms mellan trycken, andra trycket på överlägget, arket borta)
    await tryckRad("forare");
    await tillbaka();
    await dubbel(overlay()!);
    expect(ark()).not.toBeNull();
    await klickEl(overlay()!);                                          // ett vanligt tryck på bakgrunden stänger fortfarande (efter fönstret: ett enkelt klick räknas alltid)
    expect(ark()).toBeNull();
    await oppnaNy();
    // en bra stund senare: snabba tryck på › (detail 2, 3, 4 …) räknas alla
    await oppnaBorjar();
    const nu = Date.now();
    const spion = vi.spyOn(Date, "now").mockReturnValue(nu + 5000);
    try {
      const fore = synligManad();
      for (const detail of [2, 3, 4]) await act(async () => { knappMed("Nästa månad").dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });
      expect(synligManad()).not.toBe(fore);
      expect(synligManad()).toBe("2027-01");                            // 2026-10 + 3 månader
    } finally { spion.mockRestore(); }
  });
});

describe("ATK-godkännande", () => {
  const valRad = () => ({ id: "k1", medarbetare_id: "m1", period: "2026", val: "kontant", timmar: 40, belopp: 8000, datum_valt: "2026-06-12", status: "bekräftad" });
  it("godkänn skriver och visar GODKÄND", async () => {
    g.__db.atk_val = [valRad()];
    await monter("flik=lon&underflik=atk");
    await klick("Godkänn");
    expect(g.__db.atk_val[0].status).toBe("godkand");
    expect(text()).toContain("Godkänd");
  });
  it("0 rader träffades → felet står och valet står kvar som VÄNTAR", async () => {
    g.__db.atk_val = [valRad()];
    await monter("flik=lon&underflik=atk");
    g.__ingaRader = true;
    await klick("Godkänn");
    expect(text()).toContain("Ändringen sparades inte");
    expect(text()).toContain("Väntar");
    expect(text()).not.toContain("Godkänd");
  });
});

describe("Lönesystem", () => {
  it("anställningsnummer: ändra befintligt skriver utan kolumnen 'uppdaterad' (finns inte i prod) och raden är ändrad", async () => {
    g.__avvisaKolumner = { medarbetare_lonesystem: ["uppdaterad"], lonesystem_artikelmappning: ["uppdaterad"] };
    await monter("flik=lon&underflik=system");
    const rad = radMed("Anna Berg");
    await skriv(rad.querySelector("input")!, "2002");
    await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(g.__db.medarbetare_lonesystem.find((r: any) => r.medarbetare_id === "m1").anstallningsnummer).toBe("2002");
    expect(text()).not.toContain("schema cache");
  });
  it("anställningsnummer: ny person får en rad (insert)", async () => {
    g.__avvisaKolumner = { medarbetare_lonesystem: ["uppdaterad"] };
    await monter("flik=lon&underflik=system");
    const rad = radMed("Erik Lind");
    await skriv(rad.querySelector("input")!, "3003");
    await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    const ny = g.__db.medarbetare_lonesystem.find((r: any) => r.medarbetare_id === "m2");
    expect(ny.anstallningsnummer).toBe("3003");
    expect(ny.lonesystem_id).toBe("ls1");
  });
  it("anställningsnummer: 0 rader träffades → felet står på raden", async () => {
    await monter("flik=lon&underflik=system");
    const rad = radMed("Anna Berg");
    await skriv(rad.querySelector("input")!, "2002");
    g.__ingaRader = true;
    await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(text()).toContain("Ändringen sparades inte");
  });
  it("löneartskod: ändra befintlig skriver utan 'uppdaterad'", async () => {
    g.__avvisaKolumner = { lonesystem_artikelmappning: ["uppdaterad"] };
    await monter("flik=lon&underflik=system");
    const rad = radMed("Timlön");
    const inp = rad.querySelectorAll("input")[0] as HTMLInputElement;
    await skriv(inp, "12");
    await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(g.__db.lonesystem_artikelmappning.find((r: any) => r.intern_typ === "timlon").extern_kod).toBe("12");
  });
  it("koppla ifrån: egen bekräftelse i sidan, ingen window.confirm, inget anrop förrän man svarar ja", async () => {
    const conf = vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("window.confirm anropades"); });
    await monter("flik=lon&underflik=system");
    await klick("Koppla ifrån");
    expect(conf).not.toHaveBeenCalled();
    expect(g.__fetchAnrop.some((a: string[]) => a[0].includes("/disconnect"))).toBe(false);
    expect(text()).toContain("Koppla ifrån Fortnox?");
    await klick("Ja, koppla ifrån");
    expect(g.__fetchAnrop.some((a: string[]) => a[0].includes("/disconnect"))).toBe(true);
  });
});

describe("Löneunderlag", () => {
  const tl = (datum: string, id = "m1") => ({ medarbetare_id: id, datum, tidigarelagd_start: { gap_min: 45, kvitterad: false, angiven_start: "05:00", maskin_start: "05:45", aktivitet: null } });
  it("ingen kronalista: inget Sammanlagt, inget Per medarbetare, ingen CSV, inga kronor", async () => {
    g.__db.arbetsdag = [{ medarbetare_id: "m1", datum: "2026-10-02", arbetad_min: 480, km_morgon: 22, km_kvall: 22, km_totalt: 44, traktamente: false, bekraftad: true, dagtyp: null }];
    await monter("flik=lon");
    const t = text();
    expect(t).not.toContain("Sammanlagt");
    expect(t).not.toContain("Per medarbetare");
    expect(t).not.toContain("Exportera CSV");
    expect(t).not.toContain("Körersättning");
    expect(t).not.toMatch(/\d\s?kr\b/);
  });
  it("Fortnox-granskningen är innehållet, och visas även när månaden saknar arbetsdagar", async () => {
    await monter("flik=lon");
    expect(text()).toContain("Går till Fortnox");
    expect(text()).toContain("arbetstid september 2026");
    expect(blad("Skicka till Fortnox").length).toBeGreaterThan(0);
  });
  it("'Maskinstart senare än angiven' gäller ARBETSMÅNADEN (september) — samma som granskningen under löneperiod oktober", async () => {
    g.__db.arbetsdag = [tl("2026-09-03"), tl("2026-09-04"), tl("2026-09-07"), tl("2026-10-02", "m2")];
    await monter("flik=lon");
    expect(text()).toContain("Maskinstart senare än angiven · september 2026");
    expect(text()).toContain("Anna Berg");
    expect(text()).not.toContain("Erik Lind"); // hans enda dag ligger i oktober = fel månad
  });
});

describe("Vilobrott-fliken läser förarens svar", () => {
  const dagar = [
    { medarbetare_id: "m1", datum: "2026-09-28", start_tid: "05:00:00", slut_tid: "20:30:00", arbetad_min: 600 },
    { medarbetare_id: "m1", datum: "2026-09-29", start_tid: "05:00:00", slut_tid: "15:30:00", arbetad_min: 600 },
  ];
  // Underlaget ger ett dygnsvilo- OCH ett veckovilobrott (8,5 h mellan två pass).
  const alla = () => analyseraVilobrott(medPerioddagSpann(dagar as any, []), vilaTrosklarFromAvtal(AVTAL as any));
  it("förutsättning: underlaget ger ett dygnsvilobrott och ett veckovilobrott", () => {
    expect(alla().map(b => b.typ).sort()).toEqual(["dygnsvila", "veckovila"]);
  });

  it("obesvarade brott: räknas och står rött som obesvarade", async () => {
    g.__db.arbetsdag = dagar.map(d => ({ ...d }));
    await monter("flik=lon&underflik=vila");
    expect(text()).toContain("2 obesvarade");
    expect(text()).not.toContain("Besvarat:");
  });
  it("ett besvarat brott: grått med svaret ('Besvarat: Planerat enligt avtal'), det andra är kvar som obesvarat", async () => {
    g.__db.arbetsdag = dagar.map(d => ({ ...d }));
    const b = alla().find(x => x.typ === "dygnsvila")!;
    g.__db.vilobrott = [{ id: "v1", medarbetare_id: "m1", datum: b.datum, typ: b.typ, vila_h: b.vila_h, krav_h: b.krav_h, besvarat_av_forare: true, orsak: "planerad_avtal", orsak_fritext: null }];
    await monter("flik=lon&underflik=vila");
    expect(text()).toContain("Besvarat: Planerat enligt avtal");
    expect(text()).toContain("1 obesvarat");
    expect(text()).toContain("1 besvarade");
  });
  it("alla brott besvarade: inget rött kvar, 'alla besvarade'", async () => {
    g.__db.arbetsdag = dagar.map(d => ({ ...d }));
    g.__db.vilobrott = alla().map((b, i) => ({ id: `v${i}`, medarbetare_id: "m1", datum: b.datum, typ: b.typ, vila_h: b.vila_h, krav_h: b.krav_h, besvarat_av_forare: true, orsak: "akut_jour", orsak_fritext: null }));
    await monter("flik=lon&underflik=vila");
    expect(text()).toContain("alla besvarade");
    expect(text()).not.toMatch(/\d obesvarat/);
    expect(text()).toContain("Besvarat: Akut situation");
  });
  it("PDF: blockeras fönstret står det i sidan — ingen alert", async () => {
    g.__db.arbetsdag = dagar.map(d => ({ ...d }));
    const al = vi.spyOn(window, "alert").mockImplementation(() => { throw new Error("alert anropades"); });
    vi.spyOn(window, "open").mockImplementation(() => null);
    await monter("flik=lon&underflik=vila");
    await klick("Exportera PDF för Arbetsmiljöverket");
    expect(al).not.toHaveBeenCalled();
    expect(text()).toContain("Kunde inte öppna PDF-fönstret");
  });
});


/* ─────────────────────────── Ny medarbetare: ett flöde, fyra steg ─────────────────────────── */

const falt = (label: string) => {
  const l = Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find(e => (e.textContent || "").trim() === label);
  if (!l) throw new Error("hittar inget fält: " + label + " — sidan säger: " + text().slice(0, 300));
  return document.getElementById(l.htmlFor) as HTMLInputElement;
};
const valFalt = (label: string) => falt(label) as unknown as HTMLSelectElement;
async function valj(sel: HTMLSelectElement, v: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, v);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
/**
 * Geokodningens svar i fake-databasen: en punkt på adressnivå (obekräftad tills admin stämt av den), eller bara byn:
 * då sparas bara förslaget och ingen hempunkt (Kompersmåla Gård 362 96).
 */
function geokodSvar(nivå: "adress" | "ort") {
  g.__geokod = (b: any) => {
    const m = g.__db.medarbetare.find((x: any) => x.id === b.id);
    if (nivå === "adress") Object.assign(m, { hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_geokod_etikett: "Björkvägen 4, Ryd", hem_geokod_precision: "address", hem_bekraftad_tid: null });
    else Object.assign(m, { hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_geokod_status: "osaker", hem_geokod_etikett: "Kompersmåla, Almundsryd", hem_geokod_precision: "locality", hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333 });
    return { ok: true };
  };
}
const nyPerson = (extra: Record<string, any> = {}) => {
  const rad = { id: "n1", namn: "Nils Ek", epost: "nils@example.se", hemadress: null, roll: "forare", maskin_id: null, anstallningsdatum: null, timlon_kr: null, manadslon_kr: null, user_id: null, hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_geokod_status: null, hem_geokod_etikett: null, hem_geokod_precision: null, hem_geokod_lat: null, hem_geokod_lng: null, hem_bekraftad_tid: null, ...extra };
  g.__db.medarbetare.push(rad);
  return rad;
};
const stegRad = (namn: string) => Array.from(cont.querySelectorAll<HTMLElement>("[data-steg]")).find(e => (e.textContent || "").includes(namn))!;

describe("Ny medarbetare: fyra steg, ett i taget", () => {
  it("stapel överst, stegen i en lista under den, inga ✓ innan något är gjort", async () => {
    await monter("flik=medarbetare&ny=1");
    expect(text()).toContain("Steg 1 av 4");
    const rader = Array.from(cont.querySelectorAll("[data-steg]")).map(e => (e.textContent || "").replace(/\s+/g, " ").trim());
    expect(rader).toHaveLength(4);
    expect(rader.join("|")).toMatch(/Namn och e-post.*\|.*Hemadress.*\|.*Maskin och operatör.*\|.*Anställningsnummer/);
    expect(cont.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("0");
    expect(cont.querySelectorAll("[data-klar=true]").length).toBe(0);
  });

  it("steg 1: namn och e-post sparas när man går vidare (personen finns då), och man hamnar på steg 2", async () => {
    await monter("flik=medarbetare&ny=1");
    await skriv(falt("Namn"), "Nils Ek");
    await skriv(falt("E-post"), "nils@example.se");
    await klick("Spara och fortsätt");
    const ny = g.__db.medarbetare.find((m: any) => m.namn === "Nils Ek");
    expect(ny).toMatchObject({ epost: "nils@example.se", roll: "forare" });
    expect(window.location.search).toContain(`person=${ny.id}`);
    expect(window.location.search).toContain("steg=2");
    expect(text()).toContain("Steg 2 av 4");
    expect(stegRad("Namn och e-post").getAttribute("data-klar")).toBe("true");
  });

  it("steg 1: namn krävs, och en skrivning som RLS stoppar (0 rader) står som fel — ingen person och inget steg 2", async () => {
    await monter("flik=medarbetare&ny=1");
    await skriv(falt("Namn"), "Nils Ek");
    g.__ingaRader = true;
    await klick("Spara och fortsätt");
    expect(text()).toContain("sparades inte");
    expect(text()).toContain("Steg 1 av 4");
    expect(g.__db.medarbetare.some((m: any) => m.namn === "Nils Ek")).toBe(false);
  });

  it("steg 2: adressen geokodas direkt, kartan visar punkten och etiketten, och Nästa är öppen då punkten finns", async () => {
    nyPerson();
    geokodSvar("adress");
    await monter("flik=medarbetare&ny=1&person=n1&steg=2");
    expect(text()).toContain("Steg 2 av 4");
    expect(blad("Nästa")[0].closest("button")!.disabled).toBe(true);
    await skriv(falt("Hemadress"), "Björkvägen 4, Ryd");
    await klick("Hitta adressen");
    expect(g.__db.medarbetare.find((m: any) => m.id === "n1").hemadress).toBe("Björkvägen 4, Ryd");
    expect(g.__geokodAnrop).toEqual([{ id: "n1" }]);
    expect(text()).toContain("Punkten är från adressen");
    expect(text()).toContain("exakt adress");
    expect(text()).toContain("Björkvägen 4, Ryd");
    expect(g.__karta.punkt()).toEqual([14.7, 56.4]);
    expect(blad("Stämmer").length).toBe(1);
    expect(blad("Nästa")[0].closest("button")!.disabled).toBe(false);
    await klick("Nästa");
    expect(text()).toContain("Steg 3 av 4");
    expect(window.location.search).toContain("steg=3");
  });

  it("steg 2: bara byn hittades (Kompersmåla Gård 362 96) → INGEN nål, 'Tryck på huset', Spara inaktiv; ett tryck ger nål och Nästa öppnas", async () => {
    nyPerson({ hemadress: "Kompersmåla Gård 362 96" });
    geokodSvar("ort");
    await monter("flik=medarbetare&ny=1&person=n1&steg=2");
    await klick("Hitta adressen");
    expect(g.__db.medarbetare.find((m: any) => m.id === "n1").hem_lat).toBeNull();
    expect(text()).toContain("Tryck på huset");
    expect(text()).toContain("Kompersmåla, Almundsryd");
    expect(g.__karta.markorer).toHaveLength(0);
    expect(blad("Stämmer").length).toBe(0);
    expect(blad("Spara punkten")[0].closest("button")!.disabled).toBe(true);
    expect(blad("Nästa")[0].closest("button")!.disabled).toBe(true);
    g.__karta.tryck(56.3939, 14.7729);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(g.__karta.punkt()).toEqual([14.7729, 56.3939]);
    await klick("Spara punkten");
    expect(g.__hempunktAnrop).toEqual([{ id: "n1", atgard: "flytta", lat: 56.3939, lng: 14.7729 }]);
    expect(g.__db.medarbetare.find((m: any) => m.id === "n1")).toMatchObject({ hem_lat: 56.3939, hem_koord_kalla: "manuell" });
    expect(blad("Nästa")[0].closest("button")!.disabled).toBe(false);
  });

  it("steg 3: maskinen sparas, och en okänd operatör med personens namn föreslås med en knapp", async () => {
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "geokod", hem_geokod_status: "ok" });
    g.__kontroller = { ok: true, okandaOperatorer: [{ operator_id: "OP-5", operator_namn: "Nils E", maskin_id: "R64101", datum: ["2026-10-01", "2026-10-02"], medarbetare: { id: "n1", namn: "Nils Ek" } }], forareUtanMaskin: [], saknarHempunkt: [] };
    await monter("flik=medarbetare&ny=1&person=n1&steg=3");
    expect(text()).toContain("Steg 3 av 4");
    expect(text()).toContain('Operatören "Nils E"');
    expect(blad("Koppla till Nils Ek och bygg dagarna").length).toBe(1);
    await valj(valFalt("Maskin"), "R64101");
    await klick("Spara och fortsätt");
    expect(g.__db.medarbetare.find((m: any) => m.id === "n1").maskin_id).toBe("R64101");
    expect(text()).toContain("Steg 4 av 4");
  });

  it("steg 3: finns ingen operatör än står det varför och att Översikten föreslår kopplingen när personen kört", async () => {
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7 });
    await monter("flik=medarbetare&ny=1&person=n1&steg=3");
    expect(text()).toContain("dyker upp i maskinfilerna");
    expect(text()).toContain("Översikten");
  });

  it("steg 4: anställningsnumret sparas på kopplingen (utan kolumnen uppdaterad) och personen öppnas med alla steg klara", async () => {
    g.__avvisaKolumner = { medarbetare_lonesystem: ["uppdaterad"] };
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, maskin_id: "R64101" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=4");
    expect(text()).toContain("Steg 4 av 4");
    await skriv(falt("Anställningsnummer"), "4711");
    await klick("Klar");
    const rad = g.__db.medarbetare_lonesystem.find((r: any) => r.medarbetare_id === "n1");
    expect(rad).toMatchObject({ anstallningsnummer: "4711", lonesystem_id: "ls1" });
    expect(window.location.search).toContain("person=n1");
    expect(window.location.search).not.toContain("ny=1");
    expect(text()).toContain("Personuppgifter");
  });

  it("avbryta och fortsätta: stegen ✓ härleds ur det som är sparat, och flödet öppnas på första ogjorda steget", async () => {
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7 });
    await monter("flik=medarbetare&ny=1&person=n1");
    expect(text()).toContain("Steg 3 av 4");
    expect(stegRad("Namn och e-post").getAttribute("data-klar")).toBe("true");
    expect(stegRad("Hemadress").getAttribute("data-klar")).toBe("true");
    expect(stegRad("Maskin och operatör").getAttribute("data-klar")).toBeNull();
    expect(cont.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("2");
  });

  it("utan hempunkt är steg 2 det första ogjorda: flödet öppnas där och hempunkten räknas inte som klar", async () => {
    nyPerson();
    await monter("flik=medarbetare&ny=1&person=n1");
    expect(text()).toContain("Steg 2 av 4");
    expect(stegRad("Hemadress").getAttribute("data-klar")).toBeNull();
    expect(cont.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("1");
  });

  it("steg 4: ett befintligt nummer ändras på samma rad (update, utan uppdaterad-kolumnen)", async () => {
    g.__avvisaKolumner = { medarbetare_lonesystem: ["uppdaterad"] };
    await monter("flik=medarbetare&ny=1&person=m1&steg=4");
    expect(falt("Anställningsnummer").value).toBe("1001");
    await skriv(falt("Anställningsnummer"), "5005");
    await klick("Klar");
    expect(g.__db.medarbetare_lonesystem.filter((r: any) => r.medarbetare_id === "m1")).toHaveLength(1);
    expect(g.__db.medarbetare_lonesystem.find((r: any) => r.medarbetare_id === "m1").anstallningsnummer).toBe("5005");
  });

  it("'Avbryt, fortsätt senare' lämnar flödet utan att radera något", async () => {
    nyPerson();
    await monter("flik=medarbetare&ny=1&person=n1&steg=2");
    await klick("Avbryt, fortsätt senare");
    expect(window.location.search).not.toContain("ny=1");
    expect(g.__db.medarbetare.some((m: any) => m.id === "n1")).toBe(true);
  });

  it("ett steg går att öppna igen från listan (när personen finns)", async () => {
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "gps" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=3");
    await klick("Namn och e-post");
    expect(text()).toContain("Steg 1 av 4");
    expect(falt("Namn").value).toBe("Nils Ek");
  });
});

describe("Anställningsnummer på personen", () => {
  it("syns och går att ändra i personens löneuppgifter, med samma skrivning som Lönesystem", async () => {
    g.__avvisaKolumner = { medarbetare_lonesystem: ["uppdaterad"] };
    await monter("flik=medarbetare&person=m1");
    expect(falt("Anställningsnummer (Fortnox)").value).toBe("1001");
    await skriv(falt("Anställningsnummer (Fortnox)"), "2002");
    await klick("Spara ändringar");
    expect(g.__db.medarbetare_lonesystem.find((r: any) => r.medarbetare_id === "m1").anstallningsnummer).toBe("2002");
  });
  it("misslyckas skrivningen står felet kvar på personen — man lämnar inte formuläret", async () => {
    await monter("flik=medarbetare&person=m1");
    await skriv(falt("Anställningsnummer (Fortnox)"), "2002");
    g.__ingaRader = true;
    await klick("Spara ändringar");
    expect(text()).toContain("Ändringen sparades inte");
    expect(text()).toContain("Personuppgifter");
  });
});

describe("Introduktionen som inte är klar", () => {
  it("en förare som saknar steg får ett kort med knapp tillbaka till flödet; en admin och en färdig förare får det inte", async () => {
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7 });
    await monter("flik=medarbetare&person=n1");
    expect(text()).toContain("Introduktionen är inte klar");
    expect(text()).toContain("saknar maskin");
    await klick("Fortsätt introduktionen");
    expect(window.location.search).toContain("ny=1");
    expect(window.location.search).toContain("person=n1");
    expect(text()).toContain("Steg 3 av 4");
    await act(async () => { root.unmount(); }); cont.remove();
    await monter("flik=medarbetare&person=m2"); // admin
    expect(text()).not.toContain("Introduktionen är inte klar");
    await act(async () => { root.unmount(); }); cont.remove();
    await monter("flik=medarbetare&person=m1"); // förare med maskin, hempunkt och nummer
    expect(text()).not.toContain("Introduktionen är inte klar");
  });
});


describe("Löneartskoder: samma sju som exporten använder", () => {
  const rader = () => Array.from(cont.querySelectorAll<HTMLInputElement>("input[aria-label$=', extern kod']"));

  it("listan är de sju lönearterna, i exportens ordning, med produktionens koder och enhet", async () => {
    await monter("flik=lon&underflik=system");
    expect(rader().map(i => i.getAttribute("aria-label"))).toEqual([
      "Timlön, extern kod", "Premielön skördare, extern kod", "Premielön skotare, extern kod", "Övertid skördare, extern kod", "Övertid skotare, extern kod", "Vältlappar, extern kod", "Reseersättning, extern kod",
    ]);
    expect(rader().map(i => i.value)).toEqual(["11", "1355", "1354", "1435", "1436", "136", "821"]);
    expect(text()).toContain("veckor"); // vältlappar räknas i veckor
    expect(text()).toContain("mil");
    expect(text()).not.toContain("Övertid vardag"); // de gamla tolv typerna som exporten aldrig använde är borta
    expect(text()).not.toContain("OB kväll");
  });

  it("en kod som saknas står som 'Saknar kod' — det är det som stoppar en skarp sändning", async () => {
    g.__db.lonesystem_artikelmappning = g.__db.lonesystem_artikelmappning.filter((r: any) => r.intern_typ !== "valtlappar");
    await monter("flik=lon&underflik=system");
    expect(radMed("Vältlappar").textContent).toContain("Saknar kod");
    expect(radMed("Timlön").textContent).not.toContain("Saknar kod");
  });

  it("ändra en kod skriver raden (update på id), och det är exportens kod: den läses ur samma rad", async () => {
    g.__avvisaKolumner = { lonesystem_artikelmappning: ["uppdaterad"] };
    await monter("flik=lon&underflik=system");
    const rad = radMed("Övertid skördare");
    await skriv(rad.querySelector("input")!, "1450");
    await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(g.__db.lonesystem_artikelmappning.find((r: any) => r.intern_typ === "overtid_skordare").extern_kod).toBe("1450");
    expect(g.__db.lonesystem_artikelmappning.filter((r: any) => r.intern_typ === "overtid_skordare")).toHaveLength(1);
  });

  it("en ny kod för en löneart utan rad skapas på Fortnox-kopplingen (annars läser exporten den aldrig)", async () => {
    g.__db.lonesystem_artikelmappning = g.__db.lonesystem_artikelmappning.filter((r: any) => r.intern_typ !== "valtlappar");
    await monter("flik=lon&underflik=system");
    const rad = radMed("Vältlappar");
    await skriv(rad.querySelector("input")!, "137");
    await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    const ny = g.__db.lonesystem_artikelmappning.find((r: any) => r.intern_typ === "valtlappar");
    expect(ny).toMatchObject({ extern_kod: "137", lonesystem_id: "ls1" });
  });

  it("granskningen visar etiketten ur lönearten, inte ur koden: en ändrad kod får fortfarande rätt namn", async () => {
    g.__salary = { ok: true, arbetsperiod: "2026-09", totalt_rader: 1, oenighet: [], medarbetare: [{ ...SALARY.medarbetare[0], rader: [{ loneart: "valtlappar", SalaryCode: "137", Number: "4" }] }] };
    await monter("flik=lon");
    expect(text()).toContain("Vältlappar");
    expect(text()).toContain("(137)");
    expect(text()).toContain("veckor");
  });
});

describe("Anställningsnummer utan Fortnox: sparas ändå, kontrolleras när anslutningen finns", () => {
  const medNr = (id: string) => g.__db.medarbetare_lonesystem.filter((r: any) => r.medarbetare_id === id);

  it("steg 4 utan någon koppling: fältet är öppet, numret sparas (utan koppling) och man går vidare", async () => {
    g.__db.lonesystem_koppling = [];
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, maskin_id: "R64101" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=4");
    expect(falt("Anställningsnummer").disabled).toBe(false);
    expect(text()).toContain("kontrolleras mot Fortnox när anslutningen finns");
    await skriv(falt("Anställningsnummer"), "4711");
    await klick("Klar");
    expect(medNr("n1")).toHaveLength(1);
    expect(medNr("n1")[0]).toMatchObject({ anstallningsnummer: "4711", lonesystem_id: null });
    expect(window.location.search).toContain("person=n1");
    expect(window.location.search).not.toContain("ny=1");
  });

  it("Fortnox finns men är inte anslutet: sparas på kopplingen, ingen spärr, och personen visar att det kontrolleras senare", async () => {
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, maskin_id: "R64101" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=4");
    await skriv(falt("Anställningsnummer"), "4711");
    await klick("Klar");
    expect(medNr("n1")[0]).toMatchObject({ anstallningsnummer: "4711", lonesystem_id: "ls1" });
    expect(g.__kontrollAnrop[0]).toEqual({ anstallningsnummer: "4711" }); // flödets kontroll; personen kontrollerar sedan sitt sparade nummer
    expect(window.location.search).not.toContain("ny=1");
    expect(text()).toContain("Kontrolleras mot Fortnox när anslutningen finns");
  });

  it("Fortnox ansluten och numret finns: 'Finns i Fortnox som …' och man går vidare", async () => {
    g.__kontroll = () => ({ ok: true, status: "hittad", namn: "Nils Ek" });
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, maskin_id: "R64101" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=4");
    await skriv(falt("Anställningsnummer"), "4711");
    await klick("Klar");
    expect(window.location.search).not.toContain("ny=1");
    expect(text()).toContain("Finns i Fortnox som Nils Ek");
  });

  it("Fortnox ansluten men känner inte numret: det är sparat, flödet stannar och säger det, och man kan gå vidare ändå", async () => {
    g.__kontroll = () => ({ ok: true, status: "saknas" });
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, maskin_id: "R64101" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=4");
    await skriv(falt("Anställningsnummer"), "4711");
    await klick("Klar");
    expect(medNr("n1")[0].anstallningsnummer).toBe("4711");
    expect(text()).toContain("Fortnox känner inte numret 4711");
    expect(text()).toContain("Steg 4 av 4"); // flödet stannar
    await klick("Gå vidare ändå");
    expect(window.location.search).not.toContain("ny=1");
    expect(window.location.search).toContain("person=n1");
  });

  it("kontrollen själv fallerar: det sägs, numret är sparat och man kan gå vidare ändå", async () => {
    g.__kontroll = () => ({ ok: false, status: "fel", fel: "Fortnox svarade 500" });
    nyPerson({ hem_lat: 56.4, hem_lng: 14.7, maskin_id: "R64101" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=4");
    await skriv(falt("Anställningsnummer"), "4711");
    await klick("Klar");
    expect(text()).toContain("Kunde inte kontrollera mot Fortnox");
    expect(text()).toContain("Fortnox svarade 500");
    expect(medNr("n1")[0].anstallningsnummer).toBe("4711");
  });

  it("personen: fältet är öppet utan koppling och numret sparas utan koppling", async () => {
    g.__db.lonesystem_koppling = [];
    g.__db.medarbetare_lonesystem = [];
    await monter("flik=medarbetare&person=m1");
    expect(falt("Anställningsnummer (Fortnox)").disabled).toBe(false);
    await skriv(falt("Anställningsnummer (Fortnox)"), "2002");
    await klick("Spara ändringar");
    expect(medNr("m1")[0]).toMatchObject({ anstallningsnummer: "2002", lonesystem_id: null });
  });

  it("ett nummer som sparats utan koppling knyts till kopplingen när det sparas igen — samma rad, ingen dubblett", async () => {
    g.__db.medarbetare_lonesystem = [{ id: "u1", medarbetare_id: "m1", lonesystem_id: null, anstallningsnummer: "1001", skapad: "2026-10-01" }];
    await monter("flik=medarbetare&person=m1");
    expect(falt("Anställningsnummer (Fortnox)").value).toBe("1001");
    await skriv(falt("Anställningsnummer (Fortnox)"), "1002");
    await klick("Spara ändringar");
    expect(medNr("m1")).toHaveLength(1);
    expect(medNr("m1")[0]).toMatchObject({ id: "u1", anstallningsnummer: "1002", lonesystem_id: "ls1" });
  });

  it("personen visar kontrollen mot Fortnox när numret finns och Fortnox svarar", async () => {
    g.__kontroll = () => ({ ok: true, status: "saknas" });
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Fortnox känner inte numret 1001");
  });
});


describe("Hempunkten på karta: en punkt, en etikett, två knappar", () => {
  const m1 = () => g.__db.medarbetare.find((m: any) => m.id === "m1");
  /** Kompersmåla Gård 362 96: geokodaren svarade med byns mittpunkt (geonames), ingen hempunkt sparad. */
  const byn = () => Object.assign(m1(), { hemadress: "Kompersmåla Gård 362 96", hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_geokod_status: "osaker", hem_geokod_etikett: "Kompersmåla, Almundsryd", hem_geokod_precision: "locality", hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333, hem_bekraftad_tid: null });
  /** En geokodad punkt på adressnivå som ingen har sett. */
  const obekraftad = () => Object.assign(m1(), { hemadress: "Björkvägen 4, Ryd", hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_geokod_etikett: "Björkvägen 4, Ryd", hem_geokod_precision: "address", hem_bekraftad_tid: null });
  const knappar = () => Array.from(cont.querySelectorAll<HTMLButtonElement>("button")).map(b => (b.textContent || "").trim());
  const tick = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

  it("Kompersmåla Gård: ingen nål (byns mittpunkt är en gissning), kartan visar området och säger 'Tryck på huset'; Stämmer och Flytta finns inte, Spara är inaktiv", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    expect(g.__karta.kartor).toHaveLength(1);
    expect(g.__karta.sista().centrum).toEqual([14.78333, 56.38333]); // området, utan nål
    expect(g.__karta.markorer).toHaveLength(0);
    expect(text()).toContain("Kompersmåla, Almundsryd");
    expect(text()).toContain("Hittade bara byn");
    expect(text()).toContain("Tryck på huset");
    expect(blad("Stämmer").length).toBe(0);
    expect(blad("Flytta punkten").length).toBe(0);
    expect(blad("Spara punkten")[0].closest("button")!.disabled).toBe(true);
    // ingen hempunkt sparades och ingenting står som 'exakt' eller 'klar'
    expect(m1().hem_lat).toBeNull();
    expect(text()).not.toContain("exakt");
    expect(g.__hempunktAnrop).toEqual([]);
  });

  it("första trycket sätter nålen (dragbar), Spara punkten skriver en manuell, bekräftad punkt", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    g.__karta.tryck(56.3939, 14.7729);
    await tick();
    expect(g.__karta.markorer).toHaveLength(1);
    expect(g.__karta.punkt()).toEqual([14.7729, 56.3939]);
    expect(g.__karta.markorer.at(-1).dragbar).toBe(true);
    expect(blad("Spara punkten")[0].closest("button")!.disabled).toBe(false);
    await klick("Spara punkten");
    expect(g.__hempunktAnrop).toEqual([{ id: "m1", atgard: "flytta", lat: 56.3939, lng: 14.7729 }]);
    expect(m1()).toMatchObject({ hem_lat: 56.3939, hem_lng: 14.7729, hem_koord_kalla: "manuell" });
    expect(m1().hem_bekraftad_tid).toBeTruthy();
    expect(text()).not.toContain("Hittade bara byn");
    expect(text()).toContain("Bekräftad");
  });

  it("nålen går att dra efter första trycket, och ett nytt tryck flyttar den (ingen andra nål)", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    g.__karta.tryck(56.39, 14.77);
    await tick();
    g.__karta.dra(56.394, 14.773);
    await tick();
    g.__karta.tryck(56.3945, 14.7735);
    await tick();
    expect(g.__karta.markorer).toHaveLength(1);
    await klick("Spara punkten");
    expect(g.__hempunktAnrop[0]).toEqual({ id: "m1", atgard: "flytta", lat: 56.3945, lng: 14.7735 });
  });

  it("en gammal grov geokodad punkt (sparad som hempunkt) ritas inte heller som nål: den är också en gissning", async () => {
    Object.assign(m1(), { hem_lat: 56.38333, hem_lng: 14.78333, hem_koord_kalla: "geokod", hem_geokod_precision: "locality", hem_geokod_etikett: "Kompersmåla, Almundsryd", hem_bekraftad_tid: null });
    await monter("flik=medarbetare&person=m1");
    expect(g.__karta.markorer).toHaveLength(0);
    expect(text()).toContain("Tryck på huset");
    expect(blad("Stämmer").length).toBe(0);
  });

  it("Avbryt: punkten går tillbaka dit den var och inget skickas", async () => {
    obekraftad();
    await monter("flik=medarbetare&person=m1");
    await klick("Flytta punkten");
    g.__karta.tryck(56.5, 14.9);
    await tick();
    await klick("Avbryt");
    expect(g.__karta.punkt()).toEqual([14.77, 56.39]);
    expect(g.__hempunktAnrop).toEqual([]);
    expect(blad("Stämmer").length).toBe(1);
  });

  it("obekräftad geokodad punkt: kartan, etiketten och två knappar. Stämmer stämplar punkten och behåller källan geokod", async () => {
    obekraftad();
    await monter("flik=medarbetare&person=m1");
    expect(g.__karta.punkt()).toEqual([14.77, 56.39]);
    expect(text()).toContain("Björkvägen 4, Ryd");
    expect(text()).toContain("inte bekräftad");
    expect(knappar().filter(t => t === "Stämmer" || t === "Flytta punkten")).toEqual(["Stämmer", "Flytta punkten"]);
    await klick("Stämmer");
    expect(g.__hempunktAnrop).toEqual([{ id: "m1", atgard: "stammer" }]);
    expect(m1().hem_bekraftad_tid).toBeTruthy();
    expect(m1().hem_koord_kalla).toBe("geokod");
    expect(blad("Stämmer").length).toBe(0);
    expect(text()).toContain("Bekräftad");
    expect(text()).not.toContain("inte bekräftad");
  });

  it("en punkt som redan satts för hand eller med GPS visas på kartan, är bekräftad, och kan flyttas — men ska inte 'stämmas'", async () => {
    await monter("flik=medarbetare&person=m1"); // m1: gps
    expect(g.__karta.punkt()).toEqual([14.7, 56.4]);
    expect(text()).toContain("Bekräftad");
    expect(blad("Stämmer").length).toBe(0);
    expect(blad("Flytta punkten").length).toBe(1);
  });

  it("servern nekar (t.ex. RLS eller utanför Sverige): felet står, punkten står kvar på kartan och inget ser sparat ut", async () => {
    obekraftad();
    g.__hempunkt = () => ({ ok: false, error: "Inget sparades (raden träffades inte)" });
    await monter("flik=medarbetare&person=m1");
    await klick("Stämmer");
    expect(text()).toContain("Inget sparades");
    expect(blad("Stämmer").length).toBe(1);
    expect(text()).not.toContain("Bekräftad");
  });

  it("kartan går inte att ladda: det sägs, och punktens värden finns kvar som text — ingen tyst tom ruta", async () => {
    delete (window as any).maplibregl;
    obekraftad();
    await monter("flik=medarbetare&person=m1");
    const script = document.getElementById("maplibre-js-hempunkt");
    expect(script).toBeTruthy();
    await act(async () => { script!.dispatchEvent(new Event("error")); });
    expect(text()).toContain("Kartan kunde inte laddas");
    expect(text()).toContain("Björkvägen 4, Ryd");
    script!.remove();
  });

  it("Översikt: obekräftad hempunkt är en sak att göra, 'Hempunkten är inte bekräftad – namn', och leder till kartan", async () => {
    obekraftad();
    g.__kontroller = { ok: true, okandaOperatorer: [], forareUtanMaskin: [], saknarHempunkt: [], obekraftadHempunkt: [{ id: "m1", namn: "Anna Berg" }] };
    await monter("flik=oversikt");
    expect(text()).toContain("Hempunkten är inte bekräftad – Anna Berg");
    await klick("Visa kartan");
    expect(window.location.search).toContain("flik=medarbetare");
    expect(window.location.search).toContain("person=m1");
    expect(g.__karta.kartor.length).toBe(1);
    expect(blad("Stämmer").length).toBe(1);
  });
});


describe("Hempunktskartan: raden under kartan, pekaren och adressfältet", () => {
  const m1 = () => g.__db.medarbetare.find((m: any) => m.id === "m1");
  const tick = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const byn = () => Object.assign(m1(), { hemadress: "Kompersmåla Gård 362 96", hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_geokod_status: "osaker", hem_geokod_etikett: "Kompersmåla, Almundsryd, KR, Sweden", hem_geokod_precision: "locality", hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333, hem_bekraftad_tid: null });
  const exakt = () => Object.assign(m1(), { hemadress: "Björkvägen 4, Ryd", hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_geokod_etikett: "Björkvägen 4, Ryd, KR, Sweden", hem_geokod_precision: "address", hem_bekraftad_tid: null });

  // ── raden under kartan ──
  it("punkt satt för hand: bara 'Punkten är satt för hand · Bekräftad' — geokodarens gissning (som ligger kvar i raden) visas inte", async () => {
    Object.assign(m1(), { hem_lat: 56.3939, hem_lng: 14.7729, hem_koord_kalla: "manuell", hem_geokod_status: null, hem_geokod_etikett: "Kompersmåla, Almundsryd, KR, Sweden", hem_geokod_precision: "locality", hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333 });
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Punkten är satt för hand · Bekräftad");
    expect(text()).not.toContain("Almundsryd");
    expect(text()).not.toContain("Sweden");
    expect(text()).not.toMatch(/\bKR\b/);
  });

  it("efter att man satt punkten på kartan (byn → Spara punkten) står bara 'satt för hand · Bekräftad', inte byns namn", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Kompersmåla, Almundsryd"); // gissningen visas medan punkten inte är satt
    g.__karta.tryck(56.3939, 14.7729);
    await tick();
    await klick("Spara punkten");
    expect(text()).toContain("Punkten är satt för hand · Bekräftad");
    expect(text()).not.toContain("Almundsryd");
  });

  it("GPS-punkt: 'satt med GPS i Maskinflytt · Bekräftad' och ingen etikett", async () => {
    Object.assign(m1(), { hem_geokod_etikett: "Idekulla, Ryd, KR, Sweden" });
    await monter("flik=medarbetare&person=m1"); // m1: gps
    expect(text()).toContain("Punkten är satt med GPS i Maskinflytt · Bekräftad");
    expect(text()).not.toContain("Idekulla, Ryd");
  });

  it("geokodad punkt: etiketten visas men aldrig landskod eller engelska (KR, Sweden)", async () => {
    exakt();
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Björkvägen 4, Ryd");
    expect(text()).not.toContain("Sweden");
    expect(text()).not.toMatch(/\bKR\b/);
  });

  it("förslaget (bara byn): etiketten är rensad", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Kompersmåla, Almundsryd");
    expect(text()).not.toContain("Sweden");
    expect(text()).not.toMatch(/\bKR\b/);
  });

  // ── pekaren ──
  it("före första trycket (bara byn): hårkors i vila; under kartdrag den vanliga grepphanden (ärvd); drag av kartan sätter ingen nål", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    expect(g.__karta.pekare()).toBe("crosshair");
    g.__karta.kartdragStart();
    await tick();
    expect(g.__karta.pekare()).toBe(""); // MapLibres egen 'grabbing' under drag
    g.__karta.kartdragSlut();
    await tick();
    expect(g.__karta.pekare()).toBe("crosshair");
    expect(g.__karta.markorer).toHaveLength(0); // inget drag har satt en nål
  });

  it("efter att nålen är satt: vanlig hand över kartan (ingen hårkors), grab över nålen, grabbing när nålen dras", async () => {
    byn();
    await monter("flik=medarbetare&person=m1");
    g.__karta.tryck(56.3939, 14.7729);
    await tick();
    expect(g.__karta.pekare()).toBe("");
    expect(g.__karta.nalPekare()).toBe("grab");
    g.__karta.nalDragStart();
    await tick();
    expect(g.__karta.nalPekare()).toBe("grabbing");
    g.__karta.dra(56.394, 14.773); // släpp
    await tick();
    expect(g.__karta.nalPekare()).toBe("grab");
  });

  it("exakt adress: hand från början (inget hårkors), nålen står på huset, och nålens pekare är grab", async () => {
    exakt();
    await monter("flik=medarbetare&person=m1");
    expect(g.__karta.pekare()).toBe("");
    expect(g.__karta.punkt()).toEqual([14.77, 56.39]);
    expect(g.__karta.nalPekare()).toBe(""); // ärver kartans hand: nålen går inte att dra förrän man valt Flytta punkten
    expect(blad("Stämmer").length).toBe(1);
    expect(blad("Flytta punkten").length).toBe(1);
  });

  it("exakt adress, Flytta punkten: nålen finns redan, så ingen hårkors — ett tryck flyttar den", async () => {
    exakt();
    await monter("flik=medarbetare&person=m1");
    await klick("Flytta punkten");
    expect(g.__karta.pekare()).toBe("");
    expect(g.__karta.nalPekare()).toBe("grab");
    g.__karta.tryck(56.5, 14.9);
    await tick();
    expect(g.__karta.punkt()).toEqual([14.9, 56.5]);
    expect(g.__karta.markorer).toHaveLength(1);
  });

  // ── adressfältet ──
  it("Hemadress: ETT fält, exempel i svensk ordning och hjälptext — på personen", async () => {
    await monter("flik=medarbetare&person=m1");
    expect(Array.from(cont.querySelectorAll("label")).filter(l => (l.textContent || "").trim() === "Hemadress")).toHaveLength(1);
    expect(falt("Hemadress").placeholder).toBe("Kompersmåla 3, 362 96 Ryd");
    expect(text()).toContain("Gata och nummer, postnummer och ort.");
  });

  it("Hemadress: samma fält, exempel och hjälptext i Ny medarbetare steg 2", async () => {
    nyPerson();
    await monter("flik=medarbetare&ny=1&person=n1&steg=2");
    expect(Array.from(cont.querySelectorAll("label")).filter(l => (l.textContent || "").trim() === "Hemadress")).toHaveLength(1);
    expect(falt("Hemadress").placeholder).toBe("Kompersmåla 3, 362 96 Ryd");
    expect(text()).toContain("Gata och nummer, postnummer och ort.");
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ÅRSÖVERTID: kortet svarar på EN fråga — hur nära taket (250 tim/år) är varje förare? (Martin 2026-10-09)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Årsövertid: en fråga, hur nära taket är varje förare?", () => {
  /** Så ser /api/lon/arsovertid ut: alla fyra modellerna per förare (de tre andra visas inte). */
  const MODELLER = [
    { key: "vardagar", namn: "Vardagar × 8", beskrivning: "per månad: timmar minus kalenderns vardagar × 8", anvandsAv: "Min tid (förarens vy)", avtalet: false },
    { key: "dagar", namn: "Arbetade dagar × 8", beskrivning: "per månad: timmar minus arbetade dagar × 8", anvandsAv: "Fortnox-exporten (löneart 1435/1436)", avtalet: false },
    { key: "vecka", namn: "Över 40 tim/vecka", beskrivning: "per ISO-vecka: timmar över 40, ingen utjämning", anvandsAv: "ingen", avtalet: false },
    { key: "genomsnitt", namn: "Genomsnitt", beskrivning: "avtalet §5 mom 2", anvandsAv: "Skogsavtalet — frånvaro och komp ej avdragna", avtalet: true },
  ];
  const PERIODER = [
    { fran: 1, till: 16, veckor: 16, timmar: 683.9, bas: 584, franvaroTimmar: 0, rodaTimmar: 40, overtid: 99.9, markerad: false },
    { fran: 17, till: 27, veckor: 11, timmar: 309.4, bas: 376, franvaroTimmar: 40, rodaTimmar: 24, overtid: 0, markerad: true },
    { fran: 28, till: 41, veckor: 14, timmar: 593.8, bas: 480, franvaroTimmar: 80, rodaTimmar: 0, overtid: 113.8, markerad: false },
  ];
  const forare = (id: string, namn: string, genomsnitt: number) => ({ medarbetare_id: id, namn, timmar: 1000, modeller: { genomsnitt, vardagar: 205.5, dagar: 303.5, vecka: 344.3 }, perioder: PERIODER, basavdrag: { franvaroTimmar: 120, rodaTimmar: 64 } });
  const svar = (rader: [string, string, number][], extra: Record<string, any> = {}) => ({
    ok: true, ar: 2026, tak: 250, tomDatum: "2026-10-09", modeller: MODELLER,
    medarbetare: rader.map(([id, n, h]) => forare(id, n, h)),
    utjamning: [{ startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: null, anteckning: "Gavle/Hedemora-Sandviken 22 apr-29 jun 2026 (sex objekt, 100 arbetsdagar). Ordinarie tid utlagd ojamnt." }],
    utjamning_fel: null, franvaro_fel: null, ...extra,
  });
  /** Dagens tal i prod (2026-10-09): Stefan 74,5, övriga 0. */
  const IDAG: [string, string, number][] = [["s", "Stefan Karlsson", 74.5], ["m", "Martin Lindqvist", 0], ["d", "Daniel Johansson", 0], ["o", "Oskar Nilsson", 0]];
  const rader = () => Array.from(cont.querySelectorAll<HTMLElement>("[data-arsovertid-rad]"));
  const radText = (e: HTMLElement) => (e.textContent || "").replace(/\s+/g, " ").trim();
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  const stapel = (e: HTMLElement) => e.querySelector<HTMLElement>("[role=progressbar]")!;
  const fyllning = (e: HTMLElement) => stapel(e).firstElementChild as HTMLElement;
  const SAKER = ["Vardagar × 8", "Arbetade dagar × 8", "Över 40 tim/vecka", "(avtalet)"];
  /** Bara årsövertidskortets text (sidan har andra kort som nämner §5 mom 2 och utjämningsperioder). */
  const kortText = () => (cont.querySelector("[data-arsovertid-kort]")?.textContent || "").replace(/\s+/g, " ");

  it("en rad per förare: namn till vänster, '74,5 av 250 tim' till höger — samma tal som kolumnen Genomsnitt, Stefan först", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    expect(rader().map(radText)).toEqual(["Stefan Karlsson 74,5 av 250 tim", "Daniel Johansson 0 av 250 tim", "Martin Lindqvist 0 av 250 tim", "Oskar Nilsson 0 av 250 tim"]);
  });

  it("bara avtalets modell: de tre andra kolumnerna och deras tal finns inte i vyn", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    for (const t of SAKER) expect(kortText()).not.toContain(t);
    for (const tal of ["205,5", "303,5", "344,3"]) expect(kortText()).not.toContain(tal);
    expect(cont.querySelectorAll("[data-arsovertid-rad]").length).toBe(4);
  });

  it("tunn stapel under raden: 74,5 av 250 = 29,8 % av längden, med tal för skärmläsare", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    const st = stapel(rader()[0]);
    expect(st.getAttribute("aria-valuenow")).toBe("74.5");
    expect(st.getAttribute("aria-valuemax")).toBe("250");
    expect(fyllning(rader()[0]).style.width).toBe("29.8%");
    expect(fyllning(rader()[1]).style.width).toBe("0%");
  });

  it("grå normalt, orange över 200, röd över 250, noll dämpad — stapel och tal i samma färg, och talet står alltid i text", async () => {
    g.__arsovertid = svar([["a", "A Lugn", 74.5], ["b", "B Gräns", 200], ["c", "C Varning", 200.5], ["d", "D Tak", 250], ["e", "E Över", 250.5], ["f", "F Noll", 0]]);
    await monter("flik=lon");
    const per = Object.fromEntries(rader().map(e => [radText(e).split(" ")[0] + (radText(e).split(" ")[1] || ""), e]));
    const niva = (k: string) => per[k].getAttribute("data-niva");
    expect([niva("ALugn"), niva("BGräns"), niva("CVarning"), niva("DTak"), niva("EÖver"), niva("FNoll")]).toEqual(["lugn", "lugn", "varning", "varning", "over", "noll"]);
    expect(fyllning(per["CVarning"]).style.background).toBe(rgb("#ff9f0a"));
    expect(fyllning(per["EÖver"]).style.background).toBe(rgb("#ff453a"));
    expect(fyllning(per["ALugn"]).style.background).not.toBe(rgb("#ff9f0a"));
    expect(fyllning(per["ALugn"]).style.background).not.toBe(rgb("#ff453a"));
    expect(radText(per["EÖver"])).toContain("250,5 av 250 tim");
    // noll är dämpad: grå text, ingen färg
    const nollTal = per["FNoll"].querySelector<HTMLElement>("[data-arsovertid-tal]")!;
    const lugnTal = per["ALugn"].querySelector<HTMLElement>("[data-arsovertid-tal]")!;
    expect(nollTal.style.color).not.toBe(lugnTal.style.color);
    expect(nollTal.style.color).not.toBe(rgb("#ff9f0a"));
  });

  it("utjämningsperioden är en grå rad: 'Utjämningsperiod v17–27 (…) räknas som genomsnitt'", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    const r = Array.from(cont.querySelectorAll<HTMLElement>("p")).find(e => (e.textContent || "").startsWith("Utjämningsperiod"))!;
    expect(r.textContent).toBe("Utjämningsperiod v17–27 (Gavle/Hedemora-Sandviken) räknas som genomsnitt");
    expect(r.style.color).toBe(rgb("#8e8e93"));
  });

  it("all förklarande text ligger bakom en tertiär länk 'Så räknas det' som fäller ut — och fäller ihop igen", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    const FORKLARING = ["§5 mom 2", "Avtalet förutsätter", "v1–16", "v28–41", "(antagen)", "(markerad)", "genomsnitt över en beräkningsperiod", "minus frånvaro", "röda vardagar"];
    for (const t of FORKLARING) expect(kortText(), t).not.toContain(t);
    const lank = blad("Så räknas det")[0].closest("button") as HTMLButtonElement;
    expect(lank.getAttribute("aria-expanded")).toBe("false");
    await klick("Så räknas det");
    expect((blad("Så räknas det")[0].closest("button") as HTMLButtonElement).getAttribute("aria-expanded")).toBe("true");
    for (const t of FORKLARING) expect(kortText(), t).toContain(t);
    // de tre andra modellerna beskrivs inte heller i förklaringen: de finns inte i vyn
    for (const t of SAKER) expect(kortText()).not.toContain(t);
    await klick("Så räknas det");
    for (const t of FORKLARING) expect(kortText(), t).not.toContain(t);
  });

  it("ett fel som påverkar talen är inte förklaring: 'Kunde inte läsa utjämningsperioder' står kvar utan att fälla ut", async () => {
    g.__arsovertid = svar(IDAG, { utjamning: [], utjamning_fel: "relation does not exist" });
    await monter("flik=lon");
    expect(text()).toContain("Kunde inte läsa utjämningsperioder");
    expect(text()).toContain("relation does not exist");
    expect(blad("Så räknas det").length).toBe(1);
  });

  it("ett läsfel är aldrig 'ingen övertid': felet står, och inga rader ritas", async () => {
    g.__arsovertid = { ok: false, meddelande: "nät" };
    await monter("flik=lon");
    expect(text()).toContain("Kunde inte läsa årets övertid: nät");
    expect(rader().length).toBe(0);
  });

  it("basen: 'Så räknas det' visar per förare hur många tim som drogs ur basen för frånvaro och röda dagar", async () => {
    g.__arsovertid = svar([["s", "Stefan Karlsson", 189.7], ["m", "Martin Lindqvist", 0]]);
    await monter("flik=lon");
    expect(kortText()).not.toContain("drogs ur basen");
    await klick("Så räknas det");
    expect(kortText()).toContain("Stefan: 120 tim frånvaro och 64 tim röda dagar drogs ur basen");
    expect(kortText()).toContain("Martin: 120 tim frånvaro och 64 tim röda dagar drogs ur basen");
    // perioderna visar basen de räknades mot
    expect(kortText()).toContain("v1–16 (antagen): 683,9 tim mot bas 584 → 99,9");
    expect(kortText()).toContain("v28–41 (antagen): 593,8 tim mot bas 480 → 113,8");
  });

  it("kan frånvaron inte läsas säger kortet det utan att fälla ut: talen är för höga, aldrig 'ingen frånvaro'", async () => {
    g.__arsovertid = svar(IDAG, { franvaro_fel: "relation does not exist" });
    await monter("flik=lon");
    expect(kortText()).toContain("Kunde inte läsa frånvaron");
    expect(kortText()).toContain("relation does not exist");
    expect(kortText()).toContain("för höga");
  });

  it("frånvaron lästes: ingen varning", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    expect(kortText()).not.toContain("Kunde inte läsa frånvaron");
  });

  // ── Översikt ──
  it("Översikt: passerar någon 200 tim står en rad '[Namn] har X tim övertid i år, taket är 250' som leder till Lön", async () => {
    g.__arsovertid = svar([["s", "Stefan Karlsson", 212.5], ["m", "Martin Lindqvist", 0]]);
    await monter("flik=oversikt");
    expect(text()).toContain("Stefan Karlsson har 212,5 tim övertid i år, taket är 250");
    expect(text()).not.toContain("Martin Lindqvist har");
    await klick("Visa");
    expect(window.location.search).toContain("flik=lon");
  });

  it("Översikt: dagens tal (Stefan 74,5, övriga 0) ger ingenting — ingen rad och ingen 'stämmer'-rad om övertid", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=oversikt");
    expect(text()).not.toContain("tim övertid i år");
    expect(text()).not.toMatch(/övertid/i);
  });

  it("Översikt: exakt 200 tim passerar inte", async () => {
    g.__arsovertid = svar([["s", "Stefan Karlsson", 200]]);
    await monter("flik=oversikt");
    expect(text()).not.toContain("tim övertid i år");
  });

  it("Översikt: kan årsövertiden inte läsas säger Översikten det i stället för att tiga", async () => {
    g.__arsovertid = { ok: false, meddelande: "nät" };
    await monter("flik=oversikt");
    expect(text()).toContain("Kunde inte kontrollera årsövertiden");
  });
});
