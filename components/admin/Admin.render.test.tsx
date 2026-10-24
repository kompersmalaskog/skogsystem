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
import { byggArbetstid } from "@/lib/arbetstidsgranser";

vi.mock("next/navigation", () => ({ useSearchParams: () => (globalThis as any).__sp, useRouter: () => ({ push: (u: string) => { (globalThis as any).__push.push(u); } }) }));

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
    cols = "";
    select(c?: string, o?: any) { if (this.mode === "select") this.cols = c || ""; if (this.mode !== "select") this.valjSkrivet = true; if (o?.count) this.count = true; if (o?.head) this.head = true; return this; }
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
        const saknas = ((g.__saknasLasKolumner?.[this.t] || []) as string[]).find(k => this.cols.includes(k));   // kolumnen finns inte än (migration ej körd)
        if (saknas) return klar({ data: null, error: { message: `column ${this.t}.${saknas} does not exist` }, count: null });
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
  // Storage: uppladdningar och signerade länkar registreras i g.__storage; g.__storage.uppFel / signFel styr felvägarna.
  const storage = { from: (bucket: string) => ({
    upload: async (path: string, fil: any, opts: any) => {
      const g = globalThis as any;
      g.__storage.upp.push({ bucket, path, namn: fil?.name, typ: fil?.type, opts });
      return g.__storage.uppFel ? { data: null, error: { message: g.__storage.uppFel } } : { data: { path }, error: null };
    },
    createSignedUrl: async (path: string, sek: number) => {
      const g = globalThis as any;
      g.__storage.signerade.push({ bucket, path, sek });
      return g.__storage.signFel ? { data: null, error: g.__storage.signFel } : { data: { signedUrl: `https://signerad.example/${bucket}/${path}?t=1` }, error: null };
    },
  }) };
  return { supabase: { from: (t: string) => new Q(t), storage } };
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
  blockerande: [], kopplingar: { timlon: { kod: "11", namn: "Timlön" }, korersattning: { kod: "821", namn: "Körersättning skattefri" } },
  medarbetare: [{ medarbetare_id: "m1", namn: "Anna Berg", status: "utkast", godkannande: "godkand", anstallningsnummer: "1001", rader: [{ loneart: "timlon", SalaryCode: "11", Number: 168 }, { loneart: "korersattning", SalaryCode: "821", Number: 14 }],
    lonerader: [{ loneart: "timlon", mangd: "168.00", kod: "11", beskrivning: "Timlön", status: "skickas" }, { loneart: "korersattning", mangd: "14.00", kod: "821", beskrivning: "Reseersättning", status: "skickas" }], dagar: [], synk: [], deldagar: [], ledighetskollision: [], vilobrott: [], rast_langa: [], kortpass: [], orimliga: [], utan_rast: { dagar: 0, timmar: 0, datum: [] }, helglon: { dagar: [], timmar: 0 }, byten: [], obekraftade: 0, ob: { timmar: 0, dagar: 0, obesvarade: 0 }, varningar: [] }],
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
  g.__storage = { upp: [], signerade: [], uppFel: null, signFel: null };
  g.__skriv = []; g.__eq = []; g.__ingaRader = false; g.__avvisaKolumner = {}; g.__dbFel = null; g.__saknasLasKolumner = {};
  g.__leverans = { laddar: false, fel: null, data: [{ maskinId: "R64101", namn: "Rottne H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-10-06", dagarSedan: 1 }] };
  g.__fetchAnrop = []; g.__bjudIn = null; g.__bjudInAnrop = []; g.__kontroller = null; g.__geokod = null; g.__geokodAnrop = []; g.__kontroll = null; g.__kontrollAnrop = []; g.__hempunkt = null; g.__hempunktAnrop = []; g.__arsovertid = null; g.__arbetstid = null; g.__fortnoxStatus = null; g.__paminn = null; g.__paminnAnrop = [];
  g.fetch = vi.fn(async (url: string, init?: any) => {
    const u = String(url); g.__fetchAnrop.push([u, init?.method || "GET", init?.body]);
    if (u.includes("/api/lon/paminn")) {
      const b = JSON.parse(init?.body || "{}");
      g.__paminnAnrop.push(b);
      const svar = g.__paminn ? g.__paminn(b) : { ok: true, koad: true, skickades: true };
      return { ok: svar.ok !== false, status: svar.ok === false ? 409 : 200, json: async () => svar } as any;
    }
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
    if (u.includes("/api/personal/bjud-in")) {
      const b = JSON.parse(init?.body || "{}");
      g.__bjudInAnrop.push(b);
      // Servern: raden skapas med vald roll och en inbjudan går ut. Standardsvaret gör det; ett test kan byta ut det.
      const svar = g.__bjudIn ? g.__bjudIn(b) : (() => {
        const id = "ny" + (g.__db.medarbetare.length + 1);
        g.__db.medarbetare.push({ id, namn: b.namn, epost: String(b.epost).toLowerCase(), telefon: b.telefon || null, roll: b.roll, user_id: null, maskin_id: null, hemadress: null, hem_lat: null, hem_lng: null, anstallningsdatum: null, timlon_kr: null, manadslon_kr: null });
        return { status: 200, body: { ok: true, id, inbjudan: "skickad" } };
      })();
      return { ok: svar.status === 200, status: svar.status, json: async () => svar.body } as any;
    }
    if (u.includes("/api/medarbetare/geokoda")) {
      const b = JSON.parse(init?.body || "{}");
      g.__geokodAnrop.push(b);
      return { ok: true, status: 200, json: async () => (g.__geokod ? g.__geokod(b) : { ok: true }) } as any;
    }
    const body = u.includes("/api/lon/arbetstid") ? (g.__arbetstid ?? { ok: true, ar: 2026, tomDatum: "2026-10-13", forare: [], varningar: [] })
      : u.includes("/api/lon/arsovertid") ? (g.__arsovertid ?? { ok: true, ar: 2026, tak: 250, tomDatum: "2026-09-30", modeller: [], medarbetare: [], utjamning: [] })
      : u.includes("/api/fortnox/salary-export") ? (g.__salarySkicka && JSON.parse(init?.body || "{}").dry_run !== true ? g.__salarySkicka : (g.__salary || SALARY))
      : u.includes("/api/fortnox/status") ? (g.__fortnoxStatus ?? { connected: true, token_utgar: null, senast_synkad: null })
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
  // En ny montering ersätter den förra: en kvarglömd container gjorde att texts-sökningar (blad/klick) träffade gammalt innehåll.
  if (cont?.isConnected) { await act(async () => { root.unmount(); }); cont.remove(); }
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
/** Översiktens rader är tryckbara hela vägen (›, ingen knapp bredvid texten): tryck på raden med den här rubriken. */
async function klickRad(rubrik: string) {
  const el = blad(rubrik)[0];
  if (!el) throw new Error("hittar ingen rad: " + rubrik + " — sidan säger: " + text().slice(0, 400));
  const knapp = el.closest("button")!;
  await act(async () => { knapp.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await lugn();
}

/** Läsfel på en tabell (permission denied, tabellen finns inte). */
const rgbAv = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const seedFel = (tabell: string) => { g.__dbFel = { ...(g.__dbFel || {}), [tabell]: `relation "${tabell}" does not exist` }; };

vi.setConfig({ testTimeout: 30000 }); // jsdom + många fetchar på en långsam dator
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 7, 12, 0)); seed(); installeraKarta(); });
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); delete g.__salary; delete g.__salarySkicka; delete (window as any).maplibregl; });

describe("Skal och navigering", () => {
  it("fem flikar i menyn, ingen Inst.; ?flik=installningar faller tillbaka på Översikt", async () => {
    await monter("flik=installningar");
    for (const f of ["Översikt", "Medarbetare", "Maskiner", "Lön", "Avtal"]) expect(blad(f).length, f).toBeGreaterThan(0);
    expect(blad("Inst.").length).toBe(0);
    expect(text()).not.toContain("kommer i nästa steg");
    expect(text()).toContain("Inget att göra");
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
    expect(text()).toContain("Så räknas det"); // Vilobrott: länken som visar hur det räknas
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

  it("inget väntar: 'Inget att göra' med ✓ — ingen rubrik, ingen 'stämmer'-lista, ingen siffra i menyn", async () => {
    allaStammer();
    await monter("flik=oversikt");
    expect(document.querySelector("[data-inget-att-gora]")!.textContent).toContain("Inget att göra");
    expect(document.querySelector("[data-inget-att-gora]")!.textContent).toContain("check");   // ✓
    expect(text()).not.toContain("kräver dig");
    expect(text()).not.toMatch(/stämmer|Alla dagar är bekräftade|Inga obesvarade|Alla har maskin|Alla operatörer|Avtalet gäller till|Alla maskiner har skickat/);
    expect(document.querySelectorAll("[data-sak]")).toHaveLength(0);
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
      // vilobrott: Anna slutar 20:30 och börjar 05:00. Veckovilobrottet kräver veckor utan 36 tim vila: ett pass varje dag 6–27 sep
      // (14 tim vila mellan dem), i en obruten kedja från 3–5 sep — ett glapp före kedjan skulle räknas som vila i fönstret (hela glappet räknas).
      ...Array.from({ length: 22 }, (_, i) => ({ medarbetare_id: "m1", datum: `2026-09-${String(6 + i).padStart(2, "0")}`, start_tid: "05:00:00", slut_tid: "15:00:00", bekraftad: true })),
      { medarbetare_id: "m1", datum: "2026-09-28", start_tid: "05:00:00", slut_tid: "20:30:00", bekraftad: true },
      { medarbetare_id: "m1", datum: "2026-09-29", start_tid: "05:00:00", slut_tid: "15:30:00", bekraftad: true },
    ];
    g.__db.loneunderlag = [{ medarbetare_id: "m1", period: "2026-09", status: "godkand_av_forare" }];   // Anna har godkänt, Erik inte
    g.__db.gs_avtal[0].giltigt_till = "2026-10-20"; // inom en månad
    g.__leverans = { laddar: false, fel: null, data: [{ maskinId: "R64101", namn: "Rottne H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-09-20", dagarSedan: 17 }] };
    g.__kontroller = { ok: true, okandaOperatorer: [{ operator_id: "OP-9", operator_namn: "E Lind", maskin_id: "R64101", datum: ["2026-09-19", "2026-09-22"], medarbetare: { id: "m2", namn: "Erik Lind" } }], forareUtanMaskin: [{ id: "m2", namn: "Erik Lind" }], saknarHempunkt: [{ id: "m2", namn: "Erik Lind", orsak: "ingen_adress" }] };
  }

  it("väntande: en rad per sak, orange rubrik med antalet, siffran i menyn är samma tal — och inget som stämmer visas", async () => {
    mangaSaker();
    await monter("flik=oversikt");
    const t = text();
    const rad = (id: string) => cont.querySelector<HTMLElement>(`[data-sak="${id}"]`)!;
    // Lönen: rubrik + EN undertext. Anna har godkänt (klar), Erik inte (väntar).
    expect(rad("lon").textContent).toContain("Lönen för september");
    expect(rad("lon").textContent).toContain("1 klar · 1 väntar på föraren");
    // Vilobrott: EN rad med antalet. Inga namn, inga datum.
    expect(rad("vila").textContent).toContain("Vilobrott");
    expect(rad("vila").textContent).toContain("2 obesvarade");
    expect(rad("vila").textContent).not.toMatch(/Anna|sep|dygnsvila|veckovila/);
    expect(t).toMatch(/Erik Lind.*saknar maskin · saknar hemadress · ingen inloggning kopplad/);
    expect(t).toContain('Operatören "E Lind" matchar Erik Lind');
    expect(t).toContain("Ny maskin i importen: H8E");
    expect(t).toContain("Avtalet går ut inom en månad");
    expect(t).toContain("Rottne H8E har inte skickat fil på 17 dygn");
    // 7 rader: lön, vilobrott, person, operatör, maskin, avtal, tyst maskin
    expect(document.querySelectorAll("[data-sak]")).toHaveLength(7);
    expect(t).toContain("7 saker kräver dig");
    expect(cont.querySelector("aside")!.textContent).toMatch(/Översikt\s*7/);
    // Lön, vilobrott och arbetstid kommer först
    expect(Array.from(document.querySelectorAll("[data-sak]")).slice(0, 2).map(e => e.getAttribute("data-sak"))).toEqual(["lon", "vila"]);
    // det som inte längre hör hit
    expect(t).not.toMatch(/väntar på bekräftelse|Allt annat stämmer|Allt stämmer|kunde inte kopplas|Anna Berg: /);
    expect(document.querySelector("[data-stammer]")).toBeNull();
  });

  it("raderna leder dit det fixas: hela raden är tryckbar (›, ingen Öppna-knapp) — lönen → Löneunderlag, personen → personen, maskinen → maskinen", async () => {
    mangaSaker();
    await monter("flik=oversikt");
    // Ingen knapp bredvid texten: raden är knappen, med › till höger.
    expect(blad("Öppna").length).toBe(0);
    expect(blad("Granska").length + blad("Se dagarna").length + blad("Bekräfta").length + blad("Visa").length).toBe(0);
    await klickRad("Lönen för september");
    expect(window.location.search).toContain("flik=lon");
    expect(window.location.search).toContain("underflik=underlag");
    expect(text()).toMatch(/Klart att skicka|att kolla|Väntar på föraren/);
    await klick("Översikt");
    await klickRad("Erik Lind");
    expect(window.location.search).toContain("person=m2");
    expect(text()).toContain("Personuppgifter");
    await klick("Översikt");
    await klickRad("Ny maskin i importen: H8E");
    expect(window.location.search).toContain("maskin=R64999");
    expect(text()).toContain("Ny maskin upptäckt i importen");
  });

  it("dagar som väntar på bekräftelse finns inte i Översikten (de bor i Lön → Dagar)", async () => {
    mangaSaker();
    await monter("flik=oversikt");
    expect(document.querySelector('[data-sak="dagar"]')).toBeNull();
    expect(text()).not.toContain("väntar på bekräftelse");
  });

  describe("lönen: 'N klara · M väntar på föraren'", () => {
    const MAN = (rader: any[], status: Record<string, string | null> = {}, skickat: string[] = [], extra: any = {}) => {
      g.__db.arbetsdag = rader.map(id => ({ medarbetare_id: id, datum: "2026-09-10", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: true }));
      g.__db.loneunderlag = Object.entries(status).map(([medarbetare_id, st]) => ({ medarbetare_id, period: "2026-09", status: st }));
      g.__db.fortnox_export_logg = skickat.map(medarbetare_id => ({ medarbetare_id, status: "skickat", period: "2026-10" }));
      Object.assign(g.__db.medarbetare.find((m: any) => m.id === "m2"), extra);
    };
    const lon = () => cont.querySelector<HTMLElement>('[data-sak="lon"]');

    it("två klara och en som väntar: båda talen, och raden leder till Löneunderlag", async () => {
      g.__db.medarbetare.push({ ...MED[0], id: "m3", namn: "Cecilia Dahl", user_id: "u3" });
      MAN(["m1", "m2", "m3"], { m1: "godkand_av_forare", m2: "inskickat" });
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("2 klara · 1 väntar på föraren");
      await klickRad("Lönen för september");
      expect(window.location.search).toContain("underflik=underlag");
    });
    it("ingen har godkänt: bara 'väntar' — aldrig '0 klara'", async () => {
      MAN(["m1", "m2"]);
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("2 väntar på föraren");
      expect(lon()!.textContent).not.toContain("0 klara");
    });
    it("alla har godkänt: bara 'klara'", async () => {
      MAN(["m1", "m2"], { m1: "godkand_av_forare", m2: "godkand_av_forare" });
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("2 klara");
      expect(lon()!.textContent).not.toContain("väntar på föraren");
    });
    it("en nollställd månad (status NULL) väntar igen, och en skickad räknas varken som klar eller väntande", async () => {
      MAN(["m1", "m2"], { m1: null, m2: "godkand_av_forare" }, ["m2"]);
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("1 väntar på föraren");
      expect(lon()!.textContent).not.toContain("klar");
    });
    it("en misslyckad sändning (status 'fel') är inte skickad: föraren räknas fortfarande", async () => {
      MAN(["m1", "m2"], { m1: "godkand_av_forare" });
      g.__db.fortnox_export_logg = [{ medarbetare_id: "m1", status: "fel", period: "2026-10" }];
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("1 klar · 1 väntar på föraren");
    });
    it("bara dagar i ARBETSmånaden räknas: en förare som bara har dagar i oktober hör inte till septemberlönen", async () => {
      MAN(["m1"]);
      g.__db.arbetsdag.push({ medarbetare_id: "m2", datum: "2026-10-05", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: true });
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("1 väntar på föraren");
    });
    it("allt skickat → ingen lönerad, och ingen 'skickad till Fortnox' som en sak som stämmer", async () => {
      MAN(["m1", "m2"], { m1: "godkand_av_forare", m2: "godkand_av_forare" }, ["m1", "m2"]);
      await monter("flik=oversikt");
      expect(lon()).toBeNull();
      expect(text()).toContain("Inget att göra");
    });
    it("företagsledare räknas inte (lönen ligger utanför appen)", async () => {
      MAN(["m1", "m2"], { m1: "godkand_av_forare" }, [], { foretagsledare: true });
      await monter("flik=oversikt");
      expect(lon()!.textContent).toContain("1 klar");
      expect(lon()!.textContent).not.toContain("väntar");
    });
    it("kan företagsledarna inte läsas är det också en rad med Försök igen — aldrig en lön som räknar med dem", async () => {
      MAN(["m1", "m2"]);
      seedFel("medarbetare");
      await monter("flik=oversikt");
      expect(document.querySelector('[data-sak="fel-lon"]')!.textContent).toContain("Kunde inte kontrollera lönen");
      expect(lon()).toBeNull();
    });
    it("kan godkännandena inte läsas är det en rad med Försök igen — aldrig en gissad siffra", async () => {
      MAN(["m1", "m2"]);
      seedFel("loneunderlag");
      await monter("flik=oversikt");
      expect(document.querySelector('[data-sak="fel-lon"]')!.textContent).toContain("Kunde inte kontrollera lönen");
      expect(lon()).toBeNull();
    });
  });

  describe("vilobrott → dagarna", () => {
    const RAD = "Vilobrott";   // en person → raden går rakt till hennes dagar
    const ark = () => document.body.querySelector("[data-vilobrott-ark]") as HTMLElement | null;
    const brottRad = (typ: string) => Array.from(document.body.querySelectorAll<HTMLElement>("[data-vilobrott]")).find(e => e.getAttribute("data-vilobrott")!.startsWith(typ))!;
    const oppnaBrott = async (typ: string) => {
      const knapp = brottRad(typ).querySelector("button")!;
      await act(async () => { knapp.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await lugn();
    };

    it("raderna är tryckbara hela vägen: › på varje, ingen Öppna-knapp, tryck på raden gör det knappen gjorde", async () => {
      mangaSaker();
      await monter("flik=oversikt");
      const rader = Array.from(cont.querySelectorAll<HTMLElement>("[data-sak]"));
      expect(rader.length).toBe(7);
      for (const r of rader) {
        expect(Array.from(r.querySelectorAll("button")).some(b => b.textContent === "Öppna"), r.getAttribute("data-sak")!).toBe(false);
        expect(r.textContent, r.getAttribute("data-sak")!).toContain("chevron_right");
        expect(r.querySelectorAll("button").length, r.getAttribute("data-sak")!).toBe(1);   // raden ÄR knappen
      }
    });

    it("tryck på vilobrottsraden öppnar ett ark med ETT brott per rad (adressen bär ?vila=), Stäng lämnar det", async () => {
      mangaSaker();
      await monter("flik=oversikt");
      expect(ark()).toBeNull();
      await klickRad(RAD);
      expect(ark()).not.toBeNull();
      expect(window.location.search).toContain("vila=m1");
      expect(window.location.search).toContain("flik=oversikt");
      expect(ark()!.textContent).toContain("Anna");
      expect(ark()!.textContent).toContain("2 obesvarade vilobrott");   // arkets egen rubrik
      expect(document.body.querySelectorAll("[data-vilobrott]")).toHaveLength(2);
      expect(brottRad("dygnsvila").textContent).toContain("8,5 h av 11 h");
      expect(brottRad("veckovila").textContent).toContain("av 36 h");
      // flera brott: stängda tills man trycker
      expect(document.body.querySelector("[data-vilobrott-detalj]")).toBeNull();
      await act(async () => { (Array.from(ark()!.querySelectorAll("button")).find(b => b.textContent === "Stäng") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await lugn();
      expect(ark()).toBeNull();
      expect(window.location.search).not.toContain("vila=");
    });

    it("en omladdning på ?vila=… landar i arket", async () => {
      mangaSaker();
      await monter("flik=oversikt&vila=m1");
      expect(ark()).not.toBeNull();
      expect(document.body.querySelectorAll("[data-vilobrott]")).toHaveLength(2);
    });

    it("dygnsvila: dagen före (slut) och dagen efter (start) med vilan mot kravet — och att brottet är obesvarat", async () => {
      mangaSaker();
      await monter("flik=oversikt");
      await klickRad(RAD);
      await oppnaBrott("dygnsvila");
      const d = document.body.querySelector("[data-vilobrott-detalj]")!;
      expect(d.querySelector('[data-vila-pass="2026-09-28"]')!.textContent).toContain("mån 28 sep");
      expect(d.querySelector('[data-vila-pass="2026-09-28"]')!.textContent).toContain("05:00–20:30");
      expect(d.querySelector('[data-vila-pass="2026-09-29"]')!.textContent).toContain("05:00–15:30");
      const vila = d.querySelector("[data-vila-vila]")!.textContent!;
      expect(vila).toContain("Vila 8,5 h · kravet 11 h");
      expect(vila).toContain("mån 20:30 → tis 05:00");
      // exakt två pass, vilan mellan dem
      const ordning = Array.from(d.querySelectorAll("[data-vila-pass],[data-vila-vila]")).map(e => e.hasAttribute("data-vila-vila") ? "vila" : e.getAttribute("data-vila-pass"));
      expect(ordning).toEqual(["2026-09-28", "vila", "2026-09-29"]);
      expect(d.querySelector("[data-vila-svar]")!.textContent).toContain("Obesvarat");
    });

    it("veckovila: veckan där den längsta vilan är utpekad, med passen runt den", async () => {
      mangaSaker();
      await monter("flik=oversikt");
      await klickRad(RAD);
      await oppnaBrott("veckovila");
      const d = document.body.querySelector("[data-vilobrott-detalj]")!;
      expect(d.textContent).toContain("7 dagar:");
      expect(d.querySelectorAll("[data-vila-vila]")).toHaveLength(1);
      expect(d.querySelector("[data-vila-vila]")!.textContent).toMatch(/Längsta vilan .* h · kravet 36 h.*sammanhängande/);
      expect(d.querySelectorAll("[data-vila-pass]").length).toBeGreaterThanOrEqual(5);
    });

    it("ett enda brott: dagarna står öppna från början (inget att välja)", async () => {
      mangaSaker();
      g.__db.arbetsdag = [
        { medarbetare_id: "m1", datum: "2026-09-28", start_tid: "05:00:00", slut_tid: "20:30:00", bekraftad: true },
        { medarbetare_id: "m1", datum: "2026-09-29", start_tid: "05:00:00", slut_tid: "15:30:00", bekraftad: true },
      ];
      await monter("flik=oversikt");
      await klickRad("Vilobrott");
      expect(document.body.querySelectorAll("[data-vilobrott]")).toHaveLength(1);
      expect(document.body.querySelector("[data-vilobrott-detalj]")).not.toBeNull();
      expect(document.body.querySelector('[data-vila-pass="2026-09-28"]')).not.toBeNull();
    });

    it("förarens svar visas när det finns — admin svarar inte själv; ett besvarat brott finns inte i arket", async () => {
      mangaSaker();
      g.__db.vilobrott = [{ id: "v1", medarbetare_id: "m1", datum: "2026-09-28", typ: "dygnsvila", vila_h: 8.5, krav_h: 11, besvarat_av_forare: true, orsak: "planerad_avtal", orsak_fritext: null }];
      await monter("flik=oversikt");
      await klickRad("Vilobrott");
      expect(document.body.querySelectorAll("[data-vilobrott]")).toHaveLength(1);
      expect(document.body.querySelector("[data-vilobrott]")!.getAttribute("data-vilobrott")).toMatch(/^veckovila/);
      expect(ark()!.textContent).not.toMatch(/Svara|Spara/);
    });

    describe("flera personer har obesvarade: raden öppnar en lista, listan öppnar personens dagar", () => {
      const tva = () => {
        mangaSaker();
        const anna = g.__db.arbetsdag.filter((d: any) => d.medarbetare_id === "m1" && (d.datum === "2026-09-28" || d.datum === "2026-09-29"));
        g.__db.medarbetare.push({ ...MED[1], id: "m9", namn: "Bertil Ek", user_id: "u9", maskin_id: "R64101", hem_lat: 56.4, hem_lng: 14.7 });
        g.__db.arbetsdag = [...g.__db.arbetsdag, ...anna.map((d: any) => ({ ...d, medarbetare_id: "m9" }))];
      };
      const lista = () => document.body.querySelector("[data-vilobrott-lista]") as HTMLElement | null;
      it("raden räknar alla ('3 obesvarade') och namnger ingen; trycket öppnar listan (adressen bär ?vila=alla)", async () => {
        tva();
        await monter("flik=oversikt");
        expect(document.querySelector('[data-sak="vila"]')!.textContent).toContain("3 obesvarade");
        expect(document.querySelector('[data-sak="vila"]')!.textContent).not.toMatch(/Anna|Bertil/);
        await klickRad("Vilobrott");
        expect(window.location.search).toContain("vila=alla");
        expect(lista()).not.toBeNull();
        expect(Array.from(lista()!.querySelectorAll("[data-vilobrott-person]")).map(e => e.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Anna Berg"), expect.stringContaining("Bertil Ek")]));
        expect(lista()!.querySelector('[data-vilobrott-person="m1"]')!.textContent).toContain("2 obesvarade");   // flest först
        expect(lista()!.querySelector('[data-vilobrott-person="m9"]')!.textContent).toContain("1 obesvarat");
        expect(Array.from(lista()!.querySelectorAll("[data-vilobrott-person]")).map(e => e.getAttribute("data-vilobrott-person"))).toEqual(["m1", "m9"]);
        expect(ark()).toBeNull();
      });
      it("tryck på en person → hennes dagar med '‹ Vilobrott' tillbaka till listan; Stäng lämnar allt", async () => {
        tva();
        await monter("flik=oversikt");
        await klickRad("Vilobrott");
        await act(async () => { (lista()!.querySelector('[data-vilobrott-person="m9"] button') as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        await lugn();
        expect(window.location.search).toContain("vila=m9");
        expect(ark()!.textContent).toContain("Bertil");
        expect(lista()).toBeNull();
        await act(async () => { (blad("‹ Vilobrott")[0].closest("button") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        await lugn();
        expect(window.location.search).toContain("vila=alla");
        expect(lista()).not.toBeNull();
        expect(ark()).toBeNull();
        await act(async () => { (blad("Stäng")[0].closest("button") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        await lugn();
        expect(window.location.search).not.toContain("vila=");
        expect(lista()).toBeNull();
      });
      it("i en persons dagar (uppifrån listan) lämnar Stäng allt på en gång — inte bara ett steg", async () => {
        tva();
        await monter("flik=oversikt&vila=m9");
        expect(ark()).not.toBeNull();
        await act(async () => { (blad("Stäng")[0].closest("button") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        await lugn();
        expect(ark()).toBeNull();
        expect(lista()).toBeNull();
        expect(window.location.search).not.toContain("vila=");
      });
      it("en omladdning på ?vila=alla landar i listan", async () => {
        tva();
        await monter("flik=oversikt&vila=alla");
        expect(lista()).not.toBeNull();
      });
      it("en enda person: ingen lista och ingen '‹ Vilobrott' — rakt till dagarna", async () => {
        mangaSaker();
        await monter("flik=oversikt");
        await klickRad("Vilobrott");
        expect(lista()).toBeNull();
        expect(ark()).not.toBeNull();
        expect(blad("‹ Vilobrott").length).toBe(0);
      });
    });

    it("Se hela månaden: öppnar Förare · Månad för just den föraren på just den dagen (adressen bär period, förare och dag)", async () => {
      mangaSaker();
      const m1 = SALARY.medarbetare[0] as any;
      g.__salary = { ...SALARY, medarbetare: [{ ...m1, dagar: [
        { id: "d28", datum: "2026-09-28", start_tid: "05:00", slut_tid: "20:30", arbetad_min: 870, extra_min: 0, rast_min: 30, objekt: [], km_totalt: 0, ersattningsmil: 0 },
        { id: "d29", datum: "2026-09-29", start_tid: "05:00", slut_tid: "15:30", arbetad_min: 600, extra_min: 0, rast_min: 30, objekt: [], km_totalt: 0, ersattningsmil: 0 },
      ] }] };
      await monter("flik=oversikt");
      await klickRad(RAD);
      await oppnaBrott("dygnsvila");
      await klick("Se hela månaden ›");
      expect(window.location.search).toContain("flik=lon");
      expect(window.location.search).toContain("period=2026-10");   // arbetsmånaden september = löneperiod oktober
      expect(window.location.search).toContain("forare=m1");
      expect(window.location.search).toContain("dag=2026-09-28");
      expect(window.location.search).not.toContain("vila=");
      expect(ark()).toBeNull();
      const manad = document.body.querySelector("[data-forare-manad]")!;
      expect(manad).not.toBeNull();
      // dagen står öppen
      const dagen = manad.querySelector('[data-dag="2026-09-28"]')!;
      expect(dagen.querySelector("[data-dag-detalj]")).not.toBeNull();
      expect(manad.querySelector('[data-dag="2026-09-29"] [data-dag-detalj]')).toBeNull();
    });

    it("pågående månad: Förare · Månad finns inte än — länken byts mot en rad som säger det, aldrig en död länk", async () => {
      mangaSaker();
      g.__db.arbetsdag = [
        { medarbetare_id: "m1", datum: "2026-10-05", start_tid: "05:00:00", slut_tid: "20:30:00", bekraftad: true },
        { medarbetare_id: "m1", datum: "2026-10-06", start_tid: "05:00:00", slut_tid: "15:30:00", bekraftad: true },
      ];
      await monter("flik=oversikt");
      await klickRad("Vilobrott");
      expect(document.body.querySelector('[data-vila-pass="2026-10-05"]')).not.toBeNull();
      expect(blad("Se hela månaden ›").length).toBe(0);
      // ingen förklarande text i stället: länken är bara borta
      expect(document.body.querySelector("[data-vila-manad-ej]")).toBeNull();
      expect(text()).not.toContain("Förare · Månad öppnas");
      expect(ark()!.textContent).toContain("Obesvarat");   // arket visar ändå dagarna och status
    });

    it("pågående månad: tidigare månad har länken kvar — det är innevarande månad som saknar den", async () => {
      mangaSaker();
      await monter("flik=oversikt");
      await klickRad(RAD);
      await oppnaBrott("dygnsvila");   // 28 sep, avslutad månad
      expect(blad("Se hela månaden ›").length).toBe(1);
    });

    it("Martin Lindqvist (företagsledare) ger inga vilobrott i Översikt — Anna med samma pass har dem kvar", async () => {
      mangaSaker();
      g.__db.medarbetare.push({ ...MED[1], id: "m9", namn: "Martin Lindqvist", foretagsledare: true, user_id: "u9", maskin_id: "R64101", hem_lat: 56.4, hem_lng: 14.7 });
      g.__db.arbetsdag = [...g.__db.arbetsdag, ...g.__db.arbetsdag.filter((d: any) => d.medarbetare_id === "m1").map((d: any) => ({ ...d, medarbetare_id: "m9" }))];
      await monter("flik=oversikt");
      // Anna har 2 (dygnsvila + veckovila); Martins identiska pass ger inga — raden räknar 2, inte 4, och går rakt till Anna
      expect(document.querySelector('[data-sak="vila"]')!.textContent).toContain("2 obesvarade");
      await klickRad("Vilobrott");
      expect(document.body.querySelector("[data-vilobrott-ark]")!.textContent).toContain("Anna");
      expect(document.body.textContent).not.toContain("Martin Lindqvist");
      // inte heller i Lön → Vilobrott (samma lista)
      await monter("flik=lon&underflik=vila");
      expect(text()).toContain("Anna Berg");
      expect(text()).not.toContain("Martin Lindqvist");
    });
  });

  it("en källa som inte går att läsa blir en egen rad med Försök igen — aldrig en tyst nolla", async () => {
    allaStammer();
    g.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/medarbetare/kontroller")) return { ok: false, status: 500, json: async () => ({ ok: false, error: "kontrollerna är nere" }) } as any;
      if (String(url).includes("/api/lon/arsovertid")) return { ok: true, status: 200, json: async () => ({ ok: true, ar: 2026, tak: 250, medarbetare: [], utjamning: [] }) } as any;
      if (String(url).includes("/api/lon/arbetstid")) return { ok: true, status: 200, json: async () => ({ ok: true, ar: 2026, tomDatum: "2026-10-13", forare: [], varningar: [] }) } as any;
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    await monter("flik=oversikt");
    expect(text()).toContain("Kunde inte kontrollera personerna");
    expect(text()).toContain("kontrollerna är nere");
    expect(text()).toContain("1 sak kräver dig");
    expect(blad("Försök igen").length).toBeGreaterThan(0);
    // Ett läsfel leder ingenstans: raden är ingen knapp med ›, bara "Försök igen" är en knapp — i blå accent (en handling, inte vit text).
    const fel = document.querySelector<HTMLElement>('[data-sak="fel-personer"]')!;
    expect(fel.textContent).not.toContain("chevron_right");
    expect(fel.querySelectorAll("button")).toHaveLength(1);
    const knapp = blad("Försök igen")[0].closest("button") as HTMLElement;
    expect(getComputedStyle(knapp).color).toBe(rgbAv(FARG.bla));
    expect(getComputedStyle(blad("kontrollerna är nere")[0]).color).not.toBe(rgbAv(FARG.bla));
    // …och trycket läser om
    const anrop = g.fetch.mock.calls.filter((c: any[]) => String(c[0]).includes("/api/medarbetare/kontroller")).length;
    await klick("Försök igen");
    expect(g.fetch.mock.calls.filter((c: any[]) => String(c[0]).includes("/api/medarbetare/kontroller")).length).toBeGreaterThan(anrop);
  });

  it("'idag' är LOKALT: klockan 00:30 den 1 oktober är 30 september en passerad dag — dess förare räknas i septemberlönen", async () => {
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30));
    g.__db.arbetsdag = [{ medarbetare_id: "m1", datum: "2026-09-30", start_tid: "06:00:00", slut_tid: "15:30:00", bekraftad: false }];
    await monter("flik=oversikt");
    expect(document.querySelector('[data-sak="lon"]')!.textContent).toContain("Lönen för september");
    expect(document.querySelector('[data-sak="lon"]')!.textContent).toContain("1 väntar på föraren");
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
    expect(text()).toContain("Inget att göra");
  });
});

describe("Medarbetare", () => {
  it("rollen visas som ord: Förare och Admin, aldrig databasvärdet", async () => {
    await monter("flik=medarbetare");
    // Grupper som i iOS Inställningar: rollen är rubriken, inte ett märke på varje rad.
    expect(blad("Förare (1)").length).toBe(1);
    expect(blad("Admin (1)").length).toBe(1);
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
    expect(text()).toContain("Anställningsnummer"); // numret finns nu på personen
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
    expect(text()).toContain("Admin (1)");
    expect(text()).not.toContain("Förare (");
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

describe("Maskiner: ingång till Produktionshistorik", () => {
  it("admin ser raden Produktionshistorik (2011–2026) i Maskiner, och trycket går till /admin/historik", async () => {
    g.__push = [];
    await monter("flik=maskiner");
    expect(blad("Produktionshistorik").length).toBeGreaterThan(0);
    expect(text()).toContain("2011–2026");
    await klick("Produktionshistorik");
    expect(g.__push).toEqual(["/admin/historik"]);
  });
  it("förare ser ingen rad", async () => {
    g.__push = [];
    await monter("flik=maskiner", <AdminClient currentUser={{ id: "m1", namn: "Anna Berg", roll: "forare" }} />);
    expect(blad("Rottne H8E").length).toBeGreaterThan(0);
    expect(text()).not.toContain("Produktionshistorik");
  });
  it("raden finns bara i listan, inte inne på en maskin", async () => {
    await monter("flik=maskiner&maskin=R64101");
    expect(text()).not.toContain("Produktionshistorik");
  });
});

describe("Avtal", () => {
  async function andraOvertid() {
    await monter("flik=avtal");
    await skriv(falt("Övertidsersättning vardag"), "55.5");
    await klick("Spara");
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
    await klick("Spara");
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

describe("Avtal → Avtalet som PDF (privat bucket avtal)", () => {
  const pdfFil = (over: Partial<{ name: string; type: string; size: number }> = {}) => {
    const f = new File(["%PDF-1.7 testinnehåll"], over.name ?? "Skogsbruk arbetare 2025-2027.pdf", { type: over.type ?? "application/pdf" });
    if (over.size != null) Object.defineProperty(f, "size", { value: over.size });
    return f;
  };
  async function valjFil(f: File) {
    const input = cont.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(input, "files", { value: [f], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await lugn();
  }
  const medKolumn = (path: string | null = null) => { g.__db.gs_avtal[0].avtal_pdf_path = path; };

  it("kolumnen finns inte än (migrationen ej körd): sidan säger det och erbjuder ingen uppladdning", async () => {
    await monter("flik=avtal");
    expect(text()).toContain("Avtalet som PDF");
    expect(text()).toContain("databasen saknar kolumnen avtal_pdf_path");
    expect(text()).toContain("20261014101036_avtal_pdf_bucket.sql");
    expect(cont.querySelector('input[type="file"]')).toBeNull();
    expect(blad("Ladda upp PDF").length).toBe(0);
  });

  it("ingen PDF än: 'Inte uppladdad än', uppladdningsknapp, ingen Öppna-knapp", async () => {
    medKolumn(null);
    await monter("flik=avtal");
    expect(text()).toContain("Inte uppladdad än");
    expect(text()).toContain("Avtalet är inte uppladdat än");   // det förarna ser tills filen finns
    expect(blad("Ladda upp PDF").length).toBe(1);
    expect(blad("Öppna PDF").length).toBe(0);
  });

  it("väljer man en PDF: den går till bucketen avtal på avtalets egen sökväg (upsert) och sökvägen sparas på avtalsraden", async () => {
    medKolumn(null);
    await monter("flik=avtal");
    await valjFil(pdfFil());
    expect(g.__storage.upp).toEqual([{ bucket: "avtal", path: "a1.pdf", namn: "Skogsbruk arbetare 2025-2027.pdf", typ: "application/pdf", opts: { upsert: true, contentType: "application/pdf" } }]);
    expect(g.__db.gs_avtal[0].avtal_pdf_path).toBe("a1.pdf");
    expect(g.__skriv.find((x: any) => x.tabell === "gs_avtal" && x.op === "update").vals).toEqual({ avtal_pdf_path: "a1.pdf" });
    expect(g.__eq.some((e: any) => e[0] === "gs_avtal" && e[1] === "id" && e[2] === "a1")).toBe(true);
    expect(text()).toContain("PDF:en är uppladdad");
    expect(text()).toContain("Uppladdad");
    expect(blad("Ersätt PDF").length).toBe(1);
    expect(blad("Öppna PDF").length).toBe(1);
  });

  it("det som står i formuläret men inte är sparat går inte förlorat när PDF:en laddas upp, och Spara väntar fortfarande", async () => {
    medKolumn(null);
    await monter("flik=avtal");
    await skriv(falt("Övertidsersättning vardag"), "61.5");
    await valjFil(pdfFil());
    expect(falt("Övertidsersättning vardag").value).toBe("61.5");
    expect(g.__db.gs_avtal[0].overtid_vardag_kr).not.toBe(61.5);
    const spara = blad("Spara").map(e => e.closest("button")!).find(Boolean)!;
    expect(spara.disabled).toBe(false);
    // ...och en PDF-uppladdning skriver aldrig formulärets fält
    expect(Object.keys(g.__skriv.find((x: any) => x.tabell === "gs_avtal" && x.op === "update").vals)).toEqual(["avtal_pdf_path"]);
  });

  it("ersätta: en ny uppladdning går till samma sökväg", async () => {
    medKolumn("a1.pdf");
    await monter("flik=avtal");
    expect(text()).toContain("Uppladdad");
    await valjFil(pdfFil({ name: "nytt.pdf" }));
    expect(g.__storage.upp).toHaveLength(1);
    expect(g.__storage.upp[0].path).toBe("a1.pdf");
    expect(g.__storage.upp[0].opts.upsert).toBe(true);
  });

  it("en fil som inte är en PDF, en tom och en för stor avvisas före uppladdning — med en mening som säger vad man gör", async () => {
    medKolumn(null);
    await monter("flik=avtal");
    await valjFil(pdfFil({ name: "avtal.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    expect(text()).toContain("Filen är inte en PDF. Välj avtalet som PDF-fil.");
    await valjFil(pdfFil({ size: 21 * 1024 * 1024 }));
    expect(text()).toContain("Filen är för stor (21 MB). Största tillåtna är 20 MB.");
    expect(g.__storage.upp).toHaveLength(0);
    expect(g.__skriv.filter((x: any) => x.tabell === "gs_avtal")).toHaveLength(0);
  });

  it("uppladdningen misslyckas (t.ex. policyn): felet står, ingenting kopplas till avtalsraden och det står aldrig 'uppladdad'", async () => {
    medKolumn(null);
    g.__storage.uppFel = "new row violates row-level security policy";
    await monter("flik=avtal");
    await valjFil(pdfFil());
    expect(text()).toContain("PDF:en laddades inte upp: new row violates row-level security policy");
    expect(g.__skriv.filter((x: any) => x.tabell === "gs_avtal")).toHaveLength(0);
    expect(text()).not.toContain("PDF:en är uppladdad");
    expect(text()).toContain("Inte uppladdad än");
  });

  it("filen laddades upp men raden skrevs inte (RLS: 0 rader utan fel): det står, och PDF:en visas inte som uppladdad", async () => {
    medKolumn(null);
    await monter("flik=avtal");
    g.__ingaRader = true;
    await valjFil(pdfFil());
    expect(text()).toContain("PDF:en laddades upp men kopplades inte till avtalet");
    expect(text()).not.toContain("PDF:en är uppladdad");
    expect(text()).toContain("Inte uppladdad än");
  });

  it("Öppna PDF: en signerad länk med kort giltighet (60 s) för just den sökvägen, i en flik som öppnades i klicket", async () => {
    medKolumn("a1.pdf");
    const flik = { location: { href: "" }, close: vi.fn() };
    const oppna = vi.spyOn(window, "open").mockImplementation(() => flik as any);
    await monter("flik=avtal");
    await klick("Öppna PDF");
    expect(oppna).toHaveBeenCalledWith("", "_blank");
    expect(g.__storage.signerade).toEqual([{ bucket: "avtal", path: "a1.pdf", sek: 60 }]);
    expect(flik.location.href).toBe("https://signerad.example/avtal/a1.pdf?t=1");
    expect(flik.close).not.toHaveBeenCalled();
  });

  it("Öppna PDF när filen saknas i bucketen: 'Avtalet är inte uppladdat än' i sidan, ingen blank flik kvar", async () => {
    medKolumn("a1.pdf");
    g.__storage.signFel = { message: "Object not found", statusCode: "404" };
    const flik = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockImplementation(() => flik as any);
    await monter("flik=avtal");
    await klick("Öppna PDF");
    expect(text()).toContain("Avtalet är inte uppladdat än");
    expect(flik.close).toHaveBeenCalled();
    expect(flik.location.href).toBe("");
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
  // Anställningsnumret ändras på PERSONEN (testerna "Anställningsnummer på personen"). Lönesystem visar bara vilka som saknar det.
  it("anställningsnummer: Lönesystem redigerar inte numret — en rad 'N saknar anställningsnummer' med Fyll i som öppnar personen", async () => {
    await monter("flik=lon&underflik=system");
    expect(cont.querySelectorAll("input").length).toBe(0); // inga fält, inga Spara-knappar
    expect(text()).toContain("1 saknar anställningsnummer");
    expect(text()).toContain("Erik"); // Erik saknar nummer, Anna har 1001
    expect(text()).not.toContain("Anna Berg");
    await klick("Fyll i");
    expect(window.location.search).toContain("flik=medarbetare");
    expect(window.location.search).toContain("person=m2");
  });
  it("anställningsnummer: flera saknas → Fyll i öppnar personlistan", async () => {
    g.__db.medarbetare_lonesystem = [];
    await monter("flik=lon&underflik=system");
    expect(text()).toContain("2 saknar anställningsnummer");
    await klick("Fyll i");
    expect(window.location.search).toContain("flik=medarbetare");
    expect(window.location.search).not.toContain("person=");
  });
  it("anställningsnummer: en företagsledare behöver inget nummer och räknas inte", async () => {
    g.__db.medarbetare[1].foretagsledare = true;
    await monter("flik=lon&underflik=system");
    expect(text()).not.toContain("saknar anställningsnummer");
    expect(blad("Fyll i").length).toBe(0);
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
    // (Ordet "Körersättning" får finnas: det är Fortnox-namnet på koden, som står bredvid löneraden. Kronor får inte.)
    expect(t).not.toMatch(/\d\s?kr\b/);
  });
  it("Fortnox-granskningen är innehållet, och visas även när månaden saknar arbetsdagar", async () => {
    await monter("flik=lon");
    // Svaret först (är det klart att skicka?), månaden är arbetsmånaden och bredvid står vilken månad lönen kommer.
    expect(cont.querySelector("[data-svar]")!.textContent).toMatch(/Klart att skicka|att kolla/);
    expect(cont.querySelector("[data-arbetsmanad]")!.textContent).toMatch(/^September( 2026)?$/);
    expect(cont.querySelector("[data-utbetalning]")!.textContent).toBe("lön i oktober");
    expect(cont.querySelector("[data-arbetsmanad]")!.parentElement!.textContent).toMatch(/^September( 2026)? · lön i oktober$/);
    expect(text()).not.toContain("Löneperiod");
    expect(blad("Skicka 1 till Fortnox").length).toBeGreaterThan(0);
  });
  it("allt kopplat och inget att kolla: svaret är 'Klart att skicka' — och en sak att kolla gör det till '1 sak att kolla'", async () => {
    const kopplad = Object.fromEntries(["timlon", "premielon_skordare", "premielon_skotare", "overtid_skordare", "overtid_skotare", "valtlappar", "korersattning", "helglon_skordare", "helglon_skotare", "brandrisk_ob"].map(k => [k, { kod: "1", namn: "x" }]));
    g.__salary = { ...SALARY, kopplingar: kopplad };
    await monter("flik=lon");
    expect(cont.querySelector("[data-svar]")!.textContent).toContain("Klart att skicka");
    expect(cont.querySelector("[data-svar]")!.textContent).toContain("1 förare · 2 lönerader");
    await act(async () => { root.unmount(); }); cont.remove();
    g.__salary = { ...SALARY, kopplingar: kopplad, medarbetare: [{ ...SALARY.medarbetare[0], obekraftade: 2 }] };
    await monter("flik=lon");
    expect(cont.querySelector("[data-svar]")!.textContent).toContain("1 sak att kolla");
  });

  it("'Se dagen' öppnar Dagar på SAMMA arbetsmånad med bara avvikelserna (arbetsmånad september = en månad bakåt från oktober)", async () => {
    g.__salary = { ...SALARY, medarbetare: [{ ...SALARY.medarbetare[0], rast_langa: [{ datum: "2026-09-11", rast_min: 114, avbrott: [] }] }] };
    await monter("flik=lon");
    expect(text()).toContain("11 sep: rast 114 min");
    await klick("Se dagen");
    expect(window.location.search).toContain("underflik=dagar");
    expect(window.location.search).toContain("dagoff=-1");
    expect(window.location.search).toContain("avv=1");
  });

  it("bekräftelsen säger arbetsmånaden och vilken månad lönen kommer (inget datum) — aldrig 'Löneperiod'", async () => {
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    const t = document.body.querySelector<HTMLElement>("[data-skicka-dialog]")!.textContent!;
    expect(t).toMatch(/September( 2026)? · lön i oktober/);
    expect(t).not.toMatch(/betalas|25 oktober/);
    expect(t).not.toContain("Löneperiod");
    expect(t).not.toContain("arbetstid");
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
  // Sex pass i rad (14 tim vila mellan dem) + natten med 8,5 tim vila: en vecka utan 36 tim (veckovila) och en natt under 11 tim (dygnsvila).
  // Utan de sex först vore tiden före första passet vila och bara dygnsvilan bröts (de ändarna räknas som vila sedan 2026-10-14).
  const dagar = [
    ...["22", "23", "24", "25", "26", "27"].map(dd => ({ medarbetare_id: "m1", datum: `2026-09-${dd}`, start_tid: "05:00:00", slut_tid: "15:00:00", arbetad_min: 600 })),
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

  it("steg 1: en NY person skapas av servern (rad + inbjudan) — webbläsaren skriver ingenting i medarbetare — och man hamnar på steg 2", async () => {
    await monter("flik=medarbetare&ny=1");
    await skriv(falt("Namn"), "Nils Ek");
    await skriv(falt("E-post"), "nils@example.se");
    await skriv(falt("Telefon"), "070-123 45 67");
    await valj(valFalt("Roll"), "admin");
    await klick("Bjud in och fortsätt");
    expect(g.__bjudInAnrop).toEqual([{ namn: "Nils Ek", epost: "nils@example.se", telefon: "070-123 45 67", roll: "admin" }]);
    expect(g.__skriv.filter((x: any) => x.tabell === "medarbetare" && x.op === "insert")).toEqual([]);
    const ny = g.__db.medarbetare.find((m: any) => m.namn === "Nils Ek");
    expect(ny).toMatchObject({ epost: "nils@example.se", roll: "admin", telefon: "070-123 45 67" });
    expect(window.location.search).toContain(`person=${ny.id}`);
    expect(window.location.search).toContain("steg=2");
    expect(text()).toContain("Steg 2 av 4");
    expect(stegRad("Namn och e-post").getAttribute("data-klar")).toBe("true");
  });

  it("steg 1: texten under e-posten säger att personen får ett mail och väljer lösenord själv, och knappen heter Bjud in", async () => {
    await monter("flik=medarbetare&ny=1");
    expect(text()).toContain("Personen får ett mail med en länk och väljer själv sitt lösenord.");
    expect(blad("Bjud in och fortsätt").length).toBe(1);
    expect(blad("Spara och fortsätt").length).toBe(0);
  });

  it("steg 1: servern säger nej (e-posten finns redan, mailet gick inte) → felet står kvar på steg 1, ingen person och inget steg 2", async () => {
    await monter("flik=medarbetare&ny=1");
    await skriv(falt("Namn"), "Nils Ek");
    await skriv(falt("E-post"), "nils@example.se");
    g.__bjudIn = () => ({ status: 409, body: { ok: false, error: "Oskar har redan en inloggning med den e-postadressen." } });
    await klick("Bjud in och fortsätt");
    expect(text()).toContain("Oskar har redan en inloggning");
    expect(text()).toContain("Steg 1 av 4");
    expect(g.__db.medarbetare.some((m: any) => m.namn === "Nils Ek")).toBe(false);
  });

  it("steg 1: e-post krävs för en ny person (knappen är avstängd utan den)", async () => {
    await monter("flik=medarbetare&ny=1");
    await skriv(falt("Namn"), "Nils Ek");
    expect(blad("Bjud in och fortsätt")[0].closest("button")!.disabled).toBe(true);
    expect(g.__bjudInAnrop).toEqual([]);
  });

  it("steg 1 för en person UTAN inloggning: 'Skicka inbjudan igen' skickar om (servern återanvänder raden); en med inloggning har ingen sådan knapp", async () => {
    nyPerson();
    await monter("flik=medarbetare&ny=1&person=n1&steg=1");
    await klick("Skicka inbjudan igen");
    expect(g.__bjudInAnrop).toHaveLength(1);
    expect(g.__bjudInAnrop[0]).toMatchObject({ epost: "nils@example.se" });
    expect(text()).toContain("Ny inbjudan är skickad.");
    expect(text()).toContain("Steg 1 av 4");
  });

  it("steg 1 för en person MED inloggning: ingen 'Skicka inbjudan igen', och sparandet är en vanlig uppdatering som förut", async () => {
    nyPerson({ user_id: "u1" });
    await monter("flik=medarbetare&ny=1&person=n1&steg=1");
    expect(blad("Skicka inbjudan igen").length).toBe(0);
    expect(text()).toContain("Inloggning kopplad.");
    await klick("Spara och fortsätt");
    expect(g.__bjudInAnrop).toEqual([]);
    expect(g.__skriv.some((x: any) => x.tabell === "medarbetare" && x.op === "update")).toBe(true);
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
    expect(falt("Anställningsnummer").value).toBe("1001");
    await skriv(falt("Anställningsnummer"), "2002");
    await klick("Spara");
    expect(g.__db.medarbetare_lonesystem.find((r: any) => r.medarbetare_id === "m1").anstallningsnummer).toBe("2002");
  });
  it("misslyckas skrivningen står felet kvar på personen — man lämnar inte formuläret", async () => {
    await monter("flik=medarbetare&person=m1");
    await skriv(falt("Anställningsnummer"), "2002");
    g.__ingaRader = true;
    await klick("Spara");
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


describe("Lönearter: vad i appen skickas som vilken löneart i Fortnox", () => {
  const rad = (key: string) => cont.querySelector<HTMLElement>(`[data-loneart="${key}"]`)!;
  const raderna = () => Array.from(cont.querySelectorAll("[data-loneart]")).map(e => e.getAttribute("data-loneart"));
  const faltKod = () => document.body.querySelector<HTMLInputElement>("#falt-kod-i-fortnox")!;
  const faltNamn = () => document.body.querySelector<HTMLInputElement>("#falt-namn-i-fortnox")!;
  const arket = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
  const sparaKnapp = () => blad("Spara")[0].closest("button") as HTMLButtonElement;
  const oppna = async (key: string) => { await act(async () => { rad(key).querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await lugn(); };
  const tryckSpara = async () => { await act(async () => { sparaKnapp().dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await lugn(); };
  const skrivningar = () => g.__skriv.filter((w: any) => w.tabell === "lonesystem_artikelmappning");
  const mappning = (typ: string) => g.__db.lonesystem_artikelmappning.filter((r: any) => r.intern_typ === typ);

  it("en egen flik under Lön, och listan är lönearterna i exportens ordning under två rubriker", async () => {
    await monter("flik=lon&underflik=lonearter");
    expect(blad("Lönearter").length).toBeGreaterThan(0);
    expect(raderna()).toEqual(["timlon", "premielon_skordare", "premielon_skotare", "overtid_skordare", "overtid_skotare", "valtlappar", "korersattning", "helglon_skordare", "helglon_skotare", "brandrisk_ob"]);
    expect(text()).toContain("Timlön och övertid");
    expect(text()).toContain("Tillägg");
  });

  it("helglön är två lönearter, en per maskintyp, båda tomma tills någon fyller i koden", async () => {
    await monter("flik=lon&underflik=lonearter");
    for (const [key, namn] of [["helglon_skordare", "Helglön skördare"], ["helglon_skotare", "Helglön skotare"]]) {
      expect(rad(key).textContent).toContain(namn);
      expect(rad(key).textContent).toContain("Ej kopplad");
    }
    expect(rad("helglon_skordare").textContent).toContain("förare som mest kör skördare");
    expect(rad("helglon_skotare").textContent).toContain("förare som mest kör skotare");
    expect(cont.querySelector('[data-loneart="helglon"]')).toBeNull();
  });

  it("brandrisk-OB: EN ny löneart, tom kod som standard ('Ej kopplad'), och ingen annan OB eller nattillägg i listan", async () => {
    await monter("flik=lon&underflik=lonearter");
    expect(rad("brandrisk_ob").textContent).toContain("Brandrisk – OB");
    expect(rad("brandrisk_ob").textContent).toContain("Ej kopplad");
    expect(raderna().filter(k => /ob|natt/i.test(k || ""))).toEqual(["brandrisk_ob"]);   // kväll/lördag/söndag och nattillägg finns inte
    expect(text()).not.toContain("nattillägg");
  });

  it("varje rad visar kod OCH namnet i Fortnox, och en löneart utan rad står som 'Ej kopplad'", async () => {
    await monter("flik=lon&underflik=lonearter");
    expect(rad("timlon").textContent).toContain("11");
    expect(rad("timlon").textContent).not.toContain("I Fortnox");          // samma namn som rubriken: står inte en gång till
    expect(rad("korersattning").textContent).toContain("821");
    expect(rad("korersattning").textContent).toContain("I Fortnox: Körersättning skattefri");
    expect(rad("helglon_skordare").textContent).toContain("Ej kopplad");
    expect(rad("helglon_skordare").textContent).not.toContain("1461");
  });

  it("koden kommer ur databasen: ändras raden där ändras listan (inget är hårdkodat)", async () => {
    g.__db.lonesystem_artikelmappning.find((r: any) => r.intern_typ === "timlon").extern_kod = "99";
    g.__db.lonesystem_artikelmappning.find((r: any) => r.intern_typ === "timlon").beskrivning = "Timlön, tim";
    await monter("flik=lon&underflik=lonearter");
    expect(rad("timlon").textContent).toContain("99");
    expect(rad("timlon").textContent).toContain("Timlön, tim");
    expect(rad("timlon").textContent).not.toContain("11");
  });

  it("en kod utan namn säger det (inga koder utan namn)", async () => {
    g.__db.lonesystem_artikelmappning.find((r: any) => r.intern_typ === "valtlappar").beskrivning = "";
    await monter("flik=lon&underflik=lonearter");
    expect(rad("valtlappar").textContent).toContain("136");
    expect(rad("valtlappar").textContent).toContain("Namnet i Fortnox saknas");
  });

  it("överst: vad som saknas och vad det betyder. Frivilliga lönearter (premien) räknas inte", async () => {
    g.__db.lonesystem_artikelmappning = g.__db.lonesystem_artikelmappning.filter((r: any) => !r.intern_typ.startsWith("premielon"));
    await monter("flik=lon&underflik=lonearter");
    const banner = cont.querySelector("[data-lonearter-saknas]")!;
    expect(banner.textContent).toMatch(/3 lönearter saknar kod: Helglön skördare, Helglön skotare, Brandrisk – OB/);   // OB-raden har tom kod som standard
    expect(banner.textContent).not.toContain("Premielön");
    expect(rad("premielon_skordare").textContent).toContain("Ej kopplad");
    expect(rad("premielon_skordare").textContent).toContain("Frivillig");
  });

  it("allt kopplat: ingen varning överst", async () => {
    g.__db.lonesystem_artikelmappning.push({ id: "x8", lonesystem_id: "ls1", intern_typ: "helglon_skordare", extern_kod: "1461", beskrivning: "Helglön, timmar", skapad: "2026-10-15" });
    g.__db.lonesystem_artikelmappning.push({ id: "x9", lonesystem_id: "ls1", intern_typ: "helglon_skotare", extern_kod: "1462", beskrivning: "Helglön, timmar 2", skapad: "2026-10-15" });
    g.__db.lonesystem_artikelmappning.push({ id: "x10", lonesystem_id: "ls1", intern_typ: "brandrisk_ob", extern_kod: "147", beskrivning: "OB", skapad: "2026-10-15" });
    await monter("flik=lon&underflik=lonearter");
    expect(cont.querySelector("[data-lonearter-saknas]")).toBeNull();
  });

  it("tryck på raden öppnar ett ark med kod, namn och vad lönearten är; Spara är grå tills något ändrats", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("helglon_skordare");
    expect(arket()).not.toBeNull();
    expect(arket()!.textContent).toContain("Helglön");
    expect(arket()!.textContent).toContain("8 timmar för varje röd vardag");
    expect(faltKod().value).toBe("");
    expect(sparaKnapp().disabled).toBe(true);
    await skriv(faltKod(), "1461");
    expect(sparaKnapp().disabled).toBe(false);
    await skriv(faltKod(), "");
    expect(sparaKnapp().disabled).toBe(true);
  });

  it("ny koppling: en rad skapas på Fortnox-kopplingen, arket stängs och listan visar den — utan kolumnen 'uppdaterad'", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("helglon_skordare");
    await skriv(faltKod(), " 1461 ");
    await skriv(faltNamn(), "Helglön, timmar");
    await tryckSpara();
    expect(mappning("helglon_skordare")).toEqual([expect.objectContaining({ lonesystem_id: "ls1", extern_kod: "1461", beskrivning: "Helglön, timmar" })]);
    expect(skrivningar().every((w: any) => !("uppdaterad" in (w.vals || {})))).toBe(true);
    expect(arket()).toBeNull();
    expect(rad("helglon_skordare").textContent).toContain("1461");
    expect(rad("helglon_skordare").textContent).toContain("Helglön, timmar");
    // skotarlönearten saknar fortfarande kod: bannern nämner bara den
    expect(cont.querySelector("[data-lonearter-saknas]")!.textContent).toMatch(/2 lönearter saknar kod: Helglön skotare, Brandrisk – OB/);
  });

  it("ändra en befintlig kod: samma rad uppdateras (ingen dubblett)", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("overtid_skordare");
    expect(faltKod().value).toBe("1435");
    await skriv(faltKod(), "1450");
    await tryckSpara();
    expect(mappning("overtid_skordare")).toHaveLength(1);
    expect(mappning("overtid_skordare")[0].extern_kod).toBe("1450");
    expect(skrivningar().map((w: any) => w.op)).toEqual(["update"]);
  });

  describe("Namnet i Fortnox fylls i av koden (och går att ändra)", () => {
    it("ny kod 1462: namnet fylls i, arket säger att det skedde automatiskt, och det sparas", async () => {
      await monter("flik=lon&underflik=lonearter");
      await oppna("helglon_skotare");
      expect(faltNamn().value).toBe("");
      await skriv(faltKod(), "1462");
      expect(faltNamn().value).toBe("Helglön, timmar 2");
      expect(arket()!.textContent).toContain("Fylldes i automatiskt");
      await tryckSpara();
      expect(mappning("helglon_skotare")).toEqual([expect.objectContaining({ extern_kod: "1462", beskrivning: "Helglön, timmar 2" })]);
      expect(rad("helglon_skotare").textContent).toContain("Helglön, timmar 2");
    });

    it("hela de tio kända koderna ger sitt namn", async () => {
      await monter("flik=lon&underflik=lonearter");
      await oppna("helglon_skordare");
      for (const [kod, namn] of [["11", "Timlön"], ["136", "Vältlappar mm"], ["147", "OB tillägg natt"], ["821", "Körersättning skattefri"], ["1354", "Premielön skotare"],
        ["1355", "Premielön skördare"], ["1435", "Övertid skördare"], ["1436", "Övertid skotare"], ["1461", "Helglön, timmar"], ["1462", "Helglön, timmar 2"]]) {
        await skriv(faltKod(), kod);
        expect(faltNamn().value, kod).toBe(namn);
      }
    });

    it("ett namn du skrivit själv skrivs aldrig över när koden ändras", async () => {
      await monter("flik=lon&underflik=lonearter");
      await oppna("helglon_skordare");
      await skriv(faltKod(), "1461");
      await skriv(faltNamn(), "Helglön (egen text)");
      await skriv(faltKod(), "1462");
      expect(faltNamn().value).toBe("Helglön (egen text)");
      await tryckSpara();
      expect(mappning("helglon_skordare")[0].beskrivning).toBe("Helglön (egen text)");
    });

    it("okänd kod: namnet gissas inte — ett tomt fält förblir tomt, och ett automatiskt ifyllt namn tas bort igen", async () => {
      await monter("flik=lon&underflik=lonearter");
      await oppna("helglon_skordare");
      await skriv(faltKod(), "999");
      expect(faltNamn().value).toBe("");
      await skriv(faltKod(), "1461");
      expect(faltNamn().value).toBe("Helglön, timmar");
      await skriv(faltKod(), "999");
      expect(faltNamn().value).toBe("");
      expect(arket()!.textContent).not.toContain("Fylldes i automatiskt");
    });

    it("befintlig rad: ett annat känt namn byter namn med koden, men ett okänt nummer lämnar det sparade namnet", async () => {
      await monter("flik=lon&underflik=lonearter");
      await oppna("overtid_skordare");
      expect(faltNamn().value).toBe("Övertid skördare");           // sparat namn, rörs inte av att arket öppnas
      expect(arket()!.textContent).not.toContain("Fylldes i automatiskt");
      await skriv(faltKod(), "1450");
      expect(faltNamn().value).toBe("Övertid skördare");           // okänd kod: det sparade stannar
      await skriv(faltKod(), "1436");
      expect(faltNamn().value).toBe("Övertid skotare");
    });
  });

  it("tom kod = koppla bort: raden tas bort, listan säger 'Ej kopplad', och arket sa det före", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("valtlappar");
    expect(arket()!.textContent).toContain("Lämna tomt för att koppla bort");
    await skriv(faltKod(), "");
    expect(arket()!.textContent).toContain("Utan kod skickas inga rader för Vältlappar");
    await tryckSpara();
    expect(mappning("valtlappar")).toEqual([]);
    expect(skrivningar().map((w: any) => w.op)).toEqual(["delete"]);
    expect(rad("valtlappar").textContent).toContain("Ej kopplad");
    expect(cont.querySelector("[data-lonearter-saknas]")!.textContent).toContain("Vältlappar");
  });

  it("samma kod som en annan löneart varnas för men går att spara", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("helglon_skordare");
    await skriv(faltKod(), "11");
    expect(arket()!.textContent).toContain("Samma kod används redan av Timlön");
    expect(sparaKnapp().disabled).toBe(false);
    await tryckSpara();
    expect(mappning("helglon_skordare")[0].extern_kod).toBe("11");
  });

  it("ogiltig kod: förklaras, Spara är grå, ingenting skrivs", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("helglon_skordare");
    await skriv(faltKod(), "11 11");
    expect(arket()!.textContent).toContain("Koden får bara innehålla siffror och bokstäver");
    expect(sparaKnapp().disabled).toBe(true);
    expect(skrivningar()).toEqual([]);
  });

  it("skrivningen stoppas (RLS: 0 rader utan fel): felet står i arket och arket stängs inte", async () => {
    await monter("flik=lon&underflik=lonearter");
    await oppna("overtid_skordare");
    await skriv(faltKod(), "1450");
    g.__ingaRader = true;
    await tryckSpara();
    expect(arket()!.textContent).toContain("Ändringen sparades inte");
    expect(mappning("overtid_skordare")[0].extern_kod).toBe("1435");
  });

  it("utan Fortnox-koppling: sidan säger det och inget skrivs", async () => {
    g.__db.lonesystem_koppling = [];
    g.__db.lonesystem_artikelmappning = [];
    await monter("flik=lon&underflik=lonearter");
    expect(text()).toContain("Anslut Fortnox under Lönesystem först");
    await oppna("helglon_skordare");
    await skriv(faltKod(), "1461");
    await tryckSpara();
    expect(arket()!.textContent).toContain("Anslut Fortnox först");
    expect(skrivningar()).toEqual([]);
  });

  it("läsfel: felet står kvar med Försök igen, och listan visar INTE allt som 'Ej kopplad'", async () => {
    g.__dbFel = { lonesystem_artikelmappning: "permission denied" };
    await monter("flik=lon&underflik=lonearter");
    expect(text()).toContain("permission denied");
    expect(blad("Försök igen").length).toBeGreaterThan(0);
    expect(raderna()).toEqual([]);
  });

  it("Lönesystem-fliken har inte längre någon kodlista (en plats, inte två)", async () => {
    await monter("flik=lon&underflik=system");
    expect(text()).not.toContain("Löneartskoder");
    expect(cont.querySelectorAll("input[aria-label$=', extern kod']")).toHaveLength(0);
    expect(text()).toContain("Anställningsnummer");
  });
});

describe("Löneunderlag: förhandsvisning rad för rad", () => {
  const lr = (loneart: string, mangd: string, status: string, kod: string | null = null) => ({ loneart, mangd, status, kod: status === "skickas" ? kod : null, beskrivning: "" });
  const radEl = (key: string) => cont.querySelector<HTMLElement>(`[data-lonerad="${key}"]`)!;
  const dialog = () => document.body.querySelector<HTMLElement>("[data-skicka-dialog]");
  const posta = () => g.__fetchAnrop.filter((a: any[]) => a[0].includes("/api/fortnox/salary-export") && JSON.parse(a[2] || "{}").dry_run !== true);
  const knappIDialog = (t: string) => Array.from(dialog()!.querySelectorAll("button")).find(b => b.textContent === t) as HTMLButtonElement | undefined;
  const klickaDialog = async (t: string) => { await act(async () => { knappIDialog(t)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await lugn(); };
  const utanHelglonskod = () => ({
    ...SALARY, blockerande: [{ loneart: "helglon_skordare", label: "Helglön skördare", enhet: "tim", forare: [{ namn: "Anna Berg", mangd: "24.00" }] }],
    medarbetare: [{ ...SALARY.medarbetare[0],
      rader: [{ loneart: "timlon", SalaryCode: "11", Number: "168.00" }],
      varningar: ["Löneart saknas för Helglön (24 tim): koppla en kod under Lön → Lönearter. Raden skickas inte."],
      lonerader: [lr("timlon", "168.00", "skickas", "11"), lr("helglon_skordare", "24.00", "saknar_kod")] }],
  });

  // Företagsledare (medarbetare.foretagsledare): lönen ligger utanför appen — inga lönerader i förhandsvisningen, och de hindrar ingen sändning.
  const ledare = (namn = "Martin Lindqvist") => ({ medarbetare_id: "m9", namn, status: "utkast", anstallningsnummer: "", foretagsledare: true,
    rader: [], lonerader: [], saknade_loneartskoder: [], dagar: [], synk: [], deldagar: [], ledighetskollision: [], vilobrott: [], rast_langa: [], kortpass: [],
    orimliga: [], utan_rast: { dagar: 0, timmar: 0, datum: [] }, helglon: { dagar: [], timmar: 0, anstallningsdatumSaknas: false }, byten: [], obekraftade: 0,
    ob: { timmar: 0, dagar: 0, obesvarade: 0 }, varningar: [] });
  const medLedare = () => ({ ...SALARY, medarbetare: [...SALARY.medarbetare, ledare()] });

  it("FÖRETAGSLEDARE: står inte i listan alls (Martin 2026-10-21) — varken namn, lönerader eller status — och förarna är kvar", async () => {
    g.__salary = medLedare();
    await monter("flik=lon");
    expect(cont.querySelector("[data-foretagsledare]")).toBeNull();
    expect(cont.querySelector('[data-forare="m9"]')).toBeNull();
    expect(text()).not.toContain("Martin Lindqvist");
    expect(text()).not.toContain("lön utanför appen");
    const anna = cont.querySelector<HTMLElement>('[data-forare="m1"]')!;
    expect(anna.textContent).toContain("Timlön");
  });

  it("FÖRETAGSLEDARE: räknas inte som medarbetare i periodraden, och skickas-knappen styrs av dem som får lön", async () => {
    g.__salary = { ...SALARY, medarbetare: [{ ...ledare(), anstallningsnummer: "9", godkannande: "godkand" }] };   // med anställningsnummer, utkast och godkänd: knappen får ändå inte lockas av en ledare
    await monter("flik=lon");
    expect(text()).toContain("0 förare");
    expect(cont.querySelector("[data-foretagsledare]")).toBeNull();
    const skicka = blad("Ingen att skicka")[0].closest("button") as HTMLButtonElement;
    expect(skicka.disabled).toBe(true);    // bara en ledare: inget att skicka
  });

  it("FÖRETAGSLEDARE: en förare som får lön gör att det går att skicka, trots att ledaren saknar anställningsnummer", async () => {
    g.__salary = medLedare();
    await monter("flik=lon");
    expect((blad("Skicka 1 till Fortnox")[0].closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("FÖRETAGSLEDARE: bekräftelsen nämner dem inte, räknar dem inte, och ledarens varningar ger ingen varningsrad", async () => {
    g.__salary = { ...medLedare(), medarbetare: [...SALARY.medarbetare, { ...ledare(), varningar: ["3 av 8 dagar är ej bekräftade."] }] };
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    expect(dialog()!.textContent).toContain("1 förare");
    expect(dialog()!.textContent).not.toContain("Martin Lindqvist");
    expect(dialog()!.textContent).not.toContain("Företagsledare");
    expect(dialog()!.textContent).not.toContain("Saknar anst.nr");
    expect(dialog()!.textContent).not.toContain("Det finns varningar");
    expect(knappIDialog("Skicka 1 till Fortnox")).toBeDefined();
  });

  it("röda dagar som inte gav helglön står med sin orsak, arbetade med 'helglön ändå'", async () => {
    g.__salary = { ...SALARY, medarbetare: [{ ...SALARY.medarbetare[0],
      helglon: { timmar: 8, anstallningsdatumSaknas: false, dagar: [
        { datum: "2025-12-24", namn: "Julafton", arbetad: false, ger: true, skal: "betalas" },
        { datum: "2025-12-25", namn: "Juldagen", arbetad: false, ger: false, skal: "sjuk" },
        { datum: "2025-12-26", namn: "Annandag jul", arbetad: false, ger: false, skal: "tjanstledig_omger" },
        { datum: "2025-12-31", namn: "Nyårsafton", arbetad: true, ger: true, skal: "betalas_arbetad" },
      ] } }] };
    await monter("flik=lon");
    // Bara undantagen står som rader (dagen som betalar syns i lönearaden), ett datumformat, ett ord per skäl.
    const t = text();
    expect(t).toContain("25 dec Juldagen: ingen helglön — sjuk");
    expect(t).toContain("26 dec Annandag jul: ingen helglön — tjänstledig dagen före/efter");
    expect(t).toContain("31 dec Nyårsafton: arbetad, helglön ändå");
    expect(t).not.toContain("Julafton");
    expect(t).not.toContain("Röda vardagar i månaden");
  });

  it("varje rad visar vad, antal och enhet — koden och namnet i Fortnox står i Lönearter, inte på varje rad", async () => {
    await monter("flik=lon");
    expect(radEl("timlon").textContent).toContain("Timlön");
    expect(radEl("timlon").textContent).toMatch(/168\s*tim/);
    expect(radEl("timlon").textContent).not.toMatch(/Fortnox|\b11\b/);
    expect(radEl("korersattning").textContent).toContain("Reseersättning");
    expect(radEl("korersattning").textContent).toMatch(/14\s*mil/);
    expect(radEl("korersattning").textContent).not.toMatch(/Fortnox|821|Körersättning skattefri/);
    expect(radEl("timlon").getAttribute("data-status")).toBe("skickas");
    expect(cont.querySelector("[data-saknas-banner]")).toBeNull();
  });

  it("saknad kod för en löneart som HAR antal = röd rad med förklaring, och en varning överst", async () => {
    g.__salary = utanHelglonskod();
    await monter("flik=lon");
    const r = radEl("helglon_skordare");
    expect(r.getAttribute("data-status")).toBe("saknar_kod");
    expect(r.textContent).toContain("Helglön");
    expect(r.textContent).toMatch(/24\s*tim/);
    expect(r.textContent).toContain("Saknar löneart");
    expect(r.textContent).toContain("skickas inte");
    // Motorns varning om samma sak står inte en andra gång under "Påverkar riktigheten": raden är redan förklaringen.
    expect(text()).not.toContain("Löneart saknas för Helglön");
    expect(text()).not.toContain("Påverkar riktigheten");
    const banner = cont.querySelector("[data-saknas-banner]")!;
    expect(banner.textContent).toContain("Kan inte skickas än");
    expect(banner.textContent).toContain("Helglön");
    expect(banner.textContent).toMatch(/1 rad/);
    expect(blad("Koppla koder").length).toBeGreaterThan(0);
  });

  it("brandrisk-OB utan kod: EN röd rad med exakta timmar (10,30), och adminraden säger att den går till lönen som en rad", async () => {
    g.__salary = {
      ...SALARY, blockerande: [
        { loneart: "brandrisk_ob", label: "Brandrisk – OB", enhet: "tim", forare: [{ namn: "Anna Berg", mangd: "10.30" }] },
      ],
      medarbetare: [{ ...SALARY.medarbetare[0],
        rader: [{ loneart: "timlon", SalaryCode: "11", Number: "168.00" }],
        ob: { timmar: 10.3, dagar: 3, obesvarade: 0 }, brandrisk: { ob_min: 618, dagar: [] },
        varningar: ["Löneart saknas för Brandrisk – OB (10.3 tim): koppla en kod under Lön → Lönearter. Raden skickas inte."],
        lonerader: [lr("timlon", "168.00", "skickas", "11"), lr("brandrisk_ob", "10.30", "saknar_kod")] }],
    };
    await monter("flik=lon");
    expect(radEl("brandrisk_ob").getAttribute("data-status")).toBe("saknar_kod");
    expect(radEl("brandrisk_ob").textContent).toContain("Brandrisk – OB");
    expect(radEl("brandrisk_ob").textContent).toMatch(/10,3\s*tim/);
    expect(cont.querySelector("[data-saknas-banner]")!.textContent).toMatch(/1 rad/);
    // Raden som upprepade lönearaden ("Brandrisk: 10,30 tim OB … en lönerad, se listan ovan") är borta: lönearaden har timmarna.
    expect(cont.querySelector("[data-brandrisk-admin]")).toBeNull();
    expect(text()).not.toMatch(/se listan ovan|beordrade morgnar|nattillägg|läggs inte som lönerad/);
  });

  describe("Att ta med löneansvarig: bara det som fortfarande är öppet", () => {
    const kopplad = (utom: string[] = []) => Object.fromEntries(
      ["timlon", "premielon_skordare", "premielon_skotare", "overtid_skordare", "overtid_skotare", "valtlappar", "korersattning", "helglon_skordare", "helglon_skotare", "brandrisk_ob"]
        .filter(k => !utom.includes(k)).map(k => [k, { kod: "1", namn: "x" }]));
    const rader = () => Array.from(cont.querySelectorAll<HTMLElement>("[data-att-ta-med]"));
    const gor = () => rader().find(e => e.getAttribute("data-att-ta-med") === "gor");
    const ark = () => document.body.querySelector<HTMLElement>("[data-oppna-fragor]");

    it("allt kopplat (Brandrisk – OB är 147): inget kodråd — de öppna frågorna är EN rad som leder till Avtal, och de långa avtalsfrågorna står inte på ytan", async () => {
      g.__salary = { ...SALARY, kopplingar: kopplad() };
      await monter("flik=lon");
      expect(gor()).toBeUndefined();
      expect(text()).not.toContain("Koppla koden");
      expect(text()).not.toContain("Koppla koderna");
      expect(text()).toContain("5 öppna frågor");
      expect(text()).not.toContain("Levereras sjukfrånvaro i timmar per dag?");
      expect(ark()).toBeNull();
      await klick("5 öppna frågor");
      // …och raden öppnar Avtal med frågorna uppe — inte ett ark ovanpå Lön.
      expect(window.location.search).toContain("flik=avtal");
      expect(window.location.search).toContain("fragor=1");
    });

    it("AVTAL: Öppna frågor bor här — en rad, och arket med de fem som är obesvarade (de beslutade är borta)", async () => {
      await monter("flik=avtal");
      expect(text()).toContain("Öppna frågor");
      expect(text()).toContain("5 öppna frågor");
      expect(ark()).toBeNull();
      await klick("5 öppna frågor");
      expect(ark()!.textContent).toContain("Levereras sjukfrånvaro i timmar per dag?");
      expect(ark()!.textContent).toContain("Var komp-saldot bor");
      expect(ark()!.querySelectorAll("[data-ark-innehall] > div > div").length).toBe(5);
      for (const beslutad of ["Ordinarie tid är ett genomsnitt", "Gävle var utjämnad ordinarie tid", "Beräkningsperiod och schema"]) expect(ark()!.textContent, beslutad).not.toContain(beslutad);
    });

    it("AVTAL: kommer man från Lön (?fragor=1) står arket redan uppe, och Stäng tar bort markeringen ur adressen", async () => {
      await monter("flik=avtal&fragor=1");
      expect(ark()!.textContent).toContain("Var komp-saldot bor");
      await klick("Stäng");
      expect(ark()).toBeNull();
      expect(window.location.search).not.toContain("fragor");
    });

    it("bara Brandrisk – OB saknar kod: en rad som nämner just den, med knappen Koppla bredvid", async () => {
      g.__salary = { ...SALARY, kopplingar: kopplad(["brandrisk_ob"]) };
      await monter("flik=lon");
      expect(gor()!.textContent).toContain("Koppla koden för Brandrisk – OB");
      await act(async () => { gor()!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(window.location.search).toContain("underflik=lonearter");
    });

    it("flera saknas: en rad som räknar upp dem, och en som redan stoppar sändningen (röd rad överst) står inte två gånger", async () => {
      g.__salary = {
        ...SALARY, kopplingar: kopplad(["helglon_skordare", "helglon_skotare", "brandrisk_ob"]),
        blockerande: [{ loneart: "helglon_skordare", label: "Helglön skördare", enhet: "tim", forare: [{ namn: "Anna Berg", mangd: "24.00" }] }],
      };
      await monter("flik=lon");
      expect(rader().filter(e => e.getAttribute("data-att-ta-med") === "gor")).toHaveLength(1);
      expect(gor()!.textContent).toContain("Koppla koderna för Helglön skotare och Brandrisk – OB");
      expect(gor()!.textContent).not.toContain("Helglön skördare");
    });

    it("det beslutade och byggda (röd vardag = 8 tim helglön, ordinarie per månad, Gävle) står inte som en fråga, och inga tekniska ord", async () => {
      await monter("flik=avtal&fragor=1");
      const t = ark()!.textContent!;
      expect(t).not.toContain("Röd vardag ger alltid");
      expect(t).not.toContain("Ordinarie tid är ett genomsnitt");
      expect(t).not.toContain("Gävle var utjämnad");
      expect(t).not.toMatch(/lib\/|dry_run/);
    });

    it("anställningsdatum som saknas är EN rad med Fyll i — inte en varning per förare", async () => {
      const varn = "Anställningsdatum saknas: kvalifikationstiden för helglön (tre månader, §10 mom 3) är inte kontrollerad. Helglönen betalas. Fyll i anställningsdatum under Medarbetare.";
      g.__salary = { ...SALARY, kopplingar: kopplad(), medarbetare: [
        { ...SALARY.medarbetare[0], varningar: [varn] },
        { ...SALARY.medarbetare[0], medarbetare_id: "m5", namn: "Oskar Lindgren", varningar: [varn] },
      ] };
      await monter("flik=lon");
      const rad = rader().find(e => e.getAttribute("data-att-ta-med") === "anstallningsdatum")!;
      expect(rad.textContent).toContain("Anställningsdatum saknas: Anna, Oskar");
      expect((text().match(/Anställningsdatum saknas/g) || []).length).toBe(1);
      expect(text()).not.toMatch(/kvalifikationstiden|§10 mom 3/);
      await act(async () => { rad.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(window.location.search).toContain("flik=medarbetare");
    });
  });

  describe("Utjämningsperiod: EN rad per period", () => {
    const per = { startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: "Gävle/Hedemora-Sandviken 22 apr-29 jun 2026" };
    const fem = [null, "a", "b", "c", "d"].map(m => ({ ...per, medarbetare_id: m }));

    it("granskningen: förarens period (alla + egen rad, samma datum) står en gång, med antal dagar", async () => {
      g.__salary = { ...SALARY, kopplingar: {}, medarbetare: [{ ...SALARY.medarbetare[0], obekraftade: 1, utjamning: [per, per] }] };
      await monter("flik=lon");
      const rader = Array.from(cont.querySelectorAll<HTMLElement>("[data-utjamning-period]"));
      expect(rader).toHaveLength(1);
      expect(rader[0].textContent).toContain("Utjämningsperiod v17–27 (Gävle/Hedemora-Sandviken), 77 dagar");
      expect(rader[0].textContent).not.toContain("markeringen bevisar inte det");   // frågan står under 'Att ta med löneansvarig'
    });

    it("årsövertiden: fem rader i tabellen (prod) blir en grå rad — bara när månaden berör perioden", async () => {
      g.__arsovertid = { ok: true, ar: 2026, tak: 250, tomDatum: "2026-09-30", modeller: [], medarbetare: [], utjamning: fem };
      await monter("flik=lon&underflik=underlag&period=2026-06"); // löneperiod juni = arbetsmånad maj: v17–27 berör den
      const kort = cont.querySelector<HTMLElement>("[data-arsovertid-kort]")!;
      const n = (kort.textContent!.match(/Utjämningsperiod v17–27/g) || []).length;
      expect(n).toBe(1);
      expect(kort.textContent).toContain("77 dagar — räknas som genomsnitt");
    });

    it("årsövertiden: en period som inte berör månaden står inte där (v17–27 säger ingenting om september)", async () => {
      g.__arsovertid = { ok: true, ar: 2026, tak: 250, tomDatum: "2026-09-30", modeller: [], medarbetare: [], utjamning: fem };
      await monter("flik=lon"); // arbetsmånad september
      expect(cont.querySelector("[data-arsovertid-kort]")!.textContent).not.toContain("Utjämningsperiod");
    });
  });

  it("Koppla koder tar admin till Lönearter", async () => {
    g.__salary = utanHelglonskod();
    await monter("flik=lon");
    await klick("Koppla koder");
    expect(window.location.search).toContain("underflik=lonearter");
    expect(raderna()).toContain("helglon_skordare");
  });
  const raderna = () => Array.from(cont.querySelectorAll("[data-loneart]")).map(e => e.getAttribute("data-loneart"));

  it("SPÄRRAD: med röda rader finns ingen 'Skicka till Fortnox' i bekräftelsen, och inget har skickats", async () => {
    g.__salary = utanHelglonskod();
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain("Helglön");
    expect(knappIDialog("Skicka 1 till Fortnox")).toBeUndefined();
    expect(knappIDialog("Koppla koder")).toBeDefined();
    expect(knappIDialog("Skicka utan dessa rader")).toBeDefined();
    expect(posta()).toEqual([]);
  });

  it("'Skicka utan dessa rader' kräver ett andra, uttryckligt steg — först då skickas begäran, med flaggan", async () => {
    g.__salary = utanHelglonskod();
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    expect(dialog()!.textContent).toContain("1 rader");           // steg 1: förarna och antal rader
    await klickaDialog("Skicka utan dessa rader");
    // Steg 2 handlar bara om det som uteblir: förarlistan (som ändå krävde scroll före varningen) är borta.
    expect(dialog()!.textContent).not.toContain("1 rader");
    expect(dialog()!.textContent).not.toContain("Löneperiod");
    // Klartext, utan tekniska ord: raderna skickas ALDRIG senare och någon måste lägga in dem för hand.
    const t = dialog()!.textContent!;
    expect(t).toContain("Raderna skickas aldrig senare");
    expect(t).toContain("Lönehanteraren måste lägga in dem för hand i Fortnox");
    expect(t).toContain("varken nästa gång du skickar eller av sig själva");
    expect(t).toContain("Helglön skördare 24 tim (Anna Berg)");   // exakt vad som uteblir, en rad per förare och löneart
    expect(t).not.toContain("följer inte med");
    expect(t).not.toMatch(/skicka_utan|SalaryCode|status/i);
    expect(posta()).toEqual([]);                       // fortfarande inget skickat
    await klickaDialog("Skicka utan raderna");
    expect(posta()).toHaveLength(1);
    expect(JSON.parse(posta()[0][2])).toMatchObject({ period: "2026-10", skicka_utan_saknade: true });
  });

  it("Tillbaka ur det andra steget skickar ingenting", async () => {
    g.__salary = utanHelglonskod();
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    await klickaDialog("Skicka utan dessa rader");
    await klickaDialog("Tillbaka");
    expect(posta()).toEqual([]);
    expect(knappIDialog("Skicka utan dessa rader")).toBeDefined();
  });

  it("efter ett val att skicka utan: svaret säger vilka rader som uteblev", async () => {
    g.__salary = utanHelglonskod();
    g.__salarySkicka = { ok: true, skickade: 1, fel: 0, felMeddelanden: [], utelamnade: [{ namn: "Anna Berg", loneart: "helglon_skordare", label: "Helglön skördare", mangd: "24.00", enhet: "tim" }] };
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    await klickaDialog("Skicka utan dessa rader");
    await klickaDialog("Skicka utan raderna");
    expect(text()).toContain("1 lönerader skickade");
    expect(text()).toContain("Skickades inte: Helglön skördare 24 tim (Anna Berg)");
  });

  it("allt kopplat: vanlig bekräftelse, och begäran bär INGEN flagga", async () => {
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    expect(knappIDialog("Skicka utan dessa rader")).toBeUndefined();
    await klickaDialog("Skicka 1 till Fortnox");
    expect(posta()).toHaveLength(1);
    expect(JSON.parse(posta()[0][2]).skicka_utan_saknade).toBeUndefined();
  });

  it("frivillig premie utan kod: orange 'Hoppas över', ingen spärr", async () => {
    g.__salary = { ...SALARY, medarbetare: [{ ...SALARY.medarbetare[0],
      varningar: ["Premielön skördare (168 tim) skickas inte: ingen kod är kopplad (frivillig). Koppla en kod under Lön → Lönearter om den ska med."],
      lonerader: [lr("timlon", "168.00", "skickas", "11"), lr("premielon_skordare", "168.00", "valfri_utan_kod")] }] };
    await monter("flik=lon");
    const r = radEl("premielon_skordare");
    expect(r.getAttribute("data-status")).toBe("valfri_utan_kod");
    expect(r.textContent).toContain("Hoppas över");
    expect(r.textContent).toContain("frivillig");
    expect(text()).not.toContain("Premielön skördare (168 tim) skickas inte");   // raden säger det redan
    expect(cont.querySelector("[data-saknas-banner]")).toBeNull();
    await klick("Skicka 1 till Fortnox");
    expect(knappIDialog("Skicka 1 till Fortnox")).toBeDefined();
  });

  it("helglönens röda dagar står under lönerna (inte under 'går inte med'), och helglön är inte längre 'ej fastställd'", async () => {
    g.__salary = { ...SALARY, medarbetare: [{ ...SALARY.medarbetare[0],
      helglon: { timmar: 8, dagar: [{ datum: "2026-12-24", namn: "Julafton", arbetad: false, ger: true, skal: "betalas" }, { datum: "2026-12-25", namn: "Juldagen", arbetad: true, ger: true, skal: "betalas_arbetad" }] },
      lonerader: [lr("timlon", "168.00", "skickas", "11"), lr("helglon_skordare", "8.00", "skickas", "1461")], rader: [{ loneart: "timlon", SalaryCode: "11", Number: "168.00" }, { loneart: "helglon_skordare", SalaryCode: "1461", Number: "8.00" }] }],
      kopplingar: { helglon_skordare: { kod: "1461", namn: "Helglön, timmar" } } };
    await monter("flik=lon");
    expect(radEl("helglon_skordare").textContent).toMatch(/8\s*tim/);
    expect(text()).toContain("25 dec Juldagen: arbetad, helglön ändå");
    expect(text()).not.toContain("Julafton"); // dagen som bara betalar syns i lönearaden
    expect(text()).not.toMatch(/Helglön §10[^.]*löneart ej fastställd/);
    expect(text()).not.toContain("Påverkar riktigheten");   // inget annat att granska i den här fixturen
  });

  it("serverns 409 visas som ett fel med förklaringen", async () => {
    g.__salarySkicka = { ok: false, kod: "LONEART_SAKNAS", meddelande: "Löneartskod saknas för Helglön. Inget är skickat." };
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    await klickaDialog("Skicka 1 till Fortnox");
    expect(text()).toContain("Löneartskod saknas för Helglön. Inget är skickat.");
  });

  it("Förare · Månad: tryck på hela förarkortet (›, ingen Öppna-knapp) öppnar arket (adressen bär ?forare=) och Stäng lämnar det", async () => {
    const m1 = SALARY.medarbetare[0] as any;
    g.__salary = { ...SALARY, medarbetare: [{ ...m1, arbetsdagar: 22, timlon_h: 176, overtid_h: 42.17, ordinarie_h: 176, extra_h: 4, kor_mil: 0, km_grans: 60,
      ordinarie: { modell: "manad", timmar: 176, vardagar: 22, roda: [], franvaro: [], anstallning: [], deldag_h: 0 }, arbetat: { maskin_min: 12850, extra_min: 240, kortpass_min: 0, hemskickad_min: 0 },
      extra_poster: [{ datum: "2026-09-10", start_tid: "12:15", slut_tid: "16:15", minuter: 240, aktivitet: "Annat", objekt: null, kommentar: "Gokart", debiterbar: false }] }] };
    await monter("flik=lon&underflik=underlag&period=2026-10");
    const kort = cont.querySelector("[data-forare]") as HTMLElement;
    expect(Array.from(kort.querySelectorAll("button")).some(b => b.textContent === "Öppna")).toBe(false);
    expect(kort.textContent).toContain("chevron_right");
    const oppna = kort;
    expect(document.body.querySelector("[data-forare-manad]")).toBeNull();
    await act(async () => { oppna.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    const ark = document.body.querySelector("[data-forare-manad]")!;
    expect(ark).not.toBeNull();
    expect(ark.querySelector("[data-svar]")!.textContent).toBe("42 tim 10 min (42,17)");
    expect(ark.querySelector('[data-extra-post="2026-09-10"]')!.textContent).toContain("Gokart");
    expect(window.location.search).toContain("forare=m1");
    await act(async () => { (Array.from(ark.querySelectorAll("button")).find(b => b.textContent === "Stäng") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(document.body.querySelector("[data-forare-manad]")).toBeNull();
    expect(window.location.search).not.toContain("forare=");
  });

  it("Förare · Månad: en knapp inne i förarkortet (Fyll i) gör sitt eget och öppnar inte arket", async () => {
    const m1 = SALARY.medarbetare[0] as any;
    g.__salary = { ...SALARY, medarbetare: [{ ...m1, anstallningsnummer: "" }] };
    await monter("flik=lon&underflik=underlag&period=2026-10");
    const fyll = Array.from(cont.querySelectorAll("[data-forare] button")).find(b => b.textContent === "Fyll i") as HTMLButtonElement;
    expect(fyll).toBeTruthy();
    await act(async () => { fyll.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(document.body.querySelector("[data-forare-manad]")).toBeNull();
    expect(window.location.search).not.toContain("forare=");
  });

  it("valfri månad går att öppna direkt via adressen (period=…), och en ogiltig period faller tillbaka på nu", async () => {
    g.__salary = { ...SALARY, arbetsperiod: "2026-08" };
    await monter("flik=lon&underflik=underlag&period=2026-09");
    // Adressen talar löneperiod (2026-09); det som syns är arbetsmånaden med månaden lönen kommer bredvid.
    expect(cont.querySelector("[data-arbetsmanad]")!.textContent).toMatch(/^Augusti( 2026)?$/);
    expect(cont.querySelector("[data-utbetalning]")!.textContent).toBe("lön i september");
    expect(g.__fetchAnrop.filter((a: any[]) => a[0].includes("salary-export")).map((a: any[]) => JSON.parse(a[2]).period)).toEqual(["2026-09"]);
    // Ogiltiga perioder faller tillbaka på nu: text, månad 00 (ser ut som en period och skulle nå servern), en siffra, och framtiden.
    for (const ogiltig of ["skräp", "2026-00", "2026-13", "2026-9", "2099-01"]) {
      await act(async () => { root.unmount(); }); cont.remove();
      g.__fetchAnrop = []; g.__salary = SALARY;
      await monter(`flik=lon&underflik=underlag&period=${ogiltig}`);
      expect(cont.querySelector("[data-arbetsmanad]")!.textContent, ogiltig).toMatch(/^September( 2026)?$/);
      expect(cont.querySelector("[data-utbetalning]")!.textContent, ogiltig).toBe("lön i oktober");
      expect(g.__fetchAnrop.filter((a: any[]) => a[0].includes("salary-export")).map((a: any[]) => JSON.parse(a[2]).period), ogiltig).toEqual(["2026-10"]);
    }
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
    expect(falt("Anställningsnummer").disabled).toBe(false);
    await skriv(falt("Anställningsnummer"), "2002");
    await klick("Spara");
    expect(medNr("m1")[0]).toMatchObject({ anstallningsnummer: "2002", lonesystem_id: null });
  });

  it("ett nummer som sparats utan koppling knyts till kopplingen när det sparas igen — samma rad, ingen dubblett", async () => {
    g.__db.medarbetare_lonesystem = [{ id: "u1", medarbetare_id: "m1", lonesystem_id: null, anstallningsnummer: "1001", skapad: "2026-10-01" }];
    await monter("flik=medarbetare&person=m1");
    expect(falt("Anställningsnummer").value).toBe("1001");
    await skriv(falt("Anställningsnummer"), "1002");
    await klick("Spara");
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
    await klickRad("Hempunkten är inte bekräftad – Anna Berg");
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
    expect(text()).not.toContain("Gata och nummer, postnummer och ort."); // en hjälptext som upprepar etiketten är borta på personen
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
  /** Månadsfördelningen servern skickar (overtidPerManad): jan fastställd, april–juli utjämning (uppskattad), oktober pågående ställning. */
  const PER_MANAD = { "2026-01": { fast: 30.6, uppskattad: 0 }, "2026-07": { fast: 0, uppskattad: 12 }, "2026-10": { fast: 0, uppskattad: 8.4, stallning: true } };
  const forare = (id: string, namn: string, genomsnitt: number) => ({ medarbetare_id: id, namn, timmar: 1000, modeller: { manad: genomsnitt, genomsnitt: 12.3, vardagar: 205.5, dagar: 303.5, vecka: 344.3 }, perioder: PERIODER, basavdrag: { franvaroTimmar: 120, rodaTimmar: 64 }, per_manad: PER_MANAD });
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

  /** Prod-liknande: en nära taket, en halvvägs, en lite, en noll. */
  const ALLA: [string, string, number][] = [["s", "Stefan Karlsson", 140.5], ["o", "Oskar Nilsson", 130], ["m", "Martin Lindqvist", 0], ["d", "Daniel Johansson", 74.5]];

  it("alla förare får en rad (Martin 2026-10-21): namn till vänster, '140,5 av 250 tim' till höger, störst först — också noll och lågt", async () => {
    g.__arsovertid = svar(ALLA);
    await monter("flik=lon");
    expect(rader().map(radText)).toEqual(["Stefan Karlsson 140,5 av 250 tim", "Oskar Nilsson 130 av 250 tim", "Daniel Johansson 74,5 av 250 tim", "Martin Lindqvist 0 av 250 tim"]);
  });

  it("ingen övertid alls: varje förare står med '0 av 250 tim', dämpad — inget 'ingen närmar sig taket'", async () => {
    g.__arsovertid = svar([["a", "A", 0], ["b", "B", 0]]);
    await monter("flik=lon");
    expect(rader().map(radText)).toEqual(["A 0 av 250 tim", "B 0 av 250 tim"]);
    expect(rader().every(e => e.getAttribute("data-niva") === "noll")).toBe(true);
    expect(kortText()).not.toContain("närmar sig taket");
  });

  it("prod idag (Stefan 74,5, övriga 0): fyra rader, Stefan först", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    expect(rader().map(radText)).toEqual(["Stefan Karlsson 74,5 av 250 tim", "Daniel Johansson 0 av 250 tim", "Martin Lindqvist 0 av 250 tim", "Oskar Nilsson 0 av 250 tim"]);
  });

  it("en företagsledare (flaggan från servern) står inte bland förarna", async () => {
    const s = svar(IDAG);
    (s.medarbetare as any[]).find(m => m.medarbetare_id === "m").foretagsledare = true;
    g.__arsovertid = s;
    await monter("flik=lon");
    expect(rader().map(radText).join(" | ")).not.toContain("Martin");
    expect(rader()).toHaveLength(3);
  });

  it("bara avtalets modell: de tre andra kolumnerna och deras tal finns inte i vyn", async () => {
    g.__arsovertid = svar([["a", "A", 140.5], ["b", "B", 130], ["c", "C", 200], ["d", "D", 126]]);
    await monter("flik=lon");
    for (const t of SAKER) expect(kortText()).not.toContain(t);
    for (const tal of ["205,5", "303,5", "344,3"]) expect(kortText()).not.toContain(tal);
    expect(cont.querySelectorAll("[data-arsovertid-rad]").length).toBe(4);
  });

  it("tunn stapel under raden: 140,5 av 250 = 56,2 % av längden, med tal för skärmläsare", async () => {
    g.__arsovertid = svar([["s", "Stefan Karlsson", 140.5], ["o", "Oskar Nilsson", 125]]);
    await monter("flik=lon");
    const st = stapel(rader()[0]);
    expect(st.getAttribute("aria-valuenow")).toBe("140.5");
    expect(st.getAttribute("aria-valuemax")).toBe("250");
    expect(fyllning(rader()[0]).style.width).toBe("56.2%");
    expect(fyllning(rader()[1]).style.width).toBe("50%");
  });

  it("grå normalt, orange över 200, röd över 250 — stapel och tal i samma färg, och talet står alltid i text; noll är dämpad", async () => {
    g.__arsovertid = svar([["a", "A Lugn", 130], ["b", "B Gräns", 200], ["c", "C Varning", 200.5], ["d", "D Tak", 250], ["e", "E Över", 250.5], ["f", "F Noll", 0], ["g", "G Låg", 74.5]]);
    await monter("flik=lon");
    const per = Object.fromEntries(rader().map(e => [radText(e).split(" ")[0] + (radText(e).split(" ")[1] || ""), e]));
    const niva = (k: string) => per[k].getAttribute("data-niva");
    expect([niva("ALugn"), niva("BGräns"), niva("CVarning"), niva("DTak"), niva("EÖver")]).toEqual(["lugn", "lugn", "varning", "varning", "over"]);
    expect(niva("FNoll")).toBe("noll");
    expect(niva("GLåg")).toBe("lugn");
    expect(fyllning(per["CVarning"]).style.background).toBe(rgb("#ff9f0a"));
    expect(fyllning(per["EÖver"]).style.background).toBe(rgb("#ff453a"));
    expect(fyllning(per["ALugn"]).style.background).not.toBe(rgb("#ff9f0a"));
    expect(fyllning(per["ALugn"]).style.background).not.toBe(rgb("#ff453a"));
    expect(radText(per["EÖver"])).toContain("250,5 av 250 tim");
  });

  it("utjämningsperioden är en grå rad: 'Utjämningsperiod v17–27 (…), 77 dagar — räknas som genomsnitt'", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon&underflik=underlag&period=2026-06"); // arbetsmånad maj: perioden berör den
    const r = Array.from(cont.querySelectorAll<HTMLElement>("p")).find(e => (e.textContent || "").startsWith("Utjämningsperiod"))!;
    expect(r.textContent).toBe("Utjämningsperiod v17–27 (Gavle/Hedemora-Sandviken), 77 dagar — räknas som genomsnitt");
    expect(r.style.color).toBe(rgb("#8e8e93"));
  });

  it("all förklarande text ligger bakom en tertiär länk 'Så räknas det' som fäller ut — och fäller ihop igen", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    const FORKLARING = ["per kalendermånad", "ordinarie timmar är fyllda", "t.o.m. igår", "§5 mom 2", "Avtalet förutsätter", "genomsnitt över en beräkningsperiod", "röda vardagar"];
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

  it("månaderna: 'Så räknas det' visar per förare vilka månader övertiden kommer från, så att summan går att kontrollräkna", async () => {
    g.__arsovertid = svar([["s", "Stefan Karlsson", 51], ["m", "Martin Lindqvist", 0]]);
    await monter("flik=lon");
    expect(kortText()).not.toContain("t.o.m. igår");
    await klick("Så räknas det");
    // 30,6 (januari) + 12 (juli, utjämning) + 8,4 (oktober, pågående) = 51
    expect(kortText()).toContain("Stefan: januari 30,6 · juli 12 (utjämning) · oktober 8,4 t.o.m. igår");
  });

  it("kan frånvaron inte läsas säger kortet det utan att fälla ut: talen är för LÅGA (basen drogs inte), aldrig 'ingen frånvaro'", async () => {
    g.__arsovertid = svar(IDAG, { franvaro_fel: "relation does not exist" });
    await monter("flik=lon");
    expect(kortText()).toContain("Kunde inte läsa frånvaron");
    expect(kortText()).toContain("relation does not exist");
    // Fel riktning förut: utan frånvaro är basen för stor (40 tim även i en semestervecka), så övertiden blir för LÅG.
    expect(kortText()).toContain("basen drogs inte för frånvaro, så talen är för låga.");
    expect(kortText()).not.toContain("för höga");
  });

  it("frånvaron lästes: ingen varning", async () => {
    g.__arsovertid = svar(IDAG);
    await monter("flik=lon");
    expect(kortText()).not.toContain("Kunde inte läsa frånvaron");
  });

});


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ARBETSTID (Översikten): lagens sex gränser per förare. Gul från 90 %, röd över gränsen; tryck på förare → de sex gränserna.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Översikten: raden Arbetstid och arket bakom den", () => {
  const TROSKLAR = { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };
  /** En förare med givet årsövertidstal (resten tomt) — byggd av den riktiga logiken, så UI:t visar exakt det servern skickar. */
  const forareMed = (id: string, namn: string, ov: number) => byggArbetstid({
    medarbetare_id: id, namn, tomDatum: "2026-10-13",
    arsovertid: { ar: 2026, tomDatum: "2026-10-13", timmar: 0, modeller: { vardagar: 0, dagar: 0, vecka: 0, genomsnitt: ov, manad: ov }, manader: [], perioder: [], veckor: [], basavdrag: { franvaroTimmar: 0, rodaTimmar: 0 } },
    dagar: [], extra: [], franvaro: [], trosklar: TROSKLAR, tak: 250,
  });
  const svar = (forare: any[], varningar: string[] = []) => ({ ok: true, ar: 2026, tomDatum: "2026-10-13", forare, varningar });
  // Förarna och gränserna ligger i ett ark (portal på body) som raden "N förare nära arbetstidsgränsen" öppnar.
  const rad = () => cont.querySelector<HTMLElement>('[data-sak="arbetstid"]');
  const ark = () => document.body.querySelector<HTMLElement>("[data-arbetstid-ark]");
  const kort = () => document.body.querySelector<HTMLElement>("[data-arbetstid-kort]");
  const kortText = () => (kort()?.textContent || "").replace(/\s+/g, " ");
  const forareRader = () => Array.from(document.body.querySelectorAll<HTMLElement>("[data-arbetstid-forare]"));
  const knappen = (r: HTMLElement) => r.querySelector<HTMLButtonElement>("button")!;
  const oppnaArket = async () => { await act(async () => { rad()!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await lugn(); };

  it("ingen förare nära en gräns: ingen rad, inget ark — och ingen 'stämmer'-rad", async () => {
    g.__arbetstid = svar([forareMed("a", "Anna Berg", 10)]);
    await monter("flik=oversikt");
    expect(rad()).toBeNull();
    expect(kort()).toBeNull();
    expect(text()).toContain("Inget att göra");
    expect(text()).not.toContain("Ingen nära eller över en gräns för arbetstid");
  });

  it("EN rad: 'N förare nära arbetstidsgränsen' — inga namn på raden, ingen egen Arbetstid-sektion, hela raden är en knapp med ›", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262), forareMed("g", "Gul Person", 230)]);
    await monter("flik=oversikt");
    expect(rad()!.textContent).toContain("2 förare nära arbetstidsgränsen");
    expect(rad()!.textContent).toContain("1 över gränsen");
    expect(rad()!.textContent).not.toMatch(/Stefan|Gul Person|tim övertid/);
    expect(rad()!.textContent).toContain("chevron_right");
    expect(rad()!.querySelectorAll("button")).toHaveLength(1);
    expect(blad("Arbetstid").length).toBe(0);   // ingen sektionsrubrik
    expect(kort()).toBeNull();                   // förarna väntar bakom trycket
    expect(ark()).toBeNull();
    await oppnaArket();
    expect(window.location.search).toContain("arbetstid=1");
    expect(ark()).not.toBeNull();
    expect(ark()!.textContent).toContain("Arbetstid");
    expect(forareRader()).toHaveLength(2);
    // arket har ingen andra "Arbetstid"-rubrik inuti kortet
    expect(Array.from(kort()!.querySelectorAll("*")).filter(e => egenText(e) === "Arbetstid")).toHaveLength(0);
    // Stäng lämnar arket och adressen
    await act(async () => { (blad("Stäng")[0].closest("button") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(ark()).toBeNull();
    expect(window.location.search).not.toContain("arbetstid=");
  });

  it("en omladdning på ?arbetstid=1 landar i arket", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt&arbetstid=1");
    expect(ark()).not.toBeNull();
    expect(forareRader()).toHaveLength(1);
  });

  it("en förare över taket: i arket namn, ordet 'Över gränsen' och EN mening med talet i", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt");
    await oppnaArket();
    expect(forareRader()).toHaveLength(1);
    const t = kortText();
    expect(t).toContain("Stefan Karlsson");
    expect(t).toContain("Över gränsen");
    expect(t).toContain("262 av 250 tim övertid i år — taket är passerat");
    expect(text()).not.toContain("Ingen nära eller över en gräns för arbetstid");
  });

  it("gul vid 90 % visas ENSAM (varna före gränsen): raden finns, utan 'över', och i arket ordet 'Nära gränsen' och talet", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 230)]);
    await monter("flik=oversikt");
    expect(rad()!.textContent).toContain("1 förare nära arbetstidsgränsen");
    expect(rad()!.textContent).not.toContain("över gränsen");
    await oppnaArket();
    expect(forareRader().map(r => r.getAttribute("data-niva"))).toEqual(["gul"]);
    expect(kortText()).toContain("Stefan Karlsson");
    expect(kortText()).toContain("Nära gränsen");
    expect(kortText()).toContain("230 av 250 tim övertid i år — närmar sig taket");
    expect(text()).not.toContain("Ingen nära eller över en gräns för arbetstid");
  });

  it("gul vid 90 % bredvid en röd: ordet är 'Nära gränsen' (färgen bär inte ensam)", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 230), forareMed("r", "Röd Person", 262)]);
    await monter("flik=oversikt");
    await oppnaArket();
    const gul = forareRader().find(r => r.getAttribute("data-niva") === "gul")!;
    expect(gul.textContent).toContain("Nära gränsen");
    expect(gul.textContent).toContain("230 av 250 tim övertid i år — närmar sig taket");
  });

  it("röda före gula", async () => {
    g.__arbetstid = svar([forareMed("g", "Gul Person", 230), forareMed("r", "Röd Person", 262)]);
    await monter("flik=oversikt");
    await oppnaArket();
    // byggAttGora sorterar: servern skickar alla, arket visar röda först
    expect(forareRader().map(r => r.getAttribute("data-niva"))).toEqual(["rod", "gul"]);
  });

  it("tryck på en förare: de sex gränserna i lagens ordning, ihopfällt innan", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt");
    await oppnaArket();
    expect(document.body.querySelectorAll("[data-arbetstid-grans]")).toHaveLength(0);
    await act(async () => { knappen(forareRader()[0]).click(); });
    const rader = Array.from(document.body.querySelectorAll<HTMLElement>("[data-arbetstid-grans]"));
    expect(rader.map(r => r.getAttribute("data-arbetstid-grans"))).toEqual(["allman_overtid_ar", "extra_overtid_ar", "overtid_manad", "snitt_48", "veckovila", "dygnsvila"]);
    const allman = rader[0];
    expect(allman.getAttribute("data-niva")).toBe("rod");
    expect((allman.querySelector("[data-arbetstid-tal]")?.textContent || "")).toBe("262 av 250 tim");
    expect(allman.querySelector("[role=progressbar]")).not.toBeNull();
    // vila är ett "minst": ingen stapel
    expect(rader[4].querySelector("[role=progressbar]")).toBeNull();
    // tryck igen fäller ihop
    await act(async () => { knappen(forareRader()[0]).click(); });
    expect(document.body.querySelectorAll("[data-arbetstid-grans]")).toHaveLength(0);
  });

  it("Varför? visar paragrafen, och tolkningar är märkta", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt");
    await oppnaArket();
    await act(async () => { knappen(forareRader()[0]).click(); });
    expect(document.body.querySelector("[data-arbetstid-varfor]")).toBeNull();
    const grans = document.body.querySelector<HTMLElement>("[data-arbetstid-grans=allman_overtid_ar]")!;
    const varfor = Array.from(grans.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "Varför?")!;
    await act(async () => { varfor.click(); });
    expect(grans.querySelector("[data-arbetstid-varfor]")!.textContent).toContain("Skogsavtalet §5 mom 5");
    const extra = document.body.querySelector<HTMLElement>("[data-arbetstid-grans=extra_overtid_ar]")!;
    expect(extra.textContent).toContain("Räknat");
    expect(document.body.querySelector<HTMLElement>("[data-arbetstid-grans=snitt_48]")!.textContent).toContain("Tolkning");
  });

  it("en vila under kravet heter 'Under kravet', inte 'Över gränsen' (vila är ett minst)", async () => {
    const vila = forareMed("v", "Vila Person", 10);
    vila.granser = vila.granser.map(g => g.id === "dygnsvila" ? { ...g, niva: "rod" as const, varde: 10, mening: "Dygnsvilan blev 10 tim den 12 okt — minst 11 krävs" } : g);
    vila.varsta = "rod";
    g.__arbetstid = svar([vila]);
    await monter("flik=oversikt");
    await oppnaArket();
    expect(kortText()).toContain("Under kravet");
    expect(kortText()).not.toContain("Över gränsen");
    await act(async () => { knappen(forareRader()[0]).click(); });
    expect(document.body.querySelector<HTMLElement>("[data-arbetstid-grans=dygnsvila]")!.textContent).toContain("Under kravet");
  });

  it("'Restid ingår inte' står i förarens detalj när restid saknas i underlaget", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt");
    await oppnaArket();
    await act(async () => { knappen(forareRader()[0]).click(); });
    expect(document.body.querySelector("[data-arbetstid-notis]")!.textContent).toContain("Restid ingår inte");
  });

  it("maskinflytt i underlaget: detaljen säger 'Maskinflytt ingår: …' och INTE 'Restid ingår inte'", async () => {
    const f = byggArbetstid({
      medarbetare_id: "s", namn: "Stefan Karlsson", tomDatum: "2026-10-13",
      arsovertid: { ar: 2026, tomDatum: "2026-10-13", timmar: 0, modeller: { vardagar: 0, dagar: 0, vecka: 0, genomsnitt: 262, manad: 262 }, manader: [], perioder: [], veckor: [], basavdrag: { franvaroTimmar: 0, rodaTimmar: 0 } },
      dagar: [], extra: [], franvaro: [], trosklar: TROSKLAR, tak: 250, nu: new Date("2026-10-13T10:00:00Z"),
      flytt: [{ starttid: "2026-09-25T04:00:00Z", sluttid: "2026-09-25T13:00:00Z", total_tid_min: 400 }],
    });
    g.__arbetstid = svar([f]);
    await monter("flik=oversikt");
    await oppnaArket();
    await act(async () => { knappen(forareRader()[0]).click(); });
    const notis = document.body.querySelector("[data-arbetstid-notis]")!.textContent || "";
    expect(notis).toContain("Maskinflytt ingår: 1 flyttdag, 6,7 tim");
    expect(notis).toContain("hemresan ingår inte");
    expect(kortText()).not.toContain("Restid ingår inte");
  });

  it("läsvarningar (frånvaro, avtal, utjämning) står i arket i orange — aldrig tyst", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)], ["Kunde inte läsa frånvaron (permission denied) — övertid och 48-timmarssnittet räknas utan den och kan vara för låga."]);
    await monter("flik=oversikt");
    await oppnaArket();
    expect(document.body.querySelector("[data-arbetstid-varning]")!.textContent).toContain("Kunde inte läsa frånvaron");
  });

  it("ett läsfel utan förare att peka ut är ändå en rad ('kunde inte kontrolleras helt') — aldrig 'inget att göra'", async () => {
    g.__arbetstid = svar([], ["Kunde inte läsa frånvaron (permission denied) — övertid och 48-timmarssnittet räknas utan den och kan vara för låga."]);
    await monter("flik=oversikt");
    expect(rad()!.textContent).toContain("Arbetstiden kunde inte kontrolleras helt");
    expect(text()).not.toContain("Inget att göra");
    await oppnaArket();
    expect(document.body.querySelector("[data-arbetstid-varning]")!.textContent).toContain("Kunde inte läsa frånvaron");
  });

  const FLYTT = "2 flyttdagar kunde inte kopplas till en förare (saknar medarbetare och namnet matchar ingen) och ingår inte.";
  it("flyttdagar som inte kunde kopplas är ingen rad i Översikten: ensam varning → 'Inget att göra'", async () => {
    g.__arbetstid = svar([forareMed("a", "Anna Berg", 10)], [FLYTT]);
    await monter("flik=oversikt");
    expect(rad()).toBeNull();
    expect(text()).toContain("Inget att göra");
    expect(text()).not.toContain("kunde inte kopplas");
  });
  it("…och inte heller på raden när någon är nära gränsen — varningen står bara i arket, efter trycket", async () => {
    g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)], [FLYTT]);
    await monter("flik=oversikt");
    expect(text()).not.toContain("kunde inte kopplas");
    expect(rad()!.textContent).not.toContain("flyttdag");
    await oppnaArket();
    expect(document.body.querySelector("[data-arbetstid-varning]")!.textContent).toContain("2 flyttdagar kunde inte kopplas");
  });

  it("kan arbetstiden inte läsas säger Översikten det i stället för att tiga", async () => {
    g.__arbetstid = { ok: false, meddelande: "nät" };
    await monter("flik=oversikt");
    expect(text()).toContain("Kunde inte kontrollera arbetstiden");
    expect(text()).not.toContain("Ingen närmar sig en gräns för arbetstid");
  });

  it("den gamla raden vid 200 tim finns inte längre (det nya kortet är enda källan)", async () => {
    g.__arsovertid = { ok: true, ar: 2026, tak: 250, tomDatum: "2026-10-13", modeller: [], medarbetare: [{ medarbetare_id: "s", namn: "Stefan Karlsson", timmar: 1, modeller: { genomsnitt: 212.5, manad: 212.5 } }], utjamning: [] };
    await monter("flik=oversikt");
    expect(text()).not.toContain("tim övertid i år, taket är");
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// FÖRETAGSLEDARE / DELÄGARE (Martin 2026-10-13): arbetstidslagen gäller inte. Rutan i Admin → Medarbetare, grå rad i kortet.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Delägare: bockrutan i Medarbetare — och de räknas aldrig i Arbetstid", () => {
  const TROSKLAR = { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };
  const forareMed = (id: string, namn: string, ov: number, foretagsledare = false) => byggArbetstid({
    medarbetare_id: id, namn, tomDatum: "2026-10-13", foretagsledare,
    arsovertid: { ar: 2026, tomDatum: "2026-10-13", timmar: 0, modeller: { vardagar: 0, dagar: 0, vecka: 0, genomsnitt: ov, manad: ov }, manader: [], perioder: [], veckor: [], basavdrag: { franvaroTimmar: 0, rodaTimmar: 0 } },
    dagar: [], extra: [], franvaro: [], trosklar: TROSKLAR, tak: 250,
  });
  const svar = (forare: any[], varningar: string[] = []) => ({ ok: true, ar: 2026, tomDatum: "2026-10-13", forare, varningar });
  const forareRader = () => Array.from(document.body.querySelectorAll<HTMLElement>("[data-arbetstid-forare]"));
  const oppnaArket = async () => { await act(async () => { cont.querySelector<HTMLElement>('[data-sak="arbetstid"] button')!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await lugn(); };
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  const reglage = () => Array.from(cont.querySelectorAll<HTMLButtonElement>("[role=switch]")).find(b => b.getAttribute("aria-label") === "Företagsledare / delägare");
  /** Menyns siffra: orange cirkel vid Översikt i sidomenyn/bottenraden. */
  const menysiffror = () => Array.from(document.querySelectorAll<HTMLElement>("nav *")).filter(e => e.children.length === 0 && /^\d+$/.test((e.textContent || "").trim()) && getComputedStyle(e).background.includes("255, 159, 10")).map(e => (e.textContent || "").trim());

  // Granskningen 2026-10-17: en grå rad om att något inte gäller var brus (aldrig något att göra). Delägare visas inte i Arbetstid alls.
  it("delägaren visas inte i Arbetstid: ingen rad, ingen grå rad, ingen nivå — 'Inget att göra'", async () => {
    g.__arbetstid = svar([forareMed("m", "Martin Lindqvist", 300, true)]);
    await monter("flik=oversikt");
    expect(forareRader()).toHaveLength(0);
    expect(cont.querySelector('[data-sak="arbetstid"]')).toBeNull();
    expect(text()).not.toContain("Martin Lindqvist");
    expect(text()).not.toContain("Delägare – arbetstidslagen gäller inte");
    expect(text()).toContain("Inget att göra");   // delägare är inte ett problem
  });

  it("en delägare som inte skulle ha varit gul/röd visas inte heller", async () => {
    g.__arbetstid = svar([forareMed("m", "Martin Lindqvist", 10, true)]);
    await monter("flik=oversikt");
    expect(cont.querySelector('[data-sak="arbetstid"]')).toBeNull();
    expect(text()).toContain("Inget att göra");
  });

  it("en vanlig röd förare räknas, delägaren bredvid räknas inte: '1 förare', och bara hon finns i arket", async () => {
    g.__arbetstid = svar([forareMed("m", "Martin Lindqvist", 300, true), forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt");
    expect(cont.querySelector('[data-sak="arbetstid"]')!.textContent).toContain("1 förare nära arbetstidsgränsen");
    await oppnaArket();
    expect(forareRader().map(r => r.getAttribute("data-niva"))).toEqual(["rod"]);
    expect(document.body.textContent).not.toContain("Martin Lindqvist");
  });

  it("delägaren räknas INTE i menysiffran: en röd delägare ger ingen siffra, en röd vanlig förare ger 1 (Arbetstid är EN rad)", async () => {
    g.__arbetstid = svar([forareMed("m", "Martin Lindqvist", 300, true)]);
    await monter("flik=oversikt");
    expect(menysiffror()).toEqual([]);
    g.__arbetstid = svar([forareMed("m", "Martin Lindqvist", 300, true), forareMed("s", "Stefan Karlsson", 262)]);
    await monter("flik=oversikt");
    expect(menysiffror().length).toBeGreaterThan(0);
    expect(menysiffror().every(t => t === "1")).toBe(true);
  });

  describe("menysiffran och rubriken räknar bara det som kräver åtgärd nu: gul syns men räknas inte, röd räknas", () => {
    const rubrik = () => Array.from(cont.querySelectorAll<HTMLElement>("div")).map(e => egenText(e)).find(t => /kräver dig|Att titta på/.test(t));
    it("bara en gul förare: raden finns, menyn har ingen siffra och rubriken säger 'Att titta på' (grå, inte orange)", async () => {
      g.__arbetstid = svar([forareMed("g", "Gul Person", 230)]);
      await monter("flik=oversikt");
      expect(cont.querySelector('[data-sak="arbetstid"]')!.textContent).toContain("1 förare nära arbetstidsgränsen");
      expect(menysiffror()).toEqual([]);
      expect(rubrik()).toBe("Att titta på");
      expect(text()).not.toContain("kräver dig");
      const el = Array.from(cont.querySelectorAll<HTMLElement>("div")).find(e => egenText(e) === "Att titta på")!;
      expect(getComputedStyle(el).color).not.toBe(rgb(FARG.orange));
    });
    it("en röd förare: menyn visar 1 (raden räknas som EN) och rubriken '1 sak kräver dig' i orange", async () => {
      g.__arbetstid = svar([forareMed("r", "Röd Person", 262), forareMed("r2", "Röd Två", 270), forareMed("g", "Gul Person", 230)]);
      await monter("flik=oversikt");
      expect(menysiffror()).toEqual(["1"]);
      expect(rubrik()).toBe("1 sak kräver dig");
      const el = Array.from(cont.querySelectorAll<HTMLElement>("div")).find(e => egenText(e) === "1 sak kräver dig")!;
      expect(getComputedStyle(el).color).toBe(rgb(FARG.orange));
    });
    it("gul + en annan sak (avtalet går ut): bara den andra räknas, i både menyn och rubriken — men båda raderna syns", async () => {
      g.__arbetstid = svar([forareMed("g", "Gul Person", 230)]);
      g.__db.gs_avtal[0].giltigt_till = "2026-10-20";
      await monter("flik=oversikt");
      expect(document.querySelectorAll("[data-sak]")).toHaveLength(2);
      expect(menysiffror()).toEqual(["1"]);
      expect(rubrik()).toBe("1 sak kräver dig");
    });
    it("en gul förare som blir röd flyttar siffran från 0 till 1", async () => {
      g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 230)]);
      await monter("flik=oversikt");
      expect(menysiffror()).toEqual([]);
      g.__arbetstid = svar([forareMed("s", "Stefan Karlsson", 262)]);
      await monter("flik=oversikt");
      expect(menysiffror()).toEqual(["1"]);
    });
  });

  const medUpdates = () => g.__skriv.filter((x: any) => x.tabell === "medarbetare" && x.op === "update");
  const sparaKnapp = () => blad("Spara").map(e => e.closest("button")!).find(Boolean)!;

  it("Admin → Medarbetare: rutan 'Företagsledare / delägare' finns, är av som standard och SPARAR DIREKT när den slås på — utan 'Spara ändringar'", async () => {
    await monter("flik=medarbetare&person=m1");
    const r = reglage()!;
    expect(r).toBeTruthy();
    expect(r.getAttribute("aria-checked")).toBe("false");
    expect(text()).toContain("Sparas direkt. Ingen lön i appen.");
    expect(medUpdates()).toHaveLength(0);
    await act(async () => { r.click(); });
    expect(reglage()!.getAttribute("aria-checked")).toBe("true");
    // Felet 2026-10-14: reglaget slogs på men raden skrevs aldrig, eftersom sparandet låg bakom knappen längst ner.
    expect(medUpdates()).toHaveLength(1);
    expect(medUpdates()[0].vals).toEqual({ foretagsledare: true });
    expect(g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare).toBe(true);
    expect(g.__eq.some((e: any) => e[0] === "medarbetare" && e[1] === "id" && e[2] === "m1")).toBe(true);   // rätt rad
    expect(sparaKnapp().disabled).toBe(true);   // inget väntar på "Spara ändringar"
  });

  it("rutan visar det sparade värdet, och slås den om är det sparat — Spara-knappen väntar inte på det", async () => {
    g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare = true;
    await monter("flik=medarbetare&person=m1");
    expect(reglage()!.getAttribute("aria-checked")).toBe("true");
    expect(sparaKnapp().disabled).toBe(true);
    await act(async () => { reglage()!.click(); });
    expect(sparaKnapp().disabled).toBe(true);
    expect(g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare).toBe(false);
  });

  it("de andra fälten sparas som förut och skriver ALDRIG foretagsledare; reglaget skriver BARA foretagsledare", async () => {
    await monter("flik=medarbetare&person=m1");
    await skriv(falt("Namn"), "Anna Bergström");
    await klick("Spara");
    expect(medUpdates()).toHaveLength(1);
    expect(medUpdates()[0].vals.namn).toBe("Anna Bergström");
    expect("foretagsledare" in medUpdates()[0].vals).toBe(false);
    // …och tvärtom: ett osparat namn dras inte med när reglaget slås om.
    g.__skriv.length = 0;
    await monter("flik=medarbetare&person=m1");
    await skriv(falt("Namn"), "Annan Berg");
    await act(async () => { reglage()!.click(); });
    expect(medUpdates()).toHaveLength(1);
    expect(medUpdates()[0].vals).toEqual({ foretagsledare: true });
  });

  it("kan man bocka ur den igen: sparas som false direkt", async () => {
    g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare = true;
    await monter("flik=medarbetare&person=m1");
    await act(async () => { reglage()!.click(); });
    expect(medUpdates()[0].vals).toEqual({ foretagsledare: false });
    expect(g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare).toBe(false);
  });

  it("databasen skriver inget (RLS: 0 rader utan fel): reglaget går tillbaka och felet står, inte ett falskt 'sparat'", async () => {
    await monter("flik=medarbetare&person=m1");
    g.__ingaRader = true;
    await act(async () => { reglage()!.click(); });
    expect(reglage()!.getAttribute("aria-checked")).toBe("false");
    expect(text()).toContain("Företagsledare sparades inte");
    expect(text()).toContain("raden träffades inte");
    expect(g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare).toBeFalsy();
  });

  it("databasen avvisar kolumnen (schemacachen): reglaget går tillbaka och felet från databasen står", async () => {
    await monter("flik=medarbetare&person=m1");
    g.__avvisaKolumner = { medarbetare: ["foretagsledare"] };
    await act(async () => { reglage()!.click(); });
    expect(reglage()!.getAttribute("aria-checked")).toBe("false");
    expect(text()).toContain("Företagsledare sparades inte: Could not find the 'foretagsledare' column");
  });

  it("det sparade följer med tillbaka till listan: öppnas personen igen utan omladdning visar reglaget det sparade", async () => {
    await monter("flik=medarbetare&person=m1");
    await act(async () => { reglage()!.click(); });
    g.__db.medarbetare.find((m: any) => m.id === "m1").foretagsledare = false;   // databasen får inte vara det som ger svaret här
    await klick("Medarbetare");                      // Tillbaka till listan
    await klick("Anna Berg");
    expect(reglage()!.getAttribute("aria-checked")).toBe("true");
  });

  it("migrationen är inte körd (kolumnen saknas): personlistan läses ändå, rutan döljs och en annan ändring sparas", async () => {
    g.__saknasLasKolumner = { medarbetare: ["foretagsledare"] };
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Personuppgifter");
    expect(text()).not.toContain("Kunde inte ladda medarbetare");
    expect(reglage()).toBeUndefined();
    await skriv(falt("Namn"), "Anna B");
    await klick("Spara");
    expect("foretagsledare" in g.__skriv.find((x: any) => x.tabell === "medarbetare" && x.op === "update").vals).toBe(false);
  });

  it("andra läsfel på medarbetare döljs inte av fallbacken: de visas som förut", async () => {
    g.__dbFel = { medarbetare: "permission denied" };
    await monter("flik=medarbetare");
    expect(text()).toContain("Kunde inte ladda medarbetare");
    expect(text()).toContain("permission denied");
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────
// DAGAR (Lön → Dagar): svaret först. Förvalt är bara avvikelserna; alla dagar ligger bakom "Visa alla".
// Granskningen 2026-10-17: 111 platta rader, svaret ("9 med avvikelse") var en liten rad överst.
// ─────────────────────────────────────────────────────────────────────────────────────
describe("Lön → Dagar: svaret först", () => {
  const dag = (datum: string, over: Record<string, any> = {}) => ({
    id: `d-${datum}`, datum, start_tid: "06:00:00", slut_tid: "15:30:00", rast_min: 30, arbetad_min: 540, extra_min: 0, objekt: ["Älmehult gallring 2026"], perioddag: false,
    maskin_id: "R64101", km_totalt: 0, ersattningsmil: 0, traktamente: false, bekraftad: true, ob_min: 0, ...over,
  });
  const forare = (dagar: any[], namn = "Anna Berg") => ({ medarbetare_id: "m1", namn, status: "utkast", anstallningsnummer: "1001", dagar, synk: [], deldagar: [], ledighetskollision: [], vilobrott: [], rader: [], lonerader: [], varningar: [] });
  /** Tis 1 sep (vanlig), lör 5 sep (helg = avvikelse), mån 7 sep med rast 114 min (avvikelse), ons 9 sep utan objekt (avvikelse). */
  const SEPT = [dag("2026-09-01"), dag("2026-09-05"), dag("2026-09-07", { rast_min: 114 }), dag("2026-09-09", { objekt: [] })];
  const oppna = async (sp = "flik=lon&underflik=dagar", dagar: any[] = SEPT) => { g.__salary = { ...SALARY, medarbetare: [forare(dagar)] }; await monter(sp); };
  const rubrik = () => (cont.querySelector("[data-visa-alla]")?.textContent || "");

  it("förvalt: bara avvikelserna, med antalet överst och 'Visa alla N' längst ned — den vanliga dagen syns inte", async () => {
    await oppna();
    expect(text()).toContain("3 dagar med avvikelse");
    expect(rubrik()).toBe("Visa alla 4");
    expect(blad("Bara avvikelser").length).toBe(0); // förvalt = inget val att göra
    expect(text()).not.toContain("tis 1 september");
    expect(text()).toContain("lör 5 september");
    expect(text()).not.toContain("Summering"); // den gamla summeringen längst ner finns inte längre ...
    expect(cont.querySelector("[data-lonekvot-tabell]")).not.toBeNull(); // ... sammanställningen står överst och visas ändå
  });

  it("'Visa alla' öppnar alla dagar, med summeringen, och 'Bara avvikelser' tar tillbaka filtret", async () => {
    await oppna();
    await klick("Visa alla 4");
    expect(text()).toContain("1 förare · 4 rader · 3 med avvikelse");
    expect(text()).toContain("tis 1 september");
    expect(text()).not.toContain("Summering"); // ingen summering längst ner: tabellen överst är densamma i båda lägena
    await klick("Bara avvikelser");
    expect(text()).toContain("3 dagar med avvikelse");
    expect(text()).not.toContain("tis 1 september");
  });

  it("?avv=0 öppnar med alla dagar (länken 'Se alla')", async () => {
    await oppna("flik=lon&underflik=dagar&avv=0");
    expect(text()).toContain("1 förare · 4 rader · 3 med avvikelse");
  });

  it("inga avvikelser: det står, och alla dagar går att öppna", async () => {
    await oppna("flik=lon&underflik=dagar", [dag("2026-09-01"), dag("2026-09-02")]);
    expect(text()).toContain("0 dagar med avvikelse");
    expect(text()).toContain("Inga avvikelser i September 2026");
    expect(rubrik()).toBe("Visa alla 2");
  });

  it("månaden har arbetsmånaden som namn och månaden lönen kommer bredvid (september → 'September · lön i oktober')", async () => {
    await oppna();
    expect(cont.querySelector("[data-arbetsmanad]")!.parentElement!.textContent).toMatch(/^September( 2026)? · lön i oktober$/);
    expect(cont.querySelector("[data-utbetalning]")!.textContent).toBe("lön i oktober");
    // ... och Löneunderlag säger samma sak om samma månad: arbetsmånaden september är löneperiod oktober.
    await klick("Löneunderlag");
    expect(cont.querySelector("[data-arbetsmanad]")!.parentElement!.textContent).toMatch(/^September( 2026)? · lön i oktober$/);
    expect(cont.querySelector("[data-utbetalning]")!.textContent).toBe("lön i oktober");
  });

  it("kvartal och år har ingen utbetalningsrad (det är en månads lön)", async () => {
    await oppna();
    await klick("Kvartal");
    expect(cont.querySelector("[data-utbetalning]")).toBeNull();
  });

  it("tekniska ord byts mot förarens: 'ingen trakt', aldrig 'utan objekt'", async () => {
    await oppna();
    expect(text()).toContain("ingen trakt");
    expect(text()).not.toContain("utan objekt");
  });

  it("rast noll på ett långt pass är ingen varning: bara en neutral rad i dagens detalj", async () => {
    await oppna("flik=lon&underflik=dagar&avv=0", [dag("2026-09-01", { rast_min: 0, arbetad_min: 480 }), dag("2026-09-02", { rast_min: 30 }), dag("2026-09-03", { rast_min: 0, arbetad_min: 300 })]);
    const INFO = "Inget stopp över 15 min – räknas som arbetstid med måltidsuppehåll (G15)";
    expect(text()).not.toContain(INFO);                       // hopfälld: inget syns
    expect(text()).not.toMatch(/utan rast|ingen rast/i);        // och ingen varning, varken på raden eller i listan
    expect(text()).toContain("1 förare · 3 rader · 0 med avvikelse"); // en dag utan rast är inte en avvikelse
    await klick("8 tim"); // dag 1 (480 min)
    expect(text()).toContain(INFO);
    expect((text().match(/Inget stopp över 15 min/g) || []).length).toBe(1);
    expect(text()).not.toContain("ingen rast");
  });

  // ── Lönekvot per förare överst (2026-10-23) ──
  const fil = (min: number) => ({ min, kalla: "fil", maskinens_min: min });
  const filDag = (datum: string, maskin: number, over: Record<string, any> = {}) => dag(datum, { maskintid: fil(maskin), ...over });
  const FEM = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"];
  const tva = (a: any[], b: any[]) => { g.__salary = { ...SALARY, medarbetare: [forare(a), { ...forare(b, "Bo Ek"), medarbetare_id: "m2" }] }; };
  const tabell = () => cont.querySelector("[data-lonekvot-tabell]") as HTMLElement;
  const radFor = (id: string) => tabell().querySelector(`[data-kvot-rad="${id}"]`) as HTMLElement;
  const alla = () => tabell().querySelector("[data-kvot-alla]") as HTMLElement;

  it("lönekvoten står överst och syns i det filtrerade läget — en rad per förare, 'Alla' sist, Betalt · Maskin · Lönekvot", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar");
    expect(text()).toContain("dagar med avvikelse");
    const t = tabell();
    expect(t.textContent).toContain("Betalt");
    expect(t.textContent).toContain("Maskin");
    expect(t.textContent).toContain("Lönekvot");
    // Ordningen: tabellen före avvikelseraden och före dagarna.
    expect(cont.innerHTML.indexOf("data-lonekvot-tabell")).toBeLessThan(cont.innerHTML.indexOf("dagar med avvikelse"));
    // Anna: 5 × 540 min betalt (45 tim), 5 × 270 maskin (22 tim 30 min) = 50 %. Bo: 5 × 360 = 67 %.
    expect(radFor("m1").textContent).toContain("45 tim");
    expect(radFor("m1").textContent).toContain("22 tim 30 min");
    expect(radFor("m1").querySelector("[data-kvot-varde]")!.textContent).toBe("50 %");
    expect(radFor("m2").querySelector("[data-kvot-varde]")!.textContent).toBe("67 %");
    // Alla = summan av minuterna, inte snittet av procenten: (1350 + 1800) / 5400 = 58 %.
    expect(alla().querySelector("[data-kvot-varde]")!.textContent).toBe("58 %");
    expect(alla().textContent).toContain("90 tim");
    expect(Array.from(t.querySelectorAll("[data-kvot-rad], [data-kvot-alla]")).map(e => e.getAttribute("data-kvot-rad") || "alla")).toEqual(["m1", "m2", "alla"]);
  });

  it("samma tabell i 'Visa alla' — inte en andra summering och inte en annan siffra", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar");
    const fore = tabell().textContent;
    await klick("Visa alla 10");
    expect(tabell().textContent).toBe(fore);
    expect(cont.querySelectorAll("[data-lonekvot-tabell]").length).toBe(1);
  });

  it("utan maskinfiler: '–' i Maskin och Lönekvot, aldrig 0 %; under 5 fildagar: 'för få dagar'", async () => {
    tva(FEM.map(d => dag(d, { maskintid: { min: 0, kalla: "ingen_fil", maskinens_min: 0 } })), FEM.slice(0, 3).map(d => filDag(d, 300)));
    await monter("flik=lon&underflik=dagar");
    expect(radFor("m1").querySelector("[data-kvot-varde]")!.textContent).toBe("–");
    expect(radFor("m1").textContent).not.toContain("0 %");
    expect(radFor("m1").textContent).toContain("45 tim"); // betald tid finns ändå
    expect(radFor("m2").querySelector("[data-kvot-varde]")!.textContent).toBe("för få dagar");
    expect(tabell().textContent).toContain("kräver minst 5 dagar med maskinfiler (3 hittills)");
  });

  it("ingen maskin i hela månaden: Alla visar '–' och förklaringen om G15 står inte (inget att förklara)", async () => {
    g.__salary = { ...SALARY, medarbetare: [forare(FEM.map(d => dag(d, { maskintid: { min: 0, kalla: "ingen_maskin", maskinens_min: 0 } })))] };
    await monter("flik=lon&underflik=dagar");
    expect(alla().querySelector("[data-kvot-varde]")!.textContent).toBe("–");
    expect(tabell().textContent).not.toContain("Mäter verksamheten");
  });

  it("tryck på en rad öppnar Förare · Månad för den föraren och månaden (löneperioden = arbetsmånad + 1)", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar");
    expect(document.body.querySelector("[data-forare-manad]")).toBeNull();
    await act(async () => { radFor("m2").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(window.location.search).toContain("underflik=underlag");
    expect(window.location.search).toContain("period=2026-10");
    expect(window.location.search).toContain("forare=m2");
    expect(document.body.querySelector('[data-forare-manad="m2"]')).not.toBeNull();
    // Samma tal i arket som i tabellen: 67 %.
    expect(document.body.querySelector("[data-lonekvot]")!.textContent).toContain("67 %");
  });

  const stangArk = async () => {
    await act(async () => { (Array.from(document.body.querySelectorAll("[data-forare-manad] button")).find(b => b.textContent === "Stäng") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
  };

  it("tillbaka från Förare · Månad landar i Dagar på samma månad (Dagar september → Stefan → tillbaka → Dagar september)", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar");
    expect(text()).toContain("September · lön i oktober");
    await act(async () => { radFor("m2").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(document.body.querySelector('[data-forare-manad="m2"]')).not.toBeNull();
    await stangArk();
    expect(document.body.querySelector("[data-forare-manad]")).toBeNull();
    expect(window.location.search).toContain("underflik=dagar");
    expect(window.location.search).toContain("dagoff=-1");
    expect(window.location.search).not.toContain("forare=");
    expect(tabell()).not.toBeNull();
    expect(text()).toContain("September · lön i oktober");
  });

  it("tillbaka landar på månaden man kom ifrån även när den inte är standardperioden (Dagar augusti → Stefan → tillbaka → Dagar augusti)", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar");
    await act(async () => { (cont.querySelector('[aria-label="Föregående period"]') as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(text()).toContain("Augusti · lön i september");
    await act(async () => { radFor("m2").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    expect(document.body.querySelector('[data-forare-manad="m2"]')).not.toBeNull();
    await stangArk();
    expect(window.location.search).toContain("underflik=dagar");
    expect(window.location.search).toContain("dagoff=-2");
    expect(text()).toContain("Augusti · lön i september");
    expect(text()).not.toContain("September · lön i oktober");
  });

  it("tillbaka bevarar också filtret ('visa alla') och månaden", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar&dagper=M&dagoff=-1&avv=0");
    await act(async () => { radFor("m1").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await lugn();
    await stangArk();
    expect(window.location.search).toContain("underflik=dagar");
    expect(window.location.search).toContain("avv=0");
    expect(window.location.search).toContain("dagoff=-1");
  });

  it("'Alla' är ingen länk, och kvartal/år (ingen enskild månad) och en månad vars underlag inte går att öppna har inga tryckbara rader", async () => {
    tva(FEM.map(d => filDag(d, 270)), FEM.map(d => filDag(d, 360)));
    await monter("flik=lon&underflik=dagar");
    expect(alla().tagName).toBe("DIV");
    expect(radFor("m1").tagName).toBe("BUTTON");
    await klick("Kvartal");
    expect(tabell().querySelector("button")).toBeNull();
    // Innevarande månad (oktober, löneperiod november ligger i framtiden): ingen Förare · Månad att öppna.
    await monter("flik=lon&underflik=dagar&dagper=M&dagoff=0");
    expect(tabell()).not.toBeNull();
    expect(tabell().querySelector("button")).toBeNull();
  });

  it("filen 'förare' utan dagar finns inte i tabellen och en tom månad visar inget tomt skal", async () => {
    g.__salary = { ...SALARY, medarbetare: [forare([])] };
    await monter("flik=lon&underflik=dagar");
    expect(cont.querySelector("[data-lonekvot-tabell]")).toBeNull();
    expect(text()).toContain("Inga arbetsdagar registrerade");
  });

  it("rast noll på ett kort pass (under sex timmar) eller med rast: ingen rad om stopp", async () => {
    await oppna("flik=lon&underflik=dagar&avv=0", [dag("2026-09-02", { rast_min: 30 }), dag("2026-09-03", { rast_min: 0, arbetad_min: 300 })]);
    await klick("9 tim");
    await klick("5 tim");
    expect(text()).not.toContain("Inget stopp över 15 min");
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────
// GRANSKNINGEN 2026-10-17: färre ord, samma mönster i alla flikar (en rad = en sak, inga tekniska ord, inga dubbletter).
// ─────────────────────────────────────────────────────────────────────────────────────
describe("Granskningen: Medarbetare", () => {
  const forareRad = () => radMed("Anna Berg").parentElement as HTMLElement;
  it("en förare utan koppling till maskinfilerna får EN orange rad om det — en admin aldrig, och ingen '0 operatörer' på varje rad", async () => {
    await monter("flik=medarbetare");
    expect(text()).not.toMatch(/\d operatör/);
    expect(text()).toContain("ingen koppling till maskinfilerna");
    expect((text().match(/ingen koppling till maskinfilerna/g) || []).length).toBe(1); // Anna (förare), inte Erik (admin)
    expect(text()).toContain("Rottne H8E · ingen koppling");
  });
  it("kopplad förare: raden har bara maskinen", async () => {
    g.__db.dim_operator = [{ operator_id: "OP1", operator_namn: "Anna", operator_key: "k", maskin_id: "R64101" }];
    g.__db.operator_medarbetare = [{ operator_id: "OP1", medarbetare_id: "m1" }];
    await monter("flik=medarbetare");
    expect(text()).not.toContain("ingen koppling till maskinfilerna");
    void forareRad;
  });
  it("Spara ligger i sidhuvudet (grå tills något är ändrat), före alla fält — och det finns ingen 'Spara ändringar' längst ned", async () => {
    await monter("flik=medarbetare&person=m1");
    const spara = blad("Spara")[0].closest("button") as HTMLButtonElement;
    expect(blad("Spara").length).toBe(1);
    expect(spara.disabled).toBe(true);
    expect(blad("Spara ändringar").length).toBe(0);
    // sidhuvudet: före första fältet i dokumentordning
    expect(spara.compareDocumentPosition(falt("Namn")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await skriv(falt("Namn"), "Anna Bergström");
    expect((blad("Spara")[0].closest("button") as HTMLButtonElement).disabled).toBe(false);
  });
  it("hjälptexter som bara upprepar etiketten är borta, och företagsledare är en rad", async () => {
    await monter("flik=medarbetare&person=m1");
    expect(text()).not.toContain("Inloggning kopplad.");
    expect(text()).not.toContain("Gata och nummer");
    expect(text()).not.toContain("Arbetstidslagen gäller inte");
    expect(text()).not.toContain("En operatör är namnet i maskinfilerna");
    expect(text()).toContain("Sparas direkt. Ingen lön i appen.");
    expect(text()).toContain("Tiden når inte lönen utan koppling till maskinfilerna. Tryck + Koppla.");
  });
  it("ingen inloggning kopplad: en kort orange rad som säger vad som händer", async () => {
    g.__db.medarbetare.find((m: any) => m.id === "m1").user_id = null;
    await monter("flik=medarbetare&person=m1");
    expect(text()).toContain("Ingen inloggning kopplad — den kopplas när ett konto med samma e-post finns.");
  });
});

describe("Granskningen: Maskiner", () => {
  const valj = async (select: HTMLSelectElement, v: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, v);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const datakalla = () => Array.from(cont.querySelectorAll("select")).find(sel => Array.from(sel.options).some(o => o.textContent === "Maskinfiler")) as HTMLSelectElement;
  it("listan: en rad per maskin utan egen knapp — 'Öppna som maskin' bor i maskinens vy", async () => {
    await monter("flik=maskiner");
    expect(text()).not.toContain("Öppna som maskin");
    await klick("Rottne H8E");
    const lank = Array.from(cont.querySelectorAll("a")).find(a => a.textContent === "Öppna som maskin")!;
    expect(lank.getAttribute("href")).toBe("/maskin?som=R64101");
    expect(lank.getAttribute("target")).toBe("_blank");
  });
  it("EN fråga i stället för två brytare: 'Hur kommer datan?' — Maskinfiler, Manuellt eller Ingen data", async () => {
    await monter("flik=maskiner&maskin=R64101");
    expect(text()).not.toContain("Sänder filer");
    expect(text()).not.toContain("Manuell datakälla");
    expect(text()).not.toContain("FPR");
    expect(Array.from(datakalla().options).map(o => o.textContent)).toEqual(["Maskinfiler", "Manuellt, lass i arbetsrapporten", "Ingen data"]);
    expect(datakalla().value).toBe("filer");
  });
  it("Manuellt sparar datakälla manuell och sänder-inte-filer; Ingen data sparar auto och sänder-inte; Maskinfiler tillbaka", async () => {
    await monter("flik=maskiner&maskin=R64101");
    await valj(datakalla(), "manuellt");
    expect(text()).toContain("Föraren registrerar lass i arbetsrapporten. Maskinfiler avvisas.");
    await klick("Spara ändringar");
    let skr = g.__skriv.filter((x: any) => x.tabell === "dim_maskin" && x.op === "update").pop().vals;
    expect(skr).toMatchObject({ sander_filer: false, datakalla: "manuell" });
    await monter("flik=maskiner&maskin=R64101");
    expect(datakalla().value).toBe("manuellt");
    await valj(datakalla(), "ingen");
    await klick("Spara ändringar");
    skr = g.__skriv.filter((x: any) => x.tabell === "dim_maskin" && x.op === "update").pop().vals;
    expect(skr).toMatchObject({ sander_filer: false, datakalla: "auto" });
    await monter("flik=maskiner&maskin=R64101");
    expect(datakalla().value).toBe("ingen");
    await valj(datakalla(), "filer");
    await klick("Spara ändringar");
    skr = g.__skriv.filter((x: any) => x.tabell === "dim_maskin" && x.op === "update").pop().vals;
    expect(skr).toMatchObject({ sander_filer: true, datakalla: "auto" });
  });
  it("ny maskin: två korta meningar, ingen text om vad som skyddas eller skrivs över", async () => {
    g.__db.dim_maskin.push({ maskin_id: "R64999", visningsnamn: null, modell: "H8E", maskin_typ: "Harvester", sander_filer: true, datakalla: null, aktiv_fran: null, aktiv_till: null, bekraftad: false });
    await monter("flik=maskiner&maskin=R64999");
    expect(text()).toContain("Ny maskin upptäckt i importen");
    expect(text()).toContain("Fyll i visningsnamn och aktiv från, bekräfta sedan.");
    expect(text()).not.toContain("skyddas");
    expect(text()).not.toContain("nyckel mot filerna");
    expect(text()).not.toContain("Öppna som maskin"); // en obekräftad maskin är inget att öppna som
  });
});

describe("Granskningen: Lön → Lönesystem", () => {
  it("bara system som finns: inga 'Stub'-knappar, och ingen utvecklartext om miljövariabler och kryptering", async () => {
    await monter("flik=lon&underflik=system");
    expect(text()).not.toMatch(/Stub|Visma|Hogia|Kontek|Crona|Agda/);
    expect(text()).not.toMatch(/FORTNOX_CLIENT|AES|miljövariabler|krypteras/);
    expect(blad("Fortnox").length).toBeGreaterThan(0);
    expect(blad("CSV-export").length).toBeGreaterThan(0);
    expect(text()).not.toContain("väljer du under Lön → Lönearter");
  });
  it("token som går ut om månader visas inte; senast synkad står som 'igår 21:10', aldrig som en tidsstämpel", async () => {
    g.__fortnoxStatus = { connected: true, token_utgar: "2026-12-01T01:00:00", senast_synkad: "2026-10-06T21:10:00" };
    await monter("flik=lon&underflik=system");
    expect(text()).not.toContain("Token");
    expect(text()).toContain("Senast synkad");
    expect(text()).toContain("igår 21:10");
    expect(text()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it("token som går ut om några dagar: en orange rad med Förnya bredvid", async () => {
    g.__fortnoxStatus = { connected: true, token_utgar: "2026-10-10T10:00:00", senast_synkad: null };
    await monter("flik=lon&underflik=system");
    expect(text()).toContain("Token går ut10 okt");
    expect(blad("Förnya").length).toBe(1);
  });
  it("redan utgången token säger det", async () => {
    g.__fortnoxStatus = { connected: true, token_utgar: "2026-10-01T10:00:00", senast_synkad: null };
    await monter("flik=lon&underflik=system");
    expect(text()).toContain("Token har gått ut");
  });
  it("'Koppla ifrån' ligger sist och är röd text — inte först med samma tyngd som Testa anslutning", async () => {
    await monter("flik=lon&underflik=system");
    const testa = blad("Testa anslutning")[0];
    const ifran = blad("Koppla ifrån")[0];
    expect(testa.compareDocumentPosition(ifran) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(ifran.closest("button")!).color).toBe("rgb(255, 69, 58)");
  });
});

describe("Granskningen: Lön → Lönearter", () => {
  const rad = (key: string) => cont.querySelector<HTMLElement>(`[data-loneart="${key}"]`)!;
  it("en mening överst, och ingen rad upprepar sitt eget namn som 'I Fortnox: …'", async () => {
    g.__db.lonesystem_artikelmappning.push({ id: "x9", lonesystem_id: "ls1", intern_typ: "helglon_skotare", extern_kod: "1462", beskrivning: "Helglön skotare:", skapad: "2026-10-01" });
    g.__db.lonesystem_artikelmappning.push({ id: "x10", lonesystem_id: "ls1", intern_typ: "helglon_skordare", extern_kod: "1461", beskrivning: "Helglön, timmar", skapad: "2026-10-01" });
    await monter("flik=lon&underflik=lonearter");
    expect(text()).toContain("Vilken löneart i Fortnox varje rad skickas som. Bara antal skickas — Fortnox räknar kronorna.");
    expect(text()).not.toContain("Här väljer du");
    expect(rad("timlon").textContent).not.toContain("I Fortnox");                  // samma namn som rubriken
    expect(rad("helglon_skotare").textContent).not.toContain("I Fortnox");         // kolonet i Fortnox-namnet ("Helglön skotare:") gör det inte till ett annat namn
    expect(rad("helglon_skotare").textContent).not.toMatch(/:/);
    expect(rad("helglon_skordare").textContent).toContain("I Fortnox: Helglön, timmar"); // ett annat namn står kvar
    expect(rad("helglon_skordare").textContent).toContain("1461");
  });
  it("lönearter som saknar kod: en rad med namnen, utan förklaring av hur exporten stoppar (den står i bekräftelsen)", async () => {
    await monter("flik=lon&underflik=lonearter");
    const t = cont.querySelector("[data-lonearter-saknas]")!.textContent!;
    expect(t).toMatch(/lönearter saknar kod: Helglön skördare, Helglön skotare, Brandrisk – OB\./);
    expect(t).not.toContain("stoppas exporten");
  });
});

describe("Granskningen: ATK-val och Vilobrott", () => {
  it("ATK: 'Saknar val (2)' är rubriken — raderna är bara namn, inget 'Ej valt' upprepat", async () => {
    await monter("flik=lon&underflik=atk");
    expect(text()).toContain("Saknar val (2)");
    expect(text()).not.toContain("Ej valt");
    expect(text()).toContain("Förarna väljer pengar, ledig tid eller pension.");
  });
  it("Vilobrott: metodtexten ligger bakom 'Så räknas det', inte före svaret", async () => {
    await monter("flik=lon&underflik=vila");
    expect(text()).not.toContain("Analyserar");
    expect(text()).not.toContain("dygnsvila minst 11 h");
    await klick("Så räknas det");
    expect(text()).toContain("dygnsvila minst 11 h, veckovila minst 36 h i följd");
  });
});

describe("Granskningen: Avtal", () => {
  it("rubrikkortet som upprepade namn och datum är borta; Spara ligger i sidhuvudet; gruppen heter Resor", async () => {
    await monter("flik=avtal");
    expect(text()).not.toContain("Aktuellt avtal");
    expect(text()).not.toContain("Färdmedel & färdtid");
    expect(text()).toContain("Resor");
    expect(blad("Spara").length).toBe(1);
    expect(blad("Spara ändringar").length).toBe(0);
    const spara = blad("Spara")[0].closest("button") as HTMLButtonElement;
    expect(spara.disabled).toBe(true);
    expect(spara.compareDocumentPosition(falt("Övertidsersättning vardag")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ...och före Utjämningsperioder, så det inte ser ut att höra till dem
    expect(spara.compareDocumentPosition(blad("Utjämningsperioder")[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await skriv(falt("Övertidsersättning vardag"), "55.5");
    expect((blad("Spara")[0].closest("button") as HTMLButtonElement).disabled).toBe(false);
  });
  it("namnfältet är brett nog för avtalsnamnet (det klipptes: 'Skogsavtalet 2025–20')", async () => {
    await monter("flik=avtal");
    expect(falt("Namn").style.width).toBe("280px");
    expect(falt("Namn").value).toBe("Skogsavtalet 2025-2027");
  });
  it("Tidigare avtal visas inte när det inte finns några — en tom grupp med en förklaring var bara text", async () => {
    await monter("flik=avtal");
    expect(text()).not.toContain("Tidigare avtal");
    expect(text()).not.toContain("Inga tidigare avtalsversioner");
  });
  it("finns det ett tidigare avtal visas det", async () => {
    g.__db.gs_avtal.push({ ...AVTAL, id: "a0", namn: "Skogsavtalet 2022-2025", giltigt_fran: "2022-04-01", giltigt_till: "2025-03-31" });
    await monter("flik=avtal");
    expect(text()).toContain("Tidigare avtal (1)");
    expect(text()).toContain("Skogsavtalet 2022-2025");
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────
// Hemskickad (Martin 2026-10-17): maskinen gick sönder / väder. Betald tid (dagen fylls upp till 8 tim som timlön), ingen frånvaro.
// Admin ser antalet hemskickade timmar per förare och månad (Löneunderlag) och "hemskickad 2:00 – betalas" på dagen (Dagar).
// ─────────────────────────────────────────────────────────────────────────────────────
describe("Hemskickad i Admin", () => {
  const hemMed = (extra: Record<string, any> = {}) => ({
    ...SALARY.medarbetare[0],
    hemskickad: [{ datum: "2026-09-07", fran_tid: "14:00", arbetad_min: 360, minuter: 120, timmar: 2 }, { datum: "2026-09-09", fran_tid: "13:00", arbetad_min: 307, minuter: 173, timmar: 2.88 }],
    hemskickad_h: 4.88, ...extra,
  });

  it("Löneunderlag: förarkortet säger antalet hemskickade timmar och dagarna — som betald tid, inte som något att kolla", async () => {
    g.__salary = { ...SALARY, medarbetare: [hemMed()] };
    await monter("flik=lon&underflik=underlag");
    const t = text();
    expect(t).toContain("Hemskickad 4,88 tim · 2 dagar (7 sep, 9 sep) – betalas som timlön");
    expect(t).not.toMatch(/Deldag|frånvaro/i);
    // Betald tid är ingen sak att kolla: raden gör inte svaret ("N saker att kolla") längre.
    const utan = await (async () => { g.__salary = SALARY; await act(async () => { root.unmount(); }); cont.remove(); await monter("flik=lon&underflik=underlag"); return cont.querySelector("[data-svar]")!.textContent; })();
    expect(utan).toContain("1 sak att kolla");
    g.__salary = { ...SALARY, medarbetare: [hemMed()] };
    await act(async () => { root.unmount(); }); cont.remove(); await monter("flik=lon&underflik=underlag");
    expect(cont.querySelector("[data-svar]")!.textContent).toBe(utan);
  });

  it("Löneunderlag: en förare utan hemskickad har ingen sådan rad", async () => {
    g.__salary = SALARY;
    await monter("flik=lon&underflik=underlag");
    expect(text()).not.toContain("Hemskickad");
  });

  it("Dagar: dagen säger 'hemskickad 2:00 – betalas' (8 tim minus de 6 arbetade), och en vanlig dag säger inget", async () => {
    const dag = (datum: string, arbetad_min: number) => ({
      id: `d-${datum}`, datum, start_tid: "06:00:00", slut_tid: "12:00:00", rast_min: 0, arbetad_min, extra_min: 0, objekt: ["Älmehult gallring 2026"], perioddag: false,
      maskin_id: "R64101", km_totalt: 0, ersattningsmil: 0, traktamente: false, bekraftad: true, ob_min: 0,
    });
    g.__salary = { ...SALARY, medarbetare: [{ ...hemMed(), dagar: [dag("2026-09-07", 360), dag("2026-09-08", 480)], deldagar: [] }] };
    await monter("flik=lon&underflik=dagar&period=2026-10");
    const t = text();
    expect(t).toContain("hemskickad 2:00 – betalas");
    expect(t).toContain("1 dag med avvikelse");
    expect(t).not.toContain("jobbade till 14:00, sedan hemskickad");
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// FÖRARENS GODKÄNNANDE styr exporten (Martin 2026-10-21): status på kortet, Skicka N, Påminn, kvittering, Skicka utan godkännande.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Förarens godkännande i Löneunderlag", () => {
  /** Alla lönearter kopplade: ingen "Koppla koden"-rad som räknas som en sak att kolla. */
  const ALLA_KOPPLADE = Object.fromEntries(["timlon", "premielon_skordare", "premielon_skotare", "overtid_skordare", "overtid_skotare", "valtlappar", "korersattning", "helglon_skordare", "helglon_skotare", "brandrisk_ob"].map(k => [k, { kod: "1", namn: "x" }]));
  const fo = (id: string, namn: string, o: Record<string, any> = {}) => ({ ...SALARY.medarbetare[0], medarbetare_id: id, namn, ...o });
  const TRE = () => ({ ...SALARY, kopplingar: ALLA_KOPPLADE, medarbetare: [
    fo("m1", "Anna Berg"),                                                      // godkänd
    fo("m5", "Bo Ek", { godkannande: "vantar", anstallningsnummer: "1005" }),    // väntar
    fo("m6", "Cia Dal", { status: "skickat", anstallningsnummer: "1006" }),      // skickad
  ] });
  const kort = (id: string) => cont.querySelector<HTMLElement>(`[data-forare="${id}"]`)!;
  const status = (id: string) => kort(id).querySelector<HTMLElement>("[data-forare-status]")!;
  const dialog = () => document.body.querySelector<HTMLElement>("[data-skicka-dialog]");
  const posta = () => g.__fetchAnrop.filter((a: any[]) => a[0].includes("/api/fortnox/salary-export") && JSON.parse(a[2] || "{}").dry_run !== true);
  const knappIDialog = (t: string) => Array.from(dialog()!.querySelectorAll("button")).find(b => b.textContent === t) as HTMLButtonElement | undefined;
  const klickaDialog = async (t: string) => { await act(async () => { knappIDialog(t)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await lugn(); };
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

  it("förarkortet säger Väntar på föraren / Godkänd av föraren / Skickad — i ord, och färgen följer ordet", async () => {
    g.__salary = TRE();
    await monter("flik=lon");
    expect(status("m1").textContent).toBe("Godkänd av föraren");
    expect(status("m5").textContent).toBe("Väntar på föraren");
    expect(status("m6").textContent).toBe("Skickad");
    expect(status("m5").style.color).toBe(rgb("#ff9f0a"));
    expect(status("m1").style.color).toBe(rgb("#30d158"));
  });

  it("saknat godkännande-fält (äldre svar) = väntar: kortet skriver aldrig 'Godkänd' på gissning", async () => {
    const m: any = fo("m1", "Anna Berg"); delete m.godkannande;
    g.__salary = { ...SALARY, medarbetare: [m] };
    await monter("flik=lon");
    expect(status("m1").textContent).toBe("Väntar på föraren");
    expect(blad("Ingen att skicka").length).toBe(1);
  });

  it("knappen säger 'Skicka N till Fortnox' där N bara är de godkända — den som väntar och den som redan skickats räknas inte", async () => {
    g.__salary = TRE();
    await monter("flik=lon");
    expect(blad("Skicka 1 till Fortnox").length).toBe(1);
    expect((blad("Skicka 1 till Fortnox")[0].closest("button") as HTMLButtonElement).disabled).toBe(false);
    expect(text()).toContain("1 väntar på föraren");
  });

  it("svaret först: 'Ingen har godkänt än' när ingen godkänt, och knappen är avstängd", async () => {
    g.__salary = { ...SALARY, kopplingar: ALLA_KOPPLADE, medarbetare: [fo("m1", "Anna Berg", { godkannande: "vantar" }), fo("m5", "Bo Ek", { godkannande: "vantar", anstallningsnummer: "1005" })] };
    await monter("flik=lon");
    expect(cont.querySelector("[data-svar]")!.textContent).toContain("Ingen har godkänt än");
    expect((blad("Ingen att skicka")[0].closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(text()).not.toContain("Klart att skicka");
  });

  it("svaret: '1 av 2 har godkänt' när några väntar och inget annat är att kolla", async () => {
    g.__salary = { ...SALARY, kopplingar: ALLA_KOPPLADE, medarbetare: [fo("m1", "Anna Berg"), fo("m5", "Bo Ek", { godkannande: "vantar", anstallningsnummer: "1005" })] };
    await monter("flik=lon");
    expect(cont.querySelector("[data-svar]")!.textContent).toContain("1 av 2 har godkänt");
  });

  it("alla godkänt och inget att kolla: 'Klart att skicka'", async () => {
    g.__salary = { ...SALARY, kopplingar: ALLA_KOPPLADE };
    await monter("flik=lon");
    expect(cont.querySelector("[data-svar]")!.textContent).toContain("Klart att skicka");
  });

  it("bekräftelsen: 'Skicka 1 till Fortnox?', de som väntar står kvar utan att skickas, och begäran bär ingen flagga", async () => {
    g.__salary = TRE();
    g.__salarySkicka = { ok: true, skickade: 2, fel: 0, felMeddelanden: [], utelamnade: [], vantar: [{ medarbetare_id: "m5", namn: "Bo Ek" }] };
    await monter("flik=lon");
    await klick("Skicka 1 till Fortnox");
    expect(dialog()!.textContent).toContain("Skicka 1 till Fortnox?");
    expect(dialog()!.textContent).toContain("1 förare");
    expect(dialog()!.textContent).toContain("1 väntar på föraren och skickas inte");
    expect(dialog()!.textContent).toContain("Väntar på föraren – skickas inte");
    expect(dialog()!.textContent).toContain("Redan skickat");
    await klickaDialog("Skicka 1 till Fortnox");
    expect(posta()).toHaveLength(1);
    expect(JSON.parse(posta()[0][2])).toEqual({ period: expect.any(String) });
    expect(text()).toContain("Väntar på föraren (skickades inte): Bo Ek.");
  });

  describe("Påminn", () => {
    it("finns bara på kortet för den som väntar — inte på godkänd eller skickad", async () => {
      g.__salary = TRE();
      await monter("flik=lon");
      expect(blad("Påminn").length).toBe(1);
      expect(kort("m5").textContent).toContain("Påminn");
      expect(kort("m1").textContent).not.toContain("Påminn");
      expect(kort("m6").textContent).not.toContain("Påminn");
    });
    it("åtgärdsknappen är blå accent (en handling), aldrig vit eller grå text — och kortet är ändå ett kort med › på sig själv", async () => {
      g.__salary = TRE();
      await monter("flik=lon");
      const knapp = blad("Påminn")[0].closest("button") as HTMLElement;
      expect(getComputedStyle(knapp).color).toBe(rgbAv(FARG.bla));
    });
    it("trycket skickar POST /api/lon/paminn med förare och ARBETSmånad, och kortet säger 'Påminnelse skickad' (kortet öppnas inte)", async () => {
      g.__salary = TRE();
      await monter("flik=lon&period=2026-10");
      await klick("Påminn");
      expect(g.__paminnAnrop).toEqual([{ medarbetare_id: "m5", arbetsmanad: "2026-09" }]);
      expect(kort("m5").textContent).toContain("Påminnelse skickad");
      expect(kort("m5").textContent).not.toContain("Påminn ");
      expect(window.location.search).not.toContain("forare=");
    });
    it("köad (pushen gick inte direkt) säger det, och en nyss skickad säger det", async () => {
      g.__salary = TRE();
      g.__paminn = () => ({ ok: true, koad: true, skickades: false });
      await monter("flik=lon");
      await klick("Påminn");
      expect(kort("m5").textContent).toContain("Påminnelse köad");
      g.__paminn = () => ({ ok: true, koad: false, skickades: false });
      await monter("flik=lon");
      await klick("Påminn");
      expect(kort("m5").textContent).toContain("Påminnelse skickades nyss");
    });
    it("serverns nej visas som ett fel på kortet och knappen finns kvar att försöka igen", async () => {
      g.__salary = TRE();
      g.__paminn = () => ({ ok: false, meddelande: "Föraren har redan godkänt månaden." });
      await monter("flik=lon");
      await klick("Påminn");
      expect(kort("m5").querySelector("[data-paminn-fel]")!.textContent).toBe("Föraren har redan godkänt månaden.");
      expect(blad("Påminn").length).toBe(1);
    });
  });

  it("godkännandet nollställt av en ändring syns på kortet: 'Ändrad efter godkännandet · 10 sep'", async () => {
    g.__salary = { ...SALARY, medarbetare: [fo("m1", "Anna Berg", { godkannande: "vantar", andrad_efter_godkannande: { at: "2026-10-05T08:00:00Z", datum: "2026-09-10" } })] };
    await monter("flik=lon");
    expect(kort("m1").querySelector("[data-andrad]")!.textContent).toBe("Ändrad efter godkännandet · 10 sep");
  });

  describe("ändrad efter att månaden skickats (kortet och förarens ark)", () => {
    const SKICKAD = { status: "skickat", godkannande: "godkand", andrad_efter_skickat: { at: "2026-10-12T09:30:00Z", dagar: ["2026-09-10"] } };
    it("kortet säger 'Ändrad efter att den skickats · 10 sep' — och status står kvar som Skickad", async () => {
      g.__salary = { ...SALARY, medarbetare: [fo("m1", "Anna Berg", SKICKAD)] };
      await monter("flik=lon");
      expect(kort("m1").querySelector("[data-forare-status]")!.getAttribute("data-forare-status")).toBe("skickad");
      expect(kort("m1").querySelector("[data-andrad-skickat]")!.textContent).toBe("Ändrad efter att den skickats · 10 sep");
      // …och det är inte den andra märkningen (godkännandet nollställdes inte, så det finns ingen Påminn att trycka)
      expect(kort("m1").querySelector("[data-andrad]")).toBeNull();
      expect(blad("Påminn").length).toBe(0);
    });
    it("flera dagar skrivs i ordning", async () => {
      g.__salary = { ...SALARY, medarbetare: [fo("m1", "Anna Berg", { ...SKICKAD, andrad_efter_skickat: { at: "2026-10-12T09:30:00Z", dagar: ["2026-09-10", "2026-09-12"] } })] };
      await monter("flik=lon");
      expect(kort("m1").querySelector("[data-andrad-skickat]")!.textContent).toBe("Ändrad efter att den skickats · 10 sep, 12 sep");
    });
    it("en skickad månad som inte ändrats har ingen märkning", async () => {
      g.__salary = { ...SALARY, medarbetare: [fo("m1", "Anna Berg", { status: "skickat", godkannande: "godkand" })] };
      await monter("flik=lon");
      expect(kort("m1").querySelector("[data-andrad-skickat]")).toBeNull();
    });
    it("förarens ark visar samma sak i raden 'Förarens godkännande'", async () => {
      g.__salary = { ...SALARY, medarbetare: [fo("m1", "Anna Berg", SKICKAD)] };
      await monter("flik=lon&forare=m1");
      const rad = document.body.querySelector<HTMLElement>("[data-forare-manad] [data-godkannande]")!;
      expect(rad.textContent).toContain("Skickad");
      expect(rad.textContent).toContain("Ändrad efter att den skickats · 10 sep");
    });
  });

  describe("Skicka utan förarens godkännande (förarens ark)", () => {
    const oppna = async (m: any) => { g.__salary = { ...SALARY, medarbetare: [m] }; await monter("flik=lon&forare=" + m.medarbetare_id); };
    const arket = () => document.body.querySelector<HTMLElement>("[data-forare-manad]");
    it("arket visar förarens godkännande, och för den som väntar finns valet", async () => {
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar" }));
      expect(arket()!.querySelector("[data-godkannande]")!.textContent).toContain("Väntar på föraren");
      expect(blad("Skicka utan förarens godkännande").length).toBe(1);
    });
    it("tryck ger en extra bekräftelse — och ingenting skickas förrän man bekräftat", async () => {
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar" }));
      await klick("Skicka utan förarens godkännande");
      expect(posta()).toHaveLength(0);
      const b = arket()!.querySelector("[data-skicka-utan-godkannande]")!;
      expect(b.textContent).toContain("Anna har inte godkänt september 2026");
      expect(b.textContent).toContain("det bokförs att du gick förbi godkännandet");
    });
    it("Avbryt skickar ingenting", async () => {
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar" }));
      await klick("Skicka utan förarens godkännande");
      await klick("Avbryt");
      expect(posta()).toHaveLength(0);
      expect(arket()!.querySelector("[data-skicka-utan-godkannande]")).toBeNull();
    });
    it("bekräftat: EN begäran med just den föraren och flaggan — bara det booleska true", async () => {
      g.__salarySkicka = { ok: true, skickade: 2, fel: 0, felMeddelanden: [], utelamnade: [], vantar: [] };
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar" }));
      await klick("Skicka utan förarens godkännande");
      await klick("Skicka utan godkännande");
      expect(posta()).toHaveLength(1);
      expect(JSON.parse(posta()[0][2])).toEqual({ period: expect.any(String), medarbetare_ids: ["m1"], skicka_utan_godkannande: true });
      expect(text()).toContain("2 lönerader skickade till Fortnox");
    });
    it("serverns nej (saknad löneartskod) visas i bekräftelsen, och arket stannar öppet", async () => {
      g.__salarySkicka = { ok: false, kod: "LONEART_SAKNAS", meddelande: "Löneartskod saknas för Helglön skördare. Inget är skickat." };
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar" }));
      await klick("Skicka utan förarens godkännande");
      await klick("Skicka utan godkännande");
      expect(arket()!.querySelector("[data-skicka-utan-godkannande]")!.textContent).toContain("Löneartskod saknas för Helglön skördare");
    });
    it("finns inte för en förare som godkänt, en som redan skickats, eller utan anställningsnummer", async () => {
      await oppna(fo("m1", "Anna Berg"));
      expect(blad("Skicka utan förarens godkännande").length).toBe(0);
      expect(arket()!.querySelector("[data-godkannande]")!.textContent).toContain("Godkänd av föraren");
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar", status: "skickat" }));
      expect(blad("Skicka utan förarens godkännande").length).toBe(0);
      await oppna(fo("m1", "Anna Berg", { godkannande: "vantar", anstallningsnummer: "" }));
      expect(blad("Skicka utan förarens godkännande").length).toBe(0);
    });
  });

  describe("Att kolla: kvittering ('Ser rätt ut')", () => {
    const med = (extra: Record<string, any> = {}) => ({ ...SALARY, kopplingar: ALLA_KOPPLADE, medarbetare: [fo("m1", "Anna Berg", { rast_langa: [{ datum: "2026-09-11", rast_min: 114, avbrott: [] }], ...extra })] });
    const kolla = (id = "rast-2026-09-11") => cont.querySelector<HTMLElement>(`[data-kolla="${id}"]`);
    const svar = () => cont.querySelector("[data-svar]")!.textContent!;

    it("en punkt med 'Ser rätt ut' bredvid knappen som leder till dagen", async () => {
      g.__salary = med();
      await monter("flik=lon");
      expect(kolla()!.textContent).toContain("11 sep: rast 114 min");
      expect(kolla()!.textContent).toContain("Se dagen");
      expect(kolla()!.textContent).toContain("Ser rätt ut");
      expect(svar()).toContain("1 sak att kolla");
    });
    it("'Ser rätt ut' är blå accent, samma som knappen som leder dit det åtgärdas", async () => {
      g.__salary = med();
      await monter("flik=lon");
      expect(getComputedStyle(blad("Ser rätt ut")[0].closest("button") as HTMLElement).color).toBe(rgbAv(FARG.bla));
      expect(getComputedStyle(blad("Se dagen")[0].closest("button") as HTMLElement).color).toBe(rgbAv(FARG.bla));
    });
    it("tryck på 'Ser rätt ut' sparar kvitteringen med radens text, och punkten räknas inte längre", async () => {
      g.__salary = med();
      await monter("flik=lon");
      await klick("Ser rätt ut");
      const skrivet = g.__skriv.filter((x: any) => x.tabell === "lon_kvittering");
      expect(skrivet).toHaveLength(1);
      expect(skrivet[0].vals).toMatchObject({ medarbetare_id: "m1", period: "2026-09", punkt: "rast-2026-09-11", text: "11 sep: rast 114 min", kvitterad_av: "m2" });
      expect(svar()).not.toMatch(/sak(er)? att kolla/);
      expect(kolla()!.hasAttribute("data-kvitterad")).toBe(true);
      expect(kolla()!.textContent).not.toContain("Ser rätt ut");
      expect(kolla()!.textContent).toContain("Ångra");
    });
    it("kvitterat visas nedtonat under 'Kollat' — grå text, inte orange — och 'Att kolla' försvinner när allt är kvitterat", async () => {
      g.__salary = med();
      await monter("flik=lon");
      await klick("Ser rätt ut");
      expect(text()).toContain("Kollat");
      expect(text()).not.toContain("Att kolla");
      const t = kolla()!.querySelector("span")!;
      expect(t.style.color).toBe("rgb(99, 99, 102)");
    });
    it("en sparad kvittering läses in vid öppning och gäller så länge texten är densamma", async () => {
      g.__salary = med();
      await monter("flik=lon", undefined);
      g.__db.lon_kvittering = [{ medarbetare_id: "m1", period: "2026-09", punkt: "rast-2026-09-11", text: "11 sep: rast 114 min" }];
      await monter("flik=lon");
      expect(kolla()!.hasAttribute("data-kvitterad")).toBe(true);
      expect(svar()).not.toMatch(/sak(er)? att kolla/);
    });
    it("ändrad text (rasten är nu 140 min): kvitteringen gäller inte längre och punkten kommer tillbaka", async () => {
      g.__salary = med({ rast_langa: [{ datum: "2026-09-11", rast_min: 140, avbrott: [] }] });
      await monter("flik=lon");
      g.__db.lon_kvittering = [{ medarbetare_id: "m1", period: "2026-09", punkt: "rast-2026-09-11", text: "11 sep: rast 114 min" }];
      await monter("flik=lon");
      expect(kolla()!.hasAttribute("data-kvitterad")).toBe(false);
      expect(svar()).toContain("1 sak att kolla");
    });
    it("Ångra tar bort kvitteringen och punkten räknas igen", async () => {
      g.__salary = med();
      await monter("flik=lon");
      await klick("Ser rätt ut");
      await klick("Ångra");
      expect(g.__skriv.some((x: any) => x.tabell === "lon_kvittering" && x.op === "delete")).toBe(true);
      expect(kolla()!.hasAttribute("data-kvitterad")).toBe(false);
      expect(svar()).toContain("1 sak att kolla");
    });
    it("det som har en riktig åtgärd (maskin utan typ, obekräftade dagar) går inte att kvittera", async () => {
      g.__salary = med({ rast_langa: [], maskin_utan_typ: ["R64428"], obekraftade: 2 });
      await monter("flik=lon");
      expect(kolla("typ-R64428")!.textContent).not.toContain("Ser rätt ut");
      expect(kolla("obekr")!.textContent).not.toContain("Ser rätt ut");
    });
    it("kan kvittensen inte läsas (tabellen finns inte än) finns inga kvittera-knappar — ingen kvittering som försvinner tyst", async () => {
      g.__salary = med();
      seedFel("lon_kvittering");
      await monter("flik=lon");
      expect(kolla()!.textContent).toContain("Se dagen");
      expect(kolla()!.textContent).not.toContain("Ser rätt ut");
    });
    it("ett skrivfel visas, och punkten räknas fortfarande", async () => {
      g.__salary = med();
      await monter("flik=lon");
      g.__avvisaKolumner = { lon_kvittering: ["punkt"] };
      await klick("Ser rätt ut");
      expect(text()).toContain("Kunde inte spara");
      expect(svar()).toContain("1 sak att kolla");
    });
  });
});
