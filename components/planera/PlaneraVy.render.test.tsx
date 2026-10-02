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
import { plusDagar } from "@/lib/planera/logik";

// Klockan är FAST (fre 2 okt 2026 15:20) — testerna får aldrig bero på när de körs.
const NU = new Date(2026, 9, 2, 15, 20);
const IDAG = "2026-10-02";
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
async function montera(nu: Date = NU) {
  const { default: PlaneraVy } = await import("./PlaneraVy");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<PlaneraVy nu={nu} />); });
  await flush();
}
const text = () => behallare!.textContent || "";
const knappar = () => Array.from(behallare!.querySelectorAll("button")) as HTMLButtonElement[];
/** EXAKT knapptext — "2 tim" (längden) får aldrig förväxlas med "Spara 2 tim". */
const exakt = (t: string) => knappar().find(b => (b.textContent || "").trim() === t);
const delText = (t: string) => knappar().find(b => (b.textContent || "").includes(t));
const etikett = (e: string) => behallare!.querySelector(`[aria-label="${e}"]`) as HTMLButtonElement | null;
async function tryck(k: HTMLElement | null | undefined, namn: string) {
  if (!k) throw new Error(`Hittar ingen knapp "${namn}". Sidan visar: ${text().slice(0, 400)}`);
  await act(async () => { k.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
}
const klicka = (t: string) => tryck(exakt(t), t);
const klickaDel = (t: string) => tryck(delText(t), t);
const klickaEtikett = (e: string) => tryck(etikett(e), e);
const avstangd = (b: HTMLElement | null | undefined) => !b || (b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true";
/** Trakt-raden (inte förslagsraden "Samma som i går") i Senaste trakter. */
const valjSenasteTrakt = () => tryck(knappar().find(b => (b.textContent || "").includes("Trestensdal gallring") && !(b.textContent || "").includes("Samma")), "Senaste trakt");
const hookFel = () => konsolFel.filter(m => /Rendered (more|fewer) hooks|order of Hooks|#310/i.test(m));
const extraInsatt = () => skrivna.filter(s => s.tabell === "extra_tid" && s.op === "insert");

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

describe("Planera: skärm 2 — fyra block", () => {
  it("trakt + blå dagrad, stor tid, fyra längder, aktivitet, låst Spara — inga klockfält, ingen tidslinje", async () => {
    await montera();
    await valjSenasteTrakt();
    expect(hookFel()).toEqual([]);
    expect(text()).toMatch(/Trestensdal gallring/);
    expect(text()).toContain("Idag, fre 2 okt");
    expect(etikett("Starttid")?.textContent).toBe("07:00");
    expect(etikett("Sluttid")?.textContent).toBe("--:--");
    expect(text()).toContain("tryck på en tid för att ändra");
    for (const l of ["1 tim", "2 tim", "4 tim", "Till nu"]) expect(exakt(l), l).toBeDefined();
    for (const a of ["Planering", "Manuellt", "Möte", "Restid"]) expect(exakt(a), a).toBeDefined();
    // Borta: klockfält, Dag-segmentet, tidslinje och starta-knappar
    expect(behallare!.querySelector('input[type="time"]')).toBeNull();
    expect(exakt("I går")).toBeUndefined();
    expect(exakt("Annan dag")).toBeUndefined();
    expect(text()).not.toMatch(/Byt trakt|faktureras/);
    // Ingen längd vald → Spara låst och säger vad som saknas
    expect(avstangd(exakt("Välj hur länge"))).toBe(true);
    await klicka("Välj hur länge");
    expect(skrivna).toEqual([]);
    // Alla knappar ≥ 44 px höga (stilvärdet — jsdom har ingen layout)
    for (const b of knappar()) expect(parseInt(b.style.minHeight || "44", 10), b.textContent || "").toBeGreaterThanOrEqual(44);
  });

  it("snabbvägen: trakt → 2 tim → Spara — raden skrivs, kvitto ur databasens rad", async () => {
    await montera();
    await valjSenasteTrakt();
    await klicka("2 tim");
    expect(etikett("Sluttid")?.textContent).toBe("09:00");
    expect(exakt("Spara 2 tim")).toBeDefined();
    await klicka("Spara 2 tim");
    const insatt = extraInsatt()[0];
    expect(insatt, `skrivet: ${JSON.stringify(skrivna)}`).toBeDefined();
    expect(insatt.rad).toMatchObject({
      medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120,
      aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, kalla: "under_dagen",
    });
    expect(skrivna.some(s => s.tabell === "arbetsdag" && s.op === "upsert")).toBe(true); // första perioden skapar dagen
    expect(text()).toMatch(/Sparat: Trestensdal gallring · idag 07:00–09:00 · 2 tim/);
    expect(hookFel()).toEqual([]);
  });

  it("restid blir icke-fakturerad, Manuellt fakturerad — följer aktivitetens default", async () => {
    await montera();
    await valjSenasteTrakt();
    await klicka("Manuellt");
    await klicka("1 tim");
    await klicka("Spara 1 tim");
    expect(extraInsatt()[0].rad).toMatchObject({ aktivitet_typ: "manuellt", debiterbar: true, objekt_id: "T1" });
    // en andra period: Restid
    await valjSenasteTrakt();
    await klicka("Restid");
    await klicka("1 tim");
    await klicka("Spara 1 tim");
    expect(extraInsatt()[1].rad).toMatchObject({ aktivitet_typ: "restid", debiterbar: false, start_tid: "08:00:00", slut_tid: "09:00:00" });
  });
});

describe("Planera: kvartar och förifylld start", () => {
  it("förarens vanliga start = median av dagens första period senaste 30 dagarna", async () => {
    for (const [d, t] of [[-3, "06:30:00"], [-4, "06:30:00"]] as [number, string][])
      db.extra_tid.push({ id: `h-${d}`, medarbetare_id: "m-1", datum: plusDagar(IDAG, d), start_tid: t, slut_tid: "12:00:00", minuter: 330, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-x" });
    await montera(); // i går 07:00, för tre och fyra dagar sedan 06:30 → median 06:30
    await valjSenasteTrakt();
    expect(etikett("Starttid")?.textContent).toBe("06:30");
  });

  it("efter en period som slutade 10:17 föreslås 10:30 — aldrig 10:17, och aldrig krock", async () => {
    db.extra_tid.push({ id: "g-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "10:17:00", minuter: 197, aktivitet_typ: "manuellt", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera();
    await valjSenasteTrakt();
    expect(etikett("Starttid")?.textContent).toBe("10:30");
    await klicka("2 tim");
    expect(text()).not.toMatch(/Krockar/);
    expect(avstangd(exakt("Spara 2 tim"))).toBe(false);
  });

  it("tryck på en tid → − och + en kvart per tryck; ingen klockväljare", async () => {
    await montera();
    await valjSenasteTrakt();
    await klickaEtikett("Starttid");
    expect(text()).toContain("en kvart per tryck");
    await klickaEtikett("En kvart tidigare");
    expect(etikett("Starttid")?.textContent).toBe("06:45");
    await klickaEtikett("En kvart senare");
    await klickaEtikett("En kvart senare");
    expect(etikett("Starttid")?.textContent).toBe("07:15");
    await klicka("2 tim");
    await klickaEtikett("Sluttid");
    await klickaEtikett("En kvart senare");
    expect(etikett("Sluttid")?.textContent).toBe("09:30");
    expect(exakt("Spara 2 tim 15 min")).toBeDefined();
    expect(behallare!.querySelector('input[type="time"]')).toBeNull();
  });

  it("slutet kan inte flyttas före starten", async () => {
    await montera();
    await valjSenasteTrakt();
    await klicka("1 tim");
    await klickaEtikett("Sluttid");
    for (let i = 0; i < 6; i++) await klickaEtikett("En kvart tidigare");
    expect(etikett("Sluttid")?.textContent).toBe("07:15"); // minst en kvart
    expect(avstangd(etikett("En kvart tidigare"))).toBe(true);
  });
});

describe("Planera: idag kan aldrig sluta efter nu", () => {
  const nu0910 = new Date(2026, 9, 2, 9, 10);
  it("kl 09:10: 4 tim är grå, 2 tim går, Till nu ger 09:00, och + stannar vid nu", async () => {
    await montera(nu0910);
    await valjSenasteTrakt();
    expect(avstangd(exakt("4 tim"))).toBe(true);
    expect(avstangd(exakt("2 tim"))).toBe(false);
    await klicka("4 tim");
    expect(etikett("Sluttid")?.textContent).toBe("--:--"); // grå knapp gör ingenting
    await klicka("Till nu");
    expect(etikett("Sluttid")?.textContent).toBe("09:00"); // rundat NED, aldrig 09:10
    expect(exakt("Spara 2 tim")).toBeDefined();
    await klickaEtikett("Sluttid");
    expect(avstangd(etikett("En kvart senare"))).toBe(true);
  });

  it("kl 09:10 med 'Till nu' på en dag utan plats kvar: ingen längd går att välja", async () => {
    db.extra_tid.push({ id: "g-2", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera(nu0910);
    await valjSenasteTrakt();
    expect(etikett("Starttid")?.textContent).toBe("09:00");
    for (const l of ["1 tim", "2 tim", "4 tim", "Till nu"]) expect(avstangd(exakt(l)), l).toBe(true);
    expect(text()).toMatch(/ingen färdig tid att lägga till ännu/);
    expect(avstangd(exakt("Välj hur länge"))).toBe(true);
  });

  it("Till nu finns bara idag", async () => {
    await montera();
    await valjSenasteTrakt();
    await klickaDel("Idag, fre 2 okt");
    await klickaDel("I går, tors 1 okt");
    expect(exakt("Till nu")).toBeUndefined();
  });

  it("Martins fall: en redan sparad framtida period (20:17–23:18 kl 16:19) kan inte sparas om — orange rad, Spara låst", async () => {
    db.extra_tid.push({ id: "f-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "20:17:00", slut_tid: "23:18:00", minuter: 181, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera(new Date(2026, 9, 2, 16, 19));
    await klickaDel("20:17–23:18");
    expect(text()).toMatch(/Slutet ligger efter klockan nu/);
    expect(avstangd(exakt("Spara 3 tim 1 min"))).toBe(true);
    await klicka("Spara 3 tim 1 min");
    expect(skrivna.filter(s => s.op === "update")).toEqual([]);
  });

  it("sparandet nekar framtida tid även om vyn kringgås", async () => {
    const { sparaNyPeriod } = await import("@/lib/planera/spara");
    const { supabase } = await import("@/lib/supabase");
    const nu = new Date(2026, 9, 2, 16, 19);
    const svar = await sparaNyPeriod(supabase as any, "m-1", { datum: IDAG, start: "20:15", slut: "23:15", typ: "planering", objektId: "T1", deb: true }, nu);
    expect(svar.ok).toBe(false);
    expect((svar as any).fel).toMatch(/framtiden/);
    const imorgon = await sparaNyPeriod(supabase as any, "m-1", { datum: plusDagar(IDAG, 1), start: "07:00", slut: "08:00", typ: "planering", objektId: "T1", deb: true }, nu);
    expect(imorgon.ok).toBe(false);
    expect(extraInsatt()).toEqual([]);
    const ok = await sparaNyPeriod(supabase as any, "m-1", { datum: IDAG, start: "14:00", slut: "16:15", typ: "planering", objektId: "T1", deb: true }, nu);
    expect(ok.ok).toBe(true);
  });
});

describe("Planera: krock", () => {
  it("orange rad 'Krockar med …' och Spara låst — bara när det händer", async () => {
    db.extra_tid.push({ id: "k-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera();
    await valjSenasteTrakt();
    expect(etikett("Starttid")?.textContent).toBe("10:00");
    await klicka("1 tim");
    expect(text()).not.toMatch(/Krockar/);
    await klickaEtikett("Starttid");
    for (let i = 0; i < 3; i++) await klickaEtikett("En kvart tidigare"); // 09:15
    expect(text()).toMatch(/Krockar med Betet gallring 2026 07:00–10:00/);
    expect(avstangd(exakt("Spara 1 tim 45 min"))).toBe(true);
    await klicka("Spara 1 tim 45 min");
    expect(extraInsatt()).toEqual([]);
  });
});

describe("Planera: dag", () => {
  it("dagraden öppnar senaste dagarna (bara bakåt); en tidigare dag ger ny förifyllning och sparas på den dagen", async () => {
    await montera();
    await valjSenasteTrakt();
    await klickaDel("Idag, fre 2 okt");
    expect(text()).toContain("I går, tors 1 okt");
    expect(text()).toContain("Tis 29 sep");
    expect(text()).not.toContain("lör 3 okt");
    const datumFalt = behallare!.querySelector('input[type="date"]') as HTMLInputElement;
    expect(datumFalt.max).toBe(IDAG); // äldre dag via kalender, aldrig framåt
    await klickaDel("I går, tors 1 okt");
    expect(text()).toContain("I går, tors 1 okt");
    expect(etikett("Starttid")?.textContent).toBe("10:00"); // gårdagens period slutade 10:00
    await klicka("2 tim");
    await klicka("Spara 2 tim");
    expect(extraInsatt()[0].rad).toMatchObject({ datum: IGAR, start_tid: "10:00:00", slut_tid: "12:00:00", objekt_id: "T1" });
    expect(text()).toMatch(/Sparat: Trestensdal gallring · i går 10:00–12:00 · 2 tim/);
  });
});

describe("Planera: Samma som i går", () => {
  it("ett tryck kopierar gårdagens trakt och tider till idag", async () => {
    await montera();
    expect(skrivna).toEqual([]); // inget sparas förrän föraren trycker
    await klickaDel("Samma som i går");
    expect(extraInsatt()).toHaveLength(1);
    expect(extraInsatt()[0].rad).toMatchObject({ datum: IDAG, start_tid: "07:00:00", slut_tid: "10:00:00", objekt_id: "T1", aktivitet_typ: "planering", debiterbar: true });
    expect(text()).toMatch(/Sparat: Trestensdal gallring · idag 07:00–10:00 · 3 tim/);
    expect(knappar().some(b => (b.textContent || "").startsWith("Samma som i går"))).toBe(false);
  });

  it("erbjuds inte medan gårdagens sluttid inte har varit idag (kl 09:00 vs 10:00)", async () => {
    await montera(new Date(2026, 9, 2, 9, 0));
    expect(text()).not.toMatch(/Samma som i går/);
  });
});

describe("Planera: maskinpasset", () => {
  it("en period INOM dagens maskinpass sparas inte — den är redan arbetstid", async () => {
    db.arbetsdag.push({ id: "a-9", medarbetare_id: "m-1", datum: IDAG, start_tid: "06:00:00", slut_tid: "16:00:00", maskin_id: "PONS" });
    await montera(new Date(2026, 9, 2, 17, 0));
    await valjSenasteTrakt();
    await klickaEtikett("Starttid");
    await klickaEtikett("En kvart senare");
    for (let i = 0; i < 7; i++) await klickaEtikett("En kvart senare"); // 07:00 → 08:00 ... inom passet
    await klicka("2 tim");
    await klickaDel("Spara 2 tim");
    expect(extraInsatt()).toEqual([]);
    expect(text()).toMatch(/inom maskinpasset \(06:00–16:00\)/);
  });
});

describe("Planera: ändra en sparad period", () => {
  it("raden i veckolistan öppnas med sina tider, + på slutet ger en kvart, Spara uppdaterar raden", async () => {
    await montera();
    await klickaDel("07:00–10:00 · Planering");
    expect(etikett("Starttid")?.textContent).toBe("07:00");
    expect(etikett("Sluttid")?.textContent).toBe("10:00");
    expect(exakt("Ta bort")).toBeUndefined(); // knappen har ikon + text
    expect(delText("Ta bort")).toBeDefined();
    expect(exakt("I går, tors 1 okt")).toBeUndefined(); // dagen kan inte flyttas vid ändring (visas som text)
    expect(text()).toContain("I går, tors 1 okt");
    await klickaEtikett("Sluttid");
    await klickaEtikett("En kvart senare");
    await klicka("Spara 3 tim 15 min");
    const upd = skrivna.find(s => s.tabell === "extra_tid" && s.op === "update")!;
    expect(upd.rad).toMatchObject({ start_tid: "07:00:00", slut_tid: "10:15:00", minuter: 195 });
    expect(extraInsatt()).toEqual([]);
  });
});
