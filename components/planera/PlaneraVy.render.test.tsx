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
    is(k: string, v: any) { this.filter.push([k, "is", v]); return this; }
    limit() { return this; }
    order(k: string, o?: { ascending?: boolean }) { this.sorter.push([k, o?.ascending !== false]); return this; }
    single() { this.enkel = true; return this; }
    maybeSingle() { this.enkel = true; return this; }
    private traffar(r: any) {
      return this.filter.every(([k, op, v]) => op === "eq" ? r[k] === v : op === "gte" ? r[k] >= v : op === "lte" ? r[k] <= v : op === "is" ? (v === null ? r[k] == null : r[k] === v) : v.includes(r[k]));
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
      { objekt_id: "T3", object_name: "Äldre avverkning", vo_nummer: "900", skogsagare: "Cy", huvudtyp: "Slutavverkning" },
    ],
    objekt: [
      { vo_nummer: "11124748", status: "planerad", typ: "slutavverkning" },
      { vo_nummer: "11218909", status: "pagaende", typ: "gallring" },
      { vo_nummer: "900", status: "avslutat", typ: "slutavverkning" },   // avslutad → inte i grupperna, men sökbar
      { vo_nummer: "777", status: "planerad", namn: "Okänd åtgärd trakt", markagare: "Di" }, // saknar typ → Övrigt
    ],
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
let Vy: any = null;
async function montera(nu: Date = NU) {
  ({ default: Vy } = await import("./PlaneraVy"));
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Vy nu={nu} />); });
  await flush();
}
/** Samma monterade vy, ny klocka — state behålls (som när tiden går medan appen är öppen). */
async function nyKlocka(nu: Date) {
  await act(async () => { rot!.render(<Vy nu={nu} />); });
  await flush();
}
const nuKl = (h: number, m: number) => new Date(2026, 9, 2, h, m);
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
    expect(text()).toMatch(/Senaste/);
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
    for (const a of ["Planering", "Manuellt", "Markägare", "Möte", "Restid"]) expect(exakt(a), a).toBeDefined();
    // Borta: klockfält, Dag-segmentet, tidslinje och starta-knappar
    expect(behallare!.querySelector('input[type="time"]')).toBeNull();
    expect(exakt("I går")).toBeUndefined();
    expect(exakt("Annan dag")).toBeUndefined();
    expect(text()).not.toMatch(/Byt trakt/);
    // Ingen längd vald → Spara låst och säger vad som saknas
    expect(avstangd(exakt("Välj hur länge"))).toBe(true);
    await klicka("Välj hur länge");
    expect(skrivna).toEqual([]);
    // STARTA NU: stor grön knapp direkt under trakt och dag, FÖRE tiden, med avdelaren "eller fyll i tid"
    const starta = delText("Starta nu")!;
    expect(starta).toBeDefined();
    expect(starta.style.background).toMatch(/30d158|48, 209, 88/i);
    const html = behallare!.innerHTML;
    expect(html.indexOf("Starta nu")).toBeGreaterThan(html.indexOf("Idag, fre 2 okt"));
    expect(html.indexOf("Starta nu")).toBeLessThan(html.indexOf('aria-label="Starttid"'));
    expect(text()).toContain("eller fyll i tid");
    expect(text()).not.toMatch(/Starta nu — avsluta sen|Starta nu valt/);
    expect(etikett("Sluttid")?.textContent).toBe("--:--"); // inget grått "?"
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
  it("kl 09:10: 4 tim är grå, 2 tim går, Till nu ger 09:15 (närmaste kvart), och + stannar där", async () => {
    await montera(nu0910);
    await valjSenasteTrakt();
    expect(avstangd(exakt("4 tim"))).toBe(true);
    expect(avstangd(exakt("2 tim"))).toBe(false);
    await klicka("4 tim");
    expect(etikett("Sluttid")?.textContent).toBe("--:--"); // grå knapp gör ingenting
    await klicka("Till nu");
    expect(etikett("Sluttid")?.textContent).toBe("09:15"); // närmaste kvart: 09:10 → 09:15 (godkänt: det jämnar ut sig)
    expect(exakt("Spara 2 tim 15 min")).toBeDefined();
    await klickaEtikett("Sluttid");
    expect(avstangd(etikett("En kvart senare"))).toBe(true);
  });

  it("kl 09:05 med 'Till nu' på en dag utan plats kvar: ingen längd går att välja", async () => {
    db.extra_tid.push({ id: "g-2", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera(nuKl(9, 5));
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
    expect(delText("Starta nu")).toBeUndefined(); // en period kan inte "startas nu" på en annan dag
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

// ── Nytt: sök + grupper, Starta nu / Rast / Fortsätt / Avsluta, en åt gången, glömd, Faktureras, kommentar ──
const valjTraktNamn = (namn: string) => tryck(knappar().find(b => (b.textContent || "").includes(namn) && !(b.textContent || "").includes("Samma")), namn);
async function skrivText(el: HTMLTextAreaElement | HTMLInputElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const kortet = (etikettText: string) => behallare!.querySelector(`[aria-label="${etikettText}"]`) as HTMLElement | null;

describe("Planera: skärm 1 — sök och aktiva trakter i grupper", () => {
  it("aktiva trakter per åtgärdstyp, avslutade utelämnade, Övrigt för trakt utan typ", async () => {
    await montera();
    expect(text()).toMatch(/Gallring · 1/);
    expect(text()).toMatch(/Slutavverkning · 1/);
    expect(text()).toMatch(/Övrigt · 1/);
    expect(text()).toContain("Okänd åtgärd trakt");
    expect(text()).not.toContain("Äldre avverkning"); // avslutad
    const t = text();
    expect(t.indexOf("Senaste")).toBeLessThan(t.indexOf("Gallring · 1"));
    expect(t.indexOf("Slutavverkning · 1")).toBeLessThan(t.indexOf("Den här veckan"));
    // Betet (pågående gallring) ligger under Gallring, före Slutavverkning
    expect(t.indexOf("Gallring · 1")).toBeLessThan(t.indexOf("Betet gallring 2026"));
    expect(t.indexOf("Betet gallring 2026")).toBeLessThan(t.indexOf("Slutavverkning · 1"));
  });

  it("sökningen filtrerar grupperna — och når även avslutade trakter (efterhandsregistrering)", async () => {
    await montera();
    await skrivText(behallare!.querySelector('input[type="search"]') as HTMLInputElement, "äldre");
    expect(text()).toContain("Äldre avverkning");
    expect(text()).toMatch(/Slutavverkning · 1/);
    expect(text()).not.toContain("Betet gallring 2026");
    expect(text()).not.toMatch(/Gallring · 1/);
    expect(text()).not.toMatch(/Senaste/);
    await skrivText(behallare!.querySelector('input[type="search"]') as HTMLInputElement, "finns inte");
    expect(text()).toMatch(/Ingen trakt matchar/);
  });
});

const oppenRadFix = (id = "o-9") => ({ id, medarbetare_id: "m-1", datum: IDAG, start_tid: "07:30:00", slut_tid: null, minuter: 0, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });

describe("Planera: Starta nu → Pågår → Avsluta (allt bekräftas där)", () => {
  it("trakt → Starta nu → perioden startar DIREKT (slut null, Pågår-kortet) → Avsluta 16:52 → sammanfattning → Spara", async () => {
    await montera(nuKl(7, 34));
    await valjTraktNamn("Betet gallring 2026");
    expect(extraInsatt()).toEqual([]); // inget sparat förrän man trycker
    await klickaDel("Starta nu");
    // 1. EN knapp, ett tryck: raden finns, utan slut, start = exakt nu — inget mellansteg
    const start = extraInsatt()[0];
    expect(start, `skrivet: ${JSON.stringify(skrivna)}`).toBeDefined();
    expect(start.rad).toMatchObject({ datum: IDAG, start_tid: "07:34:00", slut_tid: null, minuter: 0, objekt_id: "T2", aktivitet_typ: "planering", debiterbar: true, kalla: "under_dagen" });
    expect(etikett("Starttid")).toBeNull();            // tillbaka på skärm 1
    expect(exakt("Välj hur länge")).toBeUndefined();
    expect(delText("Starta 07:34")).toBeUndefined();  // ingen andra "Starta"-knapp längst ner
    // 2. Pågår-kortet överst: grön ram, räknare, ingen Rast/Fortsätt
    const kort = kortet("Pågående period")!;
    expect(kort.textContent).toContain("Pågår");
    expect(kort.textContent).toContain("Planering sedan 07:34 · 0 min");
    expect(kort.style.boxShadow).toMatch(/30d158|48, 209, 88/i); // FARG.gron
    expect(text().indexOf("Pågår")).toBeLessThan(text().indexOf("Senaste")); // överst, före listorna
    expect(delText("Rast")).toBeUndefined();
    expect(exakt("Fortsätt")).toBeUndefined();
    expect(exakt("Avsluta")).toBeDefined();
    expect(hookFel()).toEqual([]);
    // 3. Tiden går medan appen är öppen
    await nyKlocka(nuKl(9, 15));
    expect(kortet("Pågående period")!.textContent).toContain("1 tim 41 min");
    // 4. Avsluta 16:52 → sammanfattningen med allt förvalt, ännu inget skrivet
    await nyKlocka(nuKl(16, 52));
    await klicka("Avsluta");
    const panel = kortet("Avsluta period")!;
    expect(panel, text().slice(0, 300)).not.toBeNull();
    expect(panel.textContent).toContain("Planering · 07:34–16:52 · Faktureras · 9 tim 18 min");
    expect(panel.textContent).not.toContain("Rast"); // ingen förifylld rast, ingen median
    expect(delText("Klipp upp dagen")).toBeDefined();
    expect(skrivna.filter(s => s.op === "update")).toEqual([]);
    // 5. Dagen är längre än 5 tim och ingen rast är satt → Spara FRÅGAR (ett aktivt val) och sparar inte förrän han svarat
    await klicka("Spara 9 tim 18 min");
    expect(text()).toContain("Hade du rast?");
    expect(skrivna.filter(s => s.op === "update")).toEqual([]);
    await klicka("Ingen rast");
    const upd = skrivna.find(s => s.tabell === "extra_tid" && s.op === "update")!;
    expect(upd.rad).toMatchObject({ start_tid: "07:34:00", slut_tid: "16:52:00", rast_min: null, minuter: 558, aktivitet_typ: "planering", debiterbar: true });
    expect(db.extra_tid.find(r => r.objekt_id === "T2")).toMatchObject({ start_tid: "07:34:00", slut_tid: "16:52:00", rast_min: null, minuter: 558 });
    expect(text()).toMatch(/Sparat: Betet gallring 2026 · idag 07:34–16:52 · 9 tim 18 min/);
    expect(kortet("Pågående period")).toBeNull();
    expect(db.extra_tid.some(r => r.slut_tid == null)).toBe(false);
    expect(text()).toContain("07:34–16:52 · Planering"); // veckolistan
    expect(hookFel()).toEqual([]);
  });

  it("Avsluta → byt till Manuellt → Spara: raden får aktiviteten manuellt (ändra bara det som är fel)", async () => {
    db.extra_tid.push(oppenRadFix());
    await montera(nuKl(16, 52));
    await klicka("Avsluta");
    // allt förvalt: aktiviteten står på Planering
    expect(exakt("Planering")!.getAttribute("aria-pressed")).toBe("true");
    await klicka("Manuellt");
    expect(exakt("Manuellt")!.getAttribute("aria-pressed")).toBe("true");
    expect(kortet("Avsluta period")!.textContent).toContain("Manuellt · 07:30–16:52 · Faktureras · 9 tim 22 min");
    await klicka("Spara 9 tim 22 min");
    await klicka("Ingen rast");
    expect(db.extra_tid.find(r => r.id === "o-9")).toMatchObject({ aktivitet_typ: "manuellt", debiterbar: true, slut_tid: "16:52:00", rast_min: null, minuter: 562 });
  });

  it("Avsluta → Restid: faktureringen följer aktiviteten (av) och står i sammanfattningen; reglaget kan slås på igen", async () => {
    db.extra_tid.push(oppenRadFix());
    await montera(nuKl(10, 0));
    await klicka("Avsluta");
    await klicka("Restid");
    expect(kortet("Avsluta period")!.textContent).toContain("Restid · 07:30–10:00 · Faktureras inte · 2 tim 30 min");
    const reglage = () => behallare!.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(reglage().getAttribute("aria-checked")).toBe("false");
    await tryck(reglage(), "Faktureras");
    expect(kortet("Avsluta period")!.textContent).toContain("Restid · 07:30–10:00 · Faktureras · 2 tim 30 min");
    await klicka("Spara 2 tim 30 min");
    expect(db.extra_tid.find(r => r.id === "o-9")).toMatchObject({ aktivitet_typ: "restid", debiterbar: true, rast_min: null, minuter: 150 });
  });

  it("Avsluta: kommentar skrivs i sammanfattningen och sparas; en befintlig kommentar är förifylld", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-10"), kommentar: "Röjde stickvägen" });
    await montera(nuKl(11, 0));
    await klicka("Avsluta");
    expect((behallare!.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Röjde stickvägen");
    await skrivText(behallare!.querySelector("textarea") as HTMLTextAreaElement, "Röjde stickvägen och vändplanen");
    await klickaDel("Spara 3 tim 30 min");
    expect(db.extra_tid.find(r => r.id === "o-10")).toMatchObject({ kommentar: "Röjde stickvägen och vändplanen", slut_tid: "11:00:00" });
  });

      it("kort pass (under 5 tim): ingen rastfråga, sparas direkt", async () => {
    db.extra_tid.push({ id: "o-6", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:30:00", slut_tid: null, minuter: 0, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera(nuKl(11, 2));
    await klicka("Avsluta");
    const panel = kortet("Avsluta period")!;
    expect(panel.textContent).toContain("Planering · 07:30–11:02 · Faktureras · 3 tim 32 min");
    expect(panel.textContent).not.toContain("Rast");
    expect(text()).not.toContain("Hade du rast?");
    expect(etikett("Längre rast")).toBeNull();
    await klicka("Spara 3 tim 32 min");
    expect(db.extra_tid.find(r => r.id === "o-6")).toMatchObject({ slut_tid: "11:02:00", rast_min: null, minuter: 212 });
  });

          it("Avsluta samma minut som start: ingen nollängd, ett begripligt besked, raden orörd", async () => {
    db.extra_tid.push({ id: "o-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:30:00", slut_tid: null, minuter: 0, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera(nuKl(7, 30));
    await klicka("Avsluta");
    expect(text()).toMatch(/mindre än en minut gammal/);
    expect(skrivna.filter(s => s.op === "update")).toEqual([]);
  });

  it("pågående period ligger kvar: appen stängs och öppnas igen → kortet finns, räknaren stämmer", async () => {
    db.extra_tid.push({ id: "o-2", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: null, minuter: 0, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    await montera(nuKl(13, 5));
    expect(kortet("Pågående period")!.textContent).toContain("6 tim 5 min");
  });
});

describe("Planera: bara en pågående period åt gången", () => {
  beforeEach(() => {
    db.extra_tid.push({ id: "o-3", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: null, minuter: 0, aktivitet_typ: "planering", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
  });
  it("Starta nu är låst med förklaring, och en ny period över den pågående krockar", async () => {
    await montera(nuKl(9, 0));
    await valjTraktNamn("Trestensdal gallring");
    expect(avstangd(delText("Starta nu"))).toBe(true);
    expect(text()).toMatch(/redan en pågående period/);
    await klicka("1 tim");
    expect(text()).toMatch(/Krockar med Betet gallring 2026 07:00–\?/);
    expect(avstangd(exakt("Spara 1 tim"))).toBe(true);
  });
  it("sparandet nekar en andra pågående period, en start i framtiden och en pågående period bakåt i tiden", async () => {
    const { sparaNyPeriod } = await import("@/lib/planera/spara");
    const { supabase } = await import("@/lib/supabase");
    const bas = { typ: "planering" as const, objektId: "T1", deb: true };
    const nu = nuKl(9, 0);
    const andra = await sparaNyPeriod(supabase as any, "m-1", { ...bas, datum: IDAG, start: "08:00", slut: null }, nu);
    expect((andra as any).fel).toMatch(/redan en pågående period/);
    db.extra_tid = db.extra_tid.filter(r => r.id !== "o-3");
    const framtid = await sparaNyPeriod(supabase as any, "m-1", { ...bas, datum: IDAG, start: "10:00", slut: null }, nu);
    expect((framtid as any).fel).toMatch(/framtiden/);
    const igar = await sparaNyPeriod(supabase as any, "m-1", { ...bas, datum: IGAR, start: "13:00", slut: null }, nu);
    expect((igar as any).fel).toMatch(/bara startas idag/);
    expect(extraInsatt()).toEqual([]);
    const ok = await sparaNyPeriod(supabase as any, "m-1", { ...bas, datum: IDAG, start: "08:30", slut: null }, nu);
    expect(ok.ok).toBe(true);
  });
  it("Starta inom ett maskinpass nekas — det är redan arbetstid", async () => {
    db.extra_tid = db.extra_tid.filter(r => r.id !== "o-3");
    db.arbetsdag.push({ id: "a-9", medarbetare_id: "m-1", datum: IDAG, start_tid: "06:00:00", slut_tid: "16:00:00", maskin_id: "PONS" });
    const { sparaNyPeriod } = await import("@/lib/planera/spara");
    const { supabase } = await import("@/lib/supabase");
    const svar = await sparaNyPeriod(supabase as any, "m-1", { typ: "planering", objektId: "T1", deb: true, datum: IDAG, start: "08:00", slut: null }, nuKl(17, 0));
    expect((svar as any).fel).toMatch(/inom maskinpasset \(06:00–16:00\)/);
  });
});

describe("Planera: glömde avsluta", () => {
  it("period från en tidigare dag: orange kort, ingen Rast, Avsluta sätter ALDRIG slut = nu utan öppnar skärm 2", async () => {
    db.extra_tid.push({ id: "g-1", medarbetare_id: "m-1", datum: plusDagar(IDAG, -2), start_tid: "07:00:00", slut_tid: null, minuter: 0, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, arbetsdag_id: "a-0" });
    await montera(nuKl(15, 20));
    const kort = kortet("Glömd period")!;
    expect(kort).not.toBeNull();
    expect(kort.textContent).toContain("Glömde du avsluta?");
    expect(kort.textContent).toContain("Startade i förrgår 07:00");
    expect(kort.style.boxShadow).toMatch(/ff9f0a|255, 159, 10/i); // FARG.orange
    expect(delText("Rast")).toBeUndefined();
    await klicka("Avsluta");
    expect(skrivna.filter(s => s.op === "update")).toEqual([]); // inget gissat slut
    expect(etikett("Starttid")?.textContent).toBe("07:00");
    expect(etikett("Sluttid")?.textContent).toBe("--:--");
    expect(delText("Starta nu")).toBeUndefined(); // bara idag
    expect(avstangd(exakt("Välj hur länge"))).toBe(true);
    await klicka("4 tim");
    await klicka("Spara 4 tim");
    const upd = skrivna.find(s => s.tabell === "extra_tid" && s.op === "update")!;
    expect(upd.rad).toMatchObject({ start_tid: "07:00:00", slut_tid: "11:00:00", minuter: 240 });
    expect(text()).toMatch(/Sparat: Trestensdal gallring · i förrgår 07:00–11:00 · 4 tim/);
    expect(kortet("Glömd period")).toBeNull();
  });
});

describe("Planera: Markägare, Faktureras och kommentar", () => {
  it("Faktureras är en rad med reglage, förvalt efter aktiviteten; kommentaren sparas och syns i veckolistan", async () => {
    await montera();
    await valjSenasteTrakt();
    const reglage = () => behallare!.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(reglage().getAttribute("aria-checked")).toBe("true"); // planering
    await klicka("Restid");
    expect(reglage().getAttribute("aria-checked")).toBe("false");
    await klicka("Markägare");
    expect(reglage().getAttribute("aria-checked")).toBe("true");
    await tryck(reglage(), "Faktureras"); // avstängd för just den här perioden
    expect(reglage().getAttribute("aria-checked")).toBe("false");
    // Kommentar: blå rad → textfält
    expect(behallare!.querySelector("textarea")).toBeNull();
    await klickaDel("Lägg till kommentar");
    await skrivText(behallare!.querySelector("textarea") as HTMLTextAreaElement, "Möte vid grinden");
    await klicka("2 tim");
    await klicka("Spara 2 tim");
    expect(extraInsatt()[0].rad).toMatchObject({ aktivitet_typ: "markagare", debiterbar: false, kommentar: "Möte vid grinden", objekt_id: "T1" });
    expect(text()).toContain("07:00–09:00 · Markägare · Möte vid grinden"); // veckolistan
  });

  it("utan kommentar sparas null, och en tom/blank kommentar blir null", async () => {
    await montera();
    await valjSenasteTrakt();
    await klickaDel("Lägg till kommentar");
    await skrivText(behallare!.querySelector("textarea") as HTMLTextAreaElement, "   ");
    await klicka("1 tim");
    await klicka("Spara 1 tim");
    expect(extraInsatt()[0].rad.kommentar).toBeNull();
  });

  it("en sparad kommentar öppnas ifylld vid ändring och kan ändras", async () => {
    db.extra_tid.push({ id: "k-9", medarbetare_id: "m-1", datum: IGAR, start_tid: "12:00:00", slut_tid: "13:00:00", minuter: 60, aktivitet_typ: "manuellt", objekt_id: "T1", debiterbar: true, arbetsdag_id: "a-1", kommentar: "Röjde stickvägen" });
    await montera();
    await klickaDel("Röjde stickvägen");
    expect((behallare!.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Röjde stickvägen");
    await skrivText(behallare!.querySelector("textarea") as HTMLTextAreaElement, "Röjde stickvägen och vändplanen");
    await klicka("Spara 1 tim");
    expect(skrivna.find(s => s.tabell === "extra_tid" && s.op === "update")!.rad).toMatchObject({ kommentar: "Röjde stickvägen och vändplanen", slut_tid: "13:00:00" });
  });
});

describe("Planera: Starta nu STARTAR — klockan när man trycker, exakt minut", () => {
  const taTrakt = async (nu: Date, namn = "Betet gallring 2026") => { await montera(nu); await valjTraktNamn(namn); };
  it("07:34 → perioden startar 07:34 direkt, utan att något annat trycks", async () => {
    await taTrakt(nuKl(7, 34));
    await klickaDel("Starta nu");
    expect(extraInsatt()).toHaveLength(1);
    expect(extraInsatt()[0].rad).toMatchObject({ start_tid: "07:34:00", slut_tid: null, aktivitet_typ: "planering", debiterbar: true });
    expect(kortet("Pågående period")).not.toBeNull();
  });
  it("13:51 → 13:51 (Martins fall: fick 13:45)", async () => {
    await taTrakt(nuKl(13, 51));
    await klickaDel("Starta nu");
    expect(extraInsatt()[0].rad).toMatchObject({ start_tid: "13:51:00", slut_tid: null });
    expect(kortet("Pågående period")!.textContent).toContain("sedan 13:51");
  });
  it("förifyllningen styr inte: efter en period som slutade 10:30 ger Starta nu kl 13:07 starten 13:07", async () => {
    db.extra_tid.push({ id: "e-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "07:00:00", slut_tid: "10:30:00", minuter: 210, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, arbetsdag_id: "a-1" });
    await taTrakt(nuKl(13, 7));
    expect(etikett("Starttid")?.textContent).toBe("10:30"); // förifyllt — gäller efterhandsregistrering
    await klickaDel("Starta nu");
    expect(extraInsatt()[0].rad).toMatchObject({ start_tid: "13:07:00", slut_tid: null });
  });
  it("aktivitet och kommentar som redan valts följer med; inget av det krävs", async () => {
    await taTrakt(nuKl(8, 12));
    await klicka("Markägare");
    await klickaDel("Lägg till kommentar");
    await skrivText(behallare!.querySelector("textarea") as HTMLTextAreaElement, "Möte vid grinden");
    await klickaDel("Starta nu");
    expect(extraInsatt()[0].rad).toMatchObject({ aktivitet_typ: "markagare", debiterbar: true, kommentar: "Möte vid grinden", start_tid: "08:12:00", slut_tid: null });
  });
  it("Restid vald före: faktureras inte", async () => {
    await taTrakt(nuKl(8, 12));
    await klicka("Restid");
    await klickaDel("Starta nu");
    expect(extraInsatt()[0].rad).toMatchObject({ aktivitet_typ: "restid", debiterbar: false });
  });
  it("ett fel (start inom maskinpass) visas under knappen, ingen rad skrivs, man stannar på skärm 2", async () => {
    db.arbetsdag.push({ id: "a-9", medarbetare_id: "m-1", datum: IDAG, start_tid: "06:00:00", slut_tid: "16:00:00", maskin_id: "PONS" });
    await taTrakt(nuKl(12, 0));
    await klickaDel("Starta nu");
    expect(extraInsatt()).toEqual([]);
    expect(behallare!.querySelector('[role="alert"]')?.textContent).toMatch(/inom maskinpasset \(06:00–16:00\)/);
    expect(etikett("Starttid")).not.toBeNull();
  });
  it("backa starten på en pågående period: Ändra eller ta bort → minus → Spara ändring (den förblir pågående)", async () => {
    db.extra_tid.push({ ...oppenRadFix(), start_tid: "07:20:00" });
    await montera(nuKl(7, 40));
    await klickaDel("Ändra eller ta bort");
    expect(etikett("Starttid")?.textContent).toBe("07:20");
    expect(etikett("Sluttid")?.textContent).toBe("pågår");
    expect(delText("Starta nu")).toBeUndefined(); // redan startad
    await klickaEtikett("Starttid");
    await klickaEtikett("En kvart tidigare"); // 07:20 → 07:15
    await klickaEtikett("En kvart tidigare"); // → 07:00
    await klicka("Spara ändring");
    expect(db.extra_tid.find(r => r.id === "o-9")).toMatchObject({ start_tid: "07:00:00", slut_tid: null });
    expect(kortet("Pågående period")!.textContent).toContain("sedan 07:00");
  });
  it("sparandet nekar en pågående period som startar efter klockan (07:45 kl 07:38) men godtar exakt nu", async () => {
    const { sparaNyPeriod } = await import("@/lib/planera/spara");
    const { supabase } = await import("@/lib/supabase");
    const bas = { typ: "planering" as const, objektId: "T1", deb: true, datum: IDAG, slut: null };
    const nu = nuKl(7, 38);
    expect(((await sparaNyPeriod(supabase as any, "m-1", { ...bas, start: "07:45" }, nu)) as any).fel).toMatch(/framtiden/);
    expect((await sparaNyPeriod(supabase as any, "m-1", { ...bas, start: "07:38" }, nu)).ok).toBe(true);
  });
});

const klickaN = async (e: string, n: number) => { for (let i = 0; i < n; i++) await klickaEtikett(e); };
const delRader = () => knappar().filter(b => /\d\d:\d\d–\d\d:\d\d/.test(b.textContent || "") && !!b.querySelector('[aria-hidden="true"]')).map(b => b.textContent || "");
const dagRader = (datum: string) => db.extra_tid.filter(r => r.datum === datum).sort((a, b) => String(a.start_tid).localeCompare(String(b.start_tid)));

describe("Planera: klipp upp dagen (Martins fall: glömde byta och avsluta)", () => {
  it("planering 07:00–16:00 → klipp 10:00 (rast), 10:30 (manuellt), 13:00 (manuellt på Betet) → fyra delar med rätt trakt och aktivitet, arbetad tid 8 tim 30", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-k1"), objekt_id: "T1", start_tid: "07:00:00" });
    await montera(nuKl(16, 0));
    await klicka("Avsluta");
    await klickaDel("Klipp upp dagen");
    // 1. klipp 10:00 → Rast. Tiden är förifylld mitt i perioden; inget är valt än.
    expect(text()).toContain("Klipp vid 11:30");
    expect(exakt("Klipp")!.getAttribute("aria-disabled")).toBe("true");
    await klickaN("Klipp tidigare", 6);
    expect(text()).toContain("Klipp vid 10:00");
    await klicka("Rast");
    await klicka("Lägg till rast");
    expect(text()).toContain("2 delar");
    // 2. klipp igen 10:30 → Manuellt (delen som klipps är den sista: rasten 10:00–16:00)
    await klickaDel("Klipp igen");
    expect(text()).toContain("Klipp vid 13:00");
    await klickaN("Klipp tidigare", 10);
    await klicka("Manuellt");
    await klicka("Klipp");
    // 3. klipp igen 13:00 → Manuellt på en annan trakt (Betet)
    await klickaDel("Klipp igen");
    expect(text()).toContain("Klipp vid 13:15");
    await klickaEtikett("Klipp tidigare");
    await klicka("Manuellt");
    await klickaDel("Trakt");
    await valjTraktNamn("Betet gallring 2026");
    await klicka("Klipp");
    // Fyra delar, färgstapel, arbetad tid
    const rader = delRader();
    expect(rader).toHaveLength(4);
    expect(rader[0]).toContain("Planering · Trestensdal gallring"); expect(rader[0]).toContain("07:00–10:00");
    expect(rader[1]).toContain("Rast"); expect(rader[1]).toContain("10:00–10:30");
    expect(rader[2]).toContain("Manuellt · Trestensdal gallring"); expect(rader[2]).toContain("10:30–13:00");
    expect(rader[3]).toContain("Manuellt · Betet gallring 2026"); expect(rader[3]).toContain("13:00–16:00");
    expect(text()).toContain("8 tim 30 min arbetad · 4 delar");
    expect(behallare!.querySelector('[aria-label="Dagens delar"]')!.children).toHaveLength(4);
    // Spara: varje arbetsdel blir en egen rad, rasten blir luckan (ingen rad), ingen fråga eftersom rast finns
    expect(text()).not.toContain("Hade du rast?");
    await klicka("Spara 8 tim 30 min");
    const rs = dagRader(IDAG);
    expect(rs.map(r => [r.start_tid, r.slut_tid, r.aktivitet_typ, r.objekt_id, r.minuter])).toEqual([
      ["07:00:00", "10:00:00", "planering", "T1", 180],
      ["10:30:00", "13:00:00", "manuellt", "T1", 150],
      ["13:00:00", "16:00:00", "manuellt", "T2", 180],
    ]);
    expect(rs[0].id).toBe("o-k1"); // den pågående raden blev första delen
    expect(rs.some(r => r.slut_tid == null || (r.rast_min ?? 0) > 0)).toBe(false);
    expect(rs.reduce((a, r) => a + r.minuter, 0)).toBe(510);
    // Kvittot byggs av det sparade svaret
    expect(text()).toContain("Sparat · 3 delar · 8 tim 30 min arbetad");
    expect(text()).toContain("Betet gallring 2026 · idag 13:00–16:00 · 3 tim");
    expect(kortet("Pågående period")).toBeNull();
    expect(hookFel()).toEqual([]);
  }, 60000);

  it("Avsluta 07:00–16:00 utan klipp: Spara frågar 'Hade du rast?' — Ingen rast sparar som den är", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-k2"), start_tid: "07:00:00" });
    await montera(nuKl(16, 0));
    await klicka("Avsluta");
    expect(kortet("Avsluta period")!.textContent).not.toContain("Rast"); // aldrig förifylld
    await klicka("Spara 9 tim");
    expect(text()).toContain("Hade du rast?");
    expect(exakt("Spara 9 tim")).toBeUndefined(); // Spara går inte förrän han svarat
    expect(skrivna.filter(s => s.op === "update")).toEqual([]);
    await klicka("Ingen rast");
    expect(db.extra_tid.find(r => r.id === "o-k2")).toMatchObject({ start_tid: "07:00:00", slut_tid: "16:00:00", minuter: 540, rast_min: null });
  });

  it("'Lägg till rast' öppnar redigeraren med rasten vald — han sätter tiderna själv; resten fortsätter som delen var", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-k3"), start_tid: "07:00:00", objekt_id: "T1" });
    await montera(nuKl(16, 0));
    await klicka("Avsluta");
    await klicka("Spara 9 tim");
    await klicka("Lägg till rast");
    expect(text()).toContain("Klipp upp dagen");
    expect(exakt("Rast")!.getAttribute("aria-pressed")).toBe("true");
    expect(text()).toContain("Klipp vid 11:30");
    await klickaN("Klipp senare", 2);                // 12:00
    await klickaN("Rast till tidigare", 14);         // 16:00 → 12:30
    expect(text()).toMatch(/Rast 12:00–12:30 · 30 min/);
    await klicka("Lägg till rast");
    const rader = delRader();
    expect(rader).toHaveLength(3);
    expect(rader[1]).toContain("Rast"); expect(rader[1]).toContain("12:00–12:30");
    expect(rader[2]).toContain("Planering · Trestensdal gallring"); expect(rader[2]).toContain("12:30–16:00");
    await klicka("Spara 8 tim 30 min");
    expect(dagRader(IDAG).map(r => [r.start_tid, r.slut_tid, r.aktivitet_typ, r.objekt_id, r.debiterbar])).toEqual([
      ["07:00:00", "12:00:00", "planering", "T1", true],
      ["12:30:00", "16:00:00", "planering", "T1", true],
    ]);
  }, 60000);

  it("skärm 2: en period över 5 tim i efterhand ger samma fråga; Ingen rast sparar, Lägg till rast öppnar redigeraren", async () => {
    await montera(nuKl(16, 0));
    await valjSenasteTrakt();
    await klicka("Till nu");
    await klicka("Spara 9 tim");
    expect(text()).toContain("Hade du rast?");
    expect(extraInsatt()).toEqual([]);
    await klicka("Lägg till rast");
    expect(text()).toContain("Klipp upp dagen");
    expect(extraInsatt()).toEqual([]); // fortfarande inget sparat
  });

  it("ingen rastfråga för exakt 5 tim (inte LÄNGRE än 5 tim)", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-k4"), start_tid: "07:00:00" });
    await montera(nuKl(12, 0));
    await klicka("Avsluta");
    await klicka("Spara 5 tim");
    expect(text()).not.toContain("Hade du rast?");
    expect(db.extra_tid.find(r => r.id === "o-k4")!.slut_tid).toBe("12:00:00");
  });

  it("redigeraren: Avsluta-sammanfattningen får aktiviteten med sig in i klippet (och går att backa från)", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-k5"), start_tid: "07:00:00", aktivitet_typ: "planering" });
    await montera(nuKl(10, 0));
    await klicka("Avsluta");
    await klicka("Manuellt");
    await klickaDel("Klipp upp dagen");
    expect(text()).toContain("Klipp vid 08:30");
    await klickaDel("Avbryt");
    expect(delRader()[0]).toContain("Manuellt");
    await klickaDel("Avsluta"); // tillbaka-länken heter Avsluta
    expect(kortet("Avsluta period")).not.toBeNull();
  });
});

describe("Planera: snabbvalet 'Slutade 16:00?' när perioden glömts öppen", () => {
  const dagar = () => { db.extra_tid = db.extra_tid.filter(r => r.id !== "p-1"); for (const d of [-2, -3, -4, -5]) db.extra_tid.push({ id: `h-${d}`, medarbetare_id: "m-1", datum: plusDagar(IDAG, d), start_tid: "07:00:00", slut_tid: "16:00:00", minuter: 540, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, arbetsdag_id: "a-0" }); };
  it("har perioden pågått längre än han brukar jobba får han välja — inget förval", async () => {
    dagar();
    db.extra_tid.push({ ...oppenRadFix("o-s1"), start_tid: "07:00:00" });
    await montera(nuKl(19, 30));
    await klicka("Avsluta");
    expect(exakt("Slutade 16:00?")).toBeDefined();
    expect(exakt("Nu, 19:30")).toBeDefined();
    expect(kortet("Avsluta period")!.textContent).not.toContain("Faktureras"); // ingen sammanfattning förrän han valt
    await klicka("Slutade 16:00?");
    expect(kortet("Avsluta period")!.textContent).toContain("Planering · 07:00–16:00 · Faktureras · 9 tim");
    await klicka("Spara 9 tim");
    await klicka("Ingen rast");
    expect(db.extra_tid.find(r => r.id === "o-s1")).toMatchObject({ slut_tid: "16:00:00", minuter: 540 });
  });
  it("'Nu' ger exakt nu; kortare pass än vanligt och för få dagar ger inget val", async () => {
    dagar();
    db.extra_tid.push({ ...oppenRadFix("o-s2"), start_tid: "07:00:00" });
    await montera(nuKl(19, 30));
    await klicka("Avsluta");
    await klicka("Nu, 19:30");
    expect(kortet("Avsluta period")!.textContent).toContain("07:00–19:30");
  });
  it("inget val när pågående tid är inom det vanliga", async () => {
    dagar();
    db.extra_tid.push({ ...oppenRadFix("o-s3"), start_tid: "07:00:00" });
    await montera(nuKl(15, 20));
    await klicka("Avsluta");
    expect(delText("Slutade")).toBeUndefined();
    expect(kortet("Avsluta period")!.textContent).toContain("07:00–15:20");
  });
});

describe("Planera: samma redigerare i efterhand, från veckolistan", () => {
  const tva = () => {
    db.extra_tid.push({ id: "p-2", medarbetare_id: "m-1", datum: IGAR, start_tid: "10:30:00", slut_tid: "13:00:00", minuter: 150, aktivitet_typ: "manuellt", objekt_id: "T2", debiterbar: true, arbetsdag_id: "a-1" });
    db.arbetsdag.push({ id: "a-1", medarbetare_id: "m-1", datum: IGAR, bekraftad: true, bekraftad_tid: "2026-10-01T16:00:00Z" });
  };
  it("tryck på en dag → delar med rast som lucka; flytta en gräns, spara — gränsen flyttar med, en bekräftad dag bryts", async () => {
    tva();
    await montera();
    await klickaDel("tors 1 okt");
    const rader = delRader();
    expect(rader).toHaveLength(3);
    expect(rader[0]).toContain("Planering · Trestensdal gallring"); expect(rader[0]).toContain("07:00–10:00");
    expect(rader[1]).toContain("Rast"); expect(rader[1]).toContain("10:00–10:30");
    expect(rader[2]).toContain("Manuellt · Betet gallring 2026"); expect(rader[2]).toContain("10:30–13:00");
    expect(text()).toContain("5 tim 30 min arbetad · 3 delar");
    await klickaDel("07:00–10:00");
    await klickaEtikett("Slut senare");              // 10:00 → 10:15, rasten blir kortare
    expect(text()).toContain("Slut 10:15");
    await klicka("Klar");
    expect(delRader()[1]).toContain("10:15–10:30");
    expect(text()).not.toContain("Hade du rast?");   // rast finns (luckan)
    await klicka("Spara 5 tim 45 min");
    expect(db.extra_tid.find(r => r.id === "p-1")).toMatchObject({ start_tid: "07:00:00", slut_tid: "10:15:00", minuter: 195 });
    expect(db.extra_tid.find(r => r.id === "p-2")).toMatchObject({ start_tid: "10:30:00", slut_tid: "13:00:00", minuter: 150 }); // orörd
    expect(skrivna.filter(s => s.tabell === "extra_tid" && s.op === "insert")).toEqual([]);
    // En underskrift gäller det man skrev under: ändrad dag måste bekräftas igen
    expect(db.arbetsdag.find(r => r.id === "a-1")).toMatchObject({ bekraftad: false, bekraftad_tid: null });
    expect(text()).toContain("Dagen var bekräftad — den måste bekräftas igen");
  }, 30000);
  it("ändra trakt och aktivitet på en del; ta bort en del (föregående ARBETSdel eller nästa tar över, aldrig rasten)", async () => {
    tva();
    await montera();
    await klickaDel("tors 1 okt");
    await klickaDel("10:30–13:00");
    await klickaDel("Trakt");
    await valjTraktNamn("Trestensdal gallring");
    await klicka("Möte");
    await klicka("Klar");
    expect(delRader()[2]).toContain("Möte · Trestensdal gallring");
    await klickaDel("07:00–10:00");
    await klickaDel("Ta bort delen");
    await klicka("Ja, ta bort");
    // första delen hade bara en rast som granne → blir rast (obetald), slås ihop med rasten
    expect(delRader()).toHaveLength(2);
    expect(delRader()[0]).toContain("Rast"); expect(delRader()[0]).toContain("07:00–10:30");
    await klicka("Spara 2 tim 30 min");
    expect(db.extra_tid.some(r => r.id === "p-1")).toBe(false);
    expect(db.extra_tid.find(r => r.id === "p-2")).toMatchObject({ objekt_id: "T1", aktivitet_typ: "mote", debiterbar: false, start_tid: "10:30:00", slut_tid: "13:00:00" });
  }, 30000);
  it("rader Planera inte hanterar (service) syns låsta och rörs aldrig", async () => {
    tva();
    db.extra_tid.push({ id: "s-1", medarbetare_id: "m-1", datum: IGAR, start_tid: "13:00:00", slut_tid: "14:00:00", minuter: 60, aktivitet_typ: "service", objekt_id: null, debiterbar: false, arbetsdag_id: "a-1" });
    await montera();
    await klickaDel("tors 1 okt");
    const service = delRader().find(r => r.includes("13:00–14:00"))!;
    expect(service).toContain("ändras i Dag");
    await klickaDel("13:00–14:00");
    expect(etikett("Start tidigare")).toBeNull();
    await klicka("Klar");
    // sista arbetsdelens slut kan inte flyttas in i den låsta raden
    await klickaDel("10:30–13:00");
    expect(avstangd(etikett("Slut senare"))).toBe(true);
    expect(avstangd(etikett("Slut tidigare"))).toBe(true);
  });
  it("en dag med en pågående period öppnas inte — avsluta den först", async () => {
    db.extra_tid.push({ ...oppenRadFix("o-v1"), datum: IGAR, start_tid: "13:00:00" });
    await montera();
    await klickaDel("tors 1 okt");
    expect(text()).toContain("Avsluta den pågående perioden först");
    expect(delRader()).toHaveLength(0);
  });
});

import type { DagDel } from "@/lib/planera/dag";
describe("Planera: sparaDelar (skrivvägen för en hel dag)", () => {
  const hamta = async () => {
    const { sparaDelar } = await import("@/lib/planera/spara");
    const { delarFranRader, flyttaGrans, klippDel } = await import("@/lib/planera/dag");
    const { supabase } = await import("@/lib/supabase");
    return { sparaDelar, delarFranRader, flyttaGrans, klippDel, sb: supabase as any };
  };
  const rad = (id: string, s: string, e: string, extra: any = {}) => ({ id, medarbetare_id: "m-1", datum: IGAR, start_tid: s + ":00", slut_tid: e + ":00", minuter: 0, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, arbetsdag_id: "a-1", ...extra });
  const nuK = nuKl(17, 0);

  it("kontrollerar ALLT före första skrivningen: framtid och maskinpass stoppar utan att något sparas", async () => {
    const { sparaDelar, delarFranRader, klippDel, sb } = await hamta();
    db.extra_tid = [rad("x1", "07:00", "10:00")];
    const gamla = db.extra_tid.slice();
    const d = klippDel(delarFranRader(gamla), "r:x1", 8 * 60 + 30, { typ: "manuellt" })!;
    // maskinpass 08:00–09:00 mitt i delarna
    db.arbetsdag.push({ id: "a-9", medarbetare_id: "m-1", datum: IGAR, start_tid: "08:00:00", slut_tid: "09:00:00", maskin_id: "PONS" });
    const svar = await sparaDelar(sb, "m-1", IGAR, gamla, d, nuK);
    expect(svar.ok).toBe(false);
    expect((svar as any).fel).toMatch(/korsar maskinpassets gräns|inom maskinpasset/);
    expect(skrivna).toEqual([]);
    // framtid (idag, slut efter nu)
    db.arbetsdag = [];
    const idagGamla = [rad("x2", "07:00", "10:00", { datum: IDAG })];
    const f = [{ ...delarFranRader(idagGamla)[0], slut: 18 * 60 }];
    const s2 = await sparaDelar(sb, "m-1", IDAG, idagGamla, f, nuK);
    expect((s2 as any).fel).toMatch(/framtiden/);
  });
  it("flyttar en gräns i en ordning utan tillfällig överlappning (b krymper först, sedan får a växa)", async () => {
    const { sparaDelar, delarFranRader, flyttaGrans, sb } = await hamta();
    db.extra_tid = [rad("a", "07:00", "10:00"), rad("b", "10:00", "13:00")];
    const gamla = db.extra_tid.slice();
    const d = flyttaGrans(delarFranRader(gamla), 0, 11 * 60)!;
    const svar = await sparaDelar(sb, "m-1", IGAR, gamla, d, nuK);
    expect(svar.ok).toBe(true);
    expect(dagRader(IGAR).map(r => [r.id, r.start_tid, r.slut_tid, r.minuter])).toEqual([["a", "07:00:00", "11:00:00", 240], ["b", "11:00:00", "13:00:00", 120]]);
    expect((svar as any).rader.map((r: any) => r.id)).toEqual(["a", "b"]);
  });
  it("stoppar något halvvägs rapporteras vad som hann sparas, och nya delars rader kan kopplas om", async () => {
    const { sparaDelar, delarFranRader, klippDel, sb } = await hamta();
    db.extra_tid = [rad("a", "07:00", "10:00")];
    db.arbetsdag_segment.push({ id: "sg-1", medarbetare_id: "m-1", datum: IGAR, start_tid: "12:30:00", slut_tid: "13:00:00" });
    const gamla = db.extra_tid.slice();
    // a krymper till 07:00–09:00 (lyckas) och en ny del 12:00–13:00 (krockar med ett segment) infogas
    let d: DagDel[] = delarFranRader(gamla).map(x => ({ ...x, slut: 9 * 60 }));
    d = [...d, { nyckel: "n:1", radId: null, start: 12 * 60, slut: 13 * 60, typ: "planering" as const, objektId: "T1", deb: true, kommentar: "", last: false }];
    const svar = await sparaDelar(sb, "m-1", IGAR, gamla, d, nuK);
    expect(svar.ok).toBe(false);
    expect((svar as any).fel).toMatch(/1 av 2 ändringar hann sparas/);
    expect(db.extra_tid.find(r => r.id === "a")).toMatchObject({ slut_tid: "09:00:00" }); // det som hann sparas ligger kvar
    void klippDel;
  });
  it("en ändring på en bekräftad dag bryter bekräftelsen även för en enskild period (sparaNyPeriod)", async () => {
    const { sb } = await hamta();
    const { sparaNyPeriod } = await import("@/lib/planera/spara");
    db.arbetsdag.push({ id: "a-b", medarbetare_id: "m-1", datum: IGAR, bekraftad: true, bekraftad_tid: "x" });
    const svar = await sparaNyPeriod(sb, "m-1", { datum: IGAR, start: "14:00", slut: "15:00", typ: "planering", objektId: "T1", deb: true }, nuK);
    expect(svar.ok && svar.bekraftelse).toBe("bruten");
    expect(db.arbetsdag.find(r => r.id === "a-b")).toMatchObject({ bekraftad: false, bekraftad_tid: null });
  });
});
