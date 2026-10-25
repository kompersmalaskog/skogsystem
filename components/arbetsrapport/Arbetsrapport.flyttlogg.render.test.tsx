// @vitest-environment jsdom
/**
 * RENDERINGSTESTER: lastbilsflytt (flyttloggen) som egen rad i förarens dag, med svep för att ta bort (beslut Martin 2026-10-19).
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
      if ((this.mode === "insert" || this.mode === "upsert") && g.__insertFel?.[this.t]) {
        g.__skriv.push({ tabell: this.t, op: "insert-FEL", vals: this.vals });
        return Promise.resolve({ data: null, error: g.__insertFel[this.t], count: 0 }).then(res, rej);
      }
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
  g.__skriv = []; g.__insertFel = {}; g.__kmKedja = null;
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

// ── Flyttlogg ──────────────────────────────────────────────────────────────
const logSeg = (o: any = {}) => ({
  id: "seg-logg", medarbetare_id: "m-1", datum: IDAG, start_tid: "12:30:00", slut_tid: "13:50:00",
  aktivitet_typ: "flytt", debiterbar: false, objekt_id: null, kalla: "flyttlogg", flytt_id: "mf-1",
  kommentar: "Toftåsa gallring → Sandåsen gallring · 53 km", ...o,
});
const gpsSeg = (o: any = {}) => logSeg({ id: "seg-gps", kalla: "flytt", flytt_id: null, start_tid: "10:00:00", slut_tid: "10:45:00", kommentar: "Älmehult → Trestensdal · 6,5 km", ...o });

/** Svep på en rad: pekaren ned, ett drag i sidled, pekaren upp. Negativ dx = åt vänster. */
async function svep(rad: HTMLElement, dx: number, dy = 0) {
  const p = (typ: string, x: number, y: number) => new MouseEvent(typ, { bubbles: true, clientX: x, clientY: y });
  await act(async () => { rad.dispatchEvent(p("pointerdown", 300, 400)); });
  await act(async () => { rad.dispatchEvent(p("pointermove", 300 + dx / 2, 400 + dy / 2)); rad.dispatchEvent(p("pointermove", 300 + dx, 400 + dy)); });
  await act(async () => { rad.dispatchEvent(p("pointerup", 300 + dx, 400 + dy)); });
  await vänta(2, 20);
}
const svepRad = (): HTMLElement => {
  const r = behallare!.querySelector<HTMLElement>('[data-svep="rad"]');
  if (!r) throw new Error("ingen svepbar rad");
  return r;
};
const tabort = () => Array.from(behallare!.querySelectorAll<HTMLElement>("button")).find(b => (b.textContent || "").trim() === "Ta bort") || null;

describe("Flyttlogg i Kvällsrapporten", () => {
  it("raden syns: 'Flytt av maskin', längd, klockslag, trakter, km, märkt 'Från flyttloggen' och räknas som arbetstid", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    const t = text();
    expect(t).toMatch(/Flytt av maskin/);
    expect(t).toMatch(/1 tim 20 min/);
    expect(t).toMatch(/12:30–13:50/);
    expect(t).toMatch(/Toftåsa gallring → Sandåsen gallring · 53 km/);
    expect(t).toMatch(/Från flyttloggen/);
    expect(t).toMatch(/räknas som arbetstid/);
    expect(t).toMatch(/8 tim 54 min/); // dagens summa oförändrad: raden ligger inom passet
    expect(t).not.toMatch(/faktureras inte/);
  });
  it("GPS-raden är inte märkt 'Från flyttloggen'", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [gpsSeg()] });
    await montera();
    expect(text()).toMatch(/Flytt av maskin/);
    expect(text()).not.toMatch(/Från flyttloggen/);
  });
  it("båda finns samma dag (olika flyttar): två rader, bara den ena märkt", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [gpsSeg(), logSeg()] });
    await montera();
    expect((text().match(/Flytt av maskin/g) || []).length).toBe(2);
    expect((text().match(/Från flyttloggen/g) || []).length).toBe(1);
  });
  it("tryck på raden öppnar den i periodformuläret", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await klick("Flytt av maskin");
    expect(text()).toMatch(/Period inom passet/);
  });
});

describe("Svep för att ta bort en flyttloggsrad (föraren var inte med)", () => {
  it("före svepet finns ingen Ta bort", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    expect(tabort()).toBeNull();
  });
  it("svep åt vänster visar Ta bort, och ingenting skrivs av själva svepet", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), -120);
    expect(tabort()).not.toBeNull();
    expect(skrivna("arbetsdag_segment")).toHaveLength(0);
    expect(skrivna("arbetsdag_flytt_borta")).toHaveLength(0);
    expect(text()).toMatch(/Flytt av maskin/);
  });
  it("ett för litet svep (20 px) visar ingen Ta bort, och raden är kvar", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), -20);
    expect(tabort()).toBeNull();
  });
  it("ett svep uppåt/nedåt (scroll) är inget svep", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), -120, 300);
    expect(tabort()).toBeNull();
  });
  it("ett svep åt höger gör ingenting", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), 150);
    expect(tabort()).toBeNull();
  });
  it("webbläsaren skickar ett click efter ett drag: det är inget tryck och öppnar inte formuläret", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), -120);
    await act(async () => { svepRad().dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await vänta(3, 30);
    expect(text()).not.toMatch(/Period inom passet/);
    expect(tabort()).not.toBeNull(); // raden står kvar öppen
  });
  it("ett tryck på en öppnad rad stänger den (öppnar inte formuläret)", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), -120);
    await act(async () => { svepRad().dispatchEvent(new MouseEvent("click", { bubbles: true })); }); // webbläsarens click efter draget
    await act(async () => { svepRad().dispatchEvent(new MouseEvent("click", { bubbles: true })); }); // själva trycket
    await vänta(3, 30);
    expect(tabort()).toBeNull();
    expect(text()).not.toMatch(/Period inom passet/);
  });
  it("Ta bort: gravsten med flyttens id skrivs FÖRE borttagningen, raden försvinner, summan är oförändrad", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await svep(svepRad(), -120);
    await act(async () => { tabort()!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await vänta(4, 40);
    const gravar = skrivna("arbetsdag_flytt_borta").filter(s => s.op === "insert");
    expect(gravar).toHaveLength(1);
    expect(gravar[0].vals).toMatchObject({ medarbetare_id: "m-1", datum: IDAG, start_tid: "12:30:00", slut_tid: "13:50:00", flytt_id: "mf-1" });
    expect(skrivna("arbetsdag_segment").filter(s => s.op === "delete")).toHaveLength(1);
    const ordning = (g.__skriv as any[]).map(s => s.tabell + ":" + s.op);
    expect(ordning.indexOf("arbetsdag_flytt_borta:insert")).toBeLessThan(ordning.indexOf("arbetsdag_segment:delete"));
    expect(text()).not.toMatch(/Flytt av maskin/);
    expect(text()).toMatch(/8 tim 54 min/);
  });
  it("kan gravstenen inte skrivas tas raden INTE bort (annars kommer den tillbaka) och föraren får veta", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    g.__insertFel = { arbetsdag_flytt_borta: { code: "42501", message: "rls" } };
    await montera();
    await svep(svepRad(), -120);
    await act(async () => { tabort()!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await vänta(4, 40);
    expect(skrivna("arbetsdag_segment").filter(s => s.op === "delete")).toHaveLength(0);
    expect(text()).toMatch(/Kunde inte ta bort/);
    expect(text()).toMatch(/Flytt av maskin/);
  });
  it("GPS-raden går inte att svepa bort (beslutet gäller flyttloggen): den öppnas bara med tryck", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [gpsSeg()] });
    await montera();
    expect(behallare!.querySelector('[data-svep="rad"]')).toBeNull();
  });
  it("svep på en rad av flera tar bara bort den raden", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [gpsSeg(), logSeg()] });
    await montera();
    await svep(svepRad(), -120);
    await act(async () => { tabort()!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await vänta(4, 40);
    expect(skrivna("arbetsdag_segment").filter(s => s.op === "delete")).toHaveLength(1);
    expect((text().match(/Flytt av maskin/g) || []).length).toBe(1);
    expect(text()).not.toMatch(/Från flyttloggen/);
  });
});

describe("Ändra och ta bort via formuläret, och Redigera", () => {
  it("Ta bort i formuläret: gravsten med flyttens id, sedan borttagning", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await klick("Flytt av maskin");
    await klickKnappMed("Ta bort"); await klickKnapp("Ja, ta bort");
    const gravar = skrivna("arbetsdag_flytt_borta").filter(s => s.op === "insert");
    expect(gravar).toHaveLength(1);
    expect(gravar[0].vals.flytt_id).toBe("mf-1");
    expect(skrivna("arbetsdag_segment").filter(s => s.op === "delete")).toHaveLength(1);
  });
  it("Ändra tiden: raden uppdateras och förblir flyttlogg — INGEN gravsten (flyttens id håller redan synken borta)", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await klick("Flytt av maskin");
    await skrivTid("Från", "12:40"); await skrivTid("Till", "13:30");
    await klickKnapp("Spara");
    const upd = skrivna("arbetsdag_segment").filter(s => s.op === "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].vals).toMatchObject({ start_tid: "12:40", slut_tid: "13:30" });
    expect(upd[0].vals.kalla).toBeUndefined();
    expect(skrivna("arbetsdag_flytt_borta")).toHaveLength(0);
    expect(text()).toMatch(/12:40–13:30/);
    expect(text()).toMatch(/Från flyttloggen/);
  });
  it("Redigera listar flyttloggsraden med 'Från flyttloggen', utan fakturering och utan 'maskinavvikelse'", async () => {
    fixtur(klartPass(), { arbetsdag_segment: [logSeg()] });
    await montera();
    await klick("Något fel?"); await klick("Hela dagen");
    await vänta(6, 40);
    const t = text();
    expect(t).toMatch(/Flytt av maskin/);
    expect(t).toMatch(/Från flyttloggen/);
    expect(t).toMatch(/12:30–13:50/);
    expect(t).not.toMatch(/faktureras inte/);
    expect(t).not.toMatch(/via maskinavvikelse/);
  });
  it("en bekräftad dag visar sin flyttloggsrad också", async () => {
    fixtur(klartPass({ bekraftad: true, bekraftad_tid: "2026-10-05T17:00:00Z" }), { arbetsdag_segment: [logSeg()] });
    await montera();
    expect(text()).toMatch(/Flytt av maskin/);
    expect(text()).toMatch(/Från flyttloggen/);
  });
});
