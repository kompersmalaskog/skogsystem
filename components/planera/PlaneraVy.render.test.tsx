// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL för Planera: monterar hela vyn mot en databas-fake i minnet
 * och kör flödet som en förare — välj trakt → tid → spara — samt "Samma som i
 * går". Kontrollerar både att sidan inte kraschar (hook-ordning, React #310) och
 * att RADEN som skrivs är rätt (tabell, trakt, tider, aktivitet, fakturering).
 *
 * Fake: supabase-kedjan select/insert/update/delete/upsert + eq/gte/lte/in/order/
 * maybeSingle/single mot vanliga arrayer. Ingen nätverkstrafik, ingen inloggning.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lokalISO, plusDagar } from "@/lib/planera/logik";

const IDAG = lokalISO(new Date());
const IGAR = plusDagar(IDAG, -1);
const FORARE = { id: "m-1", namn: "Joacim Test", user_id: "u-1" };

let db: Record<string, any[]> = {};
let skrivna: { tabell: string; op: string; rad: any }[] = [];
let radNr = 0;

vi.mock("@/lib/supabase", () => {
  class Fraga {
    private filter: [string, string, any][] = [];
    private sorter: [string, boolean][] = [];
    private payload: any = null;
    private valj = false;
    private enkel = false;
    private opt: any = {};
    constructor(private tabell: string, private op: "select" | "insert" | "update" | "delete" | "upsert" = "select") {}
    select() { this.valj = true; return this; }
    insert(p: any) { this.op = "insert"; this.payload = p; return this; }
    update(p: any) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    upsert(p: any, o: any) { this.op = "upsert"; this.payload = p; this.opt = o || {}; return this; }
    eq(k: string, v: any) { this.filter.push([k, "eq", v]); return this; }
    gte(k: string, v: any) { this.filter.push([k, "gte", v]); return this; }
    lte(k: string, v: any) { this.filter.push([k, "lte", v]); return this; }
    in(k: string, v: any[]) { this.filter.push([k, "in", v]); return this; }
    not() { return this; }
    is() { return this; }
    limit() { return this; }
    order(k: string, o?: { ascending?: boolean }) { this.sorter.push([k, o?.ascending !== false]); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    private traffar(r: any) {
      return this.filter.every(([k, op, v]) => op === "eq" ? r[k] === v : op === "gte" ? r[k] >= v : op === "lte" ? r[k] <= v : v.includes(r[k]));
    }
    private kor() {
      const tab = (db[this.tabell] = db[this.tabell] || []);
      let data: any = null;
      if (this.op === "select") {
        let rader = tab.filter(r => this.traffar(r));
        for (const [k, asc] of [...this.sorter].reverse()) rader = [...rader].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1));
        data = this.enkel ? rader[0] ?? null : rader;
      } else if (this.op === "insert") {
        const rad = { id: `ny-${++radNr}`, ...this.payload };
        tab.push(rad); skrivna.push({ tabell: this.tabell, op: "insert", rad });
        data = this.valj ? (this.enkel ? rad : [rad]) : null;
      } else if (this.op === "update") {
        const traffade = tab.filter(r => this.traffar(r));
        traffade.forEach(r => Object.assign(r, this.payload)); skrivna.push({ tabell: this.tabell, op: "update", rad: { ...this.payload } });
        data = this.enkel ? traffade[0] ?? null : traffade;
      } else if (this.op === "delete") {
        const borta = tab.filter(r => this.traffar(r));
        db[this.tabell] = tab.filter(r => !this.traffar(r)); skrivna.push({ tabell: this.tabell, op: "delete", rad: borta });
        data = this.valj ? borta : null;
      } else if (this.op === "upsert") {
        const cols = String(this.opt.onConflict || "id").split(",");
        const finns = tab.some(r => cols.every(c => r[c] === this.payload[c]));
        if (!finns) { const rad = { id: `ny-${++radNr}`, ...this.payload }; tab.push(rad); skrivna.push({ tabell: this.tabell, op: "upsert", rad }); }
        data = null;
      }
      return { data, error: null, count: Array.isArray(data) ? data.length : 0 };
    }
    then(res: any, rej: any) { return Promise.resolve(this.kor()).then(res, rej); }
  }
  return {
    supabase: {
      from: (t: string) => new Fraga(t),
      auth: {
        getUser: async () => ({ data: { user: { id: "u-1", email: "t@example.com" } } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsolFel: string[] = [];

function nyDb(): Record<string, any[]> {
  return {
    medarbetare: [FORARE],
    dim_objekt: [
      { objekt_id: "T1", object_name: "Trestensdal gallring", vo_nummer: "11124748", skogsagare: "Cia" },
      { objekt_id: "T2", object_name: "Betet gallring 2026", vo_nummer: "11218909", skogsagare: "Bo" },
    ],
    objekt: [{ vo_nummer: "11124748", status: "planerad" }],
    extra_tid: [
      // Gårdagens planering på Trestensdal → "Senaste trakter" + "Samma som i går"
      { id: "p-1", medarbetare_id: "m-1", datum: IGAR, start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, arbetsdag_id: "a-1" },
    ],
    arbetsdag: [], arbetsdag_segment: [],
  };
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  db = nyDb(); skrivna = []; radNr = 0; konsolFel = [];
  vi.spyOn(console, "error").mockImplementation((...a: any[]) => { konsolFel.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.restoreAllMocks();
});

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
async function montera() {
  const { default: PlaneraVy } = await import("./PlaneraVy");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<PlaneraVy />); });
  await flush();
}
const text = () => behallare!.textContent || "";
const knapp = (del: string) => Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes(del)) as HTMLButtonElement | undefined;
async function klicka(del: string) {
  const k = knapp(del); if (!k) throw new Error(`Hittar ingen knapp med "${del}". Sidan visar: ${text().slice(0, 300)}`);
  await act(async () => { k.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
}
async function sattTid(etikett: "Från" | "Till", varde: string) {
  const lab = Array.from(behallare!.querySelectorAll("label")).find(l => (l.textContent || "").startsWith(etikett))!;
  const inp = lab.querySelector("input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inp, varde);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const hookFel = () => konsolFel.filter(m => /Rendered (more|fewer) hooks|order of Hooks|#310/i.test(m));

describe("Planera: skärm 1", () => {
  it("renderas utan krasch, visar senaste trakt, förslag och veckan", async () => {
    await montera();
    expect(hookFel()).toEqual([]);
    expect(text()).toMatch(/Planera/);
    expect(text()).toMatch(/Senaste trakter/);
    expect(text()).toMatch(/Trestensdal gallring/);
    expect(text()).toMatch(/i går 3 tim/);
    expect(text()).toMatch(/Samma som i går/);
    expect(text()).toMatch(/Den här veckan/);
    expect(text()).not.toMatch(/Hämtar dina trakter/);
  });

  it("sök hittar en trakt som saknar dim-rad och är planerad", async () => {
    db.objekt.push({ vo_nummer: "11105602", status: "planerad", namn: "Toftåsa gallring 2026", markagare: "Dan" });
    await montera();
    const inp = behallare!.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inp, "toftå");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(text()).toMatch(/Toftåsa gallring/);
  });
});

describe("Planera: trakt → tid → spara", () => {
  it("Senaste trakten → Välj tid låst → tider → Spara 3 tim → raden skrivs", async () => {
    await montera();
    // Senaste trakter-raden innehåller "i går 3 tim"; Förslagsraden heter "Samma som i går" — välj trakt-raden.
    const traktKnapp = Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes("Trestensdal gallring") && (b.textContent || "").includes("i går 3 tim"))!;
    await act(async () => { traktKnapp.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    expect(hookFel()).toEqual([]);
    expect(text()).toMatch(/Trestensdal gallring/);
    expect(text()).toMatch(/Idag/);
    expect(text()).toMatch(/Aktivitet/);
    // Utan sluttid: knappen är låst och säger vad som saknas
    expect(knapp("Välj tid")).toBeDefined();
    await klicka("Välj tid");
    expect(skrivna).toEqual([]);
    // Från förifylld 07:00 (inga perioder idag), sätt Till
    await sattTid("Till", "10:00");
    expect(knapp("Spara 3 tim")).toBeDefined();
    await klicka("Spara 3 tim");
    const insatt = skrivna.find(s => s.tabell === "extra_tid" && s.op === "insert")!;
    expect(insatt, `skrivet: ${JSON.stringify(skrivna)}`).toBeDefined();
    expect(insatt.rad).toMatchObject({
      medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180,
      aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, kalla: "under_dagen",
    });
    expect(skrivna.some(s => s.tabell === "arbetsdag" && s.op === "upsert")).toBe(true); // första perioden skapar dagen
    // Tillbaka på skärm 1 med kvitto byggt på databasens rad
    expect(text()).toMatch(/Sparat: Trestensdal gallring · idag 07:00–10:00 · 3 tim/);
    expect(hookFel()).toEqual([]);
  });

  it("restid blir icke-fakturerad, Manuellt fakturerad — följer aktivitetens default", async () => {
    await montera();
    const traktKnapp = Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes("i går 3 tim") && !(b.textContent || "").includes("Samma"))!;
    await act(async () => { traktKnapp.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    await sattTid("Till", "08:00");
    await klicka("Restid");
    expect(text()).toMatch(/Restid · faktureras inte/);
    await klicka("Manuellt");
    expect(text()).toMatch(/Manuellt arbete · faktureras/);
    await klicka("Spara 1 tim");
    const insatt = skrivna.find(s => s.tabell === "extra_tid" && s.op === "insert")!;
    expect(insatt.rad).toMatchObject({ aktivitet_typ: "manuellt", debiterbar: true, objekt_id: "T1" });
  });
});

describe("Planera: Samma som i går", () => {
  it("ett tryck kopierar gårdagens trakt och tider till idag", async () => {
    await montera();
    expect(skrivna).toEqual([]); // inget sparas förrän föraren trycker
    await klicka("Samma som i går");
    const insatt = skrivna.filter(s => s.tabell === "extra_tid" && s.op === "insert");
    expect(insatt).toHaveLength(1);
    expect(insatt[0].rad).toMatchObject({ datum: IDAG, start_tid: "07:00:00", slut_tid: "10:00:00", objekt_id: "T1", aktivitet_typ: "planering", debiterbar: true });
    expect(text()).toMatch(/Sparat: Trestensdal gallring · idag 07:00–10:00 · 3 tim/);
    // Förslaget försvinner — idag har nu planering
    expect(Array.from(behallare!.querySelectorAll("button")).some(b => (b.textContent || "").startsWith("Samma som i går"))).toBe(false);
  });
});

describe("Planera: maskinpasset", () => {
  it("en period INOM dagens maskinpass sparas inte — den är redan arbetstid", async () => {
    db.arbetsdag.push({ id: "a-9", medarbetare_id: "m-1", datum: IDAG, start_tid: "06:00:00", slut_tid: "16:00:00", maskin_id: "PONS" });
    await montera();
    const traktKnapp = Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes("i går 3 tim") && !(b.textContent || "").includes("Samma"))!;
    await act(async () => { traktKnapp.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    await sattTid("Från", "09:00");
    await sattTid("Till", "11:00");
    await klicka("Spara 2 tim");
    expect(skrivna.filter(s => s.tabell === "extra_tid")).toEqual([]);
    expect(text()).toMatch(/inom maskinpasset \(06:00–16:00\)/);
  });
});
