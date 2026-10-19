// @vitest-environment jsdom
/**
 * RENDERINGSTESTER: maskinflytt som egen rad i förarens dag (beslut Martin 2026-10-19).
 * (Fake-databas och hjälpare delas med Arbetsrapport.kvall.render.test.tsx.)
 *
 * På kvällen ska föraren se EN sammanfattning av dagen och EN knapp, "Stämmer".
 * Allt annat ligger bakom "Något fel?" (samma tanke som Avsluta i Planera): bara det
 * som går att kontrollera visas, bara det som avviker sticker ut. Förr mötte hen tre
 * kort, sju tryckbara ytor och dubbletter (Extra arbete / Lägg till i efterhand /
 * Åker hem, Maskin-raden, fotnoten om Meal break, datumet två gånger).
 *
 * Fake: minnesdatabas med filter; skrivningar loggas i __skriv; fetch svarar per URL
 * (km-chain för Redigeras Flytt-rad).
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
    mode: "select" | "update" | "upsert" | "insert" | "delete" = "select";
    vals: any = null;
    constructor(public t: string) {}
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    delete() { this.mode = "delete"; return this; }
    upsert(v: any) { this.mode = "upsert"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    then(res: any, rej: any) {
      const g = globalThis as any;
      const db = g.__db as Record<string, any[]>;
      const tab = (db[this.t] = db[this.t] || []);
      let rader: any[];
      if (this.mode === "select") {
        rader = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
      } else if (this.mode === "delete") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        db[this.t] = tab.filter(r => !traff.includes(r));
        g.__skriv.push({ tabell: this.t, op: "delete", antal: traff.length });
        rader = traff.map(r => ({ ...r }));
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
  for (const m of ["select", "order", "limit", "or", "in", "not", "neq", "gt", "lt", "ilike", "range", "match", "contains", "filter", "textSearch"]) {
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
  g.__skriv = []; g.__kmKedja = null;
  try { localStorage.clear(); } catch { /* jsdom */ } // toasten hade en visning-per-dag-vakt i localStorage
  g.__kmDag = null; g.__kmDagAnrop = 0; g.__kmDagHall = false; g.__kmDagSlapp = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes("/api/km/berakna-dag")) {
      // dagens km beräknas av den DELADE helpern (samma som nattjobbet och Redigera)
      g.__kmDagAnrop++;
      if (g.__kmDagHall) await new Promise<void>(r => { g.__kmDagSlapp = r; });
      return { ok: true, status: 200, json: async () => g.__kmDag ?? {}, text: async () => "" };
    }
    const json = u.includes("/api/km-chain") && g.__kmKedja ? { ok: true, segments: g.__kmKedja, platser: [], objektKoord: {} } : {};
    return { ok: true, status: 200, json: async () => json, text: async () => "" };
  }));
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
async function klickKnapp(prefix: string) {
  const b = Array.from(behallare!.querySelectorAll<HTMLElement>("button")).find(x => (x.textContent || "").trim().startsWith(prefix));
  if (!b) throw new Error("hittar ingen knapp som börjar med: " + prefix);
  await act(async () => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(4, 40);
}
async function klickKnappMed(del: string) {
  const b = Array.from(behallare!.querySelectorAll<HTMLElement>("button")).find(x => (x.textContent || "").includes(del));
  if (!b) throw new Error("hittar ingen knapp som innehåller: " + del);
  await act(async () => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await vänta(4, 40);
}
const knappar = () => Array.from(behallare!.querySelectorAll<HTMLElement>("button")).map(b => (b.textContent || "").trim());
const skrivna = (tabell: string) => (g.__skriv as any[]).filter(s => s.tabell === tabell);

const dagRad = (o: any) => ({
  id: "ad-" + o.datum, medarbetare_id: "m-1", maskin_id: MASKIN, objekt_id: "OBJ1", rast_min: 30, km_morgon: 56, km_kvall: 56, km_totalt: 112,
  traktamente: false, bekraftad: true, bekraftad_tid: o.datum + "T15:30:00Z", brandrisk_beordrad: null, ...o,
});
const extra = (id: string, o: any) => ({ id, medarbetare_id: "m-1", datum: IDAG, kalla: "morgon", objekt_id: null, debiterbar: false, aktivitet_typ: "service", ...o });
function fixtur(idag: any, ovrigt: Record<string, any[]> = {}, forare: any = FORARE) {
  g.__db = {
    medarbetare: [forare],
    gs_avtal: [{ id: 1, giltigt_fran: "2026-01-01", giltigt_till: null, traktamente_hel_kr: 300, traktamente_halv_kr: 150, km_grans_per_dag: 60 }],
    dim_objekt: [{ objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 }],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    arbetsdag: [idag, dagRad({ datum: IGAR, start_tid: "06:50:00", slut_tid: "16:05:00" })],
    arbetsdag_objekt: [], extra_tid: [], vilobrott: [], arbetsdag_segment: [], arbetsdag_flytt_borta: [], ...ovrigt,
  };
}
const klartPass = (o: any = {}) => dagRad({ datum: IDAG, start_tid: "06:48:00", slut_tid: "16:12:00", bekraftad: false, bekraftad_tid: null, ...o });


// ── Flytt ──────────────────────────────────────────────────────────────────
const flyttSeg = (o: any = {}) => ({
  id: "seg-flytt", medarbetare_id: "m-1", datum: IDAG, start_tid: "12:30:00", slut_tid: "13:50:00",
  aktivitet_typ: "flytt", debiterbar: false, objekt_id: null, kalla: "flytt",
  kommentar: "Toftåsa gallring 2026 → Sandåsen gallring 2025 · 6,5 km", ...o,
});
/** Skriv i ett <input type="time"> så att Reacts onChange hör det. */
async function skrivTid(etikett: string, varde: string) {
  const lab = Array.from(behallare!.querySelectorAll<HTMLElement>("label")).find(l => (l.textContent || "").startsWith(etikett));
  const inp = lab?.querySelector("input") as HTMLInputElement | null;
  if (!inp) throw new Error("hittar inte tidsfältet: " + etikett);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inp, varde);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await vänta(2, 20);
}

describe("Flytt i Kvällsrapporten (dag klar, ej bekräftad)", () => {
  it("flyttraden syns som en egen rad: 'Flytt av maskin', längd, klockslag, trakter, km och 'räknas som arbetstid'", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    const t = text();
    expect(t).toMatch(/Flytt av maskin/);
    expect(t).toMatch(/1 tim 20 min/);
    expect(t).toMatch(/12:30–13:50/);
    expect(t).toMatch(/Toftåsa gallring 2026 → Sandåsen gallring 2025 · 6,5 km/);
    expect(t).toMatch(/räknas som arbetstid/);
    // dagens summa är oförändrad: flytten ligger INOM passet, ingen ny tid läggs till
    expect(t).toMatch(/8 tim 54 min/);
    expect(t).not.toMatch(/\+ 1 tim 20 min/);
  });
  it("ingen orange 'faktureras inte', inget 'via maskinavvikelse' och inget objekt-brus på en automatisk flytt", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    expect(text()).not.toMatch(/faktureras inte/);
    expect(text()).not.toMatch(/inget objekt/);
    expect(text()).not.toMatch(/via maskinavvikelse/);
  });
  it("ingen flytt, ingen rad", async () => {
    fixtur(klartPass());
    await montera();
    expect(text()).not.toMatch(/Flytt av maskin/);
  });
  it("en vanlig segmentrad (föraren märkt brandvakt) ritas inte som flytt här", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg({ id: "s2", aktivitet_typ: "brandkontroll", kalla: "forare", kommentar: null })] });
    await montera();
    expect(text()).not.toMatch(/Flytt av maskin/);
  });
  it("Stämmer fungerar som förut med flyttraden på plats och skriver inget om flytten", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    await klick("Stämmer");
    expect(skrivna("arbetsdag").filter(s => s.op === "upsert").length).toBe(1);
    expect(skrivna("arbetsdag_segment").length).toBe(0);
    expect(skrivna("arbetsdag_flytt_borta").length).toBe(0);
  });
});

describe("Flytt: föraren kan ändra och ta bort den som vilken rad som helst", () => {
  it("tryck på raden öppnar den i periodformuläret med Ta bort", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    await klick("Flytt av maskin");
    expect(text()).toMatch(/Period inom passet/);
    expect(knappar().some(k => k.includes("Ta bort"))).toBe(true);
  });
  it("Ta bort: raden försvinner ur databasen OCH en gravsten skrivs så synken inte skapar den igen", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    await klick("Flytt av maskin");
    await klickKnappMed("Ta bort"); await klickKnapp("Ja, ta bort");
    const gravar = skrivna("arbetsdag_flytt_borta").filter(s => s.op === "insert");
    expect(gravar).toHaveLength(1);
    expect(gravar[0].vals).toMatchObject({ medarbetare_id: "m-1", datum: IDAG, start_tid: "12:30:00", slut_tid: "13:50:00" });
    expect(skrivna("arbetsdag_segment").filter(s => s.op === "delete")).toHaveLength(1);
    // gravstenen skrivs FÖRE borttagningen: faller borttagningen finns raden kvar (ingen gravsten utan att något tagits bort är ofarligt, men raden utan gravsten vore ett fel)
    const ordning = (g.__skriv as any[]).map(s => s.tabell + ":" + s.op);
    expect(ordning.indexOf("arbetsdag_flytt_borta:insert")).toBeLessThan(ordning.indexOf("arbetsdag_segment:delete"));
    expect(text()).not.toMatch(/Flytt av maskin/);
  });
  it("en rad föraren själv lagt in (kalla 'forare') tas bort utan gravsten", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg({ id: "s-egen", kalla: "forare", kommentar: null })] });
    await montera();
    // en egen rad syns inte som flytt i Dag — den finns i Redigera, som alla andra perioder
    expect(text()).not.toMatch(/Flytt av maskin/);
    await klick("Något fel?"); await klick("Hela dagen");
    await klick("Flytt av maskin");
    await klickKnappMed("Ta bort"); await klickKnapp("Ja, ta bort");
    expect(skrivna("arbetsdag_flytt_borta")).toHaveLength(0);
    expect(skrivna("arbetsdag_segment").filter(s => s.op === "delete")).toHaveLength(1);
  });
  it("Ändra tiden: raden uppdateras, förblir flytt, och den ursprungliga tiden får en gravsten (synken återskapar den inte)", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    await klick("Flytt av maskin");
    await skrivTid("Från", "12:40"); await skrivTid("Till", "13:30");
    await klickKnapp("Spara");
    const upd = skrivna("arbetsdag_segment").filter(s => s.op === "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].vals).toMatchObject({ start_tid: "12:40", slut_tid: "13:30" });
    expect(upd[0].vals.kalla).toBeUndefined(); // raden är fortfarande en flytt — kalla rörs inte
    const gravar = skrivna("arbetsdag_flytt_borta").filter(s => s.op === "insert");
    expect(gravar).toHaveLength(1);
    expect(gravar[0].vals).toMatchObject({ datum: IDAG, start_tid: "12:30:00", slut_tid: "13:50:00" });
  });
  it("Spara utan att ändra tiden skriver ingen gravsten", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    await klick("Flytt av maskin");
    await klickKnapp("Spara");
    expect(skrivna("arbetsdag_flytt_borta")).toHaveLength(0);
  });
});

describe("Flytt: bekräftad dag och äldre dag", () => {
  it("en bekräftad dag visar sin flyttrad också (den skapades innan bekräftelsen och står kvar)", async () => {
    fixtur(klartPass({ bekraftad: true, bekraftad_tid: "2026-10-05T17:00:00Z" }), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    expect(text()).toMatch(/Flytt av maskin/);
    expect(text()).toMatch(/räknas som arbetstid/);
  });
  it("Redigera-vyn listar flytten med samma ord, utan fakturering och utan 'maskinavvikelse'", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [flyttSeg()] });
    await montera();
    await klick("Något fel?"); await klick("Hela dagen");
    await vänta(6, 40);
    const t = text();
    expect(t).toMatch(/Tillbaka/);
    expect(t).toMatch(/Flytt av maskin/);
    expect(t).toMatch(/12:30–13:50/);
    expect(t).toMatch(/räknas som arbetstid/);
    expect(t).not.toMatch(/faktureras inte/);
    expect(t).not.toMatch(/via maskinavvikelse/);
  });
});
