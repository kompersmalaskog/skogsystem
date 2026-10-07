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
const AVTAL = { id: "a1", namn: "Skogsavtalet", giltigt_fran: "2025-04-01", giltigt_till: "2027-03-31", timlon_kr: 195, overtid_vardag_kr: 54.94, max_overtid_ar_h: 250, ob_kvall_kr: 38, ob_natt_kr: 52, ob_lordag_kr: 61, ob_sondag_kr: 74, km_ersattning_kr: 27.5, km_grans_per_dag: 60, fardtid_kr: 31, atk_procent: 2.5, atk_procent_nasta: 2.5, atk_period: "kalenderår", atk_ledig_tim: 40, atk_faktor: 1, traktamente_hel_kr: 300, traktamente_halv_kr: 150, skifttillagg_kr: 12, bortovaro_kr: 45, dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };

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
    lonesystem_artikelmappning: [{ id: "x1", lonesystem_id: null, intern_typ: "timlon", extern_kod: "11", beskrivning: "Timlön", skapad: "2026-04-17" }],
    medarbetare_lonesystem: [{ id: "l1", medarbetare_id: "m1", lonesystem_id: "ls1", anstallningsnummer: "1001", skapad: "2026-04-17" }],
    ...extra,
  };
  g.__skriv = []; g.__eq = []; g.__ingaRader = false; g.__avvisaKolumner = {};
  g.__leverans = { laddar: false, fel: null, data: [{ maskinId: "R64101", namn: "Rottne H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-10-06", dagarSedan: 1 }] };
  g.__fetchAnrop = []; g.__kontroller = null; g.__geokod = null; g.__geokodAnrop = [];
  g.fetch = vi.fn(async (url: string, init?: any) => {
    const u = String(url); g.__fetchAnrop.push([u, init?.method || "GET"]);
    if (u.includes("/api/medarbetare/geokoda")) {
      const b = JSON.parse(init?.body || "{}");
      g.__geokodAnrop.push(b);
      return { ok: true, status: 200, json: async () => (g.__geokod ? g.__geokod(b) : { ok: true }) } as any;
    }
    const body = u.includes("/api/lon/arsovertid") ? { ok: true, ar: 2026, tak: 250, tomDatum: "2026-09-30", modeller: [], medarbetare: [], utjamning: [] }
      : u.includes("/api/fortnox/salary-export") ? (g.__salary || SALARY)
      : u.includes("/api/fortnox/status") ? { connected: true, token_utgar: null, senast_synkad: null }
      : u.includes("/api/medarbetare/kontroller") ? (g.__kontroller || { ok: true, okandaOperatorer: [], forareUtanMaskin: [], saknarHempunkt: [] })
      : {};
    return { ok: true, status: 200, json: async () => body } as any;
  });
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
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 7, 12, 0)); seed(); });
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); delete g.__salary; });

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
  async function andraTimlon() {
    await monter("flik=avtal");
    const inp = Array.from(cont.querySelectorAll<HTMLInputElement>("input[type=number]"))[0];
    await skriv(inp, "199");
    await klick("Spara ändringar");
  }
  it("sparar → 'Sparat ✓' först när raden verkligen skrivits", async () => {
    await andraTimlon();
    expect(g.__db.gs_avtal[0].timlon_kr).toBe(199);
    expect(text()).toContain("Sparat ✓");
  });
  it("0 rader träffades (RLS) → inget 'Sparat ✓', felet står", async () => {
    g.__ingaRader = true;
    await andraTimlon();
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
/** Geokodningens svar i fake-databasen: adressnivå eller bara ort, och "acceptera". */
function geokodSvar(nivå: "adress" | "ort") {
  g.__geokod = (b: any) => {
    const m = g.__db.medarbetare.find((x: any) => x.id === b.id);
    if (nivå === "adress") Object.assign(m, { hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "geokod", hem_geokod_status: "ok", hem_geokod_etikett: "Björkvägen 4, Ryd", hem_geokod_precision: "address" });
    else if (b.acceptera) Object.assign(m, { hem_lat: 56.46, hem_lng: 14.69, hem_koord_kalla: "geokod", hem_geokod_status: "osaker", hem_geokod_precision: "locality" });
    else Object.assign(m, { hem_lat: null, hem_geokod_status: "osaker", hem_geokod_etikett: "Ryd (tätort)", hem_geokod_precision: "locality", hem_geokod_lat: 56.46, hem_geokod_lng: 14.69 });
    return { ok: true };
  };
}
const nyPerson = (extra: Record<string, any> = {}) => {
  const rad = { id: "n1", namn: "Nils Ek", epost: "nils@example.se", hemadress: null, roll: "forare", maskin_id: null, anstallningsdatum: null, timlon_kr: null, manadslon_kr: null, user_id: null, hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_geokod_status: null, hem_geokod_etikett: null, hem_geokod_precision: null, hem_geokod_lat: null, hem_geokod_lng: null, ...extra };
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

  it("steg 2: adressen geokodas direkt och visar att den hittades på adressnivå; Nästa först då punkten finns", async () => {
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
    expect(blad("Nästa")[0].closest("button")!.disabled).toBe(false);
    await klick("Nästa");
    expect(text()).toContain("Steg 3 av 4");
    expect(window.location.search).toContain("steg=3");
  });

  it("steg 2: bara gata/ort → står som osäker, Nästa är låst tills man godkänner förslaget", async () => {
    nyPerson({ hemadress: "Idekulla 6" });
    geokodSvar("ort");
    await monter("flik=medarbetare&ny=1&person=n1&steg=2");
    await klick("Hitta adressen");
    expect(text()).toContain("Adressen hittades bara ungefär: bara orten");
    expect(text()).toContain("Ryd (tätort)");
    expect(blad("Nästa")[0].closest("button")!.disabled).toBe(true);
    await klick("Använd förslaget ändå");
    expect(g.__geokodAnrop[1]).toEqual({ id: "n1", acceptera: true });
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
