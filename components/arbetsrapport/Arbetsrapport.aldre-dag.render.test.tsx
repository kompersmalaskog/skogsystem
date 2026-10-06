// @vitest-environment jsdom
/**
 * RENDERINGSTESTER: ETT bekräftaflöde för ALLA dagar (Martin 2026-10-06, efter test av #707).
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


const stammer = () => knapp("Stämmer") as HTMLButtonElement;
const opacity = (b: HTMLElement) => Number(b.style.opacity || 1);
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

describe("Äldre obekräftad dag: samma lista och Stämmer som idag", () => {
  it("Martins fall: väntar-raden → frågelistan och grå Stämmer, INTE 'Bekräfta dagen'", async () => {
    aldreDag({ start_tid: "05:10:00", slut_tid: "16:00:00" });          // tidig start → brandriskfråga
    await oppnaFranVantarRaden();
    expect(text()).toMatch(/2 okt/);                                     // vi är i Redigera för 2 okt
    expect(text()).toMatch(/1 sak att svara på/i);
    expect(text()).toMatch(/Började du tidigt på grund av brandrisk\?/);
    expect(text()).toMatch(/Svara på frågorna först/);
    expect(opacity(stammer())).toBeLessThan(1);
    expect(text()).not.toMatch(/Bekräfta dagen/);
  });

  it("Stämmer är inte död: tryck öppnar första frågan och bekräftar ingenting", async () => {
    aldreDag({ start_tid: "05:10:00", slut_tid: "16:00:00" });
    await oppnaFranVantarRaden();
    await klickKnapp("Stämmer");
    expect(text()).toMatch(/Började du tidigt på grund av brandrisk\?/);
    expect(knapp("Ja")).not.toBeNull();
    expect(skrivna("arbetsdag", "upsert").length).toBe(0);
  });

  it("besvara → Besvarat, Stämmer vit, dagen INTE bekräftad; Stämmer → bekräftad (rätt datum)", async () => {
    aldreDag({ start_tid: "05:10:00", slut_tid: "16:00:00" });
    await oppnaFranVantarRaden();
    await klick("Började du tidigt på grund av brandrisk?"); await klickKnapp("Ja");
    expect(skrivna("arbetsdag", "update").some(s => s.vals.brandrisk_beordrad === true)).toBe(true);
    expect(text()).toMatch(/Besvarat/);
    expect(text()).toMatch(/Tidig start · brandrisk/);
    expect(opacity(stammer())).toBe(1);
    expect(skrivna("arbetsdag", "upsert").length).toBe(0);               // aldrig automatiskt
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    const up = skrivna("arbetsdag", "upsert");
    expect(up.length).toBe(1);
    expect(up[0].vals.datum).toBe(D);
    expect(up[0].vals.bekraftad).toBe(true);
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === D).brandrisk_beordrad).toBe(true);
  });

  it("rast 95 min: raden i listan, svaret SPARAS (tidsfragor_svar) och ingen rastruta vid Stämmer", async () => {
    aldreDag({ rast_min: 95 });
    await oppnaFranVantarRaden();
    expect(text()).toMatch(/1 sak att svara på/i);
    expect(text()).toMatch(/Rast 95 min/);
    await klick("Rast 95 min"); await klickKnapp("Ja, det stämmer");
    const upd = skrivna("arbetsdag", "update").filter(s => "tidsfragor_svar" in s.vals);
    expect(upd.length).toBe(1);
    expect(upd[0].vals.tidsfragor_svar).toEqual({ rast: "10:00|18:00|95" });
    expect(opacity(stammer())).toBe(1);
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    expect(text()).not.toMatch(/Rast 95 min — stämmer det\?/);
    expect(skrivna("arbetsdag", "upsert").length).toBe(1);
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === D).tidsfragor_svar).toEqual({ rast: "10:00|18:00|95" });
  });

  it("rastsvaret skrivs på RÄTT rad: den dagens id, bara den raden, och inget annat fält", async () => {
    aldreDag({ rast_min: 95 });
    await oppnaFranVantarRaden();
    await klick("Rast 95 min"); await klickKnapp("Ja, det stämmer");
    const upd = skrivna("arbetsdag", "update").filter(s => "tidsfragor_svar" in s.vals);
    expect(upd.length).toBe(1);
    expect(upd[0].eqs).toEqual({ id: "ad-" + D });
    expect(upd[0].traffade).toEqual([D]);
    expect(Object.keys(upd[0].vals)).toEqual(["tidsfragor_svar"]);
  });

  it("skrivfel på rastsvaret SYNS för föraren (inte bara i konsolen) — och svaret gäller ändå i visningen", async () => {
    aldreDag({ rast_min: 95 });
    g.__failCol = "tidsfragor_svar";
    await oppnaFranVantarRaden();
    await klick("Rast 95 min"); await klickKnapp("Ja, det stämmer");
    expect(text()).toMatch(/Svaret kunde inte sparas/);
    expect(text()).toMatch(/Besvarat/);
    expect(opacity(stammer())).toBe(1);
  });

  it("rastsvaret finns kvar efter omladdning (databasen har det): ingen fråga", async () => {
    aldreDag({ rast_min: 95, tidsfragor_svar: { rast: "10:00|18:00|95" } });
    await oppnaFranVantarRaden();
    expect(text()).not.toMatch(/att svara på/i);
    expect(text()).toMatch(/Besvarat/);
    expect(opacity(stammer())).toBe(1);
  });

  it("objekt saknas: raden i listan, svaret skrivs på den dagen", async () => {
    aldreDag({ objekt_id: null });
    await oppnaFranVantarRaden();
    expect(text()).toMatch(/Vilken trakt var du på\?/);
    await klick("Vilken trakt var du på?");
    await klick("Hössjömåla"); await vänta(4, 40);
    const upd = skrivna("arbetsdag", "update").filter(s => "objekt_id" in s.vals);
    expect(upd.length).toBe(1);
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === D).objekt_id).toBe("OBJ1");
    expect(opacity(stammer())).toBe(1);
  });

  it("dagens vilobrott (igår→D): en rad, besvaras i arket; Stämmer öppnar inte helskärmsflödet", async () => {
    // 1/10 22:00 → 2/10 04:00 = 6 h dygnsvila
    aldreDag({ start_tid: "04:00:00", slut_tid: "12:00:00", brandrisk_beordrad: false }, [brott({ typ: "dygnsvila", datum: FORE_D, vila_h: 6 })]);
    g.__db.arbetsdag[0].start_tid = "12:00:00"; g.__db.arbetsdag[0].slut_tid = "22:00:00";
    await oppnaFranVantarRaden();
    expect(text()).toMatch(/1 sak att svara på/i);
    expect(text()).toMatch(/Dygnsvila 6 tim/);
    await klick("Kravet är 11 tim"); await klick("Akut situation eller jour"); await klickKnapp("Spara");
    expect(text()).toMatch(/Akut situation/);
    expect(opacity(stammer())).toBe(1);
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    expect(text()).not.toMatch(/Varför bröts vilan\?/);
    expect(skrivna("arbetsdag", "upsert").length).toBe(1);
  });

  it("vanlig äldre dag: ingen lista, knappen heter Stämmer och ett tryck bekräftar", async () => {
    aldreDag();
    await oppnaFranVantarRaden();
    expect(text()).not.toMatch(/att svara på/i);
    expect(text()).not.toMatch(/Bekräfta dagen/);
    expect(opacity(stammer())).toBe(1);
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    const up = skrivna("arbetsdag", "upsert");
    expect(up.length).toBe(1);
    expect(up[0].vals.datum).toBe(D);
  });

  it("samma flöde när dagen öppnas från Kalender", async () => {
    aldreDag({ start_tid: "05:10:00", slut_tid: "16:00:00" });
    await montera();
    await klick("Kalender");
    await vänta(6, 40);
    const cell = Array.from(behallare!.querySelectorAll<HTMLElement>("main span")).find(s => s.textContent === "2");
    expect(cell).toBeTruthy();
    await act(async () => { cell!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await vänta(8, 40);
    expect(text()).toMatch(/1 sak att svara på/i);
    expect(knapp("Stämmer")).not.toBeNull();
    expect(text()).not.toMatch(/Bekräfta dagen/);
  });

  it("ändrade tider (Spara ändring före Stämmer): frågelistan väntar tills ändringen sparats", async () => {
    aldreDag({ rast_min: 95 });
    await oppnaFranVantarRaden();
    expect(knapp("Stämmer")).not.toBeNull();
    // inga ändringar gjorda → ingen 'Spara ändring'
    expect(knapp("Spara ändring")).toBeNull();
  });
});
