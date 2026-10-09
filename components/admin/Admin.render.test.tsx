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
      else { const nya = (Array.isArray(this.vals) ? this.vals : [this.vals]).map((v: any) => ({ id: `ny-${tab.length}`, ...v })); tab.push(...nya); traff = nya; }
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
  g.__skriv = []; g.__eq = []; g.__ingaRader = false; g.__avvisaKolumner = {};
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
const blad = (t: string) => Array.from(cont.querySelectorAll<HTMLElement>("*")).filter(e => egenText(e) === t);
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
  const l = Array.from(cont.querySelectorAll<HTMLLabelElement>("label")).find(e => (e.textContent || "").trim() === label);
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
    { fran: 1, till: 16, veckor: 16, timmar: 640, overtid: 43.9, markerad: false },
    { fran: 17, till: 27, veckor: 11, timmar: 440, overtid: 0, markerad: true },
    { fran: 28, till: 41, veckor: 14, timmar: 590, overtid: 30.6, markerad: false },
  ];
  const forare = (id: string, namn: string, genomsnitt: number) => ({ medarbetare_id: id, namn, timmar: 1000, modeller: { genomsnitt, vardagar: 205.5, dagar: 303.5, vecka: 344.3 }, perioder: PERIODER });
  const svar = (rader: [string, string, number][], extra: Record<string, any> = {}) => ({
    ok: true, ar: 2026, tak: 250, tomDatum: "2026-10-09", modeller: MODELLER,
    medarbetare: rader.map(([id, n, h]) => forare(id, n, h)),
    utjamning: [{ startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: null, anteckning: "Gavle/Hedemora-Sandviken 22 apr-29 jun 2026 (sex objekt, 100 arbetsdagar). Ordinarie tid utlagd ojamnt." }],
    utjamning_fel: null, ...extra,
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
    const FORKLARING = ["§5 mom 2", "Avtalet förutsätter", "v1–16", "v28–41", "(antagen)", "(markerad)", "Frånvaro och komp", "genomsnitt över en beräkningsperiod"];
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
