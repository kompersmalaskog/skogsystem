// @vitest-environment jsdom
/**
 * Beskedsvyn: tryck på en beslutsnotis (?besked=<id>) → EN skärm med beskedet, inte en lista att skanna.
 *
 *  godkänd → stor bock, "Din semester är godkänd", perioden stor, längden, en vänlig rad, "Till ledighetsvyn"
 *  nekad   → stillsam: dämpad ikon, en saklig mening, "Ansök om andra datum" (öppnar ansökan direkt) + "Till ledighetsvyn"
 *
 * Visas EN gång: bara om ansökan är min, godkänd/nekad och beslutet är NYTT (serverns `nya_beslut_ids`).
 * Allt annat → ledighetsvyn som förut (raden överst och markerad, eller en saklig rad om att ansökan inte finns).
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
  anrop: [] as [string, unknown][],
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
  return {
    supabase: {
      from: (t: string) => kedja(t),
      rpc: async (namn: string, args?: unknown) => {
        h.anrop.push([namn, args]);
        const f = h.rpc[namn];
        return f ? f() : { data: null, error: { message: "ingen fake" } };
      },
    },
  };
});

import type { CurrentMedarbetare } from "@/lib/CurrentMedarbetareContext";
import MigVy from "./_components/MigVy";
import { BESKED_MAX_VANTAN_MS } from "./_components/besked";
import { MARKERING_MS } from "./_components/fokus";

const FORARE: CurrentMedarbetare = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const SALDO = { semester_dagar_kvar: 12.5, atk_timmar_kvar: 24, kalla: "manuell", uppdaterad_at: "2026-10-01T07:00:00Z" };
const ANSOKAN = (id: string, mid: string, status: string, over: Record<string, unknown> = {}) => ({
  id, medarbetare_id: mid, anvandare_id: "Någon Person", typ: "semester", startdatum: "2099-11-02", slutdatum: "2099-11-06",
  status, kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ersatter_datum: null, fran_tid: null, till_tid: null, ...over,
});
const TILL = "2026-10-14T08:00:00Z";
const nya = (ids: string[]) => () => ({ data: { att_godkanna: 0, nya_beslut: ids.length, nya_beslut_ids: ids, nya_beslut_till: ids.length ? TILL : null }, error: null });
const friska = (rader: unknown[]) => ({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: rader } });

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;
let scrollat: string[] = [];

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  h.rpc = { ledighet_markera_sett: () => ({ data: null, error: null }) };
  h.anrop = [];
  scrollat = [];
  (HTMLElement.prototype as any).scrollIntoView = function (this: Element) { scrollat.push(this.id); };
  (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  window.history.replaceState({}, "", "/");
  delete (HTMLElement.prototype as any).scrollIntoView;
  vi.useRealTimers();
  konsol.mockRestore();
});

const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
async function visa(url: string, tabeller: Record<string, Svar>, medarbetare = FORARE) {
  window.history.replaceState({}, "", url);
  h.tabeller = tabeller;
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<MigVy medarbetare={medarbetare} />); });
  await flush();
}
const besked = () => document.querySelector('[aria-label="Besked om din ledighet"]') as HTMLElement | null;
const ansokArk = () => document.querySelector('[aria-label="Ansök om ledighet"]') as HTMLElement | null;
const text = () => document.body.textContent ?? "";
const knapp = (re: RegExp, inom: ParentNode = document) => Array.from(inom.querySelectorAll("button")).find(b => re.test(b.textContent ?? ""));
const tryck = async (b: Element | undefined) => { expect(b).toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); await flush(); };

describe("Beskedsvyn — godkänd", () => {
  it("semester: bock, 'Din semester är godkänd', perioden stor, längden, vänlig rad, EN knapp", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    const v = besked()!;
    expect(v).not.toBeNull();
    expect(v.getAttribute("data-besked")).toBe("godkand");
    expect(v.textContent).toContain("Din semester är godkänd");
    expect(v.querySelector("[data-besked-period]")!.textContent).toBe("2 – 6 november");
    expect(v.textContent).toContain("5 arbetsdagar");
    expect(v.textContent).toContain("Ha en skön ledighet!");
    expect(v.textContent).toContain("check"); // ikonen (Material Symbols-ligatur)
    expect(Array.from(v.querySelectorAll("button")).map(b => b.textContent)).toEqual(["Till ledighetsvyn"]);
  });

  it("ATK: timmar och en saklig rad (ingen 'ha en skön')", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd", { typ: "atk" })]));
    expect(besked()!.textContent).toContain("Din ATK är godkänd");
    expect(besked()!.textContent).toContain("40 timmar");
    expect(besked()!.textContent).toContain("Inlagt i kalendern.");
    expect(besked()!.textContent).not.toContain("skön");
  });

  it("ingen rad scrollas till och ingen markeras bakom — beskedsvyn ÄR landningen", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    await act(async () => { vi.advanceTimersByTime(MARKERING_MS + 50); });
    expect(scrollat).toEqual([]);
    expect(document.querySelector("[data-markerad='true']")).toBeNull();
  });

  it("'Till ledighetsvyn' stänger beskedsvyn; beslutet ligger i listan som vanligt (inte kvar under 'Nytt besked')", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    await tryck(knapp(/Till ledighetsvyn/, besked()!));
    expect(besked()).toBeNull();
    expect(text()).toContain("Kommande ledighet");
    expect(text()).not.toContain("Nytt besked"); // det är levererat — inte längre nytt
    expect(document.getElementById("ansokan-g1")).not.toBeNull();
    expect(scrollat).toEqual([]);
  });

  it("Esc stänger också (dator)", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(besked()).toBeNull();
  });
});

describe("Beskedsvyn — nekad: stillsam", () => {
  it("en saklig mening, dämpad ikon, ingen bock, inget rött, inget 'tyvärr', ingen 'prata med någon'", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad")]));
    const v = besked()!;
    expect(v.getAttribute("data-besked")).toBe("nekad");
    expect(v.textContent).toContain("Din ansökan 2 – 6 november gick inte igenom.");
    expect(v.textContent).toContain("event_busy");
    expect(v.textContent).not.toContain("check");
    expect(v.textContent).not.toContain("godkänd");
    const lagt = (v.textContent ?? "").toLowerCase();
    for (const ord of ["tyvärr", "prata", "kontakta", "chef"]) expect(lagt).not.toContain(ord);
    // Ingen färg bär beskedet: varken rött eller grönt någonstans i vyn (jsdom normaliserar till rgb()).
    expect(v.innerHTML).not.toContain("rgb(255, 69, 58)"); // FARG.rod
    expect(v.innerHTML).not.toContain("rgb(48, 209, 88)"); // FARG.gron
  });

  it("två vägar: 'Ansök om andra datum' (primär) och 'Till ledighetsvyn'", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad")]));
    expect(Array.from(besked()!.querySelectorAll("button")).map(b => b.textContent)).toEqual(["Ansök om andra datum", "Till ledighetsvyn"]);
  });

  it("'Ansök om andra datum' öppnar ansökan DIREKT (kalendern), typen förvald — och beskedsvyn är borta (inget ark på ett ark)", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad", { typ: "atk" })]));
    await tryck(knapp(/Ansök om andra datum/, besked()!));
    expect(besked()).toBeNull();
    const ark = ansokArk()!;
    expect(ark).not.toBeNull();
    expect(ark.textContent).toContain("Period");
    const vald = Array.from(ark.querySelectorAll("button[aria-pressed='true']")).map(b => b.textContent);
    expect(vald.join(" ")).toContain("ATK");
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
  });

  it("avbryter man ansökan landar man i ledighetsvyn — avslaget ligger i Historik, inte kvar som 'nytt'", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad")]));
    await tryck(knapp(/Ansök om andra datum/, besked()!));
    await tryck(knapp(/^Avbryt$/, ansokArk()!));
    expect(ansokArk()).toBeNull();
    expect(text()).toContain("Historik");
    expect(text()).not.toContain("Nytt besked");
  });

  it("bytesdag förväljs inte (kräver en röd dag) — arket öppnas utan vald typ", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad", { typ: "inarbetad", ersatter_datum: "2099-12-24" })]));
    await tryck(knapp(/Ansök om andra datum/, besked()!));
    expect(ansokArk()!.querySelectorAll("button[aria-pressed='true']").length).toBe(0);
  });

  it("'Ansök om ledighet' ur listan öppnar fortfarande arket UTAN förvald typ (förvalet läcker inte)", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad", { typ: "atk" })]));
    await tryck(knapp(/Ansök om andra datum/, besked()!));
    await tryck(knapp(/^Avbryt$/, ansokArk()!));
    await tryck(knapp(/^add\s*Ansök om ledighet|Ansök om ledighet/));
    expect(ansokArk()!.querySelectorAll("button[aria-pressed='true']").length).toBe(0);
  });
});

describe("Ingen beskedsvy → ledighetsvyn som förut", () => {
  it("REDAN SETT beslut (servern listar det inte som nytt): ingen beskedsvy, raden överst + markerad", async () => {
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(besked()).toBeNull();
    expect(text()).toContain("Besked");
    expect(scrollat).toEqual(["ansokan-g1"]);
    expect(document.getElementById("ansokan-g1")!.getAttribute("data-markerad")).toBe("true");
  });

  it("ansökan finns inte kvar → ingen beskedsvy, saklig rad", async () => {
    h.rpc.ledighet_prick = nya(["borta"]);
    await visa("/ledighet?besked=borta", friska([ANSOKAN("v1", "m-1", "väntar")]));
    expect(besked()).toBeNull();
    expect(text()).toContain("Den ansökan finns inte längre.");
  });

  it("någon ANNANS ansökan visas aldrig, inte ens om id:t skulle stå i listan över nya", async () => {
    h.rpc.ledighet_prick = nya(["x1"]);
    await visa("/ledighet?besked=x1", friska([ANSOKAN("x1", "m-2", "godkänd")]));
    expect(besked()).toBeNull();
    expect(text()).toContain("Den ansökan finns inte längre.");
    expect(text()).not.toContain("Din semester");
  });

  it("beslutet gäller inte längre (status väntar) → ingen beskedsvy", async () => {
    h.rpc.ledighet_prick = nya(["v1"]);
    await visa("/ledighet?besked=v1", friska([ANSOKAN("v1", "m-1", "väntar")]));
    expect(besked()).toBeNull();
  });

  it("ingen länkparameter → ingen beskedsvy, även med nya beslut (då 'Nytt besked' som förut)", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(besked()).toBeNull();
    expect(text()).toContain("Nytt besked");
  });

  it("ansökningarna kunde inte läsas → ingen beskedsvy, läsfelet visas som vanligt", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: { message: "fel" } } });
    expect(besked()).toBeNull();
    expect(text()).toContain("Kunde inte läsa dina ansökningar");
  });

  it("serverns lista kunde inte läsas (null) → ingen beskedsvy (vi vet inte att det är nytt)", async () => {
    h.rpc.ledighet_prick = () => ({ data: null, error: { message: "nere" } });
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(besked()).toBeNull();
    expect(text()).toContain("Besked"); // raden överst som förut
    expect(scrollat).toEqual(["ansokan-g1"]);
  });
});

describe("Väntan och 'visas en gång'", () => {
  it("medan serverns svar saknas visas varken lista eller beskedsvy — bara 'Läser ditt besked…'", async () => {
    h.rpc.ledighet_prick = () => new Promise(() => {}); // svarar aldrig
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(text()).toContain("Läser ditt besked…");
    expect(besked()).toBeNull();
    expect(text()).not.toContain("Ansök om ledighet");
  });

  it("svarar servern inte inom tidsgränsen → ledighetsvyn som vanligt (hänger aldrig)", async () => {
    h.rpc.ledighet_prick = () => new Promise(() => {});
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    await act(async () => { vi.advanceTimersByTime(BESKED_MAX_VANTAN_MS + 50); });
    await flush();
    expect(text()).not.toContain("Läser ditt besked…");
    expect(besked()).toBeNull();
    expect(text()).toContain("Ansök om ledighet");
  });

  it("ett svar som kommer EFTER tidsgränsen drar inte upp beskedsvyn över en lista man redan använder", async () => {
    let svara: (v: unknown) => void = () => {};
    h.rpc.ledighet_prick = () => new Promise(r => { svara = r; });
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    await act(async () => { vi.advanceTimersByTime(BESKED_MAX_VANTAN_MS + 50); });
    await flush();
    await act(async () => { svara(nya(["g1"])()); });
    await flush();
    expect(besked()).toBeNull();
  });

  it("visas EN gång: beslutet kvitteras (servern räknar det som sett) — nästa besök har ingen beskedsvy", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(besked()).not.toBeNull();
    expect(h.anrop.filter(([n]) => n === "ledighet_markera_sett")).toEqual([["ledighet_markera_sett", { p_till: TILL }]]);
    // nästa besök: servern listar inte längre beslutet
    act(() => { rot!.unmount(); });
    rot = null;
    h.anrop = [];
    h.rpc.ledighet_prick = nya([]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    expect(besked()).toBeNull();
  });

  it("en omläsning av ansökningarna medan beskedsvyn är uppe byter inte skärm under fingret", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    h.tabeller = friska([ANSOKAN("g1", "m-1", "nekad")]); // ändras på servern medan man tittar
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    expect(besked()!.getAttribute("data-besked")).toBe("godkand");
  });
});

describe("Utformning", () => {
  it("helskärmspanel under toppfältet, nedre raden med hemindikatorhänsyn, och bara rörelse ur designCss (inga egna animationer)", async () => {
    h.rpc.ledighet_prick = nya(["g1"]);
    await visa("/ledighet?besked=g1", friska([ANSOKAN("g1", "m-1", "godkänd")]));
    const v = besked()!;
    expect(v.style.position).toBe("fixed");
    expect(v.style.top).toContain("env(safe-area-inset-top)");
    expect(v.className).toBe("tona-opacity");
    expect(v.innerHTML).not.toContain("animation"); // egna @keyframes/animationer: aldrig (tryckfeedbacken på knapparna är KNAPP:s egen transition)
  });

  it("nedre raden använder medSafeBotten och panelen underTopbar (jsdom släpper max()/env() i en padding-förkortning, så läs källan)", () => {
    const kalla = readFileSync(resolve(__dirname, "_components/BeskedVy.tsx"), "utf8");
    expect(kalla).toContain("medSafeBotten(");
    expect(kalla).toContain("underTopbar()");
    expect(kalla).not.toMatch(/top:\s*\d/); // inget naket top: med tal
  });

  it("träffytor minst 44 px: båda knapparna", async () => {
    h.rpc.ledighet_prick = nya(["n1"]);
    await visa("/ledighet?besked=n1", friska([ANSOKAN("n1", "m-1", "nekad")]));
    for (const b of Array.from(besked()!.querySelectorAll("button"))) {
      expect(parseInt((b as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });
});
