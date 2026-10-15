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

// Riktiga rader ur fakturaunderlag_flytt (prod 2026-10-15): åtta flyttar, alla aktiva och ännu inte fakturerade.
type Rad = {
  id: string; km: number | null; status: string; fakturerad_tid: string | null; datum: string; kund: string | null; maskin: string | null;
  fran_objekt_id: string | null; fran_plats_id: string | null; till_objekt_id: string | null; till_plats_id: string | null;
  struken_tid: string | null; struken_anledning: string | null; godkand_tid: string | null; godkand_av: string | null;
};
// Raderna som fanns när godkännandet infördes är backfill-godkända med skapad_tid (migration 20261015150000).
const BACKFILL = { godkand_tid: "2026-09-17T13:27:49Z", godkand_av: "backfill 2026-10-15" };
const U = (id: string, datum: string, km: number | null, maskin: string, fran: string | null, till: string | null, o: Partial<Rad> = {}): Rad => ({
  id, km, status: "aktiv", fakturerad_tid: null, datum, kund: null, maskin, fran_objekt_id: fran, fran_plats_id: null, till_objekt_id: till, till_plats_id: null,
  struken_tid: null, struken_anledning: null, ...BACKFILL, ...o,
});
// OGODKÄND flytt (en NY rad från triggern): godkand_tid/av NULL.
const OGODKAND = { godkand_tid: null, godkand_av: null };
const nyaUnderlag = (): Rad[] => [
  U("u1", "2026-08-25", 34, "PONS20SDJAA270231", "o-ulfsnas", "o-dockemala"),
  U("u2", "2026-08-28", 40, "A130743", null, "o-tjuvon"),
  U("u3", "2026-08-31", 31, "JD810E", null, "o-dockemala"),
  U("u4", "2026-09-01", 49, "A130743", null, "o-stankelsmala"),
  U("u5", "2026-09-01", 47, "PONS20SDJAA270231", "o-stankelsmala", "o-akelius"),
  U("u6", "2026-09-25", 44, "A030353", "o-kampamala", "o-brokamala"),
  U("u7", "2026-10-05", 36, "A130743", "o-halaback", "o-ostra"),
  U("u8", "2026-10-06", 53, "PONS20SDJAA270231", "o-vallust", "o-bagskytte"),
];

// Riktiga rader ur flyttdag (prod 2026-10-15, EFTER rättningen av dubbelrundorna).
const R = (id: string, s: string, e: string | null, o: Record<string, unknown> = {}) => ({
  id, forare: null, starttid: s, sluttid: e, status: "ovrig_korning", auto_avslutad_av: "cron",
  tillkorning_km: null, hem_km: null, hemresa_matt: true, total_km: null, matare_km: null, bransle_l: null, ...o,
});
const MARTIN = { forare: "Martin Lindqvist", status: "avslutad", auto_avslutad_av: null };
const FLYTTDAG = [
  R("30154836", "2026-10-12T09:30:00Z", "2026-10-12T17:33:05Z", { matare_km: 294, bransle_l: 126.9, hem_km: 9.6 }),
  R("3e823d15", "2026-10-06T13:52:17Z", "2026-10-06T17:55:11Z", { ...MARTIN, matare_km: 163.2, total_km: 165.2, bransle_l: 67.3, tillkorning_km: 41, hem_km: 71.2 }),
  R("3bfa4d19", "2026-10-05T03:47:08Z", "2026-10-05T07:57:47Z", { ...MARTIN, matare_km: 132.6, total_km: 75.5, bransle_l: 49.2, tillkorning_km: 0, hem_km: 39.5 }),
  R("b9c1d038", "2026-10-01T12:23:45Z", "2026-10-01T13:56:14Z", { matare_km: 47.5, bransle_l: 18.4 }),
  R("34cddb13", "2026-10-01T05:22:12Z", "2026-10-01T11:42:24Z", { matare_km: 180.1, bransle_l: 87.6 }),
  // 20 augusti: Martins flytt, och fortsättningen som cron:en öppnade när "Framme" trycktes med bilen ute.
  R("ff5ec997", "2026-08-20T04:04:46Z", "2026-08-20T05:44:30Z", { ...MARTIN, matare_km: 41.5, bransle_l: 14, tillkorning_km: 16, hem_km: 18.3 }),
  R("c454bda3", "2026-08-20T05:44:30Z", "2026-08-20T08:30:54Z", { matare_km: 66.5, bransle_l: 31.3 }),
  // 12 augusti: en runda som startades på basen och aldrig rörde sig.
  R("514d88e1", "2026-08-12T18:33:09Z", "2026-08-12T18:33:09Z", { forare: "Joacim Ringberg", matare_km: 0, bransle_l: null }),
  // juli: ingen diesel loggad, och en runda helt utan km.
  R("995673b4", "2026-07-24T12:19:22Z", "2026-07-24T14:35:24Z", { ...MARTIN, matare_km: 91.3, total_km: 71 }),
  R("73aa1302", "2026-07-30T09:43:49Z", "2026-07-30T10:58:06Z", { ...MARTIN, matare_km: 45.1, total_km: 58 }),
  R("8e99c732", "2026-07-29T05:00:03Z", "2026-07-29T06:37:39Z", { ...MARTIN, total_km: 54 }),
  R("b7243278", "2026-07-31T12:59:05Z", "2026-07-31T14:57:53Z", { forare: "Martin Lindqvist", status: "avbruten", auto_avslutad_av: null, tillkorning_km: 32 }),
];
const BEN = (id: string, runda: string, maskin: string, fran: string | null, till: string, km: number, min: number, fakt: boolean, o: Record<string, unknown> = {}) => ({
  id, flyttdag_id: runda, maskin_id: maskin, extern_maskin: null, fran_objekt_id: fran, till_objekt_id: till, fran_plats_id: null, till_plats_id: null,
  flytt_km: km, mellankorning_km: null, tid_flytt_min: min, fakturerbar: fakt, flytt_typ: "produktion", kund: null, sluttid: "x", avbruten: false, ...o,
});
const MASKIN_FLYTT = [
  BEN("b1", "3e823d15", "PONS20SDJAA270231", "o-vallust", "o-bagskytte", 53, 75, true),
  BEN("b2", "3bfa4d19", "A130743", "o-halaback", "o-ostra", 36, 120, true),
  BEN("b3", "ff5ec997", "A030353", "o-jatsbygd", "o-raveboda", 10, 32, false),
  BEN("b4", "995673b4", "PONS20SDJAA270231", "o-brokamala", "o-tjuvon", 20, 92, false),
  BEN("b5", "3bfa4d19", "A130743", null, "o-ostra", 5, 5, false, { avbruten: true }),   // avbruten: ska aldrig synas
];
const DIM_MASKIN = [
  { maskin_id: "PONS20SDJAA270231", visningsnamn: "Giant", modell: "Scorpion" }, { maskin_id: "A130743", visningsnamn: "Elefant 26", modell: "x" },
  { maskin_id: "A030353", visningsnamn: "Wisent", modell: "y" }, { maskin_id: "JD810E", visningsnamn: "810E", modell: "z" },
];
const OBJEKT = [
  { id: "o-vallust", namn: "Vällust RP M-R -25" }, { id: "o-bagskytte", namn: "Bågskyttebanan RP J-Hus- 25" }, { id: "o-halaback", namn: "Hålabäck au 2025" },
  { id: "o-ostra", namn: "Östra-Hoka 1:7 A-C -25" }, { id: "o-jatsbygd", namn: "Jätsbygd au 2026" }, { id: "o-raveboda", namn: "Räveboda AU 2026" },
  { id: "o-brokamala", namn: "Brokamåla 1:5 V" }, { id: "o-tjuvon", namn: "Tjuvön AU 2026" },
  { id: "o-ulfsnas", namn: "Ulfsnäs AU 2026" }, { id: "o-dockemala", namn: "Dockemåla AU 2026" }, { id: "o-stankelsmala", namn: "Stänkelsmåla 2025" },
  { id: "o-akelius", namn: "400763 Akelius Tåget SA" }, { id: "o-kampamala", namn: "Kämpamåla AU 2026" },
];

const mock = vi.hoisted(() => ({
  medarbetare: null as any,
  loading: false,
  underlagFel: false,
  namnFel: false,
  extraUnderlag: [] as any[],
  underlag: [] as any[],
  skrivningar: [] as { tabell: string; varden: any }[],
  skrivNoll: false,
  skrivFel: false,
  vantarFel: false,
  rundorFel: false,
  extraRundor: [] as any[],
  patchRundor: {} as Record<string, Record<string, unknown>>,
  anrop: [] as string[],
  api: { status: 200, body: null as any },
  spar: { status: 200, body: null as any },
}));

vi.mock("@/lib/CurrentMedarbetareContext", () => ({
  useCurrentMedarbetare: () => ({ medarbetare: mock.medarbetare, loading: mock.loading }),
}));

vi.mock("@/lib/supabase", () => {
  const tabeller = (): Record<string, any[]> => ({
    fakturaunderlag_flytt: [...mock.underlag, ...mock.extraUnderlag],
    flyttdag: [...FLYTTDAG, ...mock.extraRundor].map(r => ({ ...r, ...(mock.patchRundor[r.id] ?? {}) })),
    maskin_flytt: MASKIN_FLYTT, dim_maskin: DIM_MASKIN, objekt: OBJEKT, flyttplats: [],
  });
  const tid = (v: unknown) => Date.parse(String(v));
  class Q {
    private filt: ((r: any) => boolean)[] = [];
    private uppd: Record<string, unknown> | null = null;
    private filtreraId: string[] = [];
    constructor(private tabell: string) {}
    select() { return this; }
    update(v: Record<string, unknown>) { this.uppd = v; return this; }
    eq(k: string, v: unknown) { this.filt.push(r => r[k] === v); return this; }
    is(k: string, v: unknown) { this.filt.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    not(k: string, _o: string, v: unknown) { this.filt.push(r => (v === null ? r[k] != null : r[k] !== v)); return this; }
    gte(k: string, v: string) { this.filt.push(r => tid(r[k]) >= tid(v)); return this; }
    lt(k: string, v: string) { this.filt.push(r => tid(r[k]) < tid(v)); return this; }
    in(k: string, lista: string[]) { this.filt.push(r => lista.includes(r[k])); return this; }
    order() { return this; }
    private skriv() {
      mock.anrop.push(this.tabell + ":skriv");
      mock.skrivningar.push({ tabell: this.tabell, varden: this.uppd });
      if (mock.skrivFel) return { data: null, error: { message: "boom" } };
      if (mock.skrivNoll) return { data: [], error: null };
      const traffade = tabeller()[this.tabell].filter(r => this.filt.every(f => f(r)));
      for (const r of traffade) Object.assign(r, this.uppd);      // raderna delas med nästa läsning
      return { data: traffade.map(r => ({ id: r.id })), error: null };
    }
    private kor(fran = 0, till = Infinity) {
      if (this.uppd) return this.skriv();
      mock.anrop.push(this.tabell);
      if (this.tabell === "fakturaunderlag_flytt" && mock.vantarFel && this.filt.length >= 3) return { data: null, error: { message: "boom" } };
      if (this.tabell === "fakturaunderlag_flytt" && mock.underlagFel) return { data: null, error: { message: "boom" } };
      if (this.tabell === "dim_maskin" && mock.namnFel) return { data: null, error: { message: "boom" } };
      if (["flyttdag", "maskin_flytt"].includes(this.tabell) && mock.rundorFel) return { data: null, error: { message: "boom" } };
      return { data: tabeller()[this.tabell].filter(r => this.filt.every(f => f(r))).slice(fran, till === Infinity ? undefined : till + 1), error: null };
    }
    range(fran: number, till: number) { return Promise.resolve(this.kor(fran, till)); }
    then(res: any, rej: any) { return Promise.resolve(this.kor()).then(res, rej); }
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
  mock.medarbetare = ADMIN; mock.loading = false; mock.underlagFel = false; mock.namnFel = false; mock.extraUnderlag = []; mock.anrop = [];
  mock.underlag = nyaUnderlag(); mock.skrivningar = []; mock.skrivNoll = false; mock.skrivFel = false; mock.vantarFel = false;
  mock.api = { status: 200, body: LAGE };
  mock.rundorFel = false; mock.extraRundor = []; mock.patchRundor = {};
  mock.spar = { status: 200, body: { ok: true, spar: [{ lat: 56.4, lng: 14.7 }, { lat: 56.5, lng: 14.8 }], segment: [], nagonOmatchad: false, matchningPa: false } };
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const a = String(url).startsWith("/api/lastbil/spar") ? mock.spar : mock.api;
    return { status: a.status, ok: a.status === 200, json: async () => a.body };
  });
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

const rubrikTexter = () => Array.from(document.querySelectorAll("section[aria-label] > div")).map(d => d.textContent ?? "").filter(t => /·\s\d+$/.test(t));
/** Felrutan i Fakturering-fliken (inte påminnelsens eget fel): rutan med Försök igen runt texten. */
const felIFliken = (re: RegExp) => (Array.from(document.querySelectorAll('[role="alert"]')).find(a => re.test(a.textContent ?? "")) as HTMLElement).parentElement!;
const underlagRad = (id: string) => document.querySelector(`[data-underlag="${id}"]`) as HTMLElement | null;
async function oppnaFakturering(per = "2026-10") {
  window.history.replaceState(null, "", `/lastbil?flik=fakturering&per=${per}`);
  await montera();
}

describe("Fakturering: kvittot, flyttat hit från Flyttloggen (steg 3)", () => {
  it("oktober: en grupp 'Hos faktureringen', nyast först, med maskin, sträcka och datum", async () => {
    await oppnaFakturering();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Fakturering");
    expect(rubrikTexter()).toEqual(["Hos faktureringen · 2"]);
    const rader = Array.from(document.querySelectorAll("[data-underlag]")).map(r => (r as HTMLElement).dataset.underlag);
    expect(rader).toEqual(["u8", "u7"]);
    expect(underlagRad("u8")!.textContent).toContain("Giant");
    expect(underlagRad("u8")!.textContent).toContain("Vällust RP M-R -25 → Bågskyttebanan RP J-Hus- 25");
    expect(underlagRad("u8")!.textContent).toContain("tis 6 okt");
    expect(underlagRad("u8")!.textContent).toContain("53 km");
    expect(underlagRad("u7")!.textContent).toContain("Elefant 26");
    expect(underlagRad("u7")!.textContent).toContain("Hålabäck au 2025 → Östra-Hoka 1:7 A-C -25");
  });

  it("summan i remsan är summan av raderna som visas (36 + 53 = 89) — och kvittot har inget eget stort tal", async () => {
    await oppnaFakturering();
    const radKm = Array.from(document.querySelectorAll("[data-underlag]")).map(r => Number(/(\d+) km/.exec(r.textContent ?? "")![1]));
    expect(radKm.reduce((a, b) => a + b, 0)).toBe(89);
    expect(remsa()!.textContent).toContain("89 km");
    expect(document.querySelectorAll("[data-remsa]").length).toBe(1);
    expect(text()).toContain("En flytt som avslutas fakturerbar hamnar under Att godkänna");
  });

  it("en flytt utan startobjekt säger 'okänd plats' (verkliga raden 28 aug), aldrig tomt", async () => {
    await oppnaFakturering("2026-08");
    expect(underlagRad("u2")!.textContent).toContain("okänd plats → Tjuvön AU 2026");
    expect(rubrikTexter()).toEqual(["Hos faktureringen · 3"]);
  });

  it("fakturerade och strukna får egna grupper efter 'hos'; en struken flytt räknas inte i summan", async () => {
    mock.extraUnderlag = [
      U("uf", "2026-10-02", 40, "A130743", "o-ostra", "o-vallust", { fakturerad_tid: "2026-10-09T08:00:00Z" }),
      U("us", "2026-10-03", 60, "PONS20SDJAA270231", "o-vallust", "o-ostra", { status: "struken", struken_tid: "2026-10-08T10:00:00Z", struken_anledning: "dubblett" }),
    ];
    await oppnaFakturering();
    expect(rubrikTexter()).toEqual(["Hos faktureringen · 2", "Fakturerade · 1", "Strukna · 1"]);
    expect(Array.from(document.querySelectorAll("[data-underlag]")).map(r => (r as HTMLElement).dataset.underlag)).toEqual(["u8", "u7", "uf", "us"]);
    expect(underlagRad("uf")!.textContent).toContain("Fakturerad fre 9 okt");
    expect(underlagRad("us")!.textContent).toContain("Struken tor 8 okt · dubblett");
    expect((underlagRad("us")!.querySelector('[style*="line-through"]'))).not.toBeNull();
    // remsan: 36 + 53 + 40 = 129 (struken 60 räknas aldrig)
    expect(remsa()!.textContent).toContain("129 km");
    expect(remsa()!.textContent).toContain("1 strukna");
  });

  it("en flytt utan km säger 'km saknas i datan' — aldrig 0 km", async () => {
    mock.extraUnderlag = [U("uk", "2026-10-04", null, "A130743", "o-ostra", "o-vallust")];
    await oppnaFakturering();
    expect(underlagRad("uk")!.textContent).toContain("km saknas i datan");
    expect(underlagRad("uk")!.textContent).not.toMatch(/\b0 km/);
    expect(remsa()!.textContent).toContain("(1 utan km)");
  });

  it("år: alla åtta flyttar, grupperade, och remsan står kvar (334 km)", async () => {
    await oppnaFakturering("2026");
    expect(rubrikTexter()).toEqual(["Hos faktureringen · 8"]);
    expect(document.querySelectorAll("[data-underlag]").length).toBe(8);
    expect(remsa()!.textContent).toContain("334 km");
  });

  it("en månad utan fakturerbara flyttar säger varför och att läsningen lyckades (juli)", async () => {
    await oppnaFakturering("2026-07");
    expect(document.querySelectorAll("[data-underlag]").length).toBe(0);
    expect(text()).toContain("Inga fakturerbara flyttar i juli.");
    expect(text()).toContain("Underlaget lästes utan fel.");
    expect(text()).toContain("minst 3 mil");
  });

  it("läsfel: fliken säger det och 'Försök igen' läser om (aldrig en tom lista)", async () => {
    mock.underlagFel = true;
    await oppnaFakturering();
    expect(text()).toContain("Kunde inte läsa fakturaunderlaget just nu.");
    expect(document.querySelectorAll("[data-underlag]").length).toBe(0);
    expect(text()).not.toContain("Inga fakturerbara flyttar");
    mock.underlagFel = false;
    const flikInnehall = knapp(/Försök igen/, felIFliken(/fakturaunderlaget/));
    await klicka(flikInnehall);
    expect(document.querySelectorAll("[data-underlag]").length).toBe(2);
  });

  it("namnen går inte att läsa: hela fliken säger det i stället för 'okänd plats' på varje rad", async () => {
    mock.namnFel = true;
    await oppnaFakturering();
    expect(text()).toContain("Kunde inte läsa maskin- och platsnamnen just nu.");
    expect(document.querySelectorAll("[data-underlag]").length).toBe(0);
    expect(text()).not.toContain("okänd plats");
    mock.namnFel = false;
    await klicka(knapp(/Försök igen/, felIFliken(/maskin- och platsnamnen/)));
    expect(document.querySelectorAll("[data-underlag]").length).toBe(2);
  });

  it("förare kommer aldrig hit och frågan skickas aldrig (kvittot är ekonomidata)", async () => {
    mock.medarbetare = FORARE;
    await oppnaFakturering();
    expect(document.querySelectorAll("[data-underlag]").length).toBe(0);
    expect(mock.anrop).not.toContain("fakturaunderlag_flytt");
  });

  it("ingen länk till Flyttloggen längre, och ingen hook-krasch", async () => {
    await oppnaFakturering();
    expect(document.querySelector('a[href="/maskinflytt/sammanstallning"]')).toBeNull();
    expect(hookFel()).toEqual([]);
  });
});

const rundrad = (id: string) => document.querySelector(`[data-runda="${id}"]`) as HTMLElement | null;
const ark = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const flikRad = () => document.querySelector('[role="tablist"]')!;

describe("Körningar: månadskortet och rundlistan (oktober 2026, riktiga rader)", () => {
  it("månadskortet: ETT tal (818 km = 296 + 522), antal, diesel och l/mil", async () => {
    await montera();
    const kort = document.querySelector('section[aria-label="Månaden"]')!.textContent!;
    expect(kort).toContain("Körd i oktober");
    expect(kort).toContain("818 km");
    expect(kort).toContain("5 rundor · 349 l · 4,3 l/mil");
    expect(kort).toContain("Flyttar · 2 rundor");
    expect(kort).toContain("296 km");
    expect(kort).toContain("Övrig körning · 3 rundor");
    expect(kort).toContain("522 km");
  });

  it("summan är summan av raderna som visas", async () => {
    await montera();
    const km = Array.from(document.querySelectorAll("[data-runda]")).map(r => Number(/([\d\s\u00a0]+) km/.exec(r.textContent!.split("diesel")[0].replace(/^.*\d{2}:\d{2}/, ""))?.[1].replace(/\s|\u00a0/g, "") ?? NaN));
    expect(km.reduce((a, b) => a + b, 0)).toBe(818);
  });

  it("rundorna ligger per vecka, nyast först (v42, v41, v40) och varje rad är tryckbar", async () => {
    await montera();
    expect(Array.from(document.querySelectorAll("section[aria-label^='Vecka']")).map(x => x.getAttribute("aria-label"))).toEqual(["Vecka 42", "Vecka 41", "Vecka 40"]);
    expect(Array.from(document.querySelectorAll("[data-runda]")).map(r => r.tagName)).toEqual(Array(5).fill("BUTTON"));
    expect(rundrad("30154836")!.textContent).toContain("mån 12 okt · 11:30");
  });

  it("avbrutna flyttar syns aldrig, och flytten har sina maskiner och platser", async () => {
    await montera();
    await klicka(rundrad("3bfa4d19")!);
    expect(ark()!.textContent).toContain("Elefant 26");
    expect(ark()!.textContent).toContain("Hålabäck au 2025 → Östra-Hoka 1:7 A-C -25");
    expect(ark()!.textContent).toContain("36 km");
    // Den avbrutna flytten (5 km, också Elefant 26) räknas inte som ett ben: rubriken är EN maskin, inte "Elefant 26 + Elefant 26".
    expect(ark()!.textContent).not.toContain("Elefant 26 + Elefant 26");
    expect((ark()!.textContent!.match(/Hålabäck au 2025/g) ?? []).length).toBe(1);
  });

  it("ÖVRIG KÖRNING ÄR TRYCKBAR: knappen filtrerar till dem, och varje runda öppnar ett ark", async () => {
    await montera();
    await klicka(knapp(/Övrig körning · 3 rundor/));
    expect(Array.from(document.querySelectorAll("[data-runda]")).map(r => r.getAttribute("data-runda")).sort()).toEqual(["30154836", "34cddb13", "b9c1d038"]);
    expect(knapp(/Visa alla rundor/)).toBeTruthy();
    await klicka(rundrad("30154836")!);
    const a = ark()!.textContent!;
    expect(a).toContain("Övrig körning");
    expect(a).toContain("294 km");
    expect(a).toContain("Ingen registrerad");                      // förare
    expect(a).toContain("126,9 l · 4,3 l/mil");
    expect(a).toContain("Ingen flytt är kopplad till rundan och inget syfte är registrerat");
    await klicka(knapp(/Visa alla rundor/));
    expect(document.querySelectorAll("[data-runda]").length).toBe(5);
  });

  it("filtret är ett val som kan tas bort: ett tryck till på samma knapp visar alla igen", async () => {
    await montera();
    await klicka(knapp(/Flyttar · 2 rundor/));
    expect(document.querySelectorAll("[data-runda]").length).toBe(2);
    await klicka(knapp(/Flyttar · 2 rundor/));
    expect(document.querySelectorAll("[data-runda]").length).toBe(5);
  });

  it("arket för en flytt: benen, hem, mätare mot rutt, diesel, tid och kartan", async () => {
    await montera();
    await klicka(rundrad("3e823d15")!);
    const a = ark()!.textContent!;
    for (const del of ["Giant", "Vällust RP M-R -25 → Bågskyttebanan RP J-Hus- 25", "53 km", "Fakturerbar", "Till maskinen", "41 km", "Hem", "71,2 km",
      "Martin Lindqvist", "163,2 km", "165,2 km", "67,3 l · 4,1 l/mil", "4 h 3 min", "Kört spår"]) expect(a).toContain(del);
    expect(document.querySelector('[data-testid="karta"]')).not.toBeNull();
  });

  it("arket stänger med Avbryt, och bara ETT arkknapp-kors finns (ingen dubblett)", async () => {
    await montera();
    await klicka(rundrad("3e823d15")!);
    expect(Array.from(ark()!.querySelectorAll("button")).map(b => b.textContent)).toEqual(["Avbryt"]);
    await klicka(knapp(/Avbryt/));
    expect(ark()).toBeNull();
  });

  it("kartan: laddar och fel säger det, och en runda utan spårpunkter säger det", async () => {
    mock.spar = { status: 200, body: { ok: true, spar: [], segment: [], nagonOmatchad: false, matchningPa: false } };
    await montera();
    await klicka(rundrad("3e823d15")!);
    expect(ark()!.textContent).toContain("Inga spårpunkter finns för den här rundan.");
    expect(document.querySelector('[data-testid="karta"]')).toBeNull();
    await klicka(knapp(/Avbryt/));
    mock.spar = { status: 500, body: null };
    await klicka(rundrad("3e823d15")!);
    expect(ark()!.textContent).toContain("Kunde inte läsa spåret just nu.");
  });

  it("förare ser körningarna men aldrig pengaremsan, och skickar aldrig faktureringsfrågan", async () => {
    mock.medarbetare = FORARE;
    window.history.replaceState(null, "", "/lastbil?flik=korningar&per=2026-10");
    await montera();
    expect(text()).toContain("818 km");
    expect(remsa()).toBeNull();
    expect(mock.anrop).not.toContain("fakturaunderlag_flytt");
    expect(mock.anrop).toContain("flyttdag");
  });
});

describe("Körningar: kedjan, tom runda och aldrig 0 för saknade värden", () => {
  const tillAugusti = async () => { for (let i = 0; i < 2; i++) await klicka(knapp(/Förra månaden/)); };

  it("augusti efter rättningen: 20 aug är en kedja (fortsättning efter 07:44), ingen överlappar", async () => {
    await montera();
    await tillAugusti();
    expect(rundrad("c454bda3")!.textContent).toContain("Fortsättning efter 07:44");
    expect(rundrad("ff5ec997")!.textContent).not.toContain("Fortsättning");
    expect(text()).not.toContain("Överlappar");
    expect(text()).not.toContain("kan vara dubbelräknade");
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("109 km");     // 42 + 67, avrundade delar
  });

  it("en runda som startade på basen och aldrig rörde sig är en tom runda med 0 km, utan diesel", async () => {
    await montera();
    await tillAugusti();
    const r = rundrad("514d88e1")!.textContent!;
    expect(r).toContain("Tom runda");
    expect(r).toContain("Bilen rörde sig aldrig");
    expect(r).toContain("0 km");
    expect(r).toContain("diesel saknas");
    await klicka(rundrad("514d88e1")!);
    expect(ark()!.textContent).toContain("Rundan startades på basen och bilen rörde sig aldrig.");
    expect(document.querySelector('[data-testid="karta"]')).toBeNull();                                // ingen karta för en runda som inte rört sig
  });

  it("FÖRE rättningen (som prod såg ut): överlappande rundor och en trasig tid säger det, i stället för att räknas tyst", async () => {
    mock.patchRundor = {
      c454bda3: { starttid: "2026-08-20T04:04:46Z", matare_km: 108, bransle_l: 50.8 },
      "514d88e1": { sluttid: "2026-08-11T10:43:30Z", bransle_l: -0.1 },
    };
    await montera();
    await tillAugusti();
    expect(rundrad("c454bda3")!.textContent).toContain("Överlappar en annan runda");
    expect(rundrad("ff5ec997")!.textContent).toContain("Överlappar en annan runda");
    expect(rundrad("514d88e1")!.textContent).toContain("Sluttid före start, räknas inte");
    expect(text()).toContain("2 rundor överlappar i tid och kan vara dubbelräknade i summorna.");
    expect(text()).toContain("1 runda har sluttid före start och ingår inte i summorna.");
  });

  it("juli: diesel saknas i datan (aldrig 0 l), en AVBRUTEN runda visas men räknas inte, rutt som reserv märks", async () => {
    await montera();
    for (let i = 0; i < 3; i++) await klicka(knapp(/Förra månaden/));
    const kort = document.querySelector('section[aria-label="Månaden"]')!.textContent!;
    expect(kort).toContain("3 rundor · diesel saknas i datan");
    expect(kort).not.toMatch(/\b0 l\b/);
    expect(kort).toContain("190 km");                                   // 91 + 45 + 54 (rutt)
    expect(rundrad("8e99c732")!.textContent).toContain("54 km");
    expect(rundrad("b7243278")!.textContent).toContain("Avbruten, räknas inte");
    expect(rundrad("b7243278")!.textContent).toContain("–");
    expect(rundrad("b7243278")!.textContent).not.toMatch(/\b0 km/);
  });

  it("en pågående runda visas, räknas inte och säger det", async () => {
    mock.extraRundor = [R("pagar", "2026-10-14T04:00:00Z", null, { status: "pagaende", auto_skapad: true })];
    await montera();
    expect(rundrad("pagar")!.textContent).toContain("Pågår, räknas när den avslutats");
    expect(text()).toContain("1 runda pågår och räknas när de avslutats.");
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("818 km");
  });

  it("en månad utan rundor säger att körningarna lästes utan fel (inget falskt tomläge)", async () => {
    await montera();
    await klicka(knapp(/Förra månaden/));    // september: inga rundor i fixturen
    expect(text()).toContain("Inga rundor i den här månaden. Körningarna lästes utan fel.");
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("0 km");
  });
});

describe("Körningar: året, läsfel och CSV", () => {
  it("året: månaderna som rader (också en tom månad), och ett tryck går till månaden — remsan följer med", async () => {
    await montera();
    await klicka(knapp(/^År$/));
    const kort = document.querySelector('section[aria-label="Året"]')!.textContent!;
    expect(kort).toContain("Körd 2026");
    expect(kort).toContain("1\u00a0117 km");                           // 818 (okt) + 109 (aug) + 190 (jul)
    const manader = document.querySelector('section[aria-label="Månader"]')!;
    expect(Array.from(manader.querySelectorAll("button")).map(b => b.textContent!.match(/^(Oktober|September|Augusti|Juli)/)?.[0])).toEqual(["Oktober", "September", "Augusti", "Juli"]);
    expect(manader.textContent).toContain("Inga rundor");              // september
    await klicka(Array.from(manader.querySelectorAll("button")).find(b => b.textContent!.startsWith("Augusti")) as HTMLElement);
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i augusti");
    expect(remsa()!.textContent).toContain("augusti");
    expect(window.location.search).toBe("?flik=korningar&per=2026-08");
  });

  it("läsfel: säger det, visar inga tal, och Försök igen läser om — pengaremsan påverkas inte", async () => {
    mock.rundorFel = true;
    await montera();
    expect(text()).toContain("Kunde inte läsa körningarna just nu.");
    expect(document.querySelector("[data-runda]")).toBeNull();
    expect(text()).not.toContain("818 km");
    expect(remsa()!.textContent).toContain("89 km");
    mock.rundorFel = false;
    await klicka(knapp(/Försök igen/));
    expect(text()).toContain("818 km");
  });

  it("CSV: månadens rundor, med rubrikrad, svensk tid och citerade fält", async () => {
    const delar: string[] = [];
    const OrigBlob = globalThis.Blob;
    (globalThis as any).Blob = class extends OrigBlob { constructor(p: any, o: any) { super(p, o); delar.push(String(p[0])); } };
    (URL as any).createObjectURL = () => "blob:x"; (URL as any).revokeObjectURL = () => {};
    const klick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await montera();
      await klicka(knapp(/Exportera oktober 2026 som CSV/));
      expect(klick).toHaveBeenCalledTimes(1);
      expect(delar[0].startsWith("\uFEFFDatum;Start;Slut;Typ;")).toBe(true);
      expect(delar[0].split("\r\n")).toHaveLength(1 + 5);
      expect(delar[0]).toContain("2026-10-12;11:30;19:33;Övrig körning");
      expect(delar[0]).toContain("2026-10-06;15:52;19:55;Flytt;Giant;Vällust RP M-R -25;Bågskyttebanan RP J-Hus- 25;Martin Lindqvist;163.2;165.2;67.3;4.1;53");
    } finally { klick.mockRestore(); (globalThis as any).Blob = OrigBlob; }
  });
});

// ── Godkänna flyttar: Arbetsrapportens bekräfta-modell ─────────────────────────────────────────────
const OG_OKT = () => U("og1", "2026-10-08", 62, "A130743", "o-ostra", "o-vallust", OGODKAND);   // en NY flytt i oktober
const OG_SEP = () => U("og2", "2026-09-29", 41, "JD810E", "o-tjuvon", "o-dockemala", OGODKAND);  // och en som väntat sedan september
async function skrivText(el: HTMLTextAreaElement, v: string) {
  const sat = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => { sat.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const rubriker = () => Array.from(document.querySelectorAll("section[aria-label] > div")).map(d => d.textContent ?? "").filter(t => /·\s\d+$/.test(t));
const vantarRad = () => document.querySelector("[data-vantar]") as HTMLElement | null;
const godkannKnapp = (id: string) => knapp(/^Godkänn$/, underlagRad(id)!);

describe("Godkänna flyttar: en ny flytt väntar tills admin trycker Godkänn", () => {
  it("ogodkända ligger överst som 'Att godkänna' och ingår INTE i pengatalet", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    expect(rubriker()).toEqual(["Att godkänna · 1", "Hos faktureringen · 2"]);
    const rad = underlagRad("og1")!;
    expect(rad.dataset.status).toBe("att_godkanna");
    expect(rad.textContent).toContain("Elefant 26");
    expect(rad.textContent).toContain("Östra-Hoka 1:7 A-C -25 → Vällust RP M-R -25");
    expect(rad.textContent).toContain("62 km");
    expect(godkannKnapp("og1")).toBeDefined();
    // pengatalet: bara de två godkända oktoberflyttarna (36 + 53); den väntande flytten räknas inte
    expect(remsa()!.textContent).toContain("89 km");
    expect(remsa()!.textContent).toContain("2 flyttar");
    expect(remsa()!.textContent).not.toContain("151 km");
  });

  it("ETT tryck godkänner: raden flyttar ner till 'Hos faktureringen' och pengatalet följer med — utan att blinka till 'Läser'", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    const sett: string[] = [];
    const ob = new MutationObserver(() => { const r = remsa(); if (r) sett.push(r.textContent ?? ""); });
    ob.observe(remsa()!, { childList: true, subtree: true, characterData: true });
    await klicka(godkannKnapp("og1")!);
    ob.disconnect();
    expect(mock.skrivningar).toHaveLength(1);
    expect(mock.skrivningar[0].varden).toMatchObject({ godkand_av: "Test Admin" });
    expect(typeof mock.skrivningar[0].varden.godkand_tid).toBe("string");
    expect(rubriker()).toEqual(["Hos faktureringen · 3"]);
    expect(underlagRad("og1")!.dataset.status).toBe("hos");
    expect(remsa()!.textContent).toContain("151 km");          // 36 + 53 + 62
    expect(remsa()!.textContent).toContain("3 flyttar");
    expect(sett.some(t => /Läser/.test(t) || /^[^0-9]*–/.test(t.replace(/Fakturerbart · \w+/, "")))).toBe(false);   // pengatalet blinkade aldrig
    expect(document.querySelector("[data-kvitto]")!.textContent).toContain("Godkänd · Elefant 26");
  });

  it("Ångra i kvittot lägger flytten tillbaka under 'Att godkänna'", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    await klicka(godkannKnapp("og1")!);
    await klicka(knapp(/^Ångra$/, document.querySelector("[data-kvitto]") as HTMLElement));
    expect(mock.skrivningar[1].varden).toEqual({ godkand_tid: null, godkand_av: null });
    expect(rubriker()).toEqual(["Att godkänna · 1", "Hos faktureringen · 2"]);
    expect(remsa()!.textContent).toContain("89 km");
    expect(document.querySelector("[data-kvitto]")).toBeNull();
  });

  it("Stämmer något inte: tryck på raden → Stryk med anledning (obligatorisk), och flytten hamnar under Strukna", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    await klicka(knapp(/Visa flytten Elefant 26/, underlagRad("og1")!));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("Stryk flytten");
    const stryk = knapp(/^Stryk flytten$/, dialog)!;
    expect((stryk as HTMLButtonElement).disabled).toBe(true);   // ingen anledning → spärrat
    await skrivText(dialog.querySelector("textarea")!, "  dubblett av flytten 6 okt  ");
    expect((knapp(/^Stryk flytten$/, dialog) as HTMLButtonElement).disabled).toBe(false);
    await klicka(knapp(/^Stryk flytten$/, dialog)!);
    expect(mock.skrivningar).toHaveLength(1);
    expect(mock.skrivningar[0].varden).toMatchObject({ status: "struken", struken_av: "Test Admin", struken_anledning: "dubblett av flytten 6 okt" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(rubriker()).toEqual(["Hos faktureringen · 2", "Strukna · 1"]);
    expect(underlagRad("og1")!.textContent).toContain("dubblett av flytten 6 okt");
    expect(remsa()!.textContent).toContain("89 km");                  // en struken flytt räknas aldrig
    expect(vantarRad()).toBeNull();                                  // ...och väntar inte längre
  });

  it("en skrivning som inte nådde raden (noll rader) är ett FEL: ingen kvittens, raden ligger kvar", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.skrivNoll = true;
    await oppnaFakturering();
    await klicka(godkannKnapp("og1")!);
    expect(text()).toContain("Kunde inte godkänna flytten");
    expect(document.querySelector("[data-kvitto]")).toBeNull();
    expect(underlagRad("og1")!.dataset.status).toBe("att_godkanna");
  });

  it("ett skrivfel säger det och lämnar raden som den var", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.skrivFel = true;
    await oppnaFakturering();
    await klicka(godkannKnapp("og1")!);
    expect(text()).toContain("Kunde inte godkänna flytten: boom");
    expect(underlagRad("og1")!.dataset.status).toBe("att_godkanna");
  });
});

describe("Påminnelsen: 'N flyttar väntar på godkännande'", () => {
  it("syns bara när något väntar (aldrig '0 väntar')", async () => {
    await montera();
    expect(vantarRad()).toBeNull();
  });

  it("räknar över ALLA perioder och står på Körningar och Nu — inte i den fasta rubriken", async () => {
    mock.extraUnderlag = [OG_OKT(), OG_SEP()];
    await montera();                                      // Körningar, oktober
    expect(vantarRad()!.textContent).toContain("2 flyttar väntar på godkännande");
    expect(vantarRad()!.closest("[data-remsa]")).toBeNull();
    await klicka(knapp(/^Nu$/, document.querySelector('[role="tablist"]')!));
    expect(vantarRad()!.textContent).toContain("2 flyttar väntar på godkännande");
  });

  it("trycket leder rakt till 'Att godkänna' — i ÄLDSTA månaden som väntar (september)", async () => {
    mock.extraUnderlag = [OG_OKT(), OG_SEP()];
    await montera();
    await klicka(vantarRad()!);
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Fakturering");
    expect(remsa()!.textContent).toContain("september");
    expect(rubriker()[0]).toBe("Att godkänna · 1");
    expect(underlagRad("og2")).not.toBeNull();
    expect(window.location.search).toBe("?flik=fakturering&per=2026-09");
  });

  it("på Fakturering visas den bara för det som väntar i en ANNAN period (listan visar resten själv)", async () => {
    mock.extraUnderlag = [OG_OKT(), OG_SEP()];
    await oppnaFakturering();                              // oktober: og1 syns i listan, og2 ligger i september
    expect(vantarRad()!.textContent).toContain("1 flytt väntar på godkännande i en annan period");
    await klicka(vantarRad()!);                            // → september
    expect(remsa()!.textContent).toContain("september");
    expect(vantarRad()!.textContent).toContain("1 flytt väntar på godkännande i en annan period");   // nu ligger og1 utanför
  });

  it("när allt är godkänt försvinner raden (läses om tyst)", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    expect(vantarRad()).toBeNull();                        // allt väntande ligger i den visade perioden: listan räcker
    await klicka(knapp(/^Körningar$/, document.querySelector('[role="tablist"]')!));
    expect(vantarRad()!.textContent).toContain("1 flytt väntar på godkännande");
    await klicka(vantarRad()!);
    await klicka(godkannKnapp("og1")!);
    await klicka(knapp(/^Körningar$/, document.querySelector('[role="tablist"]')!));
    expect(vantarRad()).toBeNull();
  });

  it("läsfel är ett fel med Försök igen — aldrig 'inget väntar'", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.vantarFel = true;
    await montera();
    expect(vantarRad()!.textContent).toContain("Kunde inte läsa vad som väntar på godkännande");
    mock.vantarFel = false;
    await klicka(knapp(/Försök igen/, vantarRad()!));
    expect(vantarRad()!.textContent).toContain("1 flytt väntar på godkännande");
  });

  it("förare ser ingen påminnelse och skickar aldrig frågan (ekonomidata)", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.medarbetare = FORARE;
    await montera();
    expect(vantarRad()).toBeNull();
    expect(mock.anrop.filter(a => a.startsWith("fakturaunderlag_flytt"))).toEqual([]);
  });
});

describe("Körningar: länken till Flyttplatser (bodde i Flyttloggen)", () => {
  it("finns på Körningar, månad och år, och går till /maskinflytt/platser", async () => {
    await montera();
    expect(document.querySelector('a[href="/maskinflytt/platser"]')!.textContent).toContain("Flyttplatser");
    await klicka(knapp(/^År$/));
    expect(document.querySelector('a[href="/maskinflytt/platser"]')).not.toBeNull();
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

  it("Senaste körning är tryckbar och öppnar arket för just den rundan (läst med sina grannar i tiden)", async () => {
    await nuFlik();
    const rad = document.querySelector('section[aria-label="Senaste körning"] button') as HTMLElement;
    expect(rad).toBeTruthy();
    await klicka(rad);
    expect(ark()!.textContent).toContain("Övrig körning");
    expect(ark()!.textContent).toContain("294 km");
    expect(ark()!.textContent).toContain("Ingen registrerad");
  });

  it("om rundan inte går att läsa säger arket det och erbjuder Försök igen", async () => {
    await nuFlik();
    mock.rundorFel = true;
    await klicka(document.querySelector('section[aria-label="Senaste körning"] button') as HTMLElement);
    expect(ark()!.textContent).toContain("Kunde inte läsa rundan just nu.");
    mock.rundorFel = false;
    await klicka(knapp(/Försök igen/, ark()!));
    expect(ark()!.textContent).toContain("294 km");
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
