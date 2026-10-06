// @vitest-environment jsdom
/**
 * RENDERINGSTESTER: "Saker att svara på" i kvällsvyn (Martin 2026-10-06).
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
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
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
        traff.forEach(r => Object.assign(r, this.vals));
        g.__skriv.push({ tabell: this.t, op: "update", vals: this.vals });
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
  g.__skriv = [];
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

/** Igår 12:00–22:00 → idag börjar 05:10 = 7,2 h dygnsvila (< 11 h). Ett pass 29/9 ger ett långt gap (ingen veckovila). */
function fixtur(idag: any = {}, vilobrott: any[] = [], extra: Record<string, any[]> = {}) {
  g.__db = {
    medarbetare: [FORARE], gs_avtal: [AVTAL],
    dim_objekt: [
      { objekt_id: "OBJ1", object_name: "Hössjömåla", vo_nummer: "12001", skogsagare: "Svensson", huvudtyp: "slutavverkning", atgard: "Slutavverkning", latitude: 56.9, longitude: 15.9 },
    ],
    objekt: [{ vo_nummer: "12001", status: "pagaende", namn: "Hössjömåla", markagare: "Svensson", lat: 56.9, lng: 15.9, atgard: "Slutavverkning", dim_objekt_id: "OBJ1" }],
    dim_maskin: [{ maskin_id: MASKIN, visningsnamn: "Scorpion Giant", modell: "Scorpion Giant 8W", tillverkare: "Ponsse", maskin_typ: "Harvester", datakalla: "mom" }],
    arbetsdag: [
      dagRad({ datum: IDAG, start_tid: "05:10:00", slut_tid: "16:12:00", bekraftad: false, bekraftad_tid: null, ...idag }),
      dagRad({ datum: IGAR, start_tid: "12:00:00", slut_tid: "22:00:00" }),
      dagRad({ datum: FORE, start_tid: "06:00:00", slut_tid: "16:00:00" }),
    ],
    arbetsdag_objekt: [], extra_tid: [], vilobrott, ...extra,
  };
}
const dygnsvila = () => brott({ typ: "dygnsvila", datum: IGAR, vila_h: 7.2 });
const treFragor = () => fixtur({ objekt_id: null }, [dygnsvila()]); // objekt saknas + tidig start 05:10 + dygnsvila
const stammer = () => knapp("Stämmer") as HTMLButtonElement;
const opacity = (b: HTMLElement) => Number(b.style.opacity || 1);

describe("Saker att svara på: obesvarat läge", () => {
  it("tre frågor: rubrik, tre likadana rader, Stämmer grå med 'Svara på frågorna först'", async () => {
    treFragor();
    await montera();
    const t = text();
    expect(t).toMatch(/3 saker att svara på/i);
    expect(t).toMatch(/Vilken trakt var du på\?/);
    expect(t).toMatch(/Började du tidigt på grund av brandrisk\?/);
    expect(t).toMatch(/Dygnsvila 7,2 tim/);
    expect(t).toMatch(/Kravet är 11 tim\. Varför bröts vilan\?/);
    expect(t).toMatch(/Svara på frågorna först/);
    expect(opacity(stammer())).toBeLessThan(1);
  });

  it("vilobrottsremsan överst och brandriskkortet är borta: de är rader i listan", async () => {
    treFragor();
    await montera();
    expect(text()).not.toMatch(/Dygnsvila 7,2 tim av 11/); // remsans format
    expect(knapp("Ja")).toBeNull();                          // kortets Ja/Nej
    expect(knapp("Nej")).toBeNull();
  });

  it("Stämmer är inte död: tryck öppnar första obesvarade (objektet) och bekräftar ingenting", async () => {
    treFragor();
    await montera();
    await klickKnapp("Stämmer");
    expect(text()).toMatch(/Välj objekt/);
    expect(skrivna("arbetsdag", "upsert").length).toBe(0);
  });

  it("kortet har km och mil på EN rad, utan Reseersättning-rad", async () => {
    fixtur();
    await montera();
    expect(text()).toMatch(/Körning112 km · 6 mil/);
    expect(text()).not.toMatch(/Reseersättning/);
  });

  it("km utan mil när det inte blir ersättning", async () => {
    fixtur({ km_morgon: 20, km_kvall: 20, km_totalt: 40 });
    await montera();
    expect(text()).toMatch(/Körning40 km(?! ·)/);
    expect(text()).not.toMatch(/mil/);
  });
});

describe("Saker att svara på: besvara och ändra", () => {
  it("objekt: välj trakt → skrivs verifierat, står ifyllt i kortet, raden blir besvarad", async () => {
    treFragor();
    await montera();
    await klick("Vilken trakt var du på?");
    await klick("Hössjömåla");
    await vänta(4, 40);
    const upd = skrivna("arbetsdag", "update").filter(s => "objekt_id" in s.vals);
    expect(upd.length).toBe(1);
    expect(upd[0].vals.objekt_id).toBe("OBJ1");
    expect(text()).toMatch(/2 saker att svara på/i);
    expect(text()).toMatch(/ObjektHössjömåla/);
  });

  it("brandrisk: Ja skrivs, raden visar 'Ja' och går att ändra till Nej före Stämmer", async () => {
    fixtur({}, []);
    await montera();
    expect(text()).toMatch(/1 sak att svara på/i);
    await klick("Började du tidigt på grund av brandrisk?");
    await klickKnapp("Ja");
    expect(skrivna("arbetsdag", "update").some(s => s.vals.brandrisk_beordrad === true)).toBe(true);
    expect(text()).toMatch(/Besvarat/);
    expect(text()).toMatch(/Tidig start · brandrisk/);
    expect(text()).toMatch(/Ja/);
    await klick("Tidig start · brandrisk");
    await klickKnapp("Nej");
    expect(skrivna("arbetsdag", "update").some(s => s.vals.brandrisk_beordrad === false)).toBe(true);
    expect(text()).toMatch(/Nej/);
  });

  it("vilobrott: orsak sparas på brottet (aldrig dagen), raden visar svaret", async () => {
    fixtur({}, [dygnsvila()], {});
    g.__db.arbetsdag[0].brandrisk_beordrad = false;
    await montera();
    await klick("Kravet är 11 tim");
    expect(text()).toMatch(/Varför bröts vilan\?/);
    await klick("Akut situation eller jour");
    await klickKnapp("Spara");
    const upd = skrivna("vilobrott", "update");
    expect(upd.length).toBe(1);
    expect(upd[0].vals.besvarat_av_forare).toBe(true);
    expect(upd[0].vals.orsak).toBe("akut_jour");
    expect(text()).toMatch(/Besvarat/);
    expect(text()).toMatch(/Akut situation/);
  });

  it("rast 95 min: raden finns i listan, ingen ruta först vid Stämmer", async () => {
    fixtur({ rast_min: 95, start_tid: "10:00:00", brandrisk_beordrad: null }, []);
    await montera();
    expect(text()).toMatch(/1 sak att svara på/i);
    expect(text()).toMatch(/Rast 95 min/);
    await klick("Rast 95 min");
    expect(text()).toMatch(/Rast 95 min — stämmer det\?/);
    await klickKnapp("Ja, det stämmer");
    expect(text()).toMatch(/Besvarat/);
    expect(skrivna("arbetsdag", "upsert").length).toBe(0);
  });
});

describe("Saker att svara på: besvarat läge och underskrift", () => {
  it("alla besvarade: Besvarat + svaren, Stämmer vit, dagen INTE bekräftad; Stämmer bekräftar", async () => {
    treFragor();
    await montera();
    await klick("Vilken trakt var du på?"); await klick("Hössjömåla"); await vänta(4, 40);
    await klick("Började du tidigt på grund av brandrisk?"); await klickKnapp("Ja");
    await klick("Kravet är 11 tim"); await klick("Akut situation eller jour"); await klickKnapp("Spara");
    await vänta(6, 40);
    const t = text();
    expect(t).toMatch(/Besvarat/);
    expect(t).not.toMatch(/saker att svara på/i);
    expect(t).toMatch(/Hössjömåla/);
    expect(t).toMatch(/Ja/);
    expect(t).toMatch(/Akut situation/);
    expect(t).not.toMatch(/Svara på frågorna först/);
    expect(opacity(stammer())).toBe(1);
    // aldrig automatiskt efter sista svaret
    expect(skrivna("arbetsdag", "upsert").length).toBe(0);
    expect((g.__db.arbetsdag as any[]).find(r => r.datum === IDAG).bekraftad).toBe(false);
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    const up = skrivna("arbetsdag", "upsert");
    expect(up.length).toBe(1);
    expect(up[0].vals.bekraftad).toBe(true);
    expect(up[0].vals.objekt_id).toBe("OBJ1");
  });

  it("rast besvarad: Stämmer bekräftar direkt, utan rastrutan", async () => {
    fixtur({ rast_min: 95, start_tid: "10:00:00" }, []);
    g.__db.arbetsdag[0].brandrisk_beordrad = null;
    await montera();
    await klick("Rast 95 min"); await klickKnapp("Ja, det stämmer");
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    expect(text()).not.toMatch(/Rast 95 min — stämmer det\?/);
    expect(skrivna("arbetsdag", "upsert").length).toBe(1);
  });
});

describe("Vanlig dag", () => {
  it("inga frågor: ingen rubrik, ingen lista, ett tryck bekräftar", async () => {
    fixtur({ start_tid: "10:00:00" }, []);
    await montera();
    const t = text();
    expect(t).not.toMatch(/att svara på/i);
    expect(t).not.toMatch(/Besvarat/);
    expect(t).not.toMatch(/Svara på frågorna först/);
    expect(opacity(stammer())).toBe(1);
    await klickKnapp("Stämmer");
    await vänta(6, 40);
    expect(skrivna("arbetsdag", "upsert").length).toBe(1);
  });
});

describe("Perioddag (Planera-dagar) bekräftas på samma sätt", () => {
  it("vilobrott på en perioddag är en rad i listan, Stämmer grå tills den besvarats", async () => {
    const skal = dagRad({ datum: IDAG, maskin_id: null, objekt_id: null, start_tid: null, slut_tid: null, rast_min: 0, km_morgon: 0, km_kvall: 0, km_totalt: 0, traktamente: true, bekraftad: false, bekraftad_tid: null });
    const period = { id: "p1", medarbetare_id: "m-1", datum: IDAG, arbetsdag_id: skal.id, start_tid: "04:00:00", slut_tid: "10:00:00", minuter: 360, aktivitet_typ: "planering", objekt_id: "OBJ1", debiterbar: true, kalla: "morgon" };
    fixtur({}, [dygnsvila()], { extra_tid: [period] });
    g.__db.arbetsdag[0] = skal;
    g.__db.medarbetare = [{ ...FORARE, maskin_id: null }];
    await montera();
    expect(text()).toMatch(/1 sak att svara på/i);
    expect(opacity(stammer())).toBeLessThan(1);
  });
});
