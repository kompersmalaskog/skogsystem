// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL: Lastbilen (skalet, steg 1 av omtaget). Vad som vaktas här — och som tsc/lint
 * inte ser:
 *  - HOOK-ORDNING: monteras genom övergången "roll läses → admin/förare" utan "Rendered more/fewer
 *    hooks" (React #310 kraschade Arbetsrapporten 2026-10-02 med allt grönt).
 *  - PENGATALET: fakturerbart-remsan sitter i den fasta rubriken, byter bara värde när PERIODEN byts
 *    (aldrig av flik), och visar aldrig 0 km när läsningen misslyckats.
 *  - Roller: förare ser varken remsa eller Fakturering, och skickar aldrig frågan.
 *  - Nu: läget i ord, saknade värden som "saknas i datan", läsfel som fel med "Försök igen".
 *  - Träffytor ≥ 44 px, och flik/period i adressen.
 * Datan är de riktiga åtta raderna i fakturaunderlag_flytt (prod 2026-10-14) och bilens läge 13 okt.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Rad = { id: string; km: number | null; status: string; fakturerad_tid: string | null; datum: string };
const UNDERLAG: Rad[] = [
  { id: "1", km: 34, status: "aktiv", fakturerad_tid: null, datum: "2026-08-25" },
  { id: "2", km: 40, status: "aktiv", fakturerad_tid: null, datum: "2026-08-28" },
  { id: "3", km: 31, status: "aktiv", fakturerad_tid: null, datum: "2026-08-31" },
  { id: "4", km: 47, status: "aktiv", fakturerad_tid: null, datum: "2026-09-01" },
  { id: "5", km: 49, status: "aktiv", fakturerad_tid: null, datum: "2026-09-01" },
  { id: "6", km: 44, status: "aktiv", fakturerad_tid: null, datum: "2026-09-25" },
  { id: "7", km: 36, status: "aktiv", fakturerad_tid: null, datum: "2026-10-05" },
  { id: "8", km: 53, status: "aktiv", fakturerad_tid: null, datum: "2026-10-06" },
];

const mock = vi.hoisted(() => ({
  medarbetare: null as any,
  loading: false,
  underlagFel: false,
  anrop: [] as string[],
  api: { status: 200, body: null as any },
}));

vi.mock("@/lib/CurrentMedarbetareContext", () => ({
  useCurrentMedarbetare: () => ({ medarbetare: mock.medarbetare, loading: mock.loading }),
}));

vi.mock("@/lib/supabase", () => {
  class Q {
    private filt: ((r: any) => boolean)[] = [];
    constructor(private tabell: string) {}
    select() { return this; }
    gte(k: string, v: string) { this.filt.push(r => r[k] >= v); return this; }
    lt(k: string, v: string) { this.filt.push(r => r[k] < v); return this; }
    order() { return this; }
    range(fran: number, till: number) {
      mock.anrop.push(this.tabell);
      if (mock.underlagFel) return Promise.resolve({ data: null, error: { message: "boom" } });
      const rader = (this.tabell === "fakturaunderlag_flytt" ? UNDERLAG : []).filter(r => this.filt.every(f => f(r)));
      return Promise.resolve({ data: rader.slice(fran, till + 1), error: null });
    }
  }
  return { supabase: { from: (t: string) => new Q(t) } };
});

vi.mock("@/components/LastbilKarta", () => ({ default: () => <div data-testid="karta">karta</div> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));

import LastbilVy from "./LastbilVy";

const FORARE = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const ADMIN = { ...FORARE, id: "m-a", namn: "Test Admin", roll: "admin" };

// Bilens läge 13 okt 07:06 UTC: stilla på LBC, 62 % diesel, 71 % AdBlue, 270 km, inga lampor, service saknas.
const LAGE = {
  ok: true, harData: true, namn: null,
  position: { lat: 56.459, lng: 14.702, tidpunkt: "2026-10-13T07:06:59Z", alder_min: 54 },
  tank: { diesel_pct: 62, adblue_pct: 71.2, rackvidd_km: 270 },
  halsa: { har_lampor: true, lampor: [], service_km: null, matare_km: 301128, motortimmar: null },
  spar_idag: [], runda_pagar: false, oppen_runda_id: null, oppen_runda: null,
  parkerad: { plats: "LBC", sedan: "2026-10-13T07:06:59Z" },
  rundor: [{ id: "30154836", starttid: "2026-10-12T09:30:00Z", sluttid: "2026-10-12T17:33:05Z", typ: "ovrig", antal_flytt: 0, matare_km: 294, bransle_l: 126.9, l_per_mil: 4.3 }],
  saknas: ["service"],
};

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  mock.medarbetare = ADMIN; mock.loading = false; mock.underlagFel = false; mock.anrop = [];
  mock.api = { status: 200, body: LAGE };
  (globalThis as any).fetch = vi.fn(async () => ({ status: mock.api.status, ok: mock.api.status === 200, json: async () => mock.api.body }));
  window.history.replaceState(null, "", "/lastbil");
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  konsol.mockRestore(); vi.useRealTimers();
});

const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent ?? "";
const knapp = (re: RegExp, inom: ParentNode = document) =>
  Array.from(inom.querySelectorAll("button, a")).find(b => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")) as HTMLElement;
const remsa = () => document.querySelector("[data-remsa]") as HTMLElement | null;
async function klicka(el: HTMLElement) { await act(async () => { el.click(); }); await flush(); }
async function montera() {
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<LastbilVy />); });
  await flush();
}
async function ritaOm() { await act(async () => { rot!.render(<LastbilVy />); }); await flush(); }
const hookFel = () => konsol.mock.calls.map(c => String(c[0])).filter(s => /hooks|Rendered (more|fewer)|#310|#300/i.test(s));

describe("hook-ordning", () => {
  it("roll läses → admin: ingen hook-krasch", async () => {
    mock.loading = true; mock.medarbetare = null;
    await montera();
    expect(text()).toContain("Läser");
    mock.loading = false; mock.medarbetare = ADMIN;
    await ritaOm();
    expect(hookFel()).toEqual([]);
    expect(remsa()).not.toBeNull();
  });
  it("roll läses → förare: ingen hook-krasch", async () => {
    mock.loading = true; mock.medarbetare = null;
    await montera();
    mock.loading = false; mock.medarbetare = FORARE;
    await ritaOm();
    expect(hookFel()).toEqual([]);
    expect(remsa()).toBeNull();
  });
});

describe("pengatalet: fakturerbart-remsan", () => {
  it("admin öppnar på Körningar; remsan visar månadens fakturerbara (36 + 53 = 89 km, 2 flyttar)", async () => {
    await montera();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Körningar");
    expect(remsa()!.textContent).toContain("Fakturerbart · oktober");
    expect(remsa()!.textContent).toContain("89 km");
    expect(remsa()!.textContent).toContain("2 flyttar");
    expect(remsa()!.textContent).toContain("2 hos faktureringen · 0 fakturerade");
  });

  it("ändras aldrig av flikbyte: samma plats, samma värde på Fakturering och Nu", async () => {
    await montera();
    const forsta = remsa()!.textContent;
    for (const f of [/Fakturering/, /Nu/, /Körningar/]) {
      await klicka(knapp(f, document.querySelector('[role="tablist"]')!));
      expect(remsa()!.textContent).toBe(forsta);
    }
  });

  it("ändras av perioden: förra månaden (140 km), augusti (105 km), året (334 km)", async () => {
    await montera();
    await klicka(knapp(/Förra månaden/));
    expect(remsa()!.textContent).toContain("Fakturerbart · september");
    expect(remsa()!.textContent).toContain("140 km");
    await klicka(knapp(/Förra månaden/));
    expect(remsa()!.textContent).toContain("105 km");
    await klicka(knapp(/^År$/));
    expect(remsa()!.textContent).toContain("Fakturerbart · 2026");
    expect(remsa()!.textContent).toContain("334 km");
    expect(remsa()!.textContent).toContain("8 flyttar");
  });

  it("juli är första månaden: Förra månaden är inaktiv där, och Nästa månad i innevarande månad", async () => {
    await montera();
    expect((knapp(/Nästa månad/) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 3; i++) await klicka(knapp(/Förra månaden/));
    expect(remsa()!.textContent).toContain("juli");
    expect((knapp(/Förra månaden/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("en månad utan flyttar visar 0 km som en LÄST nolla, inte som fel", async () => {
    await montera();
    for (let i = 0; i < 3; i++) await klicka(knapp(/Förra månaden/));   // juli
    expect(remsa()!.textContent).toContain("0 km");
    expect(remsa()!.textContent).not.toContain("Kunde inte läsa");
  });

  it("ett läsfel visar aldrig 0 km: texten säger det, och Försök igen läser om", async () => {
    mock.underlagFel = true;
    await montera();
    expect(remsa()!.textContent).toContain("Kunde inte läsa fakturerbart");
    expect(remsa()!.textContent).not.toMatch(/\b0 km/);
    expect(remsa()!.textContent).not.toContain("89 km");
    mock.underlagFel = false;
    await klicka(knapp(/Försök igen/, remsa()!));
    expect(remsa()!.textContent).toContain("89 km");
  });
});

describe("roller", () => {
  it("förare: öppnar på Nu, ingen remsa, ingen Fakturering-flik, och frågan om fakturering skickas aldrig", async () => {
    mock.medarbetare = FORARE;
    await montera();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Nu");
    expect(Array.from(document.querySelectorAll('[role="tab"]')).map(t => t.textContent)).toEqual(["Körningar", "Nu"]);
    expect(remsa()).toBeNull();
    expect(mock.anrop).toEqual([]);
  });

  it("en förare som följer en länk till Fakturering hamnar på Nu", async () => {
    mock.medarbetare = FORARE;
    window.history.replaceState(null, "", "/lastbil?flik=fakturering&per=2026-09");
    await montera();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Nu");
    expect(mock.anrop).toEqual([]);
  });
});

describe("adressen", () => {
  it("läser flik och månad ur länken (admin)", async () => {
    window.history.replaceState(null, "", "/lastbil?flik=fakturering&per=2026-09");
    await montera();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Fakturering");
    expect(remsa()!.textContent).toContain("september");
    expect(remsa()!.textContent).toContain("140 km");
  });
  it("skriver flik och period när man byter", async () => {
    await montera();
    expect(window.location.search).toBe("?flik=korningar&per=2026-10");
    await klicka(knapp(/^År$/));
    expect(window.location.search).toBe("?flik=korningar&per=2026");
    await klicka(knapp(/^Månad$/));
    expect(window.location.search).toBe("?flik=korningar&per=2026-10");
    await klicka(knapp(/^Nu$/, document.querySelector('[role="tablist"]')!));
    expect(window.location.search).toBe("?flik=nu&per=2026-10");
  });
  it("ogiltigt värde i länken = som om det inte stod där", async () => {
    window.history.replaceState(null, "", "/lastbil?flik=karta&per=imorgon");
    await montera();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Körningar");
    expect(remsa()!.textContent).toContain("oktober");
  });
});

describe("övergångsflikarna (byggs i steg 2 och 3)", () => {
  it("Körningar och Fakturering säger var innehållet finns tills vidare och länkar dit — inga påhittade siffror", async () => {
    await montera();
    expect(text()).toContain("Tills dess finns de i Flyttloggen");
    expect(document.querySelector('a[href="/maskinflytt/sammanstallning"]')).not.toBeNull();
    await klicka(knapp(/Fakturering/, document.querySelector('[role="tablist"]')!));
    expect(text()).toContain("Faktureringskvittot flyttar hit");
  });
});

describe("Nu", () => {
  const nuFlik = async () => { mock.medarbetare = FORARE; await montera(); };

  it("parkerad: läget i ord, tank, inga varningar, service och mätare saknas/finns, senaste körning", async () => {
    await nuFlik();
    expect(text()).toContain("Parkerad på LBC");
    expect(text()).toContain("Diesel 62 % · AdBlue 71 %");
    expect(text()).toContain("Räckvidd 270 km");
    expect(text()).toContain("Inga varningar");
    expect(text()).toContain("Service: saknas i datan");
    expect(text()).toContain("301 128 km");
    expect(text()).toContain("mån 12 okt · Övrig körning");
    expect(text()).toContain("294 km");
    expect(text()).toContain("127 l");
  });

  it("högst tre block i viloläge: läge, ett kort med tank och varningar, ett kort med senaste körning", async () => {
    await nuFlik();
    expect(document.querySelectorAll("section").length).toBe(3);
  });

  it("låg diesel tar över rubriken, i ord, och läget står kvar under", async () => {
    mock.api.body = { ...LAGE, tank: { diesel_pct: 14, adblue_pct: 71.2, rackvidd_km: 95 } };
    await nuFlik();
    expect(document.querySelector("h1")!.textContent).toBe("Diesel 14 % – tanka nu");
    expect(text()).toContain("Parkerad på LBC");
  });

  it("läsfel: säger det och erbjuder Försök igen, och visar inga tal", async () => {
    mock.api = { status: 500, body: null };
    await nuFlik();
    expect(text()).toContain("Kunde inte läsa lastbilsdata just nu.");
    expect(text()).not.toContain("Diesel");
    mock.api = { status: 200, body: LAGE };
    await klicka(knapp(/Försök igen/));
    expect(text()).toContain("Parkerad på LBC");
  });

  it("utloggad säger det", async () => {
    mock.api = { status: 401, body: null };
    await nuFlik();
    expect(text()).toContain("Du är utloggad");
  });

  it("ingen data från bilen än: förklarar varför och vad som fyller vyn", async () => {
    mock.api.body = { ...LAGE, harData: false };
    await nuFlik();
    expect(text()).toContain("Ingen data från lastbilen än.");
    expect(text()).toContain("dyker den upp här");
  });

  it("Visa var den står öppnar ett ark med kartan, och Avbryt stänger det", async () => {
    await nuFlik();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await klicka(knapp(/Visa var den står/));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="karta"]')).not.toBeNull();
    await klicka(knapp(/Avbryt/));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("träffytor", () => {
  const px = (v: string) => (v ? parseFloat(v) : 0);
  it("allt tryckbart är minst 44 px högt", async () => {
    await montera();
    const forLitet = () => Array.from(document.querySelectorAll("button, a"))
      .filter(e => Math.max(px((e as HTMLElement).style.minHeight), px((e as HTMLElement).style.height)) < 44)
      .map(e => `${e.tagName} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}"`);
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/^Nu$/, document.querySelector('[role="tablist"]')!));
    await klicka(knapp(/Visa var den står/));
    expect(forLitet()).toEqual([]);
  });
});
