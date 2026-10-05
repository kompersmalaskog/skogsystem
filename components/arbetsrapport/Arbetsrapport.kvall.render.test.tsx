// @vitest-environment jsdom
/**
 * RENDERINGSTESTER för kvällsvyn i Dag (utredning 2026-10-05, design 2026-10-05).
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
    mode: "select" | "update" | "upsert" | "insert" = "select";
    vals: any = null;
    constructor(public t: string) {}
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    upsert(v: any) { this.mode = "upsert"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
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
      } else {
        const ny = { id: "ny-" + g.__skriv.length, ...this.vals };
        g.__skriv.push({ tabell: this.t, op: this.mode, vals: this.vals });
        rader = [ny];
      }
      return Promise.resolve({ data: this.enkel ? (rader[0] ?? null) : rader, error: null, count: rader.length }).then(res, rej);
    }
  }
  for (const m of ["select", "order", "limit", "or", "in", "not", "delete", "neq", "gt", "lt", "ilike", "range", "match", "contains", "filter", "textSearch"]) {
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const u = String(url);
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
}const knappar = () => Array.from(behallare!.querySelectorAll<HTMLElement>("button")).map(b => (b.textContent || "").trim());
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
    arbetsdag_objekt: [], extra_tid: [], vilobrott: [], ...ovrigt,
  };
}
const klartPass = (o: any = {}) => dagRad({ datum: IDAG, start_tid: "06:48:00", slut_tid: "16:12:00", bekraftad: false, bekraftad_tid: null, ...o });

describe("Kvällsvyn: sammanfattningen + EN knapp", () => {
  it("maskindag, pass klart: Stämmer + Något fel?, ingen dubblett eller brus", async () => {
    fixtur(klartPass());
    await montera();
    const t = text();
    expect(t).toMatch(/8 tim 54 min/);
    expect(t).toMatch(/06:48 → 16:12 · rast 30 min/);
    expect(t).toMatch(/ObjektHössjömåla/);
    expect(t).toMatch(/Körning112 km/);
    expect(t).toMatch(/Traktamente/);
    expect(knappar()).toContain("Stämmer");
    expect(knappar()).toContain("Något fel?");
    // borta: dubbletterna och bruset
    expect(t).not.toMatch(/Bekräfta dagen/);
    expect(t).not.toMatch(/Extra arbete/);
    expect(t).not.toMatch(/Lägg till i efterhand/);
    expect(t).not.toMatch(/Åker hem/);
    expect(t).not.toMatch(/Meal break/);
    expect(t).not.toMatch(/Maskin(?!pass)/);
    expect(t).not.toMatch(/Måndag 5 oktober/); // datumet står redan i hälsningen
  });

  it("Stämmer bekräftar dagen (samma skrivning som förr) och behåller databasens km", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Stämmer");
    const upserts = skrivna("arbetsdag").filter(s => s.op === "upsert");
    expect(upserts.length).toBe(1);
    expect(upserts[0].vals.bekraftad).toBe(true);
    expect(upserts[0].vals.km_morgon).toBe(56);
    expect(upserts[0].vals.km_kvall).toBe(56);
  });

  it("Något fel? öppnar ett ark med Tider, Körning, Mer arbete och Hela dagen", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?");
    expect(text()).toMatch(/Vad vill du ändra\?/);
    for (const rad of ["Tider", "Körning", "Mer arbete", "Hela dagen"]) expect(knappar().some(k => k.startsWith(rad))).toBe(true);
    // inget skrivs av att bara öppna arket
    expect(skrivna("arbetsdag").length).toBe(0);
  });

  it("arkets rader leder till rätt ändra-yta (och stänger arket först)", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?"); await klickKnapp("Körning");
    expect(text()).toMatch(/Ändra km/); expect(text()).toMatch(/Totalt112 km/); expect(text()).not.toMatch(/Vad vill du ändra/);
  });
  it("Tider → Ändra tider", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?"); await klick("Tider");
    expect(text()).toMatch(/Ändra tider/); expect(text()).not.toMatch(/Vad vill du ändra/);
  });
  it("Mer arbete → periodformuläret", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?"); await klick("Mer arbete");
    expect(text()).toMatch(/Lägg till period/); expect(text()).not.toMatch(/Vad vill du ändra/);
  });
  it("Hela dagen → Redigera för dagen", async () => {
    fixtur(klartPass());
    await montera();
    await klick("Något fel?"); await klick("Hela dagen");
    await vänta(6, 40);
    expect(text()).toMatch(/5 okt/); expect(text()).toMatch(/Tillbaka/); expect(text()).not.toMatch(/Vad vill du ändra/);
  });

  it("extra arbete efteråt visas som en rad; summan i dämpad rad är kort", async () => {
    fixtur(klartPass(), { extra_tid: [extra("e1", { start_tid: "16:30:00", slut_tid: "17:15:00", minuter: 45, aktivitet_typ: "reservdelar" })] });
    await montera();
    expect(text()).toMatch(/Kväll/); expect(text()).toMatch(/Hämta reservdelar 16:30–17:15/);
    expect(text()).toMatch(/\+ 45 min · totalt 9 tim 39 min/);
    expect(text()).not.toMatch(/extra arbete ·/);
  });
});

describe("Kvällsvyn: det som avviker syns, och går att åtgärda", () => {
  it("saknat objekt: orange rad 'Saknas' som öppnar objektlistan", async () => {
    fixtur(klartPass({ objekt_id: null }));
    await montera();
    expect(text()).toMatch(/ObjektSaknas/);
    await klick("Saknas");
    expect(text()).toMatch(/Välj objekt/);
  });

  it("lång rast: Stämmer stannar först vid frågan 'Rast 95 min — stämmer det?'", async () => {
    fixtur(klartPass({ rast_min: 95 }));
    await montera();
    expect(text()).toMatch(/rast 95 min/);
    await klick("Stämmer");
    expect(text()).toMatch(/Rast 95 min — stämmer det\?/);
    expect(skrivna("arbetsdag").filter(s => s.op === "upsert").length).toBe(0);
  });

  it("ändrad efter bekräftelse: 'Ändrad — ej bekräftad' och 'Stämmer igen'", async () => {
    fixtur(klartPass({ bekraftad: false, bekraftad_tid: "2026-10-05T15:30:00Z" }));
    await montera();
    expect(text()).toMatch(/Ändrad — ej bekräftad/);
    expect(knappar()).toContain("Stämmer igen");
  });
});

describe("Kvällsvyn: övriga lägen", () => {
  it("perioddag utan maskin: Stämmer, periodraderna, ingen Arbete-/Frånvaro-ruta, arket utan Tider", async () => {
    fixtur(
      dagRad({ datum: IDAG, maskin_id: null, objekt_id: null, start_tid: null, slut_tid: null, rast_min: 0, km_morgon: 0, km_kvall: 0, km_totalt: 0, bekraftad: false, bekraftad_tid: null }),
      { extra_tid: [
        extra("p1", { start_tid: "07:30:00", slut_tid: "11:30:00", minuter: 240, aktivitet_typ: "planering", objekt_id: "OBJ1", debiterbar: true }),
        extra("p2", { start_tid: "11:30:00", slut_tid: "12:15:00", minuter: 45, aktivitet_typ: "restid" }),
      ] },
      { ...FORARE, maskin_id: null },
    );
    await montera();
    expect(knappar()).toContain("Stämmer");
    expect(text()).toMatch(/Planering/); expect(text()).toMatch(/Restid/);
    expect(text()).not.toMatch(/Lägg till arbete/);
    expect(text()).not.toMatch(/Frånvaro/);
    await klick("Något fel?");
    expect(knappar().some(k => k.startsWith("Mer arbete"))).toBe(true);
    expect(knappar().some(k => k.startsWith("Tider"))).toBe(false);
  });

  it("en period som pågår: timerkortet visar Avsluta och Stämmer finns inte", async () => {
    fixtur(klartPass(), { extra_tid: [extra("t1", { start_tid: "18:30:00", slut_tid: null, minuter: 0, aktivitet_typ: "service" })] });
    await montera();
    expect(text()).toMatch(/Avsluta/);
    expect(knappar()).not.toContain("Stämmer");
  });

  it("passet pågår (timfil 19:05): ingen Stämmer; 'bekräfta ändå' ger kvällsvyn", async () => {
    fixtur(klartPass({ slut_tid: "19:05:00" }));
    await montera();
    expect(knappar()).not.toContain("Stämmer");
    expect(text()).toMatch(/bekräfta ändå/);
    await klick("bekräfta ändå");
    await vänta(8, 40); // <Tillstand> tonar över till nästa tillstånd (250 ms)
    expect(knappar()).toContain("Stämmer");
  });

  it("bekräftad dag: Ändra rapport, ingen Åker hem och ingen Något fel?", async () => {
    fixtur(klartPass({ bekraftad: true, bekraftad_tid: "2026-10-05T15:30:00Z" }));
    await montera();
    expect(text()).toMatch(/Bekräftad kl/);
    expect(knappar()).toContain("Ändra rapport");
    expect(knappar()).not.toContain("Något fel?");
    expect(text()).not.toMatch(/Åker hem/);
    expect(text()).not.toMatch(/Meal break/);
  });
});

describe("Redigera: Körning med Flytt", () => {
  it("Flytt visas som egen rad UTANFÖR Körning-summan: delarna summerar till talet", async () => {
    g.__kmKedja = [
      { fromLabel: "Hem", toLabel: "Hössjömåla", km: 33, source: "beraknad" },
      { fromLabel: "Hössjömåla", toLabel: "Brokamåla", km: 20, source: "beraknad" },
      { fromLabel: "Brokamåla", toLabel: "Hem", km: 33, source: "beraknad" },
    ];
    fixtur(klartPass({ bekraftad: true, bekraftad_tid: "2026-10-05T15:30:00Z", km_morgon: 33, km_kvall: 33, km_totalt: 66 }));
    await montera();
    await klick("Ändra rapport");
    await vänta(8, 40);
    const t = text();
    expect(t).toMatch(/Körning66 km/);
    expect(t).toMatch(/Morgon 33 · Kväll 33/);
    expect(t).not.toMatch(/Morgon 33 · Flytt/);
    expect(t).toMatch(/Flytt20 km/);
    expect(t).toMatch(/Ingår inte i Körning/);
  });

  it("utan flytt-ben finns ingen Flytt-rad", async () => {
    g.__kmKedja = [
      { fromLabel: "Hem", toLabel: "Hössjömåla", km: 33, source: "beraknad" },
      { fromLabel: "Hössjömåla", toLabel: "Hem", km: 33, source: "beraknad" },
    ];
    fixtur(klartPass({ bekraftad: true, bekraftad_tid: "2026-10-05T15:30:00Z", km_morgon: 33, km_kvall: 33, km_totalt: 66 }));
    await montera();
    await klick("Ändra rapport");
    await vänta(8, 40);
    expect(text()).toMatch(/Morgon 33 · Kväll 33/);
    expect(text()).not.toMatch(/Flytt/);
  });
});
