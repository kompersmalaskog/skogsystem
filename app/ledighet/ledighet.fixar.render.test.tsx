// @vitest-environment jsdom
/**
 * Sista designgranskningen (2026-10-14) — fyra fixar, var och en låst här:
 *  2. Schema: teckenförklaringen står ÖVER tabellen, och högerkanten antyder att det går att svepa i sidled.
 *  3. Mig: "Låst — ändringar går via admin" EN gång per grupp (inte per rad); "Väntar" borta ur godkänn-listan.
 *  4. Ansök-arket: "Inarbetad" får en rad som de andra; dagens datum är inte navigeringsblått (kalender + Schema).
 * (1, datumbrytningen i beskedsvyn, ligger i besked.test.ts + ledighet.besked.render.test.tsx.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data?: unknown; error?: unknown };
const h = vi.hoisted(() => ({
  tabeller: {} as Record<string, { data?: unknown; error?: unknown }>,
  rpc: {} as Record<string, () => unknown>,
}));

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") {
          return (res: any, rej: any) => {
            const s: Svar = h.tabeller[tabell] ?? { data: null };
            return Promise.resolve({ data: s.error ? null : (s.data ?? []), error: s.error ?? null }).then(res, rej);
          };
        }
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return { supabase: { from: (t: string) => kedja(t), rpc: async (namn: string) => { const f = h.rpc[namn]; return f ? f() : { data: null, error: { message: "ingen fake" } }; } } };
});

import type { CurrentMedarbetare } from "@/lib/CurrentMedarbetareContext";
import MigVy from "./_components/MigVy";
import SchemaVy from "./_components/SchemaVy";
import { toISO } from "./_components/datum";

const FORARE: CurrentMedarbetare = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const ADMIN: CurrentMedarbetare = { ...FORARE, id: "m-admin", namn: "Test Admin", roll: "admin" };
const SALDO = { semester_dagar_kvar: 12.5, atk_timmar_kvar: 24, kalla: "manuell", uppdaterad_at: "2026-10-01T07:00:00Z" };
const A = (id: string, mid: string, status: string, typ = "semester", start = "2099-11-02", slut = "2099-11-06") => ({
  id, medarbetare_id: mid, anvandare_id: "Någon Person", typ, startdatum: start, slutdatum: slut,
  status, kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ersatter_datum: null, fran_tid: null, till_tid: null,
});
const nya = () => ({ data: { att_godkanna: 0, nya_beslut: 0, nya_beslut_ids: [], nya_beslut_till: null }, error: null });
const mig = (rader: unknown[]) => ({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: rader } });

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  h.rpc = { ledighet_prick: nya, ledighet_markera_sett: () => ({ data: null, error: null }) };
  (HTMLElement.prototype as any).scrollIntoView = () => {};
  (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  behallare = document.createElement("div"); document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null;
  window.history.replaceState({}, "", "/"); delete (HTMLElement.prototype as any).scrollIntoView; konsol.mockRestore();
});
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
async function montera(el: React.ReactElement, tabeller: Record<string, Svar>, url = "/ledighet") {
  window.history.replaceState({}, "", url);
  h.tabeller = tabeller;
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(el); });
  await flush();
}
const text = () => document.body.textContent ?? "";
const antal = (s: string, d = text()) => d.split(s).length - 1;
const knapp = (re: RegExp, inom: ParentNode = document) => Array.from(inom.querySelectorAll("button")).find(b => re.test(b.textContent ?? ""));
const tryck = async (b: Element | undefined) => { expect(b).toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); await flush(); };
const KALLA = (f: string) => readFileSync(resolve(__dirname, f), "utf8");

describe("#3 — 'Låst' en gång per grupp, inte per rad", () => {
  const LOCK = "Godkänd ledighet är låst — ändringar går via admin";

  it("tre godkända i Kommande ledighet → förklaringen står EN gång (och 'Låst —' på rad finns inte)", async () => {
    await montera(<MigVy medarbetare={FORARE} />, mig([A("g1", "m-1", "godkänd"), A("g2", "m-1", "godkänd", "atk", "2099-11-10", "2099-11-10"), A("g3", "m-1", "godkänd", "semester", "2099-12-01", "2099-12-04")]));
    expect(antal(LOCK)).toBe(1);
    expect(text()).not.toContain("Låst —");
    expect(document.querySelectorAll('[id^="ansokan-"]').length).toBe(3); // raderna finns — bara upprepningen är borta
  });

  it("förklaringen står UNDER gruppens kort (efter sista raden), inte före", async () => {
    await montera(<MigVy medarbetare={FORARE} />, mig([A("g1", "m-1", "godkänd"), A("g2", "m-1", "godkänd", "atk", "2099-11-10", "2099-11-10")]));
    const t = text();
    expect(t.indexOf("Kommande ledighet")).toBeLessThan(t.indexOf(LOCK));
    const sista = document.getElementById("ansokan-g2")!;
    const not = Array.from(document.querySelectorAll("p")).find(p => (p.textContent ?? "").includes(LOCK))!;
    expect(sista.compareDocumentPosition(not) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("en grupp utan godkänd (bara registrerad sjukdag) får ingen förklaring", async () => {
    await montera(<MigVy medarbetare={FORARE} />, mig([A("s1", "m-1", "registrerad", "sjuk", "2099-11-02", "2099-11-02")]));
    expect(text()).toContain("Kommande ledighet");
    expect(text()).not.toContain("är låst");
  });

  it("två grupper med godkänd (Besked överst + Kommande) → en förklaring per GRUPP, två totalt — inte en per rad", async () => {
    h.rpc.ledighet_prick = nya; // redan sett → reservvägen: raden lyfts upp under 'Besked'
    await montera(<MigVy medarbetare={FORARE} />, mig([A("g1", "m-1", "godkänd"), A("g2", "m-1", "godkänd", "atk", "2099-11-10", "2099-11-10"), A("g3", "m-1", "godkänd", "semester", "2099-12-01", "2099-12-04")]), "/ledighet?besked=g1");
    expect(text()).toContain("Besked");
    expect(antal(LOCK)).toBe(2);
  });

  it("Historik (passerat) hade aldrig förklaringen och får den inte nu heller", async () => {
    await montera(<MigVy medarbetare={FORARE} />, mig([A("p1", "m-1", "godkänd", "semester", "2020-01-02", "2020-01-03")]));
    await tryck(knapp(/Historik/));
    expect(text()).not.toContain("är låst");
  });
});

describe("#3 — 'Väntar' bort ur godkänn-listan", () => {
  it("raderna i godkänn-listan visar inget 'Väntar' (alla väntar) — men Godkänn/Neka och namn finns", async () => {
    const rader = [A("b1", "m-2", "väntar"), A("b2", "m-3", "väntar", "atk", "2099-12-01", "2099-12-02")];
    await montera(<MigVy medarbetare={ADMIN} />, mig(rader), "/ledighet?godkann=1");
    const lista = Array.from(document.querySelectorAll('[id^="godkann-"]'));
    expect(lista.length).toBe(2);
    for (const rad of lista) {
      expect(rad.textContent).not.toContain("Väntar");
      expect(rad.textContent).toContain("Godkänn");
      expect(rad.textContent).toContain("Neka");
    }
  });

  it("men den egna listan 'Väntar på besked' visar fortfarande statusen (där är det ett svar, inte brus)", async () => {
    await montera(<MigVy medarbetare={FORARE} />, mig([A("v1", "m-1", "väntar")]));
    const rad = document.getElementById("ansokan-v1")!;
    expect(rad.textContent).toContain("Väntar");
  });
});

describe("#2 — Schema: teckenförklaringen överst, antydan om sidscroll", () => {
  const idag = toISO(new Date());
  const SCHEMA = {
    medarbetare_namn: { data: [{ id: "m-1", fornamn: "Stefan" }, { id: "m-2", fornamn: "Oskar" }] },
    ledighet_ansokningar: { data: [{ medarbetare_id: "m-2", typ: "semester", startdatum: idag, slutdatum: idag }] },
    dim_maskin: { data: [{ maskin_id: "R64428", visningsnamn: "Rottne 428", modell: "H8E", maskin_typ: "Harvester", aktiv_till: null }] },
    stopp: { data: [{ id: "s1", fran_datum: idag, till_datum: idag, orsak: "semesterstopp", kommentar: null }] },
    stopp_maskin: { data: [{ stopp_id: "s1", maskin_id: "R64428" }] },
  };

  it("legenden står FÖRE tabellen (före första personen) — och säger vad grönt, rött och tomt betyder", async () => {
    await montera(<SchemaVy />, SCHEMA);
    const t = text();
    expect(t).toContain("Ledig");
    expect(t).toContain("Maskinstopp");
    expect(t).toContain("Tomt = på jobbet");
    expect(t.indexOf("Tomt = på jobbet")).toBeLessThan(t.indexOf("Stefan"));
    expect(t.indexOf("Ledig")).toBeLessThan(t.indexOf("Stefan"));
    const ram = document.querySelector("[data-schema-ram]")!;
    const legend = Array.from(document.querySelectorAll("span")).find(s => s.textContent === "Tomt = på jobbet")!;
    expect(legend.compareDocumentPosition(ram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("godkännare: legenden överst, 'Lägg till stopp' ovanför den, och handlingstipset ('Tryck på ett rött block') UNDER tabellen", async () => {
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />, SCHEMA);
    const t = text();
    expect(t.indexOf("Lägg till stopp")).toBeLessThan(t.indexOf("Tomt = på jobbet"));
    expect(t.indexOf("Tomt = på jobbet")).toBeLessThan(t.indexOf("Stefan"));
    expect(t.indexOf("Stefan")).toBeLessThan(t.indexOf("Tryck på ett rött block"));
  });

  it("förare ser inget handlingstips om stopp, men legenden finns", async () => {
    await montera(<SchemaVy />, SCHEMA);
    expect(text()).not.toContain("Tryck på ett rött block");
    expect(text()).toContain("Maskinstopp");
  });

  it("högerkanten antyder sidscroll: ja när mer väntar åt höger, nej när man svept till slutet eller allt ryms", async () => {
    await montera(<SchemaVy />, SCHEMA);
    const ram = document.querySelector("[data-schema-ram]") as HTMLElement;
    const fade = () => document.querySelector("[data-schema-mer]") as HTMLElement;
    expect(fade().getAttribute("data-schema-mer")).toBe("nej"); // jsdom: ingen layout → inget att svepa
    const satt = (sl: number, cw: number, sw: number) => {
      Object.defineProperty(ram, "clientWidth", { configurable: true, value: cw });
      Object.defineProperty(ram, "scrollWidth", { configurable: true, value: sw });
      Object.defineProperty(ram, "scrollLeft", { configurable: true, writable: true, value: sl });
    };
    satt(0, 358, 824); // telefon: 110 + 21×34
    await act(async () => { ram.dispatchEvent(new Event("scroll")); });
    expect(fade().getAttribute("data-schema-mer")).toBe("ja");
    expect(fade().style.opacity).toBe("1");
    satt(824 - 358, 358, 824); // i slutet
    await act(async () => { ram.dispatchEvent(new Event("scroll")); });
    expect(fade().getAttribute("data-schema-mer")).toBe("nej");
    expect(fade().style.opacity).toBe("0");
  });

  it("antydan är bara dekor-fritt visuellt: den fångar inga tryck (pointer-events: none) och är dold för skärmläsare", async () => {
    await montera(<SchemaVy />, SCHEMA);
    const fade = document.querySelector("[data-schema-mer]") as HTMLElement;
    expect(fade.style.pointerEvents).toBe("none");
    expect(fade.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("#4 — Ansök-arket: en rad per typknapp; dagens datum inte blått", () => {
  async function oppnaArk() {
    await montera(<MigVy medarbetare={FORARE} />, mig([]));
    await tryck(knapp(/Ansök om ledighet/));
    return document.querySelector('[aria-label="Ansök om ledighet"]') as HTMLElement;
  }
  const typKnappar = (ark: HTMLElement) => Array.from(ark.querySelectorAll("button[aria-pressed]")).slice(0, 3) as HTMLElement[];

  it("tre typknappar med ETT ord var: Semester · ATK · Inarbetad — inget mellanrum att bryta på", async () => {
    const ark = await oppnaArk();
    const ord = typKnappar(ark).map(b => (b.textContent ?? "").replace("check", "").trim());
    expect(ord).toEqual(["Semester", "ATK", "Inarbetad"]);
    for (const o of ord) expect(o).not.toMatch(/\s/);
  });

  it("vald typ (med bock) förblir en rad: 'nowrap' på alla tre, samma höjd på alla tre", async () => {
    const ark = await oppnaArk();
    await tryck(knapp(/Inarbetad/, ark));
    const kn = typKnappar(ark);
    expect(kn.map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
    expect(new Set(kn.map(b => b.style.minHeight)).size).toBe(1);
    for (const b of kn) expect(b.style.whiteSpace).toBe("nowrap");
  });

  it("'Inarbetad dag' i listor och texter är oförändrat (bara knappen är kort)", async () => {
    await montera(<MigVy medarbetare={FORARE} />, mig([A("i1", "m-1", "väntar", "inarbetad", "2099-12-28", "2099-12-28")]));
    expect(text()).toContain("Inarbetad dag");
  });

  it("kalendern: dagens datum har halvfet vikt och ring i dämpad text — varken ring eller tal är navigeringsblå", async () => {
    const ark = await oppnaArk();
    const dag = String(new Date().getDate());
    const idagKnapp = Array.from(ark.querySelectorAll("button[aria-pressed]")).find(b => (b.textContent ?? "").trim() === dag) as HTMLElement;
    const ruta = idagKnapp.querySelector("span") as HTMLElement;
    expect(ruta.style.fontWeight).toBe("600");
    expect(ruta.outerHTML).not.toContain("rgb(10, 132, 255)");
    expect(ruta.outerHTML).not.toContain("#0a84ff");
  });

  it("Schema: dagens kolumnrubrik är vit och halvfet (bandet i bakgrunden bär resten) — inte blå", async () => {
    const idag = toISO(new Date());
    await montera(<SchemaVy />, { medarbetare_namn: { data: [{ id: "m-1", fornamn: "Stefan" }] }, ledighet_ansokningar: { data: [] }, dim_maskin: { data: [] }, stopp: { data: [] }, stopp_maskin: { data: [] } });
    const rubrik = document.querySelector(`[data-dag="${idag}"]`) as HTMLElement;
    const [veckodag, tal] = Array.from(rubrik.querySelectorAll("span")) as HTMLElement[];
    expect(tal.style.fontWeight).toBe("600");
    expect(rubrik.outerHTML).not.toContain("rgb(10, 132, 255)");
    expect(tal.style.color === "rgb(255, 255, 255)" || tal.style.color === "rgb(255, 69, 58)").toBe(true); // vit (eller röd om idag är helg/rödag — helgmarkeringen går före)
    void veckodag;
  });

  it("källvakt: varken kalendern eller schemat refererar FARG.bla (blått är bara 'navigerar eller avbryter')", () => {
    expect(KALLA("_components/ValjKalender.tsx")).not.toContain("FARG.bla");
    expect(KALLA("_components/SchemaVy.tsx")).not.toContain("FARG.bla");
  });
});
