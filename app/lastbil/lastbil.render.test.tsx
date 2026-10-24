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
  km_original: number | null; kund_original: string | null; redigerad_tid: string | null; redigerad_av: string | null;
  flytt_id?: string;
};
// Raderna som fanns när godkännandet infördes är backfill-godkända med skapad_tid (migration 20261015151948).
const BACKFILL = { godkand_tid: "2026-09-17T13:27:49Z", godkand_av: "backfill 2026-10-15" };
const U = (id: string, datum: string, km: number | null, maskin: string, fran: string | null, till: string | null, o: Partial<Rad> = {}): Rad => ({
  id, km, status: "aktiv", fakturerad_tid: null, datum, kund: null, maskin, fran_objekt_id: fran, fran_plats_id: null, till_objekt_id: till, till_plats_id: null,
  struken_tid: null, struken_anledning: null, km_original: null, kund_original: null, redigerad_tid: null, redigerad_av: null, ...BACKFILL, ...o,
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
  U("u7", "2026-10-05", 36, "A130743", "o-halaback", "o-ostra", { flytt_id: "b2" }),
  U("u8", "2026-10-06", 53, "PONS20SDJAA270231", "o-vallust", "o-bagskytte", { flytt_id: "b1" }),
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
  flytt_km: km, mellankorning_km: null, tid_flytt_min: min, fakturerbar: fakt, flytt_typ: "produktion", kund: null, sluttid: "x", avbruten: false,
  fran_lat: null, fran_lng: null, till_lat: null, till_lng: null, redigerad_tid: null, redigerad_av: null, starttid: null, koord_kalla: null, ...o,
});
const MASKIN_FLYTT = [
  BEN("b1", "3e823d15", "PONS20SDJAA270231", "o-vallust", "o-bagskytte", 53, 75, true, { till_lat: 56.41, till_lng: 14.61, fran_lat: 56.40, fran_lng: 14.60 }),
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
  { id: "o-vallust", namn: "Vällust RP M-R -25", lat: 56.40, lng: 14.60 }, { id: "o-bagskytte", namn: "Bågskyttebanan RP J-Hus- 25", lat: 56.41, lng: 14.61 }, { id: "o-halaback", namn: "Hålabäck au 2025" },
  { id: "o-ostra", namn: "Östra-Hoka 1:7 A-C -25" }, { id: "o-jatsbygd", namn: "Jätsbygd au 2026" }, { id: "o-raveboda", namn: "Räveboda AU 2026" },
  { id: "o-brokamala", namn: "Brokamåla 1:5 V" }, { id: "o-tjuvon", namn: "Tjuvön AU 2026", lat: 57.5, lng: 15.5 },
  { id: "o-ulfsnas", namn: "Ulfsnäs AU 2026" }, { id: "o-dockemala", namn: "Dockemåla AU 2026" }, { id: "o-stankelsmala", namn: "Stänkelsmåla 2025" },
  { id: "o-akelius", namn: "400763 Akelius Tåget SA" }, { id: "o-kampamala", namn: "Kämpamåla AU 2026" },
  // Kundförslaget: bolaget, markägaren när bolaget är Privat, och en trakt utan bolag.
  { id: "o-kvida", namn: "Vida-trakt AU", bolag: "Vida", markagare: "Åke Svensson" }, { id: "o-kenergi", namn: "Energi-trakt", bolag: "Vida Energi", markagare: "Bo Ek" },
  { id: "o-kprivat", namn: "Privat-trakt", bolag: "Privat", markagare: "Lisa Andersson" }, { id: "o-kutan", namn: "Utan-bolag-trakt", bolag: null, markagare: "Okänd Ägare" },
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
  manuellKolumnSaknas: false,
  rundorFel: false,
  maskinerFel: false,
  viktRader: [] as any[],
  viktFel: false,
  extraRundor: [] as any[],
  extraObjekt: [] as any[],
  patchRundor: {} as Record<string, Record<string, unknown>>,
  anrop: [] as string[],
  flyttar: [] as any[],
  lass: [] as any[],
  lassFel: false,
  rattningar: [] as any[],
  rpc: [] as { namn: string; args: any }[],
  rpcHandler: null as null | ((namn: string, args: any) => { data: any; error: any }),
  api: { status: 200, body: null as any },
  spar: { status: 200, body: null as any },
}));

// Hämta-flödet har sin egen renderingstest (_components/hamta/HamtaFlode.render.test.tsx); här testas bara hur vyn öppnar och stänger det.
vi.mock("./_components/hamta/HamtaFlode", () => ({
  default: ({ onAvsluta }: { onAvsluta: (t: string) => void }) => (
    <div><h1>Vilken maskin hämtar du?</h1><button type="button" onClick={() => onAvsluta("")}>Avbryt</button><button type="button" onClick={() => onAvsluta("Rundan är avslutad.")}>Klar</button></div>
  ),
}));

vi.mock("@/lib/CurrentMedarbetareContext", () => ({
  useCurrentMedarbetare: () => ({ medarbetare: mock.medarbetare, loading: mock.loading }),
}));

vi.mock("@/lib/supabase", () => {
  const tabeller = (): Record<string, any[]> => ({
    fakturaunderlag_flytt: [...mock.underlag, ...mock.extraUnderlag],
    flyttdag: [...FLYTTDAG, ...mock.extraRundor].map(r => ({ ...r, ...(mock.patchRundor[r.id] ?? {}) })),
    maskin_flytt: mock.flyttar, lastbil_lass: mock.lass, maskin_flytt_rattning: mock.rattningar, dim_maskin: DIM_MASKIN, objekt: [...OBJEKT, ...mock.extraObjekt], flyttplats: [],
  });
  const tid = (v: unknown) => Date.parse(String(v));
  class Q {
    private filt: ((r: any) => boolean)[] = [];
    private uppd: Record<string, unknown> | null = null;
    private filtreraId: string[] = [];
    constructor(private tabell: string) {}
    private kolumner = "";
    select(k?: string) { this.kolumner = k ?? ""; return this; }
    update(v: Record<string, unknown>) { this.uppd = v; return this; }
    eq(k: string, v: unknown) { this.filt.push(r => r[k] === v); return this; }
    is(k: string, v: unknown) { this.filt.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    not(k: string, _o: string, v: unknown) { this.filt.push(r => (v === null ? r[k] != null : r[k] !== v)); return this; }
    gte(k: string, v: string) { this.filt.push(r => tid(r[k]) >= tid(v)); return this; }
    lte(k: string, v: string) { this.filt.push(r => tid(r[k]) <= tid(v)); return this; }
    private en = false;
    maybeSingle() { this.en = true; return this; }
    lt(k: string, v: string) { this.filt.push(r => tid(r[k]) < tid(v)); return this; }
    in(k: string, lista: string[]) { this.filt.push(r => lista.includes(r[k])); return this; }
    order() { return this; }
    limit() { return this; }
    private skriv() {
      mock.anrop.push(this.tabell + ":skriv");
      mock.skrivningar.push({ tabell: this.tabell, varden: this.uppd });
      if (mock.skrivFel) return { data: null, error: { message: "boom" } };
      if (mock.skrivNoll) return { data: [], error: null };
      const traffade = tabeller()[this.tabell].filter(r => this.filt.every(f => f(r)));
      for (const r of traffade) {
        // Databasens trigger (migration 20261015155630, provad i riktig Postgres): första ändringen av km/kund
        // snapshotar originalen, klienten kan inte skriva dem, och redigerad_tid sätts av databasen.
        const v: Record<string, unknown> = { ...this.uppd };
        delete v.km_original; delete v.kund_original; delete v.redigerad_tid;
        const andrar = ("km" in v && v.km !== r.km) || ("kund" in v && v.kund !== r.kund);
        if (this.tabell === "fakturaunderlag_flytt") {
          if (andrar) {
            if (r.redigerad_tid == null) { r.km_original = r.km; r.kund_original = r.kund; }
            r.redigerad_tid = "2026-10-15T16:00:00Z";
          } else delete v.redigerad_av;
        }
        Object.assign(r, v);      // raderna delas med nästa läsning
      }
      return { data: traffade.map(r => ({ id: r.id })), error: null };
    }
    private kor(fran = 0, till = Infinity) {
      if (this.uppd) return this.skriv();
      mock.anrop.push(this.tabell);
      if (this.tabell === "fakturaunderlag_flytt" && mock.vantarFel && this.filt.length >= 3) return { data: null, error: { message: "boom" } };
      if (this.tabell === "fakturaunderlag_flytt" && mock.underlagFel) return { data: null, error: { message: "boom" } };
      if (this.tabell === "dim_maskin" && mock.namnFel) return { data: null, error: { message: "boom" } };
      if (this.tabell === "maskin_flytt" && mock.maskinerFel && this.kolumner.includes("extern_maskin, starttid, hamtad_tid")) return { data: null, error: { message: "boom" } };
      if (["flyttdag", "maskin_flytt"].includes(this.tabell) && mock.rundorFel) return { data: null, error: { message: "boom" } };
      // Migration 20261017100000 ej körd: en fråga som nämner kolumnen faller som i PostgREST.
      if (this.tabell === "maskin_flytt" && mock.manuellKolumnSaknas && this.kolumner.includes("fakturerbar_manuell")) return { data: null, error: { code: "42703", message: "column maskin_flytt.fakturerbar_manuell does not exist" } };
      if (this.tabell === "lastbil_lass" && mock.lassFel) return { data: null, error: { message: "boom" } };
      const traffar = tabeller()[this.tabell].filter(r => this.filt.every(f => f(r))).slice(fran, till === Infinity ? undefined : till + 1);
      if (this.en) return { data: traffar[0] ?? null, error: null };
      return { data: traffar, error: null };
    }
    range(fran: number, till: number) { return Promise.resolve(this.kor(fran, till)); }
    then(res: any, rej: any) { return Promise.resolve(this.kor()).then(res, rej); }
  }
  return { supabase: {
    from: (t: string) => new Q(t),
    rpc: async (namn: string, args: any) => {
      // Bilens vikt per månad (Uppföljning): egen rad i fejken och inte i rpc-loggen, så tester av ratta_flytt/stryk_flytt inte ser den.
      if (namn === "lastbil_vikt_manad") return mock.viktFel ? { data: null, error: { message: "boom" } } : { data: mock.viktRader, error: null };
      mock.rpc.push({ namn, args }); return mock.rpcHandler ? mock.rpcHandler(namn, args) : { data: null, error: { message: "inget svar" } }; },
  } };
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
  mock.underlag = nyaUnderlag(); mock.skrivningar = []; mock.skrivNoll = false; mock.skrivFel = false; mock.vantarFel = false; mock.manuellKolumnSaknas = false;
  mock.api = { status: 200, body: LAGE };
  mock.rundorFel = false; mock.maskinerFel = false; mock.viktRader = PROD_VIKT_RADER.map(r => ({ ...r })); mock.viktFel = false; mock.extraRundor = []; mock.extraObjekt = []; mock.patchRundor = {};
  mock.flyttar = MASKIN_FLYTT.map(b => ({ ...b })); mock.lass = []; mock.lassFel = false; mock.rattningar = []; mock.rpc = []; mock.rpcHandler = null;
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
const vantaTills = async (villkor: () => boolean) => { for (let i = 0; i < 30 && !villkor(); i++) await flush(); };
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

const fakturRad = () => document.querySelector("[data-fakturering-rad]") as HTMLElement | null;
// Kortet "Att göra" — med rubriken när lass/väntande finns, utan rubrik (data-att-gora-ensam) när Fakturering står ensam.
const attGora = () => document.querySelector('section[aria-label="Att göra"], section[data-att-gora-ensam]') as HTMLElement | null;
const attGoraRubrik = () => document.querySelector('section[aria-label="Att göra"]') as HTMLElement | null;
const fakturaSida = () => document.querySelector("[data-fakturering-sida]") as HTMLElement | null;
const tillbakaPil = () => document.querySelector("[data-tillbaka]") as HTMLElement | null;
const tillFakturering = async () => { await klicka(fakturRad()!); };
/** Uppföljning: raden "Uppföljning ›" längst ner i Körningar öppnar den (egen sida, tillbaka-pil till Lastbilen). */
const helaAret = () => document.querySelector("[data-uppfoljning]") as HTMLElement | null;
const arsSida = () => document.querySelector("[data-ars-sida]") as HTMLElement | null;
const tillAr = async () => { await klicka(helaAret()!); };
const filterKnapp = (id: "flytt" | "ovrig") => document.querySelector(`[data-filter="${id}"]`) as HTMLElement;
const tillHuvudsidan = async () => { await klicka(tillbakaPil()!); };
/** Flikkontrollen Körningar/Fakturering/Nu är borta: det enda som är kvar av "tabs" är Månad | År i periodväljaren. */
const flikNamn = () => Array.from(document.querySelectorAll('[role="tab"]')).map(t => t.textContent);

describe("hook-ordning", () => {
  it("roll läses → admin: ingen hook-krasch", async () => {
    mock.loading = true; mock.medarbetare = null;
    await montera();
    expect(text()).toContain("Läser");
    mock.loading = false; mock.medarbetare = ADMIN;
    await ritaOm();
    expect(hookFel()).toEqual([]);
    expect(fakturRad()).not.toBeNull();
  });
  it("roll läses → förare: ingen hook-krasch", async () => {
    mock.loading = true; mock.medarbetare = null;
    await montera();
    mock.loading = false; mock.medarbetare = FORARE;
    await ritaOm();
    expect(hookFel()).toEqual([]);
    expect(fakturRad()).toBeNull();
  });
  it("huvudsidan → fakturasidan → tillbaka: ingen hook-krasch (samma hooks i alla lägen)", async () => {
    await montera();
    await tillFakturering();
    await tillHuvudsidan();
    expect(hookFel()).toEqual([]);
  });
});

describe("pengatalet: raden Fakturering och fakturasidan", () => {
  it("admin: raden står i Att göra och visar månadens fakturerbara (36 + 53 = 89 km); fakturasidan har summan och uppdelningen överst", async () => {
    await montera();
    expect(attGora()).not.toBeNull();
    expect(attGora()!.contains(fakturRad())).toBe(true);
    expect(fakturRad()!.textContent).toContain("Fakturering · oktober");
    expect(fakturRad()!.textContent).toContain("89 km");
    expect(remsa()).toBeNull();                                  // kortet "Fakturerbart" på huvudsidan finns inte längre
    await tillFakturering();
    expect(fakturaSida()).not.toBeNull();
    expect(remsa()!.textContent).toContain("Vad ska faktureras i oktober?");
    expect(remsa()!.textContent).toContain("89 km");
    expect(remsa()!.querySelector("[data-remsa-lage]")!.textContent).toBe("2 flyttar · Ingen är fakturerad än");
  });

  it("fakturasidan är en egen sida med tillbaka-pil: inga flikar, och huvudsidan är borta medan den visas", async () => {
    await montera();
    expect(flikNamn()).toEqual([]);                                               // huvudsidan har ingen Månad/År-växel
    await tillFakturering();
    expect(tillbakaPil()).not.toBeNull();
    expect(flikNamn()).toEqual([]);                                               // inte heller fakturasidan: perioden byts på ETT sätt (‹ Oktober 2026 ›)
    expect(document.querySelector("[data-periodval]")!.textContent).toContain("Oktober 2026");
    expect(document.querySelector("[data-hamta-start]")).toBeNull();
    expect(document.querySelector("[data-korningar]")).toBeNull();
    await tillHuvudsidan();
    expect(fakturaSida()).toBeNull();
    expect(document.querySelector("[data-hamta-start]")).not.toBeNull();
  });

  it("raden ändras aldrig av att man går till fakturasidan och tillbaka (samma värde, samma plats)", async () => {
    await montera();
    const forsta = fakturRad()!.textContent;
    const plats = Array.from(attGora()!.querySelectorAll("button, [data-fakturering-rad]")).indexOf(fakturRad()!);
    await tillFakturering();
    await tillHuvudsidan();
    expect(fakturRad()!.textContent).toBe(forsta);
    expect(Array.from(attGora()!.querySelectorAll("button, [data-fakturering-rad]")).indexOf(fakturRad()!)).toBe(plats);
  });

  it("ändras av perioden (väljaren under Körningar): förra månaden (140 km), augusti (105 km)", async () => {
    await montera();
    await klicka(knapp(/Förra månaden/));
    expect(fakturRad()!.textContent).toContain("Fakturering · september");
    expect(fakturRad()!.textContent).toContain("140 km");
    await klicka(knapp(/Förra månaden/));
    expect(fakturRad()!.textContent).toContain("105 km");
  });

  it("perioden är EN för hela Lastbilen: byter man månad på fakturasidan står samma månad när man går tillbaka", async () => {
    await montera();
    await tillFakturering();
    expect(document.querySelector("[data-periodval]")).not.toBeNull();           // fakturasidan har en egen väljare
    await klicka(knapp(/Förra månaden/));
    expect(remsa()!.textContent).toContain("september");
    await tillHuvudsidan();
    expect(fakturRad()!.textContent).toContain("september");
    expect(document.querySelector("[data-korningar]")!.textContent).toContain("september");
  });

  it("juli är första månaden: Förra månaden är inaktiv där, och Nästa månad i innevarande månad", async () => {
    await montera();
    expect((knapp(/Nästa månad/) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 3; i++) await klicka(knapp(/Förra månaden/));
    expect(fakturRad()!.textContent).toContain("juli");
    expect((knapp(/Förra månaden/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("en månad utan flyttar visar 0 km som en LÄST nolla, inte som fel", async () => {
    await montera();
    for (let i = 0; i < 3; i++) await klicka(knapp(/Förra månaden/));   // juli
    expect(fakturRad()!.textContent).toContain("0 km");
    expect(fakturRad()!.textContent).not.toContain("Kunde inte läsa");
  });

  it("ett läsfel visar aldrig 0 km: raden säger 'Kunde inte läsa', och Försök igen läser om", async () => {
    mock.underlagFel = true;
    await montera();
    expect(fakturRad()!.textContent).toContain("Kunde inte läsa");
    expect(fakturRad()!.textContent).not.toMatch(/\b0 km/);
    expect(fakturRad()!.textContent).not.toContain("89 km");
    mock.underlagFel = false;
    await klicka(knapp(/Försök igen/, fakturRad()!));
    expect(fakturRad()!.textContent).toContain("89 km");
  });

  it("ett läsfel på fakturasidan säger det i summan (aldrig 0 km) och Försök igen läser om", async () => {
    mock.underlagFel = true;
    window.history.replaceState(null, "", "/lastbil?flik=fakturering&per=2026-10");
    await montera();
    expect(remsa()!.textContent).toContain("Kunde inte läsa fakturerbart");
    expect(remsa()!.textContent).not.toMatch(/\b0 km/);
    mock.underlagFel = false;
    await klicka(knapp(/Försök igen/, remsa()!));
    expect(remsa()!.textContent).toContain("89 km");
  });
});

describe("roller", () => {
  it("förare: Hämta en maskin, Bilen nu och Körningar — inget Att göra, ingen Fakturering, och frågan om fakturering skickas aldrig", async () => {
    mock.medarbetare = FORARE;
    await montera();
    expect(document.querySelector("[data-hamta-start]")).not.toBeNull();
    expect(text()).toContain("Bilen nu");
    expect(document.querySelector("[data-korningar]")).not.toBeNull();
    expect(attGora()).toBeNull();
    expect(fakturRad()).toBeNull();
    expect(remsa()).toBeNull();
    expect(flikNamn()).toEqual([]);                                   // ingen flikkontroll Körningar/Fakturering/Nu, ingen Månad/År-växel
    // ekonomidata, lass och rättningsspår läses aldrig för en förare
    for (const t of ["fakturaunderlag_flytt", "lastbil_lass", "maskin_flytt_rattning"]) expect(mock.anrop).not.toContain(t);
  });

  it("en förare som följer en länk till Fakturering hamnar på huvudsidan", async () => {
    mock.medarbetare = FORARE;
    window.history.replaceState(null, "", "/lastbil?flik=fakturering&per=2026-09");
    await montera();
    expect(fakturaSida()).toBeNull();
    expect(document.querySelector("[data-korningar]")).not.toBeNull();
    expect(mock.anrop).not.toContain("fakturaunderlag_flytt");
  });
});

describe("adressen", () => {
  it("?flik=fakturering&per=2026-09 öppnar fakturasidan på september (admin)", async () => {
    window.history.replaceState(null, "", "/lastbil?flik=fakturering&per=2026-09");
    await montera();
    expect(fakturaSida()).not.toBeNull();
    expect(remsa()!.textContent).toContain("september");
    expect(remsa()!.textContent).toContain("140 km");
  });
  it("gamla länkar: ?flik=korningar och ?flik=nu öppnar huvudsidan, och per= gäller", async () => {
    for (const gammal of ["?flik=korningar&per=2026-08", "?flik=nu&per=2026-08"]) {
      act(() => { rot?.unmount(); }); rot = null;
      window.history.replaceState(null, "", `/lastbil${gammal}`);
      await montera();
      expect(fakturaSida()).toBeNull();
      expect(document.querySelector("[data-korningar]")).not.toBeNull();
      expect(fakturRad()!.textContent).toContain("augusti");
    }
  });
  it("skriver period (och fakturasidan) i adressen när man byter", async () => {
    await montera();
    expect(window.location.search).toBe("?per=2026-10");
    await tillFakturering();
    expect(window.location.search).toBe("?flik=fakturering&per=2026-10");
    await tillHuvudsidan();
    expect(window.location.search).toBe("?per=2026-10");
    await klicka(knapp(/Förra månaden/));
    await tillAr();
    expect(window.location.search).toBe("?ar=2026&per=2026-09");                  // året och månaden man kom från
    await klicka(tillbakaPil()!);
    expect(window.location.search).toBe("?per=2026-09");
  });
  it("ogiltigt värde i länken = som om det inte stod där", async () => {
    window.history.replaceState(null, "", "/lastbil?flik=karta&per=imorgon");
    await montera();
    expect(fakturaSida()).toBeNull();
    expect(fakturRad()!.textContent).toContain("oktober");
  });
});

/** Grupprubrikerna på fakturasidan (frågor) med antalet rader under: "Vad väntar på faktura? · 2". */
const rubrikTexter = () => Array.from(document.querySelectorAll("section[aria-label] > h3")).filter(h => h.parentElement!.querySelector("[data-underlag]"))
  .map(h => `${h.textContent} · ${h.parentElement!.querySelectorAll("[data-underlag]").length}`);
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
    expect(fakturaSida()).not.toBeNull();
    expect(rubrikTexter()).toEqual(["Vad väntar på faktura? · 2"]);
    const rader = Array.from(document.querySelectorAll("[data-underlag]")).map(r => (r as HTMLElement).dataset.underlag);
    expect(rader).toEqual(["u8", "u7"]);
    expect(underlagRad("u8")!.textContent).toContain("Giant");
    expect(underlagRad("u8")!.querySelector("[data-underlag-vad]")!.textContent).toBe("Giant till Bågskyttebanan RP J-Hus- 25");
    expect(underlagRad("u8")!.querySelector("[data-underlag-nar]")!.textContent).toBe("tis 6 okt · från Vällust RP M-R -25 · kund saknas");
    expect(underlagRad("u8")!.textContent).toContain("tis 6 okt");
    expect(underlagRad("u8")!.textContent).toContain("53 km");
    expect(underlagRad("u7")!.textContent).toContain("Elefant 26");
    expect(underlagRad("u7")!.textContent).toContain("Elefant 26 till Östra-Hoka 1:7 A-C -25");
  });

  it("summan i remsan är summan av raderna som visas (36 + 53 = 89) — och kvittot har inget eget stort tal", async () => {
    await oppnaFakturering();
    const radKm = Array.from(document.querySelectorAll("[data-underlag]")).map(r => Number(/(\d+) km/.exec(r.textContent ?? "")![1]));
    expect(radKm.reduce((a, b) => a + b, 0)).toBe(89);
    expect(remsa()!.textContent).toContain("89 km");
    expect(document.querySelectorAll("[data-remsa]").length).toBe(1);
    expect(text()).not.toContain("En flytt som avslutas fakturerbar");          // rubrikerna är frågor: ingen instruktionstext behövs
  });

  it("en flytt utan startobjekt säger 'okänd plats' (verkliga raden 28 aug), aldrig tomt", async () => {
    await oppnaFakturering("2026-08");
    expect(underlagRad("u2")!.querySelector("[data-underlag-vad]")!.textContent).toBe("Elefant 26 till Tjuvön AU 2026");
    expect(underlagRad("u2")!.querySelector("[data-underlag-nar]")!.textContent).toBe("fre 28 aug · från okänd plats · kund saknas");
    expect(rubrikTexter()).toEqual(["Vad väntar på faktura? · 3"]);
  });

  it("fakturerade och strukna får egna grupper efter 'hos'; en struken flytt räknas inte i summan", async () => {
    mock.extraUnderlag = [
      U("uf", "2026-10-02", 40, "A130743", "o-ostra", "o-vallust", { fakturerad_tid: "2026-10-09T08:00:00Z" }),
      U("us", "2026-10-03", 60, "PONS20SDJAA270231", "o-vallust", "o-ostra", { status: "struken", struken_tid: "2026-10-08T10:00:00Z", struken_anledning: "dubblett" }),
    ];
    await oppnaFakturering();
    expect(rubrikTexter()).toEqual(["Vad väntar på faktura? · 2", "Vad är fakturerat? · 1", "Vad är struket? · 1"]);
    expect(Array.from(document.querySelectorAll("[data-underlag]")).map(r => (r as HTMLElement).dataset.underlag)).toEqual(["u8", "u7", "uf", "us"]);
    expect(underlagRad("uf")!.textContent).toContain("Fakturerad fre 9 okt");
    expect(underlagRad("us")!.textContent).toContain("Struken tor 8 okt · dubblett");
    expect((underlagRad("us")!.querySelector('[style*="line-through"]'))).not.toBeNull();
    // remsan: 36 + 53 + 40 = 129 (struken 60 räknas aldrig)
    expect(remsa()!.textContent).toContain("129 km");
    expect(remsa()!.textContent).toContain("1 struken");
  });

  it("en flytt utan km säger 'km saknas i datan' — aldrig 0 km", async () => {
    mock.extraUnderlag = [U("uk", "2026-10-04", null, "A130743", "o-ostra", "o-vallust")];
    await oppnaFakturering();
    expect(underlagRad("uk")!.textContent).toContain("km saknas i datan");
    expect(underlagRad("uk")!.textContent).not.toMatch(/\b0 km/);
    expect(remsa()!.textContent).toContain("(1 utan km)");
  });

  it("fakturasidan har bara månader: en gammal länk med ett år (?per=2026) ger innevarande månad, inte ett år", async () => {
    await oppnaFakturering("2026");
    expect(rubrikTexter()).toEqual(["Vad väntar på faktura? · 2"]);
    expect(remsa()!.textContent).toContain("Vad ska faktureras i oktober?");
    expect(remsa()!.textContent).toContain("89 km");
    expect(window.location.search).toBe("?flik=fakturering&per=2026-10");
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
  it("månadskortet: ETT stort tal (818 km) och EN dämpad rad '5 rundor · 4,3 l/mil' — inga liter", async () => {
    await montera();
    const kort = document.querySelector('section[aria-label="Månaden"]')!.textContent!;
    expect(kort).toContain("Körd i oktober");
    expect(kort).toContain("818 km");
    expect(document.querySelector("[data-manadsrad]")!.textContent).toBe("5 rundor · 4,3 l/mil");
    expect(kort).not.toMatch(/\d l(?![\/\w])|349/);                      // liter hör inte hemma i toppen
    expect(kort).not.toContain("296");                         // filterraderna ligger i eget kort, inte i månadskortet
  });

  it("två rader i eget kort: 'Flyttar 296 km ›' och 'Övrig körning 522 km ›' — inga rundor eller l/mil på raderna", async () => {
    await montera();
    const kort = document.querySelector('section[aria-label="Typ av körning"]')!;
    expect(kort.querySelectorAll("button")).toHaveLength(2);
    expect(filterKnapp("flytt").textContent).toBe("Flyttar296 kmchevron_right");
    expect(filterKnapp("ovrig").textContent).toBe("Övrig körning522 kmchevron_right");
    expect(kort.textContent).not.toMatch(/runda|rundor|l\/mil|med lass|Flyttrundor/);
    expect(document.querySelector('section[aria-label="Månaden"]')!.contains(kort)).toBe(false);
  });

  it("rundraden: två rader text och ETT tal — datum · tid, 'Maskin · Från → Till' eller 'Övrig körning', km till höger; ingen diesel, förare eller Fakturerbar-märke", async () => {
    await montera();
    const flytt = rundrad("3e823d15")!;
    expect(flytt.children[0].children[0].textContent).toBe("tis 6 okt · 15:52");
    expect(flytt.querySelector("[data-runda-rad2]")!.textContent).toBe("Giant · Vällust RP M-R -25 → Bågskyttebanan RP J-Hus- 25");
    expect(flytt.children[1].textContent).toBe("163 km");
    expect(flytt.textContent).not.toMatch(/ l\b|Fakturerbar|Förare|diesel/);
    const ovrig = rundrad("30154836")!;
    expect(ovrig.querySelector("[data-runda-rad2]")!.textContent).toBe("Övrig körning");
    expect(ovrig.textContent).not.toMatch(/Ingen förare registrerad|ingen flytt kopplad|Förare|diesel/);
    expect(ovrig.children[1].textContent).toBe("294 km");
    // en rad som inte ryms klipps med … i CSS (nowrap + ellipsis) — namnen kortas aldrig av oss
    const stil = flytt.querySelector("[data-runda-rad2]")!.getAttribute("style")!;
    expect(stil).toContain("text-overflow: ellipsis");
    expect(stil).toContain("white-space: nowrap");
  });

  it("summan är summan av raderna som visas", async () => {
    await montera();
    const km = Array.from(document.querySelectorAll("[data-runda]")).map(r => Number((r.children[1].textContent ?? "").replace(/[^\d]/g, "") || NaN));
    expect(km.reduce((a, b) => a + b, 0)).toBe(818);
  });

  it("rundorna ligger i ETT kort, nyast först, utan veckorubriker, och varje rad är tryckbar", async () => {
    await montera();
    expect(document.querySelectorAll("section[aria-label^='Vecka']")).toHaveLength(0);
    expect(text()).not.toMatch(/Vecka \d/);
    const lista = document.querySelector("[data-rundlista]")!;
    expect(document.querySelectorAll("[data-rundlista]")).toHaveLength(1);
    const rader = Array.from(lista.querySelectorAll("[data-runda]"));
    expect(rader).toHaveLength(5);
    expect(rader.map(r => r.tagName)).toEqual(Array(5).fill("BUTTON"));
    expect(rader.map(r => r.getAttribute("data-runda"))).toEqual(["30154836", "3e823d15", "3bfa4d19", "b9c1d038", "34cddb13"]);   // mån 12, tis 6, mån 5, tor 1 (14:23), tor 1 (07:22)
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
    await klicka(filterKnapp("ovrig"));
    expect(Array.from(document.querySelectorAll("[data-runda]")).map(r => r.getAttribute("data-runda")).sort()).toEqual(["30154836", "34cddb13", "b9c1d038"]);
    expect(document.querySelector("[data-urval]")!.textContent).toBe("3 rundor · 4,5 l/mil" + "Visa alla");          // urvalet överst: antal + l/mil, och Visa alla
    expect(knapp(/^Visa alla$/)).toBeTruthy();
    expect(filterKnapp("ovrig").getAttribute("aria-pressed")).toBe("true");
    await klicka(rundrad("30154836")!);
    const a = ark()!.textContent!;
    expect(a).toContain("Övrig körning");
    expect(a).toContain("294 km");
    expect(a).toContain("Ingen registrerad");                      // förare
    expect(a).toContain("126,9 l · 4,3 l/mil");
    expect(a).toContain("Ingen flytt är kopplad till rundan och inget syfte är registrerat");
    await klicka(knapp(/^Visa alla$/));
    expect(document.querySelectorAll("[data-runda]").length).toBe(5);
    expect(document.querySelector("[data-urval]")).toBeNull();
  });

  it("filtret är ett val som kan tas bort: ett tryck till på samma knapp visar alla igen", async () => {
    await montera();
    await klicka(filterKnapp("flytt"));
    expect(document.querySelectorAll("[data-runda]").length).toBe(2);
    expect(document.querySelector("[data-urval]")!.textContent).toBe("2 rundor · 3,9 l/mil" + "Visa alla");
    await klicka(filterKnapp("flytt"));
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
    // (admin ser också flyttraderna som knappar — Visa flytten — men bara ETT sätt att stänga arket)
    const stang = Array.from(ark()!.querySelectorAll("button")).filter(b => !(b.getAttribute("aria-label") ?? "").startsWith("Visa flytten")).map(b => b.textContent);
    expect(stang).toEqual(["Avbryt"]);
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
    window.history.replaceState(null, "", "/lastbil?per=2026-10");
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
    expect(r).not.toContain("diesel");                                 // diesel hör till arket, inte raden
    await klicka(rundrad("514d88e1")!);
    expect(ark()!.textContent).toContain("Rundan startades på basen och bilen rörde sig aldrig.");
    expect(ark()!.textContent).toMatch(/Diesel\s*saknas i datan/);
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
    expect(text()).toContain("Inga rundor i september. Körningarna lästes utan fel.");
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("0 km");
  });

  it("en tom månad visar 'Senaste körning: <datum> ›' som öppnar den rundans ark", async () => {
    await montera();
    expect(document.querySelector("[data-senaste-korning]")).toBeNull();           // oktober har rundor: ingen tomtext
    await klicka(knapp(/Förra månaden/));
    const rad = document.querySelector("[data-senaste-korning]") as HTMLElement;
    expect(rad.textContent).toContain("Senaste körning: mån 12 okt");
    await klicka(rad);
    expect(ark()!.textContent).toContain("Övrig körning");
    expect(ark()!.textContent).toContain("294 km");
  });

  it("tom månad och bilen har ingen avslutad körning i datan: tomtexten säger bara att månaden är tom (ingen påhittad 'senaste körning')", async () => {
    mock.api = { status: 200, body: { ...LAGE, rundor: [] } };
    await montera();
    await klicka(knapp(/Förra månaden/));
    expect(text()).toContain("Inga rundor i september");
    expect(document.querySelector("[data-senaste-korning]")).toBeNull();
  });
});

describe("Körningar: året, läsfel och CSV", () => {
  it("raden 'Uppföljning ›' står under listan och ovanför CSV, och Uppföljning är en egen sida med tillbaka-pil till Lastbilen", async () => {
    await montera();
    const rad = helaAret()!;
    expect(rad.textContent).toContain("Uppföljning");
    expect(rad.textContent).not.toContain("Hela");
    const lista = document.querySelector("[data-rundlista]")!;
    const csv = knapp(/Exportera/)!;
    const fore = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(fore(lista, rad)).toBe(true);                              // under listan
    expect(fore(rad, csv)).toBe(true);                                // ovanför CSV
    await klicka(rad);
    expect(arsSida()).not.toBeNull();
    expect(document.querySelector("[data-korningar]")).toBeNull();
    expect(tillbakaPil()!.textContent).toBe("‹ Lastbilen");
    expect(document.querySelector("[data-periodval]")!.textContent).toContain("2026");
    expect(flikNamn()).toEqual(["Förbrukning", "Körsträcka", "Betalt"]);   // bara diagramväxeln (admin); sidan har inga flikar
    await klicka(tillbakaPil()!);
    expect(arsSida()).toBeNull();
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i oktober");
  });

  it("tillbaka går till Lastbilen med månaden man kom från kvar (augusti)", async () => {
    await montera();
    await klicka(knapp(/Förra månaden/)); await klicka(knapp(/Förra månaden/));
    await klicka(helaAret()!);
    expect(tillbakaPil()!.textContent).toBe("‹ Lastbilen");
    await klicka(tillbakaPil()!);
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i augusti");
  });

  it("året: månaderna som rader (också en tom månad), och ett tryck går till månaden — raden Fakturering följer med", async () => {
    await montera();
    await tillAr();
    const kort = document.querySelector('section[aria-label="Året"]')!.textContent!;
    expect(kort).toContain("Körd 2026");
    expect(kort).toContain("3\u00a0627 km");                           // MÄTARENS km (Martins första körning): aug 1 441 + sep 1 356 + okt 830 — inte rundornas 1 117
    expect(kort).toContain("11 rundor · 1\u00a0449 l · 4,3 l/mil");        // antalet är rundornas; liter och l/mil är MÄTARENS (555 + 565 + 329 = 1 449, över km med bränsle)
    expect(kort).toContain("mätare saknas för juli");                  // juli har rundor men ingen mätare: årets km täcker inte juli och det sägs
    const manader = document.querySelector('section[aria-label="Månader"]')!;
    expect(Array.from(manader.querySelectorAll("button")).map(b => b.textContent!.match(/^(Oktober|September|Augusti|Juli)/)?.[0])).toEqual(["Oktober", "September", "Augusti", "Juli"]);
    expect(manader.textContent).toContain("Inga rundor");              // september: inga rundor, men mätaren har kört
    // km i listan är mätarens: okt 830, sep 1 356, aug 1 441; juli saknar mätare. Andelen är Med lass (inte Övrig).
    const rad = (n: string) => norm(Array.from(manader.querySelectorAll("button")).find(b => b.textContent!.startsWith(n))!.textContent);
    expect(rad("Oktober")).toContain("830 km");
    expect(rad("Oktober")).toContain("Med lass 29 %");
    expect(rad("September")).toContain("1\u00a0356 km".replace("\u00a0", " "));
    expect(rad("Augusti")).toContain("1 441 km");
    expect(rad("Augusti")).toContain("Med lass 33 %");
    expect(rad("Juli")).toContain("mätare saknas");
    expect(rad("Juli")).not.toMatch(/\d km/);
    expect(rad("Juli")).not.toMatch(/ l\b|l\/mil/);                    // inga rundornas liter där mätaren saknas
    // liter och l/mil på månadsraden är mätarens: aug 555 l över 1 327 km med bränsle = 4,2, sep 565 l = 4,5, okt 329 l = 4,2
    expect(rad("Augusti")).toContain("555 l · 4,2 l/mil");
    expect(rad("September")).toContain("Inga rundor · 565 l · 4,5 l/mil");   // mätaren körde fast inga rundor finns: båda sägs
    expect(rad("Oktober")).toContain("329 l · 4,2 l/mil");
    expect(manader.textContent).not.toMatch(/Övrig/);
    expect(text()).not.toMatch(/Fakturering|fakturerbar/i);             // den visar körning, inte fakturering
    await klicka(Array.from(manader.querySelectorAll("button")).find(b => b.textContent!.startsWith("Augusti")) as HTMLElement);
    expect(arsSida()).toBeNull();
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i augusti");
    expect(fakturRad()!.textContent).toContain("augusti");
    expect(window.location.search).toBe("?per=2026-08");
  });

  it("året byts i År-vyn med ‹ 2026 ›; före juli 2026 finns ingen data att gå till", async () => {
    await montera();
    await tillAr();
    expect(knapp(/Förra året/)!.hasAttribute("disabled")).toBe(true);
    expect(knapp(/Nästa år/)!.hasAttribute("disabled")).toBe(true);     // inget framtida år
  });

  it("gamla länken ?per=2026 öppnar År-vyn", async () => {
    window.history.replaceState(null, "", "/lastbil?per=2026");
    await montera();
    expect(arsSida()).not.toBeNull();
    expect(document.querySelector('section[aria-label="Året"]')!.textContent).toContain("Körd 2026");
    expect(tillbakaPil()!.textContent).toBe("‹ Lastbilen");
  });

  it("direktöppning: ?ar=2026 utan per= visar Uppföljning med ‹ Lastbilen, och tillbaka landar på innevarande månad", async () => {
    window.history.replaceState(null, "", "/lastbil?ar=2026");
    await montera();
    expect(arsSida()).not.toBeNull();
    expect(tillbakaPil()!.textContent).toBe("‹ Lastbilen");
    await klicka(tillbakaPil()!);
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i oktober");
  });

  it("Uppföljning: stort km-tal och en dämpad rad överst, EN växel över ETT diagram, och månadslistan under", async () => {
    await montera();
    await tillAr();
    const sida = arsSida()!;
    const ordning = ['section[aria-label="Året"]', '[role="tablist"]', '[data-staplar]', 'section[aria-label="Månader"]']
      .map(q => sida.querySelector(q)!);
    expect(ordning.every(Boolean)).toBe(true);
    for (let i = 1; i < ordning.length; i++) expect(!!(ordning[i - 1].compareDocumentPosition(ordning[i]) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(sida.querySelectorAll("[data-staplar]").length).toBe(1);
    expect(sida.querySelectorAll('[role="tablist"]').length).toBe(1);
    // Fotnoten om tomkörning är borta (Martin 2026-10-20): Förbrukning har ingen fotnot alls.
    expect(sida.querySelector("[data-fotnot]")).toBeNull();
    expect(text()).not.toContain("tomkörningen");
  });

  it("Förbrukning (förvald): l/mil per månad ur vikten, Med lass och Utan lass bredvid varandra; juli säger 'vikt saknas' och är aldrig 0", async () => {
    await montera();
    await tillAr();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe("Förbrukning");
    const d = document.querySelector("[data-staplar]")!;
    expect(d.getAttribute("data-staplar")).toBe("bredvid");
    expect(d.querySelector("[data-legend]")!.textContent).toMatch(/Med lass.*Utan lass.*l\/mil/);
    expect(d.querySelector("[data-legend]")!.textContent).not.toMatch(/Flyttar|Övrig/);
    // Martins första körning: aug 5,10 / 3,66 · sep 5,47 / 3,83 · okt 5,30 / 3,76 (en decimal som resten av sidan)
    expect(d.querySelector('[data-stapelrad="okt"]')!.getAttribute("aria-label")).toBe("okt: Med lass 5,3, Utan lass 3,8");
    expect(d.querySelector('[data-stapelrad="sep"]')!.getAttribute("aria-label")).toBe("sep: Med lass 5,5, Utan lass 3,8");
    expect(d.querySelector('[data-stapelrad="aug"]')!.getAttribute("aria-label")).toBe("aug: Med lass 5,1, Utan lass 3,7");
    expect(d.querySelector('[data-stapelrad="okt"]')!.querySelectorAll("[title]").length).toBe(2);   // två staplar
    const jul = d.querySelector('[data-stapelrad="jul"]')!;                                           // ingen vikt i juli
    expect(jul.querySelectorAll("[title]").length).toBe(0);
    expect(jul.textContent).toContain("vikt saknas");
    expect(jul.textContent).not.toMatch(/\b0\b/);
    expect(jul.getAttribute("aria-label")).toBe("jul: vikt saknas");
  });

  it("Förbrukning: med lass förbrukar mer än utan lass, och stapeln är längre", async () => {
    await montera();
    await tillAr();
    const bredd = (el: Element) => parseFloat((el as HTMLElement).style.width);
    const [med, utan] = Array.from(document.querySelector('[data-stapelrad="sep"]')!.querySelectorAll("[title]"));
    expect(bredd(med)).toBeGreaterThan(bredd(utan));
    expect(bredd(med) / bredd(utan)).toBeCloseTo(5.47 / 3.83, 1);
  });

  it("Körsträcka: km per månad ur mätaren, Med lass + Utan lass + Okänd staplat, summan till höger och delarna som text", async () => {
    await montera();
    await tillAr();
    await klicka(knapp(/^Körsträcka$/)!);
    const d = document.querySelector("[data-staplar]")!;
    expect(d.getAttribute("data-staplar")).toBe("staplat");
    expect(d.querySelector("[data-legend]")!.textContent).toMatch(/Med lass.*Utan lass.*Okänd.*km/);
    const aug = d.querySelector('[data-stapelrad="aug"]')!;
    expect(aug.textContent!.replace(/\s/g, " ")).toContain("1 441");
    expect(aug.textContent).toContain("482 + 845 + 114");
    expect(aug.getAttribute("aria-label")!.replace(/\s/g, " ")).toBe("aug: 1 441 (Med lass 482, Utan lass 845, Okänd 114)");
    expect(d.querySelector('[data-stapelrad="sep"]')!.textContent).toContain("504 + 755 + 97");
    expect(d.querySelector('[data-stapelrad="okt"]')!.textContent).toContain("242 + 535 + 53");
    const jul = d.querySelector('[data-stapelrad="jul"]')!;
    expect(jul.textContent).toContain("vikt saknas");
    expect(jul.getAttribute("aria-label")).toBe("jul: vikt saknas");
    expect(document.querySelector("[data-fotnot]")!.textContent).toBe("Okänd = lastades eller lossades under sträckan, eller så saknades vikten.");
  });

  it("Körsträcka: okänd körning visas bara i de månader den finns; tre toner och förklaringen står kvar", async () => {
    mock.viktRader = [{ ...PROD_VIKT_RADER[0], km_okand: 0 }, PROD_VIKT_RADER[1], PROD_VIKT_RADER[2]];
    await montera();
    await tillAr();
    await klicka(knapp(/^Körsträcka$/)!);
    const d = document.querySelector("[data-staplar]")!;
    expect(d.querySelector("[data-legend]")!.textContent).toMatch(/Med lass.*Utan lass.*Okänd.*km/);
    const aug = d.querySelector('[data-stapelrad="aug"]')!;
    expect(aug.textContent).toContain("482 + 845");
    expect(aug.textContent).not.toContain("+ 114");
    expect(aug.querySelectorAll("[title]").length).toBe(2);
    const sep = d.querySelector('[data-stapelrad="sep"]')!;
    expect(sep.querySelectorAll("[title]").length).toBe(3);
    // tre olika toner: vit, grå, ljusare grå (färg bär aldrig ensam — legend och delar står i text ovan)
    const toner = Array.from(sep.querySelectorAll("[title]")).map(e => (e as HTMLElement).style.background);
    expect(new Set(toner).size).toBe(3);
  });

  it("utan någon okänd körning finns varken tredje serien eller förklaringen", async () => {
    mock.viktRader = PROD_VIKT_RADER.map(r => ({ ...r, km_okand: 0 }));
    await montera();
    await tillAr();
    await klicka(knapp(/^Körsträcka$/)!);
    expect(document.querySelector("[data-legend]")!.textContent).not.toContain("Okänd");
    expect(document.querySelector("[data-fotnot]")).toBeNull();
    expect(document.querySelector('[data-stapelrad="aug"]')!.textContent).toContain("482 + 845");
  });

  it("vikten går inte att läsa: ALLA lägen säger det med Försök igen, och årets km blir '–' — aldrig 0; resten av sidan påverkas inte", async () => {
    mock.viktFel = true;
    await montera();
    await tillAr();
    expect(text()).toContain("Kunde inte läsa vikten just nu.");
    expect(document.querySelector("[data-staplar]")).toBeNull();
    expect(document.querySelector("[data-ars-km]")!.textContent).toBe("– km");
    await klicka(knapp(/^Körsträcka$/)!);
    expect(text()).toContain("Kunde inte läsa vikten just nu.");
    await klicka(knapp(/^Betalt$/)!);
    expect(text()).toContain("Kunde inte läsa vikten just nu.");       // Betalt bygger också på mätarens km
    expect(document.querySelector('section[aria-label="Året"]')!.textContent).toContain("11 rundor");   // rundorna är lästa
    expect(document.querySelector('section[aria-label="Året"]')!.textContent).not.toMatch(/ l\b|l\/mil/);   // men liter och l/mil är mätarens och skrivs inte utan den
    expect(document.querySelector("[data-maskiner]")).not.toBeNull();   // Maskiner påverkas inte
    await klicka(knapp(/^Förbrukning$/)!);
    mock.viktFel = false;
    await klicka(knapp(/Försök igen/, document.querySelector('section[aria-label="Diagram"]')!)!);
    expect(document.querySelector('[data-stapelrad="okt"]')!.getAttribute("aria-label")).toBe("okt: Med lass 5,3, Utan lass 3,8");
    expect(document.querySelector("[data-ars-km]")!.textContent!.replace(/\s/g, " ")).toBe("3 627 km");
  });

  it("stapellängderna följer värdena: km staplat (482 mot 845, lika långa som summan 1 441)", async () => {
    await montera();
    await tillAr();
    const bredd = (el: Element) => parseFloat((el as HTMLElement).style.width);
    await klicka(knapp(/^Körsträcka$/)!);
    const km = Array.from(document.querySelector('[data-stapelrad="aug"]')!.querySelectorAll("[title]"));
    expect(bredd(km[0]) / bredd(km[1])).toBeCloseTo(482 / 845, 2);
    const storst = Array.from(document.querySelectorAll('[data-stapelrad]')).map(r => Array.from(r.querySelectorAll("[title]")).map(bredd).reduce((a, b) => a + b, 0));
    expect(Math.max(...storst)).toBeLessThanOrEqual(82);                 // största månaden lämnar plats åt talet
  });

  it("Betalt (admin): 'X av Y km' vid stapeln (rundornas km), fotnot om Ej betalt och prod-siffrorna för fakturerat", async () => {
    await montera();
    await tillAr();
    expect(flikNamn()).toEqual(["Förbrukning", "Körsträcka", "Betalt"]);
    await klicka(knapp(/^Betalt$/)!);
    const d = document.querySelector("[data-staplar]")!;
    expect(d.getAttribute("data-staplar")).toBe("staplat");
    expect(d.querySelector("[data-legend]")!.textContent).toMatch(/Fakturerat.*Ej betalt.*km/);
    const okt = d.querySelector('[data-stapelrad="okt"]')!;
    expect(okt.textContent!.replace(/\s/g, " ")).toContain("89 av 830 km");          // Y = mätarens km (inte rundornas 818)
    expect(okt.textContent).toContain("11 %");
    expect(okt.getAttribute("aria-label")!.replace(/\s/g, " ")).toBe("okt: 89 av 830 km (Fakturerat 89, Ej betalt 741)");
    expect(d.querySelector('[data-stapelrad="aug"]')!.textContent!.replace(/\s/g, " ")).toContain("105 av 1 441 km");
    expect(d.querySelector('[data-stapelrad="sep"]')!.textContent!.replace(/\s/g, " ")).toContain("140 av 1 356 km");   // samma Y som i Körsträcka-läget
    expect(d.querySelector('[data-stapelrad="jul"]')!.textContent).toContain("vikt saknas");
    expect(document.querySelector("[data-fotnot]")!.textContent).toBe("Ej betalt = tomkörning, service, korta och egna flyttar.");
    expect(document.querySelector("[data-vantar]")).toBeNull();                     // inga väntande flyttar
  });

  it("Betalt: ogodkända flyttar räknas inte men sägs i en dämpad rad; växlar man bort och tillbaka finns raden bara i Betalt", async () => {
    mock.extraUnderlag = [{ ...nyaUnderlag()[7], id: "ogk", godkand_tid: null, godkand_av: null, datum: "2026-10-07", km: 40 }];
    await montera();
    await tillAr();
    await klicka(knapp(/^Betalt$/)!);
    expect(document.querySelector('[data-stapelrad="okt"]')!.textContent!.replace(/\s/g, " ")).toContain("89 av 830 km");
    expect(document.querySelector("[data-vantar]")!.textContent).toBe("1 flytt väntar på godkännande · 40 km");
    await klicka(knapp(/^Körsträcka$/)!);
    expect(document.querySelector("[data-vantar]")).toBeNull();
  });

  it("Betalt: går fakturaunderlaget inte att läsa är det ett fel med Försök igen, aldrig 0 km", async () => {
    mock.underlagFel = true;
    await montera();
    await tillAr();
    await klicka(knapp(/^Betalt$/)!);
    expect(text()).toContain("Kunde inte läsa fakturerat just nu.");
    expect(document.querySelector("[data-staplar]")).toBeNull();
    mock.underlagFel = false;
    await klicka(knapp(/Försök igen/, document.querySelector('section[aria-label="Diagram"]')!)!);
    expect(document.querySelector('[data-stapelrad="okt"]')!.textContent!.replace(/\s/g, " ")).toContain("89 av 830 km");
  });

  // ── Betalt: kört med lass (ur vikten) mot registrerade flyttar (maskin_flytt.flytt_km) ──
  const lassSek = () => document.querySelector("[data-lass-mot-flyttar]") as HTMLElement | null;
  const flyttMan = (id: string, iso: string, km: number | null) => ({ ...maskinRader()[0], id, starttid: iso, hamtad_tid: iso, sluttid: iso, flytt_km: km });
  const lassRad = (man: number) => lassSek()!.querySelector(`[data-lass-manad="${man}"]`) as HTMLElement;
  const betalt = async () => { await montera(); await tillAr(); await klicka(knapp(/^Betalt$/)!); };

  it("Betalt (admin): 'Kört med lass X km · registrerade flyttar Y km' per månad med vikt; mer än 1,5 × Y ger orange 'Lass kan saknas'", async () => {
    mock.flyttar = [flyttMan("f1", "2026-08-10T10:00:00Z", 400), flyttMan("f2", "2026-09-10T10:00:00Z", 200), flyttMan("f3", "2026-10-10T10:00:00Z", 100)];
    await betalt();
    const sek = lassSek()!;
    expect(sek.querySelector("h3")!.textContent).toBe("Lass och flyttar");
    // Efter diagrammet och fotnoten, före månadslistan
    const diagram = arsSida()!.querySelector('section[aria-label="Diagram"]')!;
    const manader = arsSida()!.querySelector('section[aria-label="Månader"]')!;
    expect(!!(diagram.compareDocumentPosition(sek) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(!!(sek.compareDocumentPosition(manader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    // juli har ingen vikt: ingen rad
    expect(sek.querySelector('[data-lass-manad="7"]')).toBeNull();
    // aug: 482 mot 400 → 1,5 × 400 = 600, inget larm
    expect(norm(lassRad(8).textContent)).toBe("AugustiKört med lass 482 km · registrerade flyttar 400 km");
    expect(lassRad(8).querySelector("[data-lass-kan-saknas]")).toBeNull();
    expect(lassRad(8).tagName).toBe("DIV");                                   // ingen länk när allt stämmer
    // sep: 504 mot 200 → 1,5 × 200 = 300 → larm. okt: 242 mot 100 → 150 → larm.
    expect(norm(lassRad(9).textContent)).toBe("SeptemberKört med lass 504 km · registrerade flyttar 200 kmLass kan saknas");
    expect(norm(lassRad(10).textContent)).toBe("OktoberKört med lass 242 km · registrerade flyttar 100 kmLass kan saknas");
    expect(lassRad(9).querySelector("[data-lass-kan-saknas]")!.getAttribute("style")).toContain("color");
  });

  it("'Lass kan saknas' är en länk: ett tryck går till Körningar för månaden", async () => {
    mock.flyttar = [flyttMan("f1", "2026-09-10T10:00:00Z", 200)];
    await betalt();
    await klicka(lassRad(9));
    expect(arsSida()).toBeNull();
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i september");
    expect(window.location.search).toBe("?per=2026-09");
  });

  it("inga registrerade flyttar alls i en månad med lass ger larm (Y = 0), och en flytt utan km sägs vid raden", async () => {
    mock.flyttar = [flyttMan("f1", "2026-09-10T10:00:00Z", null), flyttMan("f2", "2026-09-11T10:00:00Z", 450)];
    await betalt();
    expect(norm(lassRad(10).textContent)).toBe("OktoberKört med lass 242 km · registrerade flyttar 0 kmLass kan saknas");
    expect(norm(lassRad(9).textContent)).toContain("registrerade flyttar 450 km · 1 flytt saknar km");
    expect(lassRad(9).querySelector("[data-lass-kan-saknas]")).toBeNull();     // 504 ≤ 1,5 × 450
  });

  it("jämförelsen finns bara i Betalt: Förbrukning och Körsträcka har den inte", async () => {
    await montera();
    await tillAr();
    expect(lassSek()).toBeNull();
    await klicka(knapp(/^Körsträcka$/)!);
    expect(lassSek()).toBeNull();
    await klicka(knapp(/^Betalt$/)!);
    expect(lassSek()).not.toBeNull();
  });

  it("en förare ser aldrig jämförelsen eller 'Lass kan saknas' (Betalt är bara för admin)", async () => {
    mock.medarbetare = FORARE;
    await montera();
    await tillAr();
    expect(lassSek()).toBeNull();
    expect(text()).not.toContain("Lass kan saknas");
    expect(flikNamn()).toEqual(["Förbrukning", "Körsträcka"]);
  });

  it("flyttarna går inte att läsa: jämförelsen säger det, och diagrammet i Betalt påverkas inte", async () => {
    mock.maskinerFel = true;
    await betalt();
    expect(lassSek()!.textContent).toBe("Kunde inte jämföra med flyttarna just nu.");
    expect(text()).not.toContain("Lass kan saknas");
    expect(document.querySelector('[data-stapelrad="okt"]')!.textContent!.replace(/\s/g, " ")).toContain("89 av 830 km");
  });

  it("månadslistan under diagrammet: ett tryck går till Körningar för månaden", async () => {
    await montera();
    await tillAr();
    await klicka(arsSida()!.querySelector('section[aria-label="Månader"] [data-manad="8"]') as HTMLElement);
    expect(arsSida()).toBeNull();
    expect(document.querySelector('section[aria-label="Månaden"]')!.textContent).toContain("Körd i augusti");
    expect(window.location.search).toBe("?per=2026-08");
  });

  it("en förare ser Uppföljning med samma två lägen (körning, inte fakturering)", async () => {
    mock.medarbetare = FORARE;
    await montera();
    await tillAr();
    expect(arsSida()).not.toBeNull();
    expect(flikNamn()).toEqual(["Förbrukning", "Körsträcka"]);
    expect(text()).not.toMatch(/Fakturering|fakturerbar|Betalt/i);
  });

  it("läsfel: säger det, visar inga tal, och Försök igen läser om — raden Fakturering påverkas inte", async () => {
    mock.rundorFel = true;
    await montera();
    expect(text()).toContain("Kunde inte läsa körningarna just nu.");
    expect(document.querySelector("[data-runda]")).toBeNull();
    expect(text()).not.toContain("818 km");
    expect(fakturRad()!.textContent).toContain("89 km");
    mock.rundorFel = false;
    await klicka(knapp(/Försök igen/, document.querySelector("[data-korningar]") as HTMLElement));
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
const OG_OKT = () => U("og1", "2026-10-08", 62, "A130743", "o-ostra", "o-vallust", { ...OGODKAND, flytt_id: "bg1", kund: "Vida" });   // en fakturerad flytt MÅSTE ha kund (sheeten kräver den)   // en NY flytt i oktober
const OG_SEP = () => U("og2", "2026-09-29", 41, "JD810E", "o-tjuvon", "o-dockemala", OGODKAND);  // och en som väntat sedan september
async function skrivText(el: HTMLTextAreaElement, v: string) {
  const sat = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => { sat.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const rubriker = rubrikTexter;
const vantarRad = () => document.querySelector("[data-vantar]") as HTMLElement | null;
const godkannKnapp = (id: string) => knapp(/^Godkänn$/, underlagRad(id)!);

describe("Godkänna flyttar: en ny flytt väntar tills admin trycker Godkänn", () => {
  it("ogodkända ligger överst som 'Att godkänna' och ingår INTE i pengatalet", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    expect(rubriker()).toEqual(["Vad ska du godkänna? · 1", "Vad väntar på faktura? · 2"]);
    const rad = underlagRad("og1")!;
    expect(rad.dataset.status).toBe("att_godkanna");
    expect(rad.textContent).toContain("Elefant 26");
    expect(rad.textContent).toContain("Elefant 26 till Vällust RP M-R -25");
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
    expect(rubriker()).toEqual(["Vad väntar på faktura? · 3"]);
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
    expect(rubriker()).toEqual(["Vad ska du godkänna? · 1", "Vad väntar på faktura? · 2"]);
    expect(remsa()!.textContent).toContain("89 km");
    expect(document.querySelector("[data-kvitto]")).toBeNull();
  });

  it("Stämmer något inte: tryck på raden → Stryk med anledning (obligatorisk), och flytten hamnar under Strukna", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.flyttar.push(BEN("bg1", "3bfa4d19", "A130743", "o-ostra", "o-vallust", 62, 120, true));
    mock.rpcHandler = rpcSomDb;
    await oppnaFakturering();
    await klicka(knapp(/Visa flytten Elefant 26/, underlagRad("og1")!));
    await klicka(knapp(/^Stryk flytten …$/, document.querySelector('[role="dialog"]') as HTMLElement)!);   // Flytten → Stryk
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-label")).toBe("Stryk flytten");
    const stryk = knapp(/^Stryk flytten$/, dialog)!;
    expect((stryk as HTMLButtonElement).disabled).toBe(true);   // ingen anledning → spärrat
    await skrivText(dialog.querySelector("textarea")!, "  dubblett av flytten 6 okt  ");
    expect((knapp(/^Stryk flytten$/, dialog) as HTMLButtonElement).disabled).toBe(false);
    await klicka(knapp(/^Stryk flytten$/, dialog)!);
    expect(mock.rpc).toEqual([{ namn: "stryk_flytt", args: { p_flytt: "bg1", p_anledning: "dubblett av flytten 6 okt", p_av: "Test Admin" } }]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(rubriker()).toEqual(["Vad väntar på faktura? · 2", "Vad är struket? · 1"]);
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

  it("räknar över ALLA perioder (oktober + september) och står i Att göra på huvudsidan", async () => {
    mock.extraUnderlag = [OG_OKT(), OG_SEP()];
    await montera();                                      // huvudsidan, oktober
    expect(vantarRad()!.textContent).toContain("2 flyttar väntar på godkännande");
    expect(attGora()!.contains(vantarRad())).toBe(true);
    await klicka(knapp(/Förra månaden/));                  // visad period byts: summan över alla perioder står kvar
    expect(vantarRad()!.textContent).toContain("2 flyttar väntar på godkännande");
  });

  it("trycket leder rakt till 'Att godkänna' — i ÄLDSTA månaden som väntar (september)", async () => {
    mock.extraUnderlag = [OG_OKT(), OG_SEP()];
    await montera();
    await klicka(vantarRad()!);
    expect(fakturaSida()).not.toBeNull();
    expect(remsa()!.textContent).toContain("september");
    expect(rubriker()[0]).toBe("Vad ska du godkänna? · 1");
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
    await tillHuvudsidan();
    expect(vantarRad()!.textContent).toContain("1 flytt väntar på godkännande");
    await klicka(vantarRad()!);
    await klicka(godkannKnapp("og1")!);
    await tillHuvudsidan();
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

// ── Sheeten "Flytten": rätta och stryka en flytt PÅ RIKTIGT (Fakturering, bara admin) ────────────────
// Databasfunktionerna (ratta_flytt, stryk_flytt, låset) är provade i riktig Postgres; här mockas rpc och
// vaktas vad appen SKICKAR (bara ändrade nycklar), vad den SÄGER innan man sparar, och hur den låser.
async function skrivIn(el: HTMLInputElement, v: string) {
  const sat = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { sat.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const dlg = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const valRad = (etikett: string) => dlg()!.querySelector(`button[aria-label^="${etikett}:"]`) as HTMLElement | null;
const sparaS = () => knapp(/^(Spara|Sparar …)$/, dlg()!) as HTMLButtonElement;
const anledningS = () => dlg()!.querySelector('textarea[aria-label="Anledning"]') as HTMLTextAreaElement;
const kmS = () => dlg()!.querySelector('input[aria-label="Sträcka i km"]') as HTMLInputElement;
const kundS = () => dlg()!.querySelector('input[aria-label="Kund"]') as HTMLInputElement;
const besked = () => dlg()!.querySelector("[data-forhandsbesked]")?.textContent ?? null;
const oppnaS = async (id: string, maskin: string) => { await klicka(knapp(new RegExp(`Visa flytten ${maskin}`), underlagRad(id)!)); };
const valj = async (etikett: string, alternativ: RegExp) => { await klicka(valRad(etikett)!); await klicka(knapp(alternativ, dlg()!)); };
/** Flytten bakom og1 (en ogodkänd, fakturerbar produktionsflytt Östra-Hoka → Vällust, 62 km, mätt 62). */
const BG1 = () => BEN("bg1", "3bfa4d19", "A130743", "o-ostra", "o-vallust", 62, 120, true, { till_lat: 56.40, till_lng: 14.60, starttid: "2026-10-05T04:30:00Z", koord_kalla: "objekt" });
const medBg1 = () => { mock.flyttar.push(BG1()); mock.extraUnderlag = [OG_OKT()]; mock.rpcHandler = rpcSomDb; };

describe("Flytten (sheet): öppna, läsa och rätta", () => {
  beforeEach(medBg1);

  it("öppnar med flytten ifylld som iOS-rader med chevron; 'mätt' står bara när det skiljer; Spara är grå", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector('[data-flytt-vy="huvud"]')).not.toBeNull();
    expect(valRad("Maskin")!.textContent).toContain("Elefant 26");
    expect(valRad("Från")!.textContent).toContain("Östra-Hoka 1:7 A-C -25");
    expect(valRad("Till")!.textContent).toContain("Vällust RP M-R -25");
    expect(valRad("Typ")!.textContent).toContain("Produktion");
    expect(valRad("Maskin")!.textContent).toContain("chevron_right");
    expect(kmS().value).toBe("62");
    expect(dlg()!.querySelector("[data-matt]")!.textContent).toBe("km");     // fakturerad km = mätt km: samma tal två gånger är brus
    expect(kundS().value).toBe("Vida");                           // en fakturerad flytt har en kund; ett förslag skriver aldrig över den
    expect(dlg()!.querySelector("[data-kund-kalla]")).toBeNull();
    expect(sparaS().disabled).toBe(true);
    expect(knapp(/^Stryk flytten …$/, dlg()!)).toBeDefined();
    expect(besked()).toBeNull();                                  // inget ändrat = inget förhandsbesked
  });

  it("Spara är grå tills något är ändrat OCH en anledning är ifylld", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await skrivText(anledningS(), "test");
    expect(sparaS().disabled).toBe(true);                          // anledning men inget ändrat
    await skrivIn(kmS(), "58");
    expect(sparaS().disabled).toBe(false);
    await skrivText(anledningS(), "   ");
    expect(sparaS().disabled).toBe(true);                          // ändrat men tom anledning
    await skrivText(anledningS(), "mätaren stod fel");
    await skrivIn(kmS(), "62");
    expect(sparaS().disabled).toBe(true);                          // tillbaka till det ursprungliga
  });

  it("FAKTURA ensamt: ingen ratta_flytt, bara underlaget (km + vem); raden märks 'ändrad från 62' och mätt står kvar", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await skrivIn(kmS(), "58");
    expect(dlg()!.querySelector("[data-matt]")!.textContent).toBe("km · mätt 62");
    await skrivText(anledningS(), "mätaren stod fel");
    await klicka(sparaS());
    expect(mock.rpc).toEqual([]);
    expect(mock.skrivningar).toHaveLength(1);
    expect(mock.skrivningar[0].varden).toEqual({ km: 58, redigerad_av: "Test Admin" });   // aldrig *_original, aldrig godkand_*
    expect(dlg()).toBeNull();
    expect(underlagRad("og1")!.textContent).toContain("ändrad från 62");
    expect(underlagRad("og1")!.dataset.status).toBe("att_godkanna");   // en rättning bryter inte väntan
    expect(remsa()!.textContent).toContain("89 km");                   // ogodkänd: fortfarande utanför pengatalet
    expect(document.querySelector("[data-kvitto]")!.textContent).toContain("Sparat");
    expect(knapp(/^Ångra$/, document.querySelector("[data-kvitto]") as HTMLElement)).toBeUndefined();   // en rättning är loggad, inget Ångra
  });

  it("km som redan är rättat visar '48 km · mätt 53'-formen igen vid nästa öppning, med originalet", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await skrivIn(kmS(), "58"); await skrivText(anledningS(), "a"); await klicka(sparaS());
    await oppnaS("og1", "Elefant 26");
    expect(kmS().value).toBe("58");
    expect(dlg()!.querySelector("[data-matt]")!.textContent).toBe("km · mätt 62");
  });

  it("kund: 'Tillagd av <namn> <datum>' efter ifyllning; ändrad kund säger 'Ändrad från …'", async () => {
    mock.extraUnderlag = [{ ...OG_OKT(), kund: null }];            // en gammal rad utan kund (de 7 i prod)
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await skrivIn(kundS(), "  Vida Skog  ");
    await skrivText(anledningS(), "saknades");
    await klicka(sparaS());
    expect(mock.skrivningar[0].varden).toEqual({ kund: "Vida Skog", redigerad_av: "Test Admin" });
    expect(underlagRad("og1")!.querySelector("[data-underlag-nar]")!.textContent).toContain("· Vida Skog");
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.textContent).toContain("Tillagd av Test Admin");
    await skrivIn(kundS(), "Skogsbolaget"); await skrivText(anledningS(), "fel kund"); await klicka(sparaS());
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.textContent).toContain("Tillagd av Test Admin");     // originalet (saknades) rörs aldrig igen
  });

  it("30-gränsen: ett rättat km som byter artikel säger det INNAN man sparar", async () => {
    mock.extraUnderlag = [];
    mock.flyttar.push(BEN("bg3", "3bfa4d19", "A130743", "o-ostra", "o-vallust", 28, 60, true, { fakturerbar_manuell: true }));   // 28 km: fakturerbar bara för att admin valt det
    mock.extraUnderlag = [U("og3", "2026-10-09", 28, "A130743", "o-ostra", "o-vallust", { ...OGODKAND, flytt_id: "bg3" })];
    await oppnaFakturering();
    await oppnaS("og3", "Elefant 26");
    await skrivIn(kmS(), "29");
    expect(dlg()!.querySelector('[role="note"]')).toBeNull();           // fortfarande fast belopp
    await skrivIn(kmS(), "31");
    expect(dlg()!.querySelector('[role="note"]')!.textContent).toBe("Över 30 km faktureras flytten på tid (artikel 3). Timmarna skriver du in på trakten.");
  });

  it("ogiltigt km (text, noll, tomt) kan inte sparas; decimalkomma går", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await skrivText(anledningS(), "test");
    for (const v of ["abc", "0", "-5", ""]) {
      await skrivIn(kmS(), v);
      expect(sparaS().disabled).toBe(true);
    }
    await skrivIn(kmS(), "abc");
    expect(dlg()!.querySelector('[role="alert"]')!.textContent).toContain("Skriv km som ett tal större än noll");
    await skrivIn(kmS(), "46,5");
    expect(sparaS().disabled).toBe(false);
    await klicka(sparaS());
    expect(mock.skrivningar[0].varden).toEqual({ km: 46.5, redigerad_av: "Test Admin" });
  });

  it("km som saknades kan fyllas i, och märks 'ifylld, saknades i datan' — aldrig som en mätning", async () => {
    mock.flyttar.push(BEN("bg4", "3bfa4d19", "A130743", "o-ostra", "o-vallust", null as any, 60, true, { fakturerbar_manuell: true }));   // utan mätt km är det bara admins val som gör den fakturerbar
    mock.extraUnderlag = [U("og4", "2026-10-09", null, "A130743", "o-ostra", "o-vallust", { ...OGODKAND, flytt_id: "bg4", kund: "Vida" })];
    await oppnaFakturering();
    expect(underlagRad("og4")!.textContent).toContain("km saknas i datan");
    await oppnaS("og4", "Elefant 26");
    expect(kmS().value).toBe("");
    expect(dlg()!.querySelector("[data-matt]")!.textContent).toBe("km");    // inget fakturerat km och ingen mätning: ingen skillnad att visa
    await skrivIn(kmS(), "44");
    expect(dlg()!.querySelector("[data-matt]")!.textContent).toBe("km · mätt saknas i datan");   // nu skiljer det: fakturerat men aldrig mätt
    await skrivIn(kmS(), "");
    await skrivIn(kmS(), "44"); await skrivText(anledningS(), "mätt av föraren"); await klicka(sparaS());
    expect(underlagRad("og4")!.textContent).toContain("44 km");
    expect(underlagRad("og4")!.textContent).toContain("ifylld, saknades i datan");
  });
});

describe("Flytten (sheet): FLYTTEN går via ratta_flytt, med bara de nycklar som ändrats", () => {
  beforeEach(medBg1);

  it("maskinbyte: väljaren listar egna maskiner + 'Annan maskin'; förhandsbeskedet säger att positionen följer med; skickar BARA maskin_id + extern_maskin + p_av", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(valRad("Maskin")!);
    expect(dlg()!.getAttribute("aria-label")).toBe("Maskin");
    const val = Array.from(dlg()!.querySelectorAll('[role="option"]')).map(o => o.textContent!.replace(/check$/, ""));
    expect(val).toEqual(expect.arrayContaining(["Giant", "Elefant 26", "Wisent", "810E"]));
    expect(val[val.length - 1]).toContain("Annan maskin");
    await klicka(knapp(/Giant/, dlg()!));
    expect(dlg()!.querySelector('[data-flytt-vy="huvud"]')).not.toBeNull();
    expect(valRad("Maskin")!.textContent).toContain("Giant");
    expect(dlg()!.textContent).toContain("Ändras från Elefant 26");
    expect(besked()).toBe("Positionen följer med till Giant");
    expect(sparaS().disabled).toBe(true);                           // anledning saknas
    await skrivText(anledningS(), "  fel maskin vald  ");
    await klicka(sparaS());
    expect(mock.rpc).toEqual([{ namn: "ratta_flytt", args: { p_flytt: "bg1", p_andringar: { maskin_id: "PONS20SDJAA270231", extern_maskin: null }, p_anledning: "fel maskin vald", p_av: "Test Admin" } }]);
    expect(mock.skrivningar).toEqual([]);                            // inget FAKTURA-steg när inget där ändrats
    expect(dlg()).toBeNull();
    expect(document.querySelector("[data-kvitto]")!.textContent).toContain("Flytten är rättad.");
  });

  it("'Annan maskin': fritext → extern_maskin, maskin_id null; förhandsbeskedet varnar att positionen inte följer med", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(valRad("Maskin")!);
    await klicka(knapp(/Annan maskin/, dlg()!));
    expect((knapp(/^Använd$/, dlg()!) as HTMLButtonElement).disabled).toBe(true);
    await skrivIn(dlg()!.querySelector('input[aria-label="Annans maskin"]') as HTMLInputElement, "  Hyrd Ponsse  ");
    await klicka(knapp(/^Använd$/, dlg()!));
    expect(valRad("Maskin")!.textContent).toContain("Hyrd Ponsse");
    expect(besked()).toBe("Positionen följer inte med vid byte till eller från en annan maskin — kolla kartan efteråt");
    await skrivText(anledningS(), "kundens maskin");
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ maskin_id: null, extern_maskin: "Hyrd Ponsse" });
  });

  it("till-trakt: sök bland trakter och platser (ingen fritext), skickar paret objekt + plats; ingen id syns", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(valRad("Till")!);
    expect(dlg()!.getAttribute("aria-label")).toBe("Till");
    await skrivIn(dlg()!.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement, "tjuv");
    expect(dlg()!.textContent).not.toContain("o-tjuvon");
    await klicka(knapp(/Tjuvön AU 2026/, dlg()!));
    expect(valRad("Till")!.textContent).toContain("Tjuvön AU 2026");
    expect(dlg()!.textContent).toContain("Ändras från Vällust RP M-R -25");
    // koord_kalla = 'objekt': km kom från trakten. Allt om trakten är EN text under Till-raden — inget nere vid Spara.
    expect(valRad("Till")!.parentElement!.querySelector("[data-varning]")!.textContent)
      .toMatch(/^Tjuvön AU 2026 ligger \d+ km från där maskinen lämnades, och sträckan 62 km räknades från Vällust RP M-R -25\. Stämmer valet\?$/);
    expect(besked()).toBeNull();
    await skrivText(anledningS(), "valde fel trakt");
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ till_objekt_id: "o-tjuvon", till_plats_id: null });
  });

  it("typ → Service: 'Blir inte fakturerbar — underlaget stryks' innan man sparar; skickar bara flytt_typ; inget FAKTURA-steg; tillbaka till Produktion tar bort beskedet", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Typ", /Service/);
    expect(besked()).toBe("Blir inte fakturerbar — underlaget stryks");
    await valj("Typ", /Produktion/);
    expect(besked()).toBeNull();
    await valj("Typ", /Service/);
    await skrivText(anledningS(), "verkstadsbesök");
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ flytt_typ: "service" });
    expect(mock.skrivningar).toEqual([]);
    const kvitto = document.querySelector("[data-kvitto]")!.textContent!;
    expect(kvitto).toContain("Flytten är rättad.");
    expect(kvitto).toContain("Den är inte längre fakturerbar");
    expect(underlagRad("og1")!.dataset.status).toBe("struken");
  });

  it("typ → Kunduppdrag kräver kund INNAN man sparar; kunden följer med i samma ratta_flytt", async () => {
    mock.extraUnderlag = [{ ...OG_OKT(), kund: null }];
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Typ", /Kunduppdrag/);
    await skrivText(anledningS(), "körde åt Vida");
    expect(sparaS().disabled).toBe(true);
    expect(dlg()!.querySelector("[data-kund-krav]")!.textContent).toBe("Välj kund — den här flytten faktureras");
    await skrivIn(kundS(), "Vida Skog");
    expect(sparaS().disabled).toBe(false);
    expect(dlg()!.querySelector("[data-kund-krav]")).toBeNull();
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ flytt_typ: "kunduppdrag", kund: "Vida Skog" });
    expect(mock.skrivningar).toEqual([]);                            // kunden gick med flytten, inte som en separat underlagsskrivning
  });

  it("FLYTTEN + FAKTURA: ratta_flytt först (bara flyttnycklar), sedan underlaget (bara km + vem)", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Maskin", /Giant/);
    await skrivIn(kmS(), "58");
    await skrivText(anledningS(), "fel maskin och fel km");
    await klicka(sparaS());
    expect(mock.rpc).toHaveLength(1);
    expect(mock.rpc[0].args.p_andringar).toEqual({ maskin_id: "PONS20SDJAA270231", extern_maskin: null });
    expect(mock.skrivningar.map(x => x.varden)).toEqual([{ km: 58, redigerad_av: "Test Admin" }]);
    expect(dlg()).toBeNull();
  });

  it("faller ratta_flytt sparas INGENTING (inte heller FAKTURA-delen), felet står som det är och sheeten står kvar", async () => {
    mock.rpcHandler = () => ({ data: null, error: { message: "Flytten är godkänd för fakturering — lämna tillbaka den till Att godkänna först" } });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Maskin", /Giant/);
    await skrivIn(kmS(), "58");
    await skrivText(anledningS(), "test");
    await klicka(sparaS());
    expect(dlg()!.textContent).toContain("Flytten är godkänd för fakturering — lämna tillbaka den till Att godkänna först");
    expect(mock.skrivningar).toEqual([]);
    expect(dlg()!.querySelector('[data-flytt-vy="huvud"]')).not.toBeNull();
    expect(valRad("Maskin")!.textContent).toContain("Giant");        // inget gick förlorat
    expect(document.querySelector("[data-kvitto]")).toBeNull();
  });

  it("migrationen ej körd (funktionen saknas): säger det i klartext, inga råa stackspår", async () => {
    mock.rpcHandler = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.ratta_flytt" } });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Typ", /Service/);
    await skrivText(anledningS(), "test");
    await klicka(sparaS());
    expect(dlg()!.textContent).toContain("Rättningen är inte installerad i databasen än (migration 20261015170000)");
    expect(dlg()!.textContent).not.toContain("PGRST202");
  });

  it("flytten rättades men FAKTURA-delen föll: sheeten stänger och sidan säger exakt vad som inte sparades", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Maskin", /Giant/);
    await skrivIn(kmS(), "58");
    await skrivText(anledningS(), "test");
    mock.skrivFel = true;
    await klicka(sparaS());
    expect(mock.rpc).toHaveLength(1);
    expect(dlg()).toBeNull();
    expect(text()).toContain("Flytten är rättad, men ändringen under Faktura sparades inte: boom");
  });

  it("databasen lämnade positionen orörd (osäker/hittades inte): kvittot säger 'kolla kartan'", async () => {
    mock.rpcHandler = () => ({ data: { fakturerbar_fore: true, fakturerbar_efter: true, underlag: "uppdaterat", position: "osaker" }, error: null });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Maskin", /Giant/);
    await skrivText(anledningS(), "fel maskin");
    await klicka(sparaS());
    expect(document.querySelector("[data-kvitto]")!.textContent).toContain("Positionen kunde inte flyttas automatiskt — kolla kartan.");
  });
});

describe("Flytten (sheet): stryka", () => {
  beforeEach(medBg1);

  it("egen vy (inte alert): säger vad som händer, kräver anledning, ingen extra 'Är du säker?', anropar stryk_flytt och bekräftar med svaret", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(knapp(/^Stryk flytten …$/, dlg()!));
    expect(dlg()!.getAttribute("aria-label")).toBe("Stryk flytten");
    const konsekvens = Array.from(dlg()!.querySelectorAll("[data-stryk-konsekvens] li")).map(l => l.textContent);
    expect(konsekvens).toEqual(["Flytten markeras som struken", "Underlaget stryks", "Positionen i Vällust RP M-R -25 tas bort om den går att identifiera exakt"]);
    expect((knapp(/^Stryk flytten$/, dlg()!) as HTMLButtonElement).disabled).toBe(true);
    await skrivText(anledningS(), "  flyttades aldrig  ");
    expect((knapp(/^Stryk flytten$/, dlg()!) as HTMLButtonElement).disabled).toBe(false);
    await klicka(knapp(/^Stryk flytten$/, dlg()!));
    expect(mock.rpc).toEqual([{ namn: "stryk_flytt", args: { p_flytt: "bg1", p_anledning: "flyttades aldrig", p_av: "Test Admin" } }]);
    expect(mock.skrivningar).toEqual([]);                            // appen skriver aldrig underlaget själv för det här
    expect(dlg()).toBeNull();
    const kvitto = document.querySelector("[data-kvitto]")!.textContent!;
    expect(kvitto).toContain("Flytten är struken.");
    expect(kvitto).toContain("Positionen som skrevs när flytten avslutades är borttagen.");
    expect(rubriker()).toEqual(["Vad väntar på faktura? · 2", "Vad är struket? · 1"]);
    expect(remsa()!.textContent).toContain("89 km");
  });

  it("positionen kunde inte tas bort exakt: kvittot säger att kartan ska kollas", async () => {
    mock.rpcHandler = () => ({ data: { underlag: "struket", position: "osaker" }, error: null });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(knapp(/^Stryk flytten …$/, dlg()!));
    await skrivText(anledningS(), "test");
    await klicka(knapp(/^Stryk flytten$/, dlg()!));
    expect(document.querySelector("[data-kvitto]")!.textContent).toContain("Positionen kunde inte tas bort automatiskt — kolla kartan.");
  });

  it("databasens fel visas som det är och vyn står kvar", async () => {
    mock.rpcHandler = () => ({ data: null, error: { message: "Flytten är redan struken" } });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(knapp(/^Stryk flytten …$/, dlg()!));
    await skrivText(anledningS(), "test");
    await klicka(knapp(/^Stryk flytten$/, dlg()!));
    expect(dlg()!.textContent).toContain("Flytten är redan struken");
    expect(dlg()!.getAttribute("aria-label")).toBe("Stryk flytten");
  });

  it("Avbryt i stryk-vyn går tillbaka till Flytten, inte ut ur sheeten", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(knapp(/^Stryk flytten …$/, dlg()!));
    await klicka(knapp(/^Avbryt$/, dlg()!));
    expect(dlg()!.querySelector('[data-flytt-vy="huvud"]')).not.toBeNull();
    expect(mock.rpc).toEqual([]);
  });
});

describe("Flytten (sheet): låsta flyttar och historik", () => {
  beforeEach(() => { mock.flyttar.push(BG1()); mock.rpcHandler = rpcSomDb; });

  it("GODKÄND flytt: allt läsbart, inga chevrons, ingen Spara, grå rad med vad man ska göra — och Lämna tillbaka öppnar den för rättning", async () => {
    await oppnaFakturering();
    await oppnaS("u8", "Giant");                                     // u8 är godkänd (backfill)
    expect(dlg()!.textContent).toContain("Giant");
    expect(dlg()!.textContent).toContain("Vällust RP M-R -25");
    expect(dlg()!.querySelectorAll("button[aria-label*=':']")).toHaveLength(0);   // inga rader att trycka på
    expect(dlg()!.querySelector("input, textarea")).toBeNull();
    expect(knapp(/^Spara/, dlg()!)).toBeUndefined();
    expect(knapp(/^Stryk flytten/, dlg()!)).toBeUndefined();
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Godkänd — lämna tillbaka till Att godkänna för att ändra");
    await klicka(knapp(/^Lämna tillbaka till Att godkänna$/, dlg()!));
    expect(mock.skrivningar[0].varden).toEqual({ godkand_tid: null, godkand_av: null });
    expect(dlg()).toBeNull();
    expect(underlagRad("u8")!.dataset.status).toBe("att_godkanna");
    await oppnaS("u8", "Giant");
    expect(valRad("Maskin")).not.toBeNull();                         // nu rättbar
  });

  it("FAKTURERAD flytt: öppnas för läsning, 'går inte att ändra', ingen väg tillbaka härifrån", async () => {
    mock.underlag.find(x => x.id === "u8")!.fakturerad_tid = "2026-10-10T08:00:00Z";
    await oppnaFakturering();
    await oppnaS("u8", "Giant");
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Fakturerad — går inte att ändra");
    expect(knapp(/Lämna tillbaka/, dlg()!)).toBeUndefined();
    expect(knapp(/^Spara/, dlg()!)).toBeUndefined();
    expect(dlg()!.querySelectorAll("button[aria-label*=':']")).toHaveLength(0);
  });

  it("strukna rader går att öppna för läsning: en struken flytt är låst med en grå rad", async () => {
    mock.flyttar.find(f => f.id === "bg1")!.avbruten = true;
    mock.extraUnderlag = [U("st1", "2026-10-03", 30, "A130743", "o-ostra", "o-vallust", { status: "struken", struken_tid: "2026-10-04T08:00:00Z", struken_anledning: "dubblett", flytt_id: "bg1" })];
    await oppnaFakturering();
    expect(underlagRad("st1")!.textContent).toContain("dubblett");
    await oppnaS("st1", "Elefant 26");
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Struken — flytten hände aldrig och går inte att ändra");
    expect(knapp(/^Spara/, dlg()!)).toBeUndefined();
  });

  it("historiken längst ner: senaste rättningarna ur spåret, med vem, när, vad och varför — bara läsning", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.rattningar.push(
      { id: "r1", flytt_id: "bg1", tid: "2026-10-14T09:00:00Z", av: "Joacim", anledning: "valde fel maskin", slag: "rattning",
        fore: { maskin_id: "PONS20SDJAA270231", extern_maskin: null, fran_objekt_id: "o-ostra", fran_plats_id: null, till_objekt_id: "o-vallust", till_plats_id: null, flytt_typ: "produktion", kund: null },
        efter: { maskin_id: "A130743", extern_maskin: null, fran_objekt_id: "o-ostra", fran_plats_id: null, till_objekt_id: "o-vallust", till_plats_id: null, flytt_typ: "produktion", kund: null },
        underlag_atgard: "uppdaterat", position_atgard: "flyttad" },
      { id: "r2", flytt_id: "bg1", tid: "2026-10-14T10:00:00Z", av: "Martin", anledning: "fel trakt", slag: "rattning",
        fore: { maskin_id: "A130743", extern_maskin: null, fran_objekt_id: "o-ostra", fran_plats_id: null, till_objekt_id: "o-tjuvon", till_plats_id: null, flytt_typ: "produktion", kund: null },
        efter: { maskin_id: "A130743", extern_maskin: null, fran_objekt_id: "o-ostra", fran_plats_id: null, till_objekt_id: "o-vallust", till_plats_id: null, flytt_typ: "produktion", kund: null },
        underlag_atgard: "uppdaterat", position_atgard: "ingen" });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    const h = dlg()!.querySelector('section[aria-label="Historik"]')!;
    expect(h.textContent).toMatch(/Rättad av Joacim .* — maskin Giant → Elefant 26: valde fel maskin/);
    expect(h.textContent).toMatch(/Rättad av Martin .* — till Tjuvön AU 2026 → Vällust RP M-R -25: fel trakt/);
    expect(h.querySelector("button, input")).toBeNull();
  });

  it("ingen historik: ingen tom rubrik", async () => {
    mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector('section[aria-label="Historik"]')).toBeNull();
  });

  it("läsfel på flytten: sheeten säger det och Försök igen läser om — aldrig öppen på gissade värden", async () => {
    mock.extraUnderlag = [OG_OKT()];
    mock.flyttar = null as any;                                      // gör att maskin_flytt-frågan kastar i mocken
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.textContent).toContain("Kunde inte läsa flytten just nu.");
    expect(valRad("Maskin")).toBeNull();
    mock.flyttar = [BG1()];
    await klicka(knapp(/Försök igen/, dlg()!));
    expect(valRad("Maskin")).not.toBeNull();
  });
});

describe("Körningar: länken till Flyttplatser (bodde i Flyttloggen)", () => {
  it("finns på Körningar (månad) och går till /maskinflytt/platser; År-vyn är en egen sida utan den", async () => {
    await montera();
    expect(document.querySelector('a[href="/maskinflytt/platser"]')!.textContent).toContain("Flyttplatser");
    await tillAr();
    expect(document.querySelector('a[href="/maskinflytt/platser"]')).toBeNull();
  });
});

// ── Uppföljning › Maskiner: en rad per maskin, arket med snitt och flyttlistan ─────────────────────────────────
import { prodFlyttRader } from "./_components/maskiner.fixtur";
import { PROD_VIKT_RADER } from "./_components/vikt.fixtur";
import { dagarSedan } from "./_components/maskiner";

/** Martins prod-siffror 2026-10-20 (19 flyttar) som rader i maskin_flytt-fejken. */
const maskinRader = () => prodFlyttRader().map(r => ({
  ...BEN(r.id, "x", r.maskin_id ?? "JD810E", r.fran_objekt_id, r.till_objekt_id ?? "o-ostra", r.flytt_km ?? 0, r.tid_flytt_min ?? 0, false),
  ...r, flyttdag_id: "x", avbruten: false,
}));
const maskinerSek = () => document.querySelector("[data-maskiner]") as HTMLElement;
const maskinRad = (namn: string) => knapp(new RegExp(`^Visa ${namn}$`), maskinerSek())!;
const norm = (t: string | null | undefined) => (t ?? "").replace(/chevron_right/g, "").replace(/\s/g, " ");

describe("Uppföljning: Maskiner", () => {
  beforeEach(() => { mock.flyttar = maskinRader(); });

  it("står under månadslistan med rubriken Maskiner, en rad per maskin, flest flyttar först", async () => {
    await montera();
    await tillAr();
    const sek = maskinerSek();
    expect(sek.querySelector("h3")!.textContent).toBe("Maskiner");
    const manader = arsSida()!.querySelector('section[aria-label="Månader"]')!;
    expect(!!(manader.compareDocumentPosition(sek) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    const rader = Array.from(sek.querySelectorAll("button")).map(b => norm(b.textContent));
    expect(rader).toEqual([
      "Giant11 flyttar249 km", "Elefant 264 flyttar143 km", "Wisent2 flyttar54 km", "810E1 flytt31 km", "R644281 flytt16 km",
    ]);
  });

  it("Giant: antal stort, 'Står på X sedan N dagar', och de tre snitten med antalet utskrivet", async () => {
    await montera();
    await tillAr();
    await klicka(maskinRad("Giant"));
    const d = dlg()!;
    expect(d.getAttribute("aria-label")).toBe("Giant");
    expect(d.querySelector("[data-maskin-antal]")!.textContent).toBe("11 flyttar");
    expect(d.textContent).toContain("i 2026");
    expect(d.querySelector("[data-star-pa]")!.textContent).toMatch(/^Står på .+ sedan \d+ dagar$/);
    const snitt = norm(d.querySelector("[data-maskin-snitt]")!.textContent);
    expect(snitt).toContain("Lassat → lossat");
    expect(snitt).toContain("snitt av 11 flyttar");
    expect(snitt).toContain("Snitt-kmsnitt av 11 flyttar23 km");              // 249 / 11 = 22,6
    expect(snitt).toContain("På en traktsnitt av 5 mellanrum2,8 dagar");
    expect(snitt).not.toMatch(/kan inte räknas|saknar/);
  });

  it("Elefant 26: för få räknebara mellanrum ger inget snitt, och flyttar utan Från står som 'Från saknas'", async () => {
    await montera();
    await tillAr();
    await klicka(maskinRad("Elefant 26"));
    const snitt = norm(dlg()!.querySelector("[data-maskin-snitt]")!.textContent);
    expect(snitt).toContain("På en traktbara 1 mellanrum – för få för snitt–");
    expect(snitt).not.toMatch(/kan inte räknas/);
    expect(snitt).toContain("snitt av 4 flyttar");
    const lista = norm(dlg()!.querySelector("[data-maskin-flyttar]")!.textContent);
    expect(lista.match(/Från saknas/g)).toHaveLength(3);
  });

  it("Wisent (2 flyttar): inget snitt — 'bara 2 flyttar – för få för snitt' — och flyttlistan har båda flyttarna med km och tid", async () => {
    await montera();
    await tillAr();
    await klicka(maskinRad("Wisent"));
    const d = dlg()!;
    expect(norm(d.querySelector("[data-maskin-snitt]")!.textContent)).toContain("bara 2 flyttar – för få för snitt");
    const rader = d.querySelectorAll("[data-maskin-flyttar] > *");
    expect(rader).toHaveLength(2);
    expect(norm(rader[0].textContent)).toMatch(/km/);
    expect(norm(d.querySelector("[data-maskin-flyttar]")!.textContent)).toMatch(/\d+ min|\d+ h/);
  });

  it("en flytt utan km räknas inte i snittet: 'N flyttar saknar km' står vid km-raden och i listan, och talet i raden är bara de som har km", async () => {
    mock.flyttar = maskinRader().map((r: any) => (r.id === "g0" ? { ...r, flytt_km: null } : r));
    await montera();
    await tillAr();
    expect(norm(maskinRad("Giant").textContent)).toContain("1 flytt saknar km");
    expect(norm(maskinRad("Giant").textContent)).toContain("229 km");
    await klicka(maskinRad("Giant"));
    expect(norm(dlg()!.querySelector("[data-maskin-snitt]")!.textContent)).toContain("snitt av 10 flyttar · 1 flytt saknar km");
    expect(norm(dlg()!.querySelector("[data-maskin-flyttar]")!.textContent)).toContain("km saknas");
  });

  it("alla flyttar utan km: raden visar '–' och 'N flyttar saknar km', aldrig '0 km'", async () => {
    mock.flyttar = maskinRader().map((r: any) => (r.maskin_id === "A030353" ? { ...r, flytt_km: null } : r));
    await montera();
    await tillAr();
    const t = norm(maskinRad("Wisent").textContent);
    expect(t).toBe("Wisent2 flyttar · 2 flyttar saknar km–");
    expect(t).not.toContain("0 km");
  });

  it("admin trycker en flytt i arket och får sheeten 'Flytten'; Avbryt tar tillbaka maskinens ark", async () => {
    await montera();
    await tillAr();
    await klicka(maskinRad("Giant"));
    expect(dlg()!.textContent).toContain("Tryck på en flytt för att rätta eller stryka den.");
    await klicka(knapp(/^Visa flytten Giant/, dlg()!.querySelector("[data-maskin-flyttar]")!)!);
    expect(dlg()!.getAttribute("aria-label")).toMatch(/^Giant · /);
    expect(valRad("Maskin")).not.toBeNull();
    await klicka(knapp(/^Avbryt$/, dlg()!)!);
    expect(dlg()!.getAttribute("aria-label")).toBe("Giant");
  });

  it("en förare ser maskinerna och flyttlistan men kan inte öppna en flytt för att rätta den", async () => {
    mock.medarbetare = FORARE;
    await montera();
    await tillAr();
    await klicka(maskinRad("Giant"));
    expect(dlg()!.querySelector("[data-maskin-antal]")!.textContent).toBe("11 flyttar");
    expect(dlg()!.textContent).not.toContain("Tryck på en flytt");
    expect(knapp(/^Visa flytten/, dlg()!)).toBeUndefined();
  });

  it("andras maskiner är en egen sista rad och har varken 'Står på' eller 'På en trakt'", async () => {
    mock.flyttar = [...maskinRader(), ...[1, 2].map(n => ({
      ...BEN(`x${n}`, "x", "JD810E", "o-vallust", "o-ostra", 40, 120, false),
      maskin_id: null, extern_maskin: n === 1 ? "Vidas skördare" : "Annan skördare", flyttdag_id: "x", avbruten: false,
      starttid: "2026-09-10T06:00:00Z", hamtad_tid: "2026-09-10T06:00:00Z", sluttid: `2026-09-1${n}T09:00:00Z`, flytt_km: 40, tid_flytt_min: 120,
    }))];
    await montera();
    await tillAr();
    const rader = Array.from(maskinerSek().querySelectorAll("button")).map(b => norm(b.textContent));
    expect(rader[rader.length - 1]).toBe("Andras maskiner2 flyttar80 km");
    await klicka(maskinRad("Andras maskiner"));
    expect(dlg()!.querySelector("[data-star-pa]")).toBeNull();
    expect(norm(dlg()!.querySelector("[data-maskin-snitt]")!.textContent)).not.toContain("På en trakt");
    expect(norm(dlg()!.querySelector("[data-maskin-flyttar]")!.textContent)).toContain("Vidas skördare");
  });

  it("pågående och avbrutna flyttar räknas inte", async () => {
    mock.flyttar = [...maskinRader(), { ...BEN("pag", "x", "PONS20SDJAA270231", "o-vallust", "o-ostra", 0, 0, false), sluttid: null, avbruten: false, flyttdag_id: "x" },
      { ...BEN("avb", "x", "PONS20SDJAA270231", "o-vallust", "o-ostra", 99, 99, false), sluttid: "2026-09-30T10:00:00Z", avbruten: true, flyttdag_id: "x" }];
    await montera();
    await tillAr();
    expect(norm(maskinRad("Giant").textContent)).toContain("11 flyttar");
    expect(norm(maskinRad("Giant").textContent)).toContain("249 km");
  });

  it("ingen flytt i året: det står, aldrig en tom ruta", async () => {
    mock.flyttar = [];
    await montera();
    await tillAr();
    expect(maskinerSek().textContent).toContain("Inga flyttar i 2026.");
  });

  it("läsfel: säger det med Försök igen och tar inte bort resten av sidan; Försök igen läser om", async () => {
    mock.maskinerFel = true;
    await montera();
    await tillAr();
    expect(maskinerSek().textContent).toContain("Kunde inte läsa maskinerna just nu.");
    expect(document.querySelector('section[aria-label="Året"]')).not.toBeNull();     // årets körning är kvar
    mock.maskinerFel = false;
    await klicka(knapp(/Försök igen/, maskinerSek())!);
    expect(norm(maskinRad("Giant").textContent)).toContain("11 flyttar");
  });

  it("året byts i Uppföljning: maskinerna läses för det året", async () => {
    await montera();
    await tillAr();
    expect(knapp(/Förra året/)!.hasAttribute("disabled")).toBe(true);                  // 2025 finns inte; samma regel som resten av sidan
    expect(maskinerSek().textContent).toContain("Giant");
  });
});

// ── Rätta och stryka en flytt (rundans ark, bara admin) ───────────────────────────────────────────
// Databasfunktionerna (ratta_flytt, stryk_flytt, låset) är provade i riktig Postgres; här mockas rpc och
// vaktas vad appen SKICKAR, vad den SÄGER innan man sparar, och hur den låser.
import { fakturerbarEffektiv } from "@/lib/flytt/fakturerbar";

/** Som databasfunktionen, så långt testet behöver: tillämpar rättningen på de delade raderna och svarar som den. */
function rpcSomDb(namn: string, args: any) {
  const f = mock.flyttar.find(x => x.id === args.p_flytt);
  if (!f) return { data: null, error: { message: "Flytten finns inte" } };
  const u = [...mock.underlag, ...mock.extraUnderlag].find(x => x.flytt_id === f.id);
  const fore = { ...f };
  if (namn === "stryk_flytt") {
    f.avbruten = true; f.redigerad_tid = "2026-10-15T16:00:00Z"; f.redigerad_av = args.p_av;
    if (u && u.status === "aktiv") Object.assign(u, { status: "struken", struken_tid: "2026-10-15T16:00:00Z", struken_anledning: "Flytten struken: " + args.p_anledning });
    mock.rattningar.push({ id: "r" + mock.rattningar.length, flytt_id: f.id, tid: "2026-10-15T16:00:00Z", av: args.p_av, anledning: args.p_anledning, slag: "stryk", fore: {}, efter: {}, underlag_atgard: u ? "struket" : "ingen", position_atgard: "raderad" });
    return { data: { underlag: u ? "struket" : "ingen", position: "raderad" }, error: null };
  }
  Object.assign(f, args.p_andringar);
  f.fakturerbar = fakturerbarEffektiv(f.flytt_typ, f.flytt_km, f.fakturerbar_manuell ?? null);   // som databasens fakturerbar_effektiv
  f.redigerad_tid = "2026-10-15T16:00:00Z"; f.redigerad_av = args.p_av;
  let underlag = "ingen";
  if (u && fore.fakturerbar && !f.fakturerbar) { Object.assign(u, { status: "struken", struken_tid: "2026-10-15T16:00:00Z" }); underlag = "struket"; }
  else if (!u && f.fakturerbar) underlag = "skapat";
  else if (u) underlag = "uppdaterat";
  mock.rattningar.push({ id: "r" + mock.rattningar.length, flytt_id: f.id, tid: "2026-10-15T16:00:00Z", av: args.p_av, anledning: args.p_anledning, slag: "rattning",
    fore: { maskin_id: fore.maskin_id, extern_maskin: null, fran_objekt_id: fore.fran_objekt_id, fran_plats_id: null, till_objekt_id: fore.till_objekt_id, till_plats_id: null, flytt_typ: fore.flytt_typ, kund: fore.kund, fakturerbar_manuell: fore.fakturerbar_manuell ?? null }, efter: { fakturerbar_manuell: f.fakturerbar_manuell ?? null }, underlag_atgard: underlag, position_atgard: "ingen" });
  return { data: { fakturerbar_fore: fore.fakturerbar, fakturerbar_efter: f.fakturerbar, underlag, position: "ingen" }, error: null };
}
/** Flyttar i oktoberrundan 3e823d15 som INTE är fakturerbara och därför saknar underlag (service, 53 resp. 20 km). */
const BN1 = () => BEN("bn1", "3e823d15", "A130743", "o-halaback", "o-ostra", 53, 40, false, { flytt_typ: "service", fran_lat: 56.40, fran_lng: 14.60, starttid: "2026-10-06T14:00:00Z", koord_kalla: "gps" });
/** En kort produktionsflytt: 15 km, under gränsen, ingen automatisk fakturering och inget underlag. */
const BN3 = () => BEN("bn3", "3e823d15", "A130743", "o-halaback", "o-ostra", 15, 25, false, { starttid: "2026-10-06T14:00:00Z", koord_kalla: "gps" });
const BN2 = () => BEN("bn2", "3e823d15", "A030353", "o-brokamala", "o-tjuvon", 20, 25, false, { flytt_typ: "service" });
const arkEl = () => document.querySelector('[role="dialog"]') as HTMLElement;
const kvittoRunda = () => document.querySelector("[data-ratta-kvitto]") as HTMLElement | null;
/** Montera Körningar, öppna oktoberrundan 3e823d15 och tryck på flyttraden för `maskin`. */
async function oppnaFranRunda(maskin: string) {
  await montera();
  await klicka(document.querySelector('[data-runda="3e823d15"]') as HTMLElement);
  await klicka(knapp(new RegExp(`Visa flytten ${maskin}`), arkEl()));
}

describe("Flytten från Körningar: samma sheet som i Fakturering, för alla avslutade flyttar", () => {
  beforeEach(() => { mock.rpcHandler = rpcSomDb; });

  it("förare ser inga rättningsrader och skickar aldrig frågan om underlag eller spår (ekonomidata)", async () => {
    mock.medarbetare = FORARE;
    await montera();
    await klicka(document.querySelector('[data-runda="3e823d15"]') as HTMLElement);
    expect(arkEl()).not.toBeNull();
    expect(knapp(/Visa flytten/, arkEl())).toBeUndefined();
    expect(arkEl().textContent).not.toContain("Tryck på en flytt för att rätta eller stryka den.");
    expect(mock.anrop.filter(a => a === "maskin_flytt_rattning" || a === "fakturaunderlag_flytt")).toEqual([]);
  });

  it("admin: en flyttrad öppnar Flytten, också en som inte är fakturerbar — FAKTURA finns inte utan underlag", async () => {
    mock.flyttar.push(BN1());
    await oppnaFranRunda("Elefant 26");
    expect(dlg()!.querySelector('[data-flytt-vy="huvud"]')).not.toBeNull();
    expect(valRad("Maskin")!.textContent).toContain("Elefant 26");
    expect(valRad("Från")!.textContent).toContain("Hålabäck au 2025");
    expect(valRad("Till")!.textContent).toContain("Östra-Hoka 1:7 A-C -25");
    expect(valRad("Typ")!.textContent).toContain("Service");
    // FAKTURA visas ALLTID — "Nej" är ett svar. Sträcka och kund finns inte (flytten faktureras inte).
    const faktura = dlg()!.querySelector('section[aria-label="Faktura"]')!;
    expect(faktura.textContent).toContain("FaktureraNej");
    expect(faktura.textContent).toContain("Automatiskt: nej — service faktureras inte");
    expect(faktura.querySelector('button[role="switch"]')!.getAttribute("aria-checked")).toBe("false");
    expect(kmS()).toBeNull();
    expect(dlg()!.querySelector("[data-matt-flytt]")!.textContent).toContain("Mätt sträcka 53 km — går inte att rätta");
    expect(sparaS().disabled).toBe(true);
    expect(knapp(/^Stryk flytten …$/, dlg()!)).toBeDefined();
  });

  it("flytt MED underlag visar FAKTURA (sträcka + kund) också härifrån", async () => {
    const u7 = mock.underlag.find(x => x.id === "u7")!; u7.godkand_tid = null; u7.godkand_av = null;
    await montera();
    await klicka(document.querySelector('[data-runda="3bfa4d19"]') as HTMLElement);
    await klicka(knapp(/Visa flytten Elefant 26/, arkEl()));
    expect(dlg()!.querySelector('section[aria-label="Faktura"]')).not.toBeNull();
    expect(kmS().value).toBe("36");
    expect(dlg()!.querySelector("[data-matt]")!.textContent).toBe("km");
    await valj("Typ", /Service/);
    expect(besked()).toBe("Blir inte fakturerbar — underlaget stryks");    // åt det hållet också
  });

  it("icke-fakturerbar Service 53 km → Produktion: 'Blir fakturerbar — hamnar under Att godkänna', och ratta_flytt får flytt_typ + kunden som krävs", async () => {
    mock.flyttar.push(BN1());
    await oppnaFranRunda("Elefant 26");
    expect(besked()).toBeNull();
    await valj("Typ", /Produktion/);
    expect(besked()).toBe("Blir fakturerbar — hamnar under Att godkänna");
    expect(sparaS().disabled).toBe(true);                                         // anledning saknas
    await skrivText(anledningS(), "  det var en produktionsflytt, inte service  ");
    expect(sparaS().disabled).toBe(true);                                         // blir fakturerbar → kund krävs
    expect(dlg()!.querySelector("[data-kund-krav]")!.textContent).toBe("Välj kund — den här flytten faktureras");
    await skrivIn(kundS(), "Vida");
    await klicka(sparaS());
    expect(mock.rpc).toEqual([{ namn: "ratta_flytt", args: { p_flytt: "bn1", p_andringar: { flytt_typ: "produktion", kund: "Vida" }, p_anledning: "det var en produktionsflytt, inte service", p_av: "Test Admin" } }]);
    expect(mock.skrivningar).toEqual([]);                                         // inget underlag fanns att skriva mot
    // tillbaka i rundans ark: kvittot säger vad databasen gjorde, och flyttens markering är uppdaterad
    expect(arkEl().querySelector('[data-flytt-vy]')).toBeNull();
    expect(kvittoRunda()!.textContent).toContain("Flytten är rättad.");
    expect(kvittoRunda()!.textContent).toContain("Den är nu fakturerbar och ligger under Att godkänna.");
    expect(arkEl().textContent).toContain("Rättad av Test Admin");
  });

  it("Service under 30 km → Produktion blir inte fakturerbar: inget förhandsbesked om fakturering", async () => {
    mock.flyttar.push(BN2());
    await oppnaFranRunda("Wisent");
    await valj("Typ", /Produktion/);
    expect(besked()).toBeNull();
    await skrivText(anledningS(), "test");
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ flytt_typ: "produktion" });
  });

  it("utan underlag får en flytt som faktureras sin kund under FAKTURA (kravet är både appens och databasens) och kunden följer med ratta_flytt", async () => {
    mock.flyttar.push(BN2());
    await oppnaFranRunda("Wisent");
    await valj("Typ", /Kunduppdrag/);
    expect(besked()).toBe("Blir fakturerbar — hamnar under Att godkänna");
    await skrivText(anledningS(), "körde åt Vida");
    expect(sparaS().disabled).toBe(true);
    expect(dlg()!.querySelector("[data-kund-krav]")!.textContent).toBe("Välj kund — den här flytten faktureras");
    await skrivIn(kundS(), "Vida Skog");
    expect(sparaS().disabled).toBe(false);
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ flytt_typ: "kunduppdrag", kund: "Vida Skog" });
    expect(mock.skrivningar).toEqual([]);
  });

  it("maskin, från och till skickas parvis; valt ställe långt från där bilen var ger en varning, aldrig en spärr", async () => {
    mock.flyttar.push(BN1());
    await oppnaFranRunda("Elefant 26");
    await valj("Maskin", /Giant/);
    await klicka(valRad("Från")!);
    await skrivIn(dlg()!.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement, "tjuv");
    await klicka(knapp(/Tjuvön AU 2026/, dlg()!));
    const not = dlg()!.querySelector('[role="note"]')!;
    expect(not.textContent).toMatch(/Tjuvön AU 2026 ligger \d+ km från där maskinen hämtades\. Stämmer valet\?/);
    await skrivText(anledningS(), "fel maskin och fel trakt");
    expect(sparaS().disabled).toBe(false);
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ maskin_id: "PONS20SDJAA270231", extern_maskin: null, fran_objekt_id: "o-tjuvon", fran_plats_id: null });
  });

  it("STRYK utan underlag: konsekvenserna nämner inget underlag, stryk_flytt anropas och rundan visar kvittot", async () => {
    mock.flyttar.push(BN2());
    await oppnaFranRunda("Wisent");
    await klicka(knapp(/^Stryk flytten …$/, dlg()!));
    expect(Array.from(dlg()!.querySelectorAll("[data-stryk-konsekvens] li")).map(l => l.textContent)).toEqual(["Flytten markeras som struken"]);
    expect((knapp(/^Stryk flytten$/, dlg()!) as HTMLButtonElement).disabled).toBe(true);
    await skrivText(anledningS(), "flyttades aldrig");
    await klicka(knapp(/^Stryk flytten$/, dlg()!));
    expect(mock.rpc).toEqual([{ namn: "stryk_flytt", args: { p_flytt: "bn2", p_anledning: "flyttades aldrig", p_av: "Test Admin" } }]);
    expect(kvittoRunda()!.textContent).toContain("Flytten är struken.");
    expect(arkEl().textContent).not.toContain("Wisent");                          // flytten försvann ur rundan
  });

  it("GODKÄND flytt är låst också härifrån: läsbar, grå rad, och Lämna tillbaka öppnar den för rättning", async () => {
    await montera();                                                              // b1/u8 är godkänd (backfill)
    await klicka(document.querySelector('[data-runda="3e823d15"]') as HTMLElement);
    expect(knapp(/Visa flytten Giant/, arkEl()).textContent).toContain("Låst · godkänd för fakturering");
    await klicka(knapp(/Visa flytten Giant/, arkEl()));
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Godkänd — lämna tillbaka till Att godkänna för att ändra");
    expect(dlg()!.querySelectorAll("button[aria-label*=':']")).toHaveLength(0);
    expect(knapp(/^Spara/, dlg()!)).toBeUndefined();
    await klicka(knapp(/^Lämna tillbaka till Att godkänna$/, dlg()!));
    expect(mock.skrivningar[0].varden).toEqual({ godkand_tid: null, godkand_av: null });
    expect(knapp(/Visa flytten Giant/, arkEl()).textContent).not.toContain("Låst");   // tillbaka i rundan, olåst
  });

  it("FAKTURERAD flytt är låst och har ingen väg tillbaka härifrån", async () => {
    mock.underlag.find(x => x.flytt_id === "b1")!.fakturerad_tid = "2026-10-10T08:00:00Z";
    await oppnaFranRunda("Giant");
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Fakturerad — går inte att ändra");
    expect(knapp(/Lämna tillbaka/, dlg()!)).toBeUndefined();
  });

  it("rundans rad säger att den går att öppna: 'Tryck på en flytt för att rätta eller stryka den.'", async () => {
    await montera();
    await klicka(document.querySelector('[data-runda="3e823d15"]') as HTMLElement);
    expect(arkEl().textContent).toContain("Tryck på en flytt för att rätta eller stryka den.");
  });

  it("databasens fel (lås, regel) visas som de är, inget kvitto, och sheeten står kvar", async () => {
    mock.flyttar.push(BN1());
    mock.rpcHandler = () => ({ data: null, error: { message: "Flytten är godkänd för fakturering — lämna tillbaka den till Att godkänna först" } });
    await oppnaFranRunda("Elefant 26");
    await valj("Typ", /Produktion/);
    await skrivText(anledningS(), "test");
    await skrivIn(kundS(), "Vida");
    await klicka(sparaS());
    expect(dlg()!.textContent).toContain("Flytten är godkänd för fakturering — lämna tillbaka den till Att godkänna först");
    expect(kvittoRunda()).toBeNull();
    expect(dlg()!.querySelector('[data-flytt-vy="huvud"]')).not.toBeNull();
  });

  it("Avbryt i sheeten går tillbaka till rundans ark, inte ut ur Körningar", async () => {
    mock.flyttar.push(BN1());
    await oppnaFranRunda("Elefant 26");
    await klicka(knapp(/^Avbryt$/, dlg()!));
    expect(dlg()!.querySelector('[data-flytt-vy]')).toBeNull();
    expect(knapp(/Visa flytten Elefant 26/, arkEl())).toBeDefined();
    expect(mock.rpc).toEqual([]);
  });

  it("läsfel på flytten (spåret): sheeten säger det och Försök igen läser om; rundans rader fungerar ändå", async () => {
    mock.flyttar.push(BN1());
    mock.rattningar = null as any;                                                // spårfrågan kastar i mocken
    await oppnaFranRunda("Elefant 26");
    expect(dlg()!.textContent).toContain("Kunde inte läsa flytten just nu.");
    expect(valRad("Maskin")).toBeNull();
    mock.rattningar = [];
    await klicka(knapp(/Försök igen/, dlg()!));
    expect(valRad("Maskin")).not.toBeNull();
  });
});

describe("Flytten (sheet): rubriken säger vilken flytt det är, och trakt-bytet varnar om km", () => {
  beforeEach(() => { medBg1(); });
  /** Trakt-texten under en rad (Från/Till): EN mening, eller null. */
  const traktText = (rad: string) => valRad(rad)!.parentElement!.querySelector("[data-varning]")?.textContent ?? null;

  it("rubriken: <maskinnamn> · <veckodag dag mån> · <förare>, och under den rutten Från → Till", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector("h2")!.textContent).toBe("Elefant 26 · mån 5 okt · Martin");
    expect(dlg()!.querySelector("[data-rutt]")!.textContent).toBe("Östra-Hoka 1:7 A-C -25 → Vällust RP M-R -25");
    expect(dlg()!.textContent).not.toContain("A130743");                  // aldrig maskin_id
  });

  it("samma rubrik när sheeten öppnas från Körningar, och den skiljer två flyttar med samma maskin åt", async () => {
    mock.flyttar.push(BN1());                                            // Elefant 26 igen, men tis 6 okt (runda 3e823d15, Martin)
    await oppnaFranRunda("Elefant 26");
    expect(dlg()!.querySelector("h2")!.textContent).toBe("Elefant 26 · tis 6 okt · Martin");
    await klicka(knapp(/^Avbryt$/, dlg()!));
    await klicka(knapp(/^Avbryt$/, dlg()!));                             // ut ur rundan
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector("h2")!.textContent).toBe("Elefant 26 · mån 5 okt · Martin");
  });

  it("rubriken i stryk-vyn och i den låsta vyn bär samma namn, dag och förare", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await klicka(knapp(/^Stryk flytten …$/, dlg()!));
    expect(dlg()!.querySelector('[data-flytt-vy="stryk"]')!.textContent).toContain("Elefant 26 · mån 5 okt · Martin");
    await klicka(knapp(/^Avbryt$/, dlg()!));
    await klicka(knapp(/^Avbryt$/, dlg()!));
    await oppnaS("u8", "Giant");                                         // godkänd (låst)
    expect(dlg()!.querySelector("h2")!.textContent).toMatch(/^Giant · .* · Martin$/);
  });

  it("maskinnamnet är dim_maskin.visningsnamn; saknas maskinen står det 'Okänd maskin', aldrig ett id — och en runda utan förare säger det", async () => {
    mock.flyttar.find(f => f.id === "bg1")!.maskin_id = "ZZ-OKAND-123";
    mock.flyttar.find(f => f.id === "bg1")!.flyttdag_id = "b9c1d038";    // rundan har ingen förare registrerad
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector("h2")!.textContent).toBe("Okänd maskin · mån 5 okt · förare saknas");
    expect(dlg()!.textContent).not.toContain("ZZ-OKAND-123");
  });

  it("en maskin i dim_maskin utan visningsnamn och modell får inte visa sitt id i rubriken heller", async () => {
    DIM_MASKIN.push({ maskin_id: "ZZ-TOM-456", visningsnamn: null as any, modell: null as any });
    try {
      mock.flyttar.find(f => f.id === "bg1")!.maskin_id = "ZZ-TOM-456";
      await oppnaFakturering();
      await oppnaS("og1", "Elefant 26");
      expect(dlg()!.querySelector("h2")!.textContent).toBe("Okänd maskin · mån 5 okt · Martin");
      expect(dlg()!.textContent).not.toContain("ZZ-TOM-456");
    } finally { DIM_MASKIN.pop(); }
  });

  it("byts Från eller Till och koordinaterna kom från trakten (koord_kalla = 'objekt'): info ovanför Spara, blockerar inte", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector("[data-varning]")).toBeNull();            // inget bytt än
    await klicka(valRad("Från")!);
    await skrivIn(dlg()!.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement, "tjuv");
    await klicka(knapp(/Tjuvön AU 2026/, dlg()!));
    // bara Från bytt: texten står under Från (Till är orörd), och inte nere vid Spara. Ingen punkt för Från att mäta mot → bara sträckan.
    expect(traktText("Från")).toBe("Sträckan 62 km räknades från Östra-Hoka 1:7 A-C -25. Stämmer valet?");
    expect(traktText("Till")).toBeNull();
    expect(besked() ?? "").not.toContain("räknades");
    await skrivText(anledningS(), "fel trakt");
    expect(sparaS().disabled).toBe(false);                                // en upplysning, inte en spärr
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ fran_objekt_id: "o-tjuvon", fran_plats_id: null });
  });

  it("varningen kommer också när bara Till byts, men inte vid maskinbyte, och inte om koordinaterna kom från annat än trakten", async () => {
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    await valj("Maskin", /Giant/);
    expect(dlg()!.querySelector("[data-varning]")).toBeNull();
    await klicka(valRad("Till")!);
    await skrivIn(dlg()!.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement, "tjuv");
    await klicka(knapp(/Tjuvön AU 2026/, dlg()!));
    expect(traktText("Till")).toContain("räknades från Vällust RP M-R -25");
    await klicka(knapp(/^Avbryt$/, dlg()!));
    // koord_kalla = 'gps' (mätt position): ingen varning
    mock.flyttar.find(f => f.id === "bg1")!.koord_kalla = "gps";
    await oppnaS("og1", "Elefant 26");
    await klicka(valRad("Till")!);
    await skrivIn(dlg()!.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement, "tjuv");
    await klicka(knapp(/Tjuvön AU 2026/, dlg()!));
    expect(traktText("Till")).toMatch(/^Tjuvön AU 2026 ligger \d+ km från där maskinen lämnades\. Stämmer valet\?$/);   // avståndet står kvar, sträckan nämns inte
    expect(traktText("Till")).not.toContain("räknades");
  });
});

describe("Flytten (sheet): manuellt val av fakturering", () => {
  beforeEach(() => { mock.rpcHandler = rpcSomDb; });
  const brytare = () => dlg()!.querySelector('button[role="switch"][aria-label="Fakturera"]') as HTMLButtonElement;
  const faktura = () => dlg()!.querySelector('section[aria-label="Faktura"]') as HTMLElement;
  const aterga = () => knapp(/^Återgå till automatiskt$/, dlg()!);

  it("15 km produktion, före: Fakturera är av, 'Automatiskt: nej — under 30 km', ingen sträcka/kund, ingen 'Valt manuellt'", async () => {
    mock.flyttar.push(BN3());
    await oppnaFranRunda("Elefant 26");
    expect(brytare().getAttribute("aria-checked")).toBe("false");
    expect(faktura().textContent).toContain("FaktureraNej");
    expect(faktura().querySelector("[data-automatiskt]")!.textContent).toBe("Automatiskt: nej — under 30 km");
    expect(faktura().textContent).not.toContain("Valt manuellt");
    expect(aterga()).toBeUndefined();
    expect(kmS()).toBeNull(); expect(kundS()).toBeNull();
    expect(besked()).toBeNull(); expect(sparaS().disabled).toBe(true);
  });

  it("15 km produktion, efter brytaren: Valt manuellt + Återgå, förhandsbesked 'hamnar under Att godkänna', och ratta_flytt får fakturerbar_manuell + kunden som krävs", async () => {
    mock.flyttar.push(BN3());
    await oppnaFranRunda("Elefant 26");
    await klicka(brytare());
    expect(brytare().getAttribute("aria-checked")).toBe("true");
    expect(faktura().textContent).toContain("FaktureraJa");
    expect(faktura().querySelector("[data-automatiskt]")!.textContent).toBe("Automatiskt: nej — under 30 km");   // regeln står kvar bredvid valet
    expect(faktura().querySelector("[data-manuellt]")!.textContent).toBe("Valt manuellt");
    expect(aterga()).toBeDefined();
    expect(besked()).toBe("Blir fakturerbar — hamnar under Att godkänna");
    expect(sparaS().disabled).toBe(true);                                   // anledning krävs
    await skrivText(anledningS(), "  kunden ska betala, trots korta sträckan  ");
    expect(sparaS().disabled).toBe(true);                                   // faktureras → kund krävs
    await skrivIn(kundS(), "Vida");
    expect(sparaS().disabled).toBe(false);
    await klicka(sparaS());
    expect(mock.rpc).toEqual([{ namn: "ratta_flytt", args: { p_flytt: "bn3", p_andringar: { fakturerbar_manuell: true, kund: "Vida" }, p_anledning: "kunden ska betala, trots korta sträckan", p_av: "Test Admin" } }]);
    expect(mock.skrivningar).toEqual([]);
    expect(kvittoRunda()!.textContent).toContain("Den är nu fakturerbar och ligger under Att godkänna.");
    // Valet minns: öppnas flytten igen står det som manuellt val, och historiken säger det.
    await klicka(knapp(/Visa flytten Elefant 26/, arkEl()));
    expect(brytare().getAttribute("aria-checked")).toBe("true");
    expect(faktura().querySelector("[data-manuellt]")).not.toBeNull();
    expect(dlg()!.textContent).toContain("fakturering automatiskt → manuellt ja");
  });

  it("Återgå till automatiskt sätter tillbaka regeln: valet, beskedet och ändringen försvinner", async () => {
    mock.flyttar.push(BN3());
    await oppnaFranRunda("Elefant 26");
    await klicka(brytare());
    await skrivText(anledningS(), "test");
    await klicka(aterga()!);
    expect(brytare().getAttribute("aria-checked")).toBe("false");
    expect(faktura().textContent).not.toContain("Valt manuellt");
    expect(besked()).toBeNull();
    expect(sparaS().disabled).toBe(true);                                   // inget ändrat längre
  });

  it("att trycka brytaren till det regeln redan säger är inget manuellt val (null, inte false)", async () => {
    mock.flyttar.push(BN3());
    await oppnaFranRunda("Elefant 26");
    await klicka(brytare()); await klicka(brytare());
    expect(faktura().textContent).not.toContain("Valt manuellt");
    await skrivText(anledningS(), "test");
    expect(sparaS().disabled).toBe(true);
  });

  it("lång flytt (53 km) av: 'Blir inte fakturerbar — underlaget stryks', fakturerbar_manuell: false, och sträcka/kund försvinner", async () => {
    mock.flyttar.push(BG1()); mock.extraUnderlag = [OG_OKT()];
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(brytare().getAttribute("aria-checked")).toBe("true");
    expect(faktura().querySelector("[data-automatiskt]")!.textContent).toBe("Automatiskt: ja — 30 km eller mer");
    expect(kmS()).not.toBeNull();
    await klicka(brytare());
    expect(faktura().querySelector("[data-manuellt]")).not.toBeNull();
    expect(besked()).toBe("Blir inte fakturerbar — underlaget stryks");
    expect(kmS()).toBeNull(); expect(kundS()).toBeNull();                    // sträcka och kund visas bara när flytten faktureras
    await skrivText(anledningS(), "kunden betalar inte flytten");
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ fakturerbar_manuell: false });
    expect(mock.skrivningar).toEqual([]);                                    // inget FAKTURA-steg: underlaget stryks av databasen
  });

  it("service av automatik, på manuellt: kunduppdrag/service-skälet står, och beskedet följer valet", async () => {
    mock.flyttar.push(BN1());                                                // service 53 km
    await oppnaFranRunda("Elefant 26");
    expect(faktura().querySelector("[data-automatiskt]")!.textContent).toBe("Automatiskt: nej — service faktureras inte");
    await klicka(brytare());
    expect(besked()).toBe("Blir fakturerbar — hamnar under Att godkänna");
    await valj("Typ", /Produktion/);                                          // 53 km produktion = automatiskt ja → valet är ihopfallet med regeln men står kvar
    expect(besked()).toBe("Blir fakturerbar — hamnar under Att godkänna");
  });

  it("migrationen ej körd: sheeten öppnas ändå, utan brytare, och säger varför", async () => {
    mock.manuellKolumnSaknas = true;
    mock.flyttar.push(BN3());
    await oppnaFranRunda("Elefant 26");
    expect(brytare()).toBeNull();
    expect(faktura().textContent).toContain("migration 20261017100000");
    expect(valRad("Maskin")!.textContent).toContain("Elefant 26");
  });

  it("låst flytt (godkänd): FAKTURA visas ändå — Fakturera Ja, regeln eller 'Valt manuellt', och sträcka/kund; utan brytare", async () => {
    await montera();
    await klicka(document.querySelector('[data-runda="3bfa4d19"]') as HTMLElement);
    await klicka(knapp(/Visa flytten Elefant 26/, arkEl()));                  // b2: 36 km, godkänt underlag u7
    const g = dlg()!.querySelector('section[aria-label="Faktura"]')!;
    expect(g.textContent).toContain("FaktureraJa");
    expect(g.textContent).toContain("Automatiskt: ja — 30 km eller mer");
    expect(g.querySelector('button[role="switch"]')).toBeNull();
    expect(g.textContent).toContain("Sträcka36 km");                         // fakturerat = mätt: "mätt" står inte två gånger
    expect(g.textContent).not.toContain("mätt");
    expect(g.textContent).toContain("KundIngen");                            // kund utan värde är "Ingen", inte ett datafel
  });

  it("låst flytt vald manuellt: raden säger vad regeln hade sagt", async () => {
    mock.flyttar.push(BN3());
    const f = mock.flyttar.find(x => x.id === "bn3")!; Object.assign(f, { fakturerbar: true, fakturerbar_manuell: true });
    mock.extraUnderlag = [U("ubn3", "2026-10-06", 15, "A130743", "o-halaback", "o-ostra", { ...OGODKAND, flytt_id: "bn3", godkand_tid: "2026-10-07T08:00:00Z", godkand_av: "Martin" })];
    await oppnaFranRunda("Elefant 26");
    expect(dlg()!.querySelector("[data-last]")).not.toBeNull();
    expect(dlg()!.textContent).toContain("Valt manuellt — automatiskt hade det varit nej (under 30 km)");
  });
});

describe("Flytten (sheet): kunden föreslås ur trakten och krävs när flytten faktureras", () => {
  beforeEach(() => { mock.rpcHandler = rpcSomDb; });
  const kallaText = () => dlg()!.querySelector("[data-kund-kalla]")?.textContent ?? null;
  const kravText = () => dlg()!.querySelector("[data-kund-krav]")?.textContent ?? null;
  const KRAV = "Välj kund — den här flytten faktureras";
  /** Byt Från/Till till en trakt via sökningen (som en människa gör det). */
  const valjTrakt = async (rad: "Från" | "Till", sok: string, namn: RegExp) => {
    await klicka(valRad(rad)!);
    await skrivIn(dlg()!.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement, sok);
    await klicka(knapp(namn, dlg()!));
  };
  /** En fakturerbar produktionsflytt (53 km) med ett underlag som SAKNAR kund — som de sju i prod. */
  const medKundlosFlytt = (fran: string, till: string) => {
    mock.flyttar.push(BEN("bk1", "3bfa4d19", "A130743", fran, till, 53, 60, true));
    mock.extraUnderlag = [U("ok1", "2026-10-09", 53, "A130743", fran, till, { ...OGODKAND, flytt_id: "bk1" })];
  };
  const oppnaK = async () => { await oppnaFakturering(); await oppnaS("ok1", "Elefant 26"); };

  it("Vida: kunden är bolaget, och källan står under (\"Vida · från traktens bolag\")", async () => {
    medKundlosFlytt("o-halaback", "o-kvida");
    await oppnaK();
    expect(kundS().value).toBe("Vida");
    expect(kallaText()).toBe("Vida · från traktens bolag");
    expect(kravText()).toBeNull();
  });

  it("Vida Energi är sitt eget bolag", async () => {
    medKundlosFlytt("o-halaback", "o-kenergi");
    await oppnaK();
    expect(kundS().value).toBe("Vida Energi");
    expect(kallaText()).toBe("Vida Energi · från traktens bolag");
  });

  it("Privat: kunden är markägaren, och källan säger det (\"Lisa Andersson · markägare\")", async () => {
    medKundlosFlytt("o-halaback", "o-kprivat");
    await oppnaK();
    expect(kundS().value).toBe("Lisa Andersson");
    expect(kallaText()).toBe("Lisa Andersson · markägare");
  });

  it("Till-trakten först; saknar den bolag tas Från-trakten", async () => {
    medKundlosFlytt("o-kvida", "o-kutan");
    await oppnaK();
    expect(kundS().value).toBe("Vida");                                        // Till (utan bolag) ger inget → Från
    expect(kallaText()).toBe("Vida · från traktens bolag");
  });

  it("saknat bolag på båda ändarna: inget förslag (ingen gissning), 'Välj kund' och en grå Spara trots ändring och anledning", async () => {
    medKundlosFlytt("o-halaback", "o-kutan");
    await oppnaK();
    expect(kundS().value).toBe("");
    expect(kundS().placeholder).toBe("Välj kund");
    expect(kallaText()).toBeNull();
    expect(kravText()).toBe(KRAV);
    await valj("Maskin", /Giant/);
    await skrivText(anledningS(), "fel maskin");
    expect(sparaS().disabled).toBe(true);                                       // ändrat + anledning, men ingen kund
    expect(kravText()).toBe(KRAV);
    await skrivIn(kundS(), "  Okänd Ägare  ");
    expect(sparaS().disabled).toBe(false);
    expect(kravText()).toBeNull();
  });

  it("kunden följer ett byte av trakt — tills man själv ändrat den", async () => {
    medKundlosFlytt("o-halaback", "o-kvida");
    await oppnaK();
    expect(kundS().value).toBe("Vida");
    await valjTrakt("Till", "privat", /Privat-trakt/);
    expect(kundS().value).toBe("Lisa Andersson");                              // följde med bytet
    expect(kallaText()).toBe("Lisa Andersson · markägare");
    await valjTrakt("Till", "energi", /Energi-trakt/);
    expect(kundS().value).toBe("Vida Energi");
    await skrivIn(kundS(), "Egen Kund");                                        // nu är den ändrad för hand
    expect(kallaText()).toBeNull();
    await valjTrakt("Till", "vida-trakt", /Vida-trakt AU/);
    expect(kundS().value).toBe("Egen Kund");                                    // följer inte längre med
    expect(kallaText()).toBeNull();
  });

  it("att tömma fältet för hand är också 'ändrat för hand': förslaget kommer inte tillbaka av sig självt", async () => {
    medKundlosFlytt("o-halaback", "o-kvida");
    await oppnaK();
    await skrivIn(kundS(), "");
    expect(kundS().value).toBe("");
    await valjTrakt("Till", "privat", /Privat-trakt/);
    expect(kundS().value).toBe("");
    expect(kravText()).toBe(KRAV);
  });

  it("en kund som redan finns skrivs aldrig över av ett förslag, inte heller vid byte av trakt", async () => {
    medKundlosFlytt("o-halaback", "o-kvida");
    mock.extraUnderlag = [U("ok1", "2026-10-09", 53, "A130743", "o-halaback", "o-kvida", { ...OGODKAND, flytt_id: "bk1", kund: "Skogsbolaget" })];
    await oppnaK();
    expect(kundS().value).toBe("Skogsbolaget");
    expect(kallaText()).toBeNull();
    await valjTrakt("Till", "privat", /Privat-trakt/);
    expect(kundS().value).toBe("Skogsbolaget");
    expect(kallaText()).toBeNull();
  });

  it("förslaget sparas först när man trycker Spara: en rättning skickar kunden med (ratta_flytt) och inget annat skrivs", async () => {
    medKundlosFlytt("o-halaback", "o-kvida");
    await oppnaK();
    await valj("Maskin", /Giant/);
    await skrivText(anledningS(), "fel maskin");
    expect(mock.rpc).toEqual([]);                                               // inget skrivs av att titta
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ maskin_id: "PONS20SDJAA270231", extern_maskin: null, kund: "Vida" });
    expect(mock.skrivningar).toEqual([]);
  });

  it("att bara ta emot förslaget på ett underlag utan kund är en ren FAKTURA-ändring: Spara går, och det är underlaget som får kunden", async () => {
    medKundlosFlytt("o-halaback", "o-kvida");
    await oppnaK();
    expect(sparaS().disabled).toBe(true);                                       // anledning krävs
    await skrivText(anledningS(), "kunden var inte ifylld");
    expect(sparaS().disabled).toBe(false);
    await klicka(sparaS());
    expect(mock.rpc).toEqual([]);
    expect(mock.skrivningar[0].varden).toEqual({ kund: "Vida", redigerad_av: "Test Admin" });
  });

  it("manuellt 'Fakturera' på en flytt utan underlag: kundraden dyker upp förifylld, krävs, och följer med ratta_flytt", async () => {
    mock.flyttar.push(BEN("bk2", "3e823d15", "A130743", "o-halaback", "o-kprivat", 15, 25, false, { starttid: "2026-10-06T14:00:00Z", koord_kalla: "gps" }));
    await oppnaFranRunda("Elefant 26");
    expect(dlg()!.querySelector("[data-rutt]")!.textContent).toContain("Privat-trakt");   // rätt flytt är öppen
    expect(kundS()).toBeNull();                                                 // 15 km: faktureras inte → ingen kundrad, inget förslag
    await klicka(dlg()!.querySelector('button[role="switch"][aria-label="Fakturera"]') as HTMLElement);
    expect(kundS().value).toBe("Lisa Andersson");
    expect(kallaText()).toBe("Lisa Andersson · markägare");
    await skrivText(anledningS(), "kunden betalar");
    expect(sparaS().disabled).toBe(false);
    await klicka(sparaS());
    expect(mock.rpc[0].args.p_andringar).toEqual({ fakturerbar_manuell: true, kund: "Lisa Andersson" });
  });

  it("flytten faktureras inte: ingen kundrad, inget förslag, inget krav", async () => {
    mock.flyttar.push(BEN("bk3", "3e823d15", "A130743", "o-halaback", "o-kvida", 15, 25, false, { starttid: "2026-10-06T14:00:00Z", koord_kalla: "gps" }));
    await oppnaFranRunda("Elefant 26");
    expect(dlg()!.querySelector("[data-rutt]")!.textContent).toContain("Vida-trakt");     // rätt flytt är öppen
    expect(kundS()).toBeNull();
    expect(kravText()).toBeNull();
    expect(kallaText()).toBeNull();
  });
});

describe("Flytten (sheet): flytter som inte går att ändra — grå rad som säger varför", () => {
  beforeEach(() => { mock.flyttar.push(BG1()); mock.rpcHandler = rpcSomDb; mock.extraUnderlag = [OG_OKT()]; });

  it("PÅGÅENDE flytt (sluttid saknas): läsbar, ingen Spara, ingen Lämna tillbaka, ingen chevron", async () => {
    mock.flyttar.find(f => f.id === "bg1")!.sluttid = null;
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Pågår — går att rätta när flytten är avslutad");
    expect(dlg()!.textContent).toContain("Elefant 26");
    expect(dlg()!.querySelectorAll("button[aria-label*=':']")).toHaveLength(0);
    expect(knapp(/^Spara/, dlg()!)).toBeUndefined();
    expect(knapp(/^Stryk flytten/, dlg()!)).toBeUndefined();
    expect(knapp(/Lämna tillbaka/, dlg()!)).toBeUndefined();
  });

  it("AVBRUTEN (struken) flytt: läsbar med historiken, grå rad, inget att trycka på", async () => {
    mock.flyttar.find(f => f.id === "bg1")!.avbruten = true;
    mock.rattningar.push({ id: "s1", flytt_id: "bg1", tid: "2026-10-14T09:00:00Z", av: "Martin", anledning: "flyttades aldrig", slag: "stryk", fore: {}, efter: {}, underlag_atgard: "struket", position_atgard: "raderad" });
    await oppnaFakturering();
    await oppnaS("og1", "Elefant 26");
    expect(dlg()!.querySelector("[data-last]")!.textContent).toContain("Struken — flytten hände aldrig och går inte att ändra");
    expect(dlg()!.querySelector('section[aria-label="Historik"]')!.textContent).toMatch(/Struken av Martin .*: flyttades aldrig/);
    expect(knapp(/^Spara/, dlg()!)).toBeUndefined();
    expect(knapp(/^Stryk flytten/, dlg()!)).toBeUndefined();
    expect(dlg()!.querySelectorAll("button[aria-label*=':']")).toHaveLength(0);
  });
});

describe("Bilen nu", () => {
  const nuFlik = async () => { mock.medarbetare = FORARE; await montera(); };
  const kort = () => document.querySelector('section[aria-label="Bilen nu"]') as HTMLElement;
  const tank = () => kort().querySelector("[data-tank]")!;
  /** Tankraden som en text: de tre värdena med mellanrum (på skärmen står de bredvid varandra och bryts mellan värdena). */
  const tankText = () => Array.from(tank().querySelectorAll("[data-niva]")).map(c => c.textContent).join(" · ");
  const tankOrd = () => Array.from(kort().querySelectorAll("[data-tank-ord]")).map(e => e.textContent);

  it("parkerad: läget i ord med EN tid (datum, klockslag bara idag), EN tankrad — och ingen kontaktrad när positionen är under 1 h", async () => {
    await nuFlik();
    expect(kort().querySelector("[data-lage]")!.textContent).toBe("Parkerad vid LBC · sedan 13 okt");
    expect(tankText()).toBe(`Diesel 62 % · AdBlue 71 % · ${(270).toLocaleString("sv-SE")} km kvar`);
    expect(tank().querySelectorAll("[data-niva]")).toHaveLength(3);               // EN rad med tre värden
    expect(tankOrd()).toEqual([]);                                                // inga ord under när allt är ok
    // raden bryts aldrig: nowrap, och den mindre storleken (TYP.meta, 13 px) så den ryms på en smal telefon
    const stil = tank().getAttribute("style")!;
    expect(stil).toContain("white-space: nowrap");
    expect(stil).toContain("flex-wrap: nowrap");
    expect(stil).toContain("font-size: 13px");
    expect(kort().querySelector("[data-sedd]")).toBeNull();                       // 54 min: under 1 h, ingen kontaktrad
    // inget "Inga varningar", ingen mätare, ingen service ("saknas") och ingen rad "Senaste körning" i kortet
    for (const borta of ["Inga varningar", "Service", "301", "Mätare", "Senaste körning", "Motortimmar"]) expect(kort().textContent).not.toContain(borta);
    expect(kort().querySelector("[data-lampa]")).toBeNull();
    expect(kort().querySelector("[data-service]")).toBeNull();
  });

  it("ingen kontakt på över 1 h: 'Ingen kontakt sedan <datum> <tid>', dämpad — aldrig timmar och minuter", async () => {
    mock.api.body = { ...LAGE, parkerad: { plats: "LBC", sedan: "2026-10-10T08:11:00Z" },
      position: { lat: 56.459, lng: 14.702, tidpunkt: "2026-10-10T08:11:00Z", alder_min: 99 * 60 + 49 } };
    await nuFlik();
    expect(kort().querySelector("[data-lage]")!.textContent).toBe("Parkerad vid LBC · sedan 10 okt");          // EN tid i rubriken, bara datum
    const sedd = kort().querySelector("[data-sedd]") as HTMLElement;
    expect(sedd.textContent).toBe("Ingen kontakt sedan 10 okt 10:11");
    expect(kort().textContent).not.toMatch(/\d+ h \d+ min|99 h/);
    expect(sedd.getAttribute("style")).not.toMatch(/ff9f0a|ff453a/i);                                          // dämpad, inte orange/röd
  });

  it("ETT kort (en sektion) — ingen separat 'Senaste körning'-sektion och inget kort med mätare", async () => {
    await nuFlik();
    expect(document.querySelectorAll('section[aria-label="Bilen nu"]').length).toBe(1);
    expect(document.querySelector('section[aria-label="Senaste körning"]')).toBeNull();
    expect(document.querySelector('section[aria-label="Tank, varningar och mätare"]')).toBeNull();
  });

  it("kör nu: läget med maskin, km och avfärd", async () => {
    mock.api.body = { ...LAGE, parkerad: null, runda_pagar: true, oppen_runda_id: "x",
      oppen_runda: { id: "x", starttid: "2026-10-14T04:41:00Z", live_km: 34, maskin: { namn: "Giant", lage: "flaket" }, pa_vag_hem: false, km_kvar: null },
      position: { lat: 56.4, lng: 14.7, tidpunkt: "2026-10-14T09:58:00Z", alder_min: 2 } };
    await nuFlik();
    expect(kort().querySelector("[data-lage]")!.textContent).toBe("Kör nu · Giant på flaket · 34 km · avfärd 06:41");
    expect(kort().querySelector("[data-sedd]")).toBeNull();                      // positionen är färsk (2 min): ingen "Senast sedd"
  });

  it("låg diesel: siffran blir orange/röd MED orden bredvid ('tanka snart' / 'tanka nu') — och tar INTE över rubriken", async () => {
    mock.api.body = { ...LAGE, tank: { diesel_pct: 22, adblue_pct: 71.2, rackvidd_km: 270 } };
    await nuFlik();
    expect(tankText()).toContain("Diesel 22 %");
    expect(tank().querySelector('[data-niva="orange"]')!.textContent).toBe("Diesel 22 %");
    expect(tankOrd()).toEqual(["Diesel låg – tanka snart"]);                      // orden på EGEN rad under, bara när de gäller
    expect(kort().querySelector("[data-lampa]")).toBeNull();
    await act(async () => { rot?.unmount(); }); rot = null;
    mock.api.body = { ...LAGE, tank: { diesel_pct: 14, adblue_pct: 18, rackvidd_km: 95 } };
    await nuFlik();
    expect(tank().querySelector('[data-niva="rod"]')!.textContent).toBe("Diesel 14 %");
    expect(tank().querySelector('[data-niva="orange"]')!.textContent).toBe("AdBlue 18 %");
    expect(tankText()).toContain("95 km kvar");
    expect(tankOrd()).toEqual(["Diesel låg – tanka nu", "AdBlue låg – fyll på", "Räckvidd kort – tanka snart"]);
    expect(kort().querySelector('[data-tank-ord="rod"]')!.textContent).toBe("Diesel låg – tanka nu");
    expect(kort().querySelector("h1")).toBeNull();
  });

  it("en lysande varningslampa tar över rubriken (röd, 'lyser' och 'Kontrollera bilen'), läget står kvar under", async () => {
    mock.api.body = { ...LAGE, halsa: { ...LAGE.halsa, lampor: [{ kod: "x", namn: "Motorvarning", state: "RED" }] } };
    await nuFlik();
    const lampa = kort().querySelector("[data-lampa]") as HTMLElement;
    expect(lampa.textContent).toContain("Motorvarning lyser");
    expect(lampa.textContent).toContain("Kontrollera bilen");
    expect(kort().querySelector(":scope > div > div")!.firstElementChild).toBe(lampa);   // överst i kortet
    expect(kort().querySelector("[data-lage]")!.textContent).toContain("Parkerad vid LBC");
  });

  it("service bara när det är under 1 000 km kvar", async () => {
    mock.api.body = { ...LAGE, halsa: { ...LAGE.halsa, service_km: 4200 } };
    await nuFlik();
    expect(kort().querySelector("[data-service]")).toBeNull();
    await act(async () => { rot?.unmount(); }); rot = null;
    mock.api.body = { ...LAGE, halsa: { ...LAGE.halsa, service_km: 800 } };
    await nuFlik();
    expect(kort().querySelector("[data-service]")!.textContent).toBe("Service om 800 km");
  });

  it("läsfel: säger det och erbjuder Försök igen, och visar inga tal", async () => {
    mock.api = { status: 500, body: null };
    await nuFlik();
    expect(kort().textContent).toContain("Kunde inte läsa lastbilsdata just nu.");
    expect(kort().textContent).not.toContain("Diesel");
    mock.api = { status: 200, body: LAGE };
    await klicka(knapp(/Försök igen/, kort()));
    expect(kort().textContent).toContain("Parkerad vid LBC");
  });

  it("utloggad säger det", async () => {
    mock.api = { status: 401, body: null };
    await nuFlik();
    expect(kort().textContent).toContain("Du är utloggad");
  });

  it("ingen data från bilen än: förklarar varför och vad som fyller kortet", async () => {
    mock.api.body = { ...LAGE, harData: false };
    await nuFlik();
    expect(kort().textContent).toContain("Ingen data från lastbilen än.");
    expect(kort().textContent).toContain("dyker den upp här");
  });

  it("saknade värden står som 'saknas i datan', aldrig 0", async () => {
    mock.api.body = { ...LAGE, tank: { diesel_pct: null, adblue_pct: 71.2, rackvidd_km: null } };
    await nuFlik();
    expect(tankText()).toBe("Diesel – · AdBlue 71 % · Räckvidd –");
    expect(tankOrd()).toEqual(["Diesel saknas i datan", "Räckvidd saknas i datan"]);
    expect(tankText()).not.toMatch(/\b0 %/);
  });

  it("om rundan bakom 'Senaste körning' i en tom månad inte går att läsa säger arket det och erbjuder Försök igen", async () => {
    await nuFlik();
    await klicka(knapp(/Förra månaden/));
    mock.rundorFel = true;
    await klicka(document.querySelector("[data-senaste-korning]") as HTMLElement);
    expect(ark()!.textContent).toContain("Kunde inte läsa rundan just nu.");
    mock.rundorFel = false;
    await klicka(knapp(/Försök igen/, ark()!));
    expect(ark()!.textContent).toContain("294 km");
  });

  it("Visa var den står öppnar ett ark med kartan — där bor också mätare och motortimmar — och Avbryt stänger det", async () => {
    await nuFlik();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const lank = knapp(/Visa var den står/);
    expect(kort().contains(lank)).toBe(true);
    expect(kort().lastElementChild!.contains(lank) || kort().contains(lank)).toBe(true);     // länken längst ner i kortet
    await klicka(lank);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="karta"]')).not.toBeNull();
    expect(document.querySelector('[data-matare]')!.textContent).toBe("301\u00a0128 km");
    expect(document.querySelector('[data-motortimmar]')!.textContent).toBe("saknas i datan");
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
    await klicka(knapp(/Visa var den står/));
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/Avbryt/));
  });
});

// ── "Vilken maskin?" — lass som bilens vikt hittat men som saknar maskin ──────────────────────────────────────
const LASS_ID = "11111111-1111-4111-8111-111111111111";
const LASS = (o: Record<string, unknown> = {}) => ({
  id: LASS_ID, status: "vantar_maskin", status_orsak: "sakerhet",
  fran_namn: "Östra-Hoka 1:7 A-C -25", till_namn: "Bågskyttebanan RP J-Hus- 25",
  lassning_tid: "2026-10-12T10:23:00Z", lossning_tid: "2026-10-12T11:46:00Z", km: 45.7,
  forslag_maskin_id: "A130743", sakerhet: "medel",
  kandidater: [
    { maskin_id: "A130743", poang: 6, utesluten: false, skal: [{ kod: "kedja_fran", dag: "2026-10-12", trakt: "Östra-Hoka" }, { kod: "kedja_till", dag: "2026-10-13", trakt: "Bågskyttebanan" }] },
    { maskin_id: "PONS20SDJAA270231", poang: 0, utesluten: true, skal: [{ kod: "foljer_inte", medianM: 7000 }] },
  ],
  bevis: { km_osaker: false }, kund: "Vida", till_plats_id: null, besvarad_av: null, besvarad_tid: null, skapad_tid: "2026-10-12T12:00:00Z", ...o,
});
const saknarRad = () => document.querySelector("[data-saknar-maskin]") as HTMLElement | null;
const lassArk = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const skapaKnapp = () => knapp(/Skapa flytten|Skapar flytten/, lassArk()!) as HTMLButtonElement;
const OK_SVAR = { data: { ok: true, skapad: true, flytt_id: "ny-flytt" }, error: null };

describe("Vilken maskin? — raden överst", () => {
  it("inget lass väntar → ingen rad alls (aldrig '0 lass')", async () => {
    await montera();
    expect(saknarRad()).toBeNull();
    expect(text()).not.toMatch(/0 lass/);
  });

  it("ETT lass väntar → '1 lass saknar maskin', överst, ovanför påminnelsen om godkännande", async () => {
    mock.lass = [LASS()];
    await montera();
    expect(saknarRad()!.textContent).toMatch(/^1 lass saknar maskin/);
    const rader = Array.from(document.querySelectorAll("[data-saknar-maskin], [data-vantar]"));
    expect(rader[0]).toBe(saknarRad());
  });

  it("tre lass → '3 lass saknar maskin'", async () => {
    mock.lass = [LASS(), LASS({ id: "22222222-2222-4222-8222-222222222222" }), LASS({ id: "33333333-3333-4333-8333-333333333333" })];
    await montera();
    expect(saknarRad()!.textContent).toMatch(/^3 lass saknar maskin/);
  });

  it("ett lass som är besvarat eller för nytt (frågan har inte gått ut än) räknas inte", async () => {
    mock.lass = [LASS({ status: "auto_flytt" }), LASS({ id: "22222222-2222-4222-8222-222222222222", lossning_tid: "2026-10-14T11:00:00Z" })];
    await montera();
    expect(saknarRad()).toBeNull();
  });

  it("läsfel → ett fel med Försök igen, aldrig 'inget väntar'", async () => {
    mock.lassFel = true;
    await montera();
    expect(saknarRad()!.textContent).toContain("Kunde inte läsa vilka lass som saknar maskin");
    mock.lassFel = false; mock.lass = [LASS()];
    await klicka(knapp(/Försök igen/, saknarRad()!));
    expect(saknarRad()!.textContent).toMatch(/^1 lass saknar maskin/);
  });

  it("förare ser ingen rad och frågan skickas aldrig", async () => {
    mock.medarbetare = FORARE; mock.lass = [LASS()]; mock.anrop = [];
    await montera();
    expect(saknarRad()).toBeNull();
    expect(mock.anrop).not.toContain("lastbil_lass");
  });

  it("monteras genom roll läses → admin utan hook-krasch", async () => {
    mock.loading = true; mock.medarbetare = null; mock.lass = [LASS()];
    await montera();
    mock.loading = false; mock.medarbetare = ADMIN;
    await ritaOm();
    expect(hookFel()).toEqual([]);
    expect(saknarRad()).not.toBeNull();
  });
});

describe("Vilken maskin? — arket", () => {
  beforeEach(() => { mock.lass = [LASS()]; });

  it("trycket öppnar arket med rutten, tiden, sträckan och förslaget förvalt med skäl", async () => {
    await montera();
    await klicka(saknarRad()!);
    const a = lassArk()!;
    expect(a.getAttribute("aria-label")).toBe("Vilken maskin?");
    expect(a.textContent).toContain("Östra-Hoka 1:7 A-C -25 → Bågskyttebanan RP J-Hus- 25".slice(0, 27));   // platsnamnet kortas till 28 tecken
    expect(a.textContent).toContain("mån 12 okt · 12:23 → 13:46 · 45,7 km");
    expect(a.textContent).toContain("Över 30 km — flytten faktureras");
    const valt = Array.from(a.querySelectorAll('[role="option"][aria-selected="true"]'));
    expect(valt).toHaveLength(1);
    expect(valt[0].textContent).toContain("Elefant 26");
    expect(valt[0].textContent).toContain("Troligen");
    expect(valt[0].textContent).toContain("Skotade Östra-Hoka 12 okt");
    expect(skapaKnapp().disabled).toBe(false);
  });

  it("lastvikten står på raden under rutten: 'last 25 t' — och inget alls när vikten saknas", async () => {
    mock.lass = [LASS({ lastvikt_kg: 25_400 })];
    await montera();
    await klicka(saknarRad()!);
    expect(norm(lassArk()!.textContent)).toContain("45,7 km · last 25 t");
  });

  // 3 aug: lossningen på 56,2 N; Intaget 608 m, Åbogen 673 m, Sandåsen 1 km norrut — rätt var Åbogen. Lassningen vid Spåramåla (40 m).
  const M_GRAD = (6371000 * Math.PI) / 180;
  const NORR = (m: number) => 56.2 + m / M_GRAD;
  const AUG3 = (o: Record<string, unknown> = {}) => LASS({
    fran_namn: "Spåramåla RP 2025", till_namn: "Intaget gallring", lassning_tid: "2026-08-03T06:51:00Z", lossning_tid: "2026-08-03T08:08:00Z", km: 40.8, lastvikt_kg: 25_300,
    lassning_lat: 56.3, lassning_lng: 14.9, lossning_lat: 56.2, lossning_lng: 14.9, ...o,
  });
  const AUG3_OBJEKT = [
    { id: "o-spar", namn: "Spåramåla RP 2025", lat: 56.3 + 40 / M_GRAD, lng: 14.9 }, { id: "o-intaget", namn: "Intaget gallring", lat: NORR(608), lng: 14.9 },
    { id: "o-abogen", namn: "Åbogen", lat: NORR(673), lng: 14.9 }, { id: "o-sandasen", namn: "Sandåsen", lat: NORR(1000), lng: 14.9 },
  ];

  it("OSÄKER PLATS (3 aug): 'Spåramåla RP 2025 → nära Intaget gallring' och dämpat under: 'även Åbogen 673 m, Sandåsen 1 km'", async () => {
    mock.extraObjekt = AUG3_OBJEKT; mock.lass = [AUG3()];
    await montera();
    await klicka(saknarRad()!);
    await vantaTills(() => !!lassArk()!.querySelector("[data-plats-andra]"));
    const ark = lassArk()!;
    expect(norm(ark.textContent)).toContain("Spåramåla RP 2025 → nära Intaget gallring");
    expect(ark.querySelectorAll("[data-plats-andra]")).toHaveLength(1);
    expect(norm(ark.querySelector("[data-plats-andra]")!.textContent)).toBe("även Åbogen 673 m, Sandåsen 1 km");
    expect(norm(ark.textContent)).toContain("last 25 t");        // vikten och sträckan står kvar
  });

  it("SÄKER PLATS: bara namnet, ingen rad under", async () => {
    mock.extraObjekt = [AUG3_OBJEKT[0], { id: "o-ensam", namn: "Intaget gallring", lat: NORR(90), lng: 14.9 }, AUG3_OBJEKT[2]];
    mock.lass = [AUG3()];
    await montera();
    await klicka(saknarRad()!);
    await vantaTills(() => norm(lassArk()?.textContent).includes("Spåramåla RP 2025 → Intaget gallring"));
    expect(lassArk()!.textContent).not.toContain("nära");
    expect(lassArk()!.querySelector("[data-plats-andra]")).toBeNull();
  });

  it("INGEN TRAKT INOM 8 KM: 'okänd plats'", async () => {
    mock.extraObjekt = AUG3_OBJEKT; mock.lass = [AUG3({ lossning_lat: 57.5 })];
    await montera();
    await klicka(saknarRad()!);
    await vantaTills(() => norm(lassArk()?.textContent).includes("→ okänd plats"));
    expect(norm(lassArk()!.textContent)).toContain("Spåramåla RP 2025 → okänd plats");
  });

  it("saknas lastvikten visas ingenting — inget '0 t', inget '–'", async () => {
    mock.lass = [LASS()];
    await montera();
    await klicka(saknarRad()!);
    const t = norm(lassArk()!.textContent);
    expect(t).toContain("45,7 km");
    expect(t).not.toMatch(/last \d|0 t\b|45,7 km · –/);
  });

  it("ett historiskt lass med en flytt på samma tid säger det — 'En flytt med Wisent finns samma tid' — och hur man avvisar", async () => {
    mock.lass = [LASS({ bevis: { km_osaker: false, historisk: true, flytt_samma_tid: [{ flytt_id: "f1", maskin_id: "A030353", extern_maskin: null, avbruten: false, skal: "annan_plats" }] } })];
    await montera();
    await klicka(saknarRad()!);
    const not = lassArk()!.querySelector("[data-flytt-samma-tid]")!;
    expect(not.textContent).toContain("En flytt med Wisent finns samma tid");
    expect(not.textContent).toContain('välj "Det var ingen maskinflytt"');
  });

  it("en AVBRUTEN flytt på samma tid säger också det", async () => {
    mock.lass = [LASS({ bevis: { km_osaker: false, flytt_samma_tid: [{ flytt_id: "f1", maskin_id: "A030353", extern_maskin: null, avbruten: true, skal: "avbruten" }] } })];
    await montera();
    await klicka(saknarRad()!);
    expect(lassArk()!.querySelector("[data-flytt-samma-tid]")!.textContent).toContain("En avbruten flytt med Wisent finns samma tid");
  });

  it("ett lass utan flytt på samma tid har ingen sådan rad (cron-lassen skriver aldrig bevis.flytt_samma_tid)", async () => {
    await montera();
    await klicka(saknarRad()!);
    expect(lassArk()!.querySelector("[data-flytt-samma-tid]")).toBeNull();
    expect(lassArk()!.textContent).not.toContain("finns samma tid");
  });

  it("en maskin som inte följde bilen står kvar i listan men märkt, och är inte förvald", async () => {
    await montera();
    await klicka(saknarRad()!);
    const giant = Array.from(lassArk()!.querySelectorAll('[role="option"]')).find(o => /Giant/.test(o.textContent ?? ""))!;
    expect(giant.textContent).toContain("Följde inte bilen");
    expect(giant.getAttribute("aria-selected")).toBe("false");
  });

  it("Skapa flytten anropar besvara_lass med förslagets maskin — och kvittot säger vad som hände", async () => {
    mock.rpcHandler = () => OK_SVAR;
    await montera();
    await klicka(saknarRad()!);
    await klicka(skapaKnapp());
    expect(mock.rpc).toHaveLength(1);
    expect(mock.rpc[0]).toEqual({ namn: "besvara_lass", args: { p_lass: LASS_ID, p_maskin_id: "A130743", p_extern_maskin: null, p_kund: null } });
    expect(lassArk()).toBeNull();
    expect(document.querySelector("[data-lass-kvitto]")!.textContent).toBe("Flytten är skapad och ligger under Att godkänna.");
  });

  it("ett annat val ger en annan maskin i anropet", async () => {
    mock.rpcHandler = () => OK_SVAR;
    await montera();
    await klicka(saknarRad()!);
    await klicka(Array.from(lassArk()!.querySelectorAll('[role="option"]')).find(o => /Wisent/.test(o.textContent ?? "")) as HTMLElement);
    await klicka(skapaKnapp());
    expect(mock.rpc[0].args.p_maskin_id).toBe("A030353");
  });

  it("SAKNAD KUND: fakturerbar flytt utan bolag → kundruta, Skapa är grå tills kund är ifylld", async () => {
    mock.lass = [LASS({ kund: null, status_orsak: "kund_saknas" })];
    mock.rpcHandler = () => OK_SVAR;
    await montera();
    await klicka(saknarRad()!);
    expect(lassArk()!.getAttribute("aria-label")).toBe("Vilken kund?");
    expect(lassArk()!.querySelector('input[aria-label="Kund"]')).not.toBeNull();
    expect(skapaKnapp().disabled).toBe(true);
    expect(lassArk()!.textContent).toContain("Välj kund — flytten faktureras");
    await skrivIn(lassArk()!.querySelector('input[aria-label="Kund"]') as HTMLInputElement, "Vida");
    expect(skapaKnapp().disabled).toBe(false);
    await klicka(skapaKnapp());
    expect(mock.rpc[0].args).toMatchObject({ p_maskin_id: "A130743", p_kund: "Vida" });
  });

  it("traktens kund finns → ingen kundruta", async () => {
    await montera();
    await klicka(saknarRad()!);
    expect(lassArk()!.querySelector('input[aria-label="Kund"]')).toBeNull();
  });

  it("MASKIN SOM INTE ÄR VÅR: namn OCH kund krävs, och anropet går som extern maskin", async () => {
    mock.rpcHandler = () => OK_SVAR;
    await montera();
    await klicka(saknarRad()!);
    await klicka(Array.from(lassArk()!.querySelectorAll('[role="option"]')).find(o => /Maskin som inte är vår/.test(o.textContent ?? "")) as HTMLElement);
    expect(skapaKnapp().disabled).toBe(true);
    expect(lassArk()!.textContent).toContain("Skriv maskinens namn");
    await skrivIn(lassArk()!.querySelector('input[aria-label="Maskinens namn"]') as HTMLInputElement, "Kunds Ponsse");
    expect(skapaKnapp().disabled).toBe(true);
    expect(lassArk()!.textContent).toContain("Välj kund");
    await skrivIn(lassArk()!.querySelector('input[aria-label="Kund"]') as HTMLInputElement, "Anders Skog");
    expect(skapaKnapp().disabled).toBe(false);
    await klicka(skapaKnapp());
    expect(mock.rpc[0].args).toEqual({ p_lass: LASS_ID, p_maskin_id: null, p_extern_maskin: "Kunds Ponsse", p_kund: "Anders Skog" });
  });

  it("det andra adminet hann före: 'Redan besvarat' med vem som svarade — ingen ny flytt", async () => {
    mock.rpcHandler = () => ({ data: { ok: false, redan: true, status: "auto_flytt", av: "Joacim Ringberg", tid: "2026-10-14T10:40:00Z" }, error: null });
    await montera();
    await klicka(saknarRad()!);
    await klicka(skapaKnapp());
    expect(lassArk()!.getAttribute("aria-label")).toBe("Redan besvarat");
    expect(lassArk()!.textContent).toContain("Joacim svarade 12:40. Flytten ligger under Att godkänna.");
  });

  it("databasens fel visas som det är och arket stannar öppet", async () => {
    mock.rpcHandler = () => ({ data: null, error: { message: "Välj kund — flytten faktureras" } });
    await montera();
    await klicka(saknarRad()!);
    await klicka(skapaKnapp());
    expect(lassArk()).not.toBeNull();
    expect(lassArk()!.querySelector('[role="alert"]')!.textContent).toBe("Välj kund — flytten faktureras");
  });

  it("'Det var ingen maskinflytt' kräver en bekräftelse och går till avvisa_lass", async () => {
    mock.rpcHandler = () => ({ data: { ok: true }, error: null });
    await montera();
    await klicka(saknarRad()!);
    await klicka(knapp(/Det var ingen maskinflytt/, lassArk()!));
    expect(mock.rpc).toHaveLength(0);                                       // ett tryck räcker inte
    expect(lassArk()!.textContent).toContain('Lasset sparas som "ingen maskinflytt"');
    await klicka(knapp(/Ja, det var ingen maskinflytt/, lassArk()!));
    expect(mock.rpc).toEqual([{ namn: "avvisa_lass", args: { p_lass: LASS_ID, p_orsak: "ingen_maskinflytt" } }]);
    expect(document.querySelector("[data-lass-kvitto]")!.textContent).toBe("Markerat som ingen maskinflytt.");
  });

  it("osäker plats: arket säger det och var man kontrollerar", async () => {
    mock.lass = [LASS({ bevis: { km_osaker: true } })];
    await montera();
    await klicka(saknarRad()!);
    expect(lassArk()!.textContent).toContain("cirka 45,7 km");
    expect(lassArk()!.textContent).toContain("Platsen är osäker");
  });

  it("allt tryckbart i arket är minst 44 px högt", async () => {
    await montera();
    await klicka(saknarRad()!);
    const px = (v: string) => (v ? parseFloat(v) : 0);
    const forLitet = Array.from(lassArk()!.querySelectorAll("button"))
      .filter(e => Math.max(px((e as HTMLElement).style.minHeight), px((e as HTMLElement).style.height)) < 44)
      .map(e => (e.textContent || "").trim().slice(0, 24));
    expect(forLitet).toEqual([]);
    expect(hookFel()).toEqual([]);
  });
});

describe("Vilken maskin? — länken i notisen (?lass=<id>)", () => {
  it("öppnar arket på just det lasset direkt", async () => {
    mock.lass = [LASS()];
    window.history.replaceState(null, "", `/lastbil?lass=${LASS_ID}`);
    await montera();
    expect(lassArk()!.getAttribute("aria-label")).toBe("Vilken maskin?");
    expect(lassArk()!.textContent).toContain("mån 12 okt");
  });

  it("ett lass som redan är besvarat säger det — det försvinner inte tyst", async () => {
    mock.lass = [LASS({ status: "auto_flytt", besvarad_av: "Martin Lindqvist", besvarad_tid: "2026-10-14T10:40:00Z" })];
    window.history.replaceState(null, "", `/lastbil?lass=${LASS_ID}`);
    await montera();
    expect(lassArk()!.getAttribute("aria-label")).toBe("Redan besvarat");
    expect(lassArk()!.textContent).toContain("Martin svarade 12:40");
  });

  it("ett lass som inte finns: klartext", async () => {
    window.history.replaceState(null, "", `/lastbil?lass=${LASS_ID}`);
    await montera();
    expect(lassArk()!.textContent).toContain("Det lasset finns inte längre.");
  });

  it("läsfel: fel med Försök igen — aldrig ett tomt ark", async () => {
    mock.lassFel = true;
    window.history.replaceState(null, "", `/lastbil?lass=${LASS_ID}`);
    await montera();
    expect(lassArk()!.textContent).toContain("Kunde inte läsa lasset just nu.");
    mock.lassFel = false; mock.lass = [LASS()];
    await klicka(knapp(/Försök igen/, lassArk()!));
    expect(lassArk()!.getAttribute("aria-label")).toBe("Vilken maskin?");
  });

  it("ett ogiltigt id i adressen är som om det inte stod där", async () => {
    mock.lass = [LASS()];
    window.history.replaceState(null, "", "/lastbil?lass=<script>");
    await montera();
    expect(lassArk()).toBeNull();
  });

  it("adressen rensas från ?lass efter första målningen (flik och period tar över)", async () => {
    mock.lass = [LASS()];
    window.history.replaceState(null, "", `/lastbil?lass=${LASS_ID}`);
    await montera();
    expect(window.location.search).not.toContain("lass=");
  });
});

// ── Steg 3: "Hämta en maskin" — knappen mellan väntar-raderna och flikarna, och flödet som ersätter /maskinflytt ──
describe("Hämta en maskin — uppifrån: knappen, Bilen nu, Att göra, Körningar", () => {
  const hamtaKnapp = () => document.querySelector("[data-hamta-start]") as HTMLElement | null;
  const fore = (a: Element | null, b: Element | null) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const bilenNu = () => document.querySelector('section[aria-label="Bilen nu"]') as HTMLElement | null;
  const korningar = () => document.querySelector("[data-korningar]") as HTMLElement | null;

  it("admin: Hämta en maskin först, sedan Bilen nu, sedan Att göra (lass, väntar, Fakturering), sedan Körningar", async () => {
    mock.lass = [LASS()];
    mock.extraUnderlag = [OG_OKT()];
    await montera();
    expect(hamtaKnapp()!.textContent).toBe("Hämta en maskin");
    expect(fore(hamtaKnapp(), bilenNu())).toBe(true);
    expect(fore(bilenNu(), attGora())).toBe(true);
    expect(fore(saknarRad(), vantarRad())).toBe(true);
    expect(fore(vantarRad(), fakturRad())).toBe(true);
    expect(attGora()!.contains(saknarRad()) && attGora()!.contains(vantarRad()) && attGora()!.contains(fakturRad())).toBe(true);
    expect(fore(attGora(), korningar())).toBe(true);
    expect(attGoraRubrik()).not.toBeNull();                                       // lass/väntande finns: rubriken "Att göra" står
  });

  it("Att göra: rubriken står när ENBART lass saknar maskin, och när ENBART flyttar väntar", async () => {
    mock.lass = [LASS()];
    await montera();
    expect(saknarRad()).not.toBeNull();
    expect(vantarRad()).toBeNull();
    expect(attGoraRubrik()).not.toBeNull();
    await act(async () => { rot?.unmount(); }); rot = null;
    mock.lass = [];
    mock.extraUnderlag = [OG_OKT()];
    await montera();
    expect(saknarRad()).toBeNull();
    expect(vantarRad()).not.toBeNull();
    expect(attGoraRubrik()).not.toBeNull();
  });

  it("knappen står först och på samma plats oavsett vilka rader som visas under (inget element med innehåll ligger före den)", async () => {
    await montera();
    const index = () => Array.from(document.body.querySelectorAll("*")).indexOf(hamtaKnapp()!);
    const utanRader = index();
    mock.lass = [LASS()];
    mock.extraUnderlag = [OG_OKT()];
    await ritaOm();
    expect(index()).toBe(utanRader);
    expect(Array.from(document.querySelectorAll("button, a, section, h1, h2")).find(e => e.textContent !== "")).toBe(hamtaKnapp());
  });

  it("Att göra: bara rader som har något — utan lass och utan väntande står bara Fakturering-raden, UTAN rubrik", async () => {
    await montera();
    expect(saknarRad()).toBeNull();
    expect(vantarRad()).toBeNull();
    expect(fakturRad()).not.toBeNull();
    expect(attGoraRubrik()).toBeNull();                                           // ingen rubrik "Att göra"
    expect(attGora()!.hasAttribute("data-att-gora-ensam")).toBe(true);
    expect(attGora()!.contains(fakturRad())).toBe(true);                          // raden står själv i sitt kort
    expect(Array.from(document.querySelectorAll("h3")).map(h => h.textContent)).not.toContain("Att göra");
    expect(text()).not.toMatch(/0 lass|0 flyttar väntar/);
  });

  it("det finns EN primärknapp på sidan, och den är Hämta en maskin", async () => {
    await montera();
    expect(document.querySelectorAll("[data-hamta-start]")).toHaveLength(1);
  });

  it("förare ser knappen, Bilen nu och Körningar, men varken Att göra eller Fakturering", async () => {
    mock.medarbetare = FORARE;
    await montera();
    expect(hamtaKnapp()).not.toBeNull();
    expect(bilenNu()).not.toBeNull();
    expect(korningar()).not.toBeNull();
    expect(attGora()).toBeNull();
    expect(remsa()).toBeNull();
    expect(text()).not.toContain("Fakturering");
  });

  it("tryck öppnar flödet: sidan ersätts, adressen blir ?hamta=1 — Avbryt tar tillbaka sidan", async () => {
    await montera();
    await klicka(hamtaKnapp()!);
    expect(text()).toContain("Vilken maskin hämtar du?");
    expect(window.location.search).toBe("?hamta=1");
    expect(bilenNu()).toBeNull();
    expect(attGora()).toBeNull();
    await klicka(knapp(/^Avbryt$/));
    expect(hamtaKnapp()).not.toBeNull();
    expect(window.location.search).toBe("?per=2026-10");
    expect(text()).not.toContain("Vilken maskin hämtar du?");
    expect(hookFel()).toEqual([]);
  });

  it("en omladdning på ?hamta=1 landar kvar i flödet", async () => {
    window.history.replaceState(null, "", "/lastbil?hamta=1");
    await montera();
    expect(text()).toContain("Vilken maskin hämtar du?");
    expect(hamtaKnapp()).toBeNull();
  });

  it("efter flödet står en rad som säger vad som hände — också för förare", async () => {
    mock.medarbetare = FORARE;
    window.history.replaceState(null, "", "/lastbil?hamta=1");
    await montera();
    await klicka(knapp(/^Avbryt$/));
    // Avbryt i listan ger ingen rad (inget hände); kvittot bär bara riktiga utfall
    expect(document.querySelector("[data-lass-kvitto]")).toBeNull();
  });

  it("Klar i flödet ger en rad överst med vad som hände — också för förare — och läser om vyn tyst", async () => {
    mock.medarbetare = FORARE;
    await montera();
    await klicka(hamtaKnapp()!);
    await klicka(knapp(/^Klar$/));
    expect(document.querySelector("[data-lass-kvitto]")!.textContent).toBe("Rundan är avslutad.");
    expect(hamtaKnapp()).not.toBeNull();
  });
});

// ── Tid att fakturera: flyttar över 3 mil (regel A, Martin 2026-10-24) ─────────────────────────────────────────
describe("Tid att fakturera (flytt över 3 mil): appen föreslår tiden ur rundan, en människa godkänner", () => {
  const tidRad = (id: string) => document.querySelector(`[data-tid="${id}"]`) as HTMLElement | null;
  const dlg = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
  // Lossningarna: Giant (b1) 16:10 på rundan 15:52–19:55, Elefant (b2) 08:30 på rundan 05:47–09:57 (svensk tid).
  const medLossning = () => {
    mock.flyttar = mock.flyttar.map(b => (b.id === "b1" ? { ...b, sluttid: "2026-10-06T14:10:00Z" } : b.id === "b2" ? { ...b, sluttid: "2026-10-05T06:30:00Z" } : b));
  };

  it("en godkänd flytt utan tid säger det i orange, med förslaget i ord — aldrig decimaler", async () => {
    medLossning();
    await oppnaFakturering();
    expect(tidRad("u8")!.textContent).toBe("Tid saknas · förslag 4 h 3 minchevron_right");
    expect(tidRad("u7")!.textContent).toBe("Tid saknas · förslag 4 h 11 minchevron_right");
    expect(text()).not.toMatch(/\d,\d\d h|\d\.\d\d/);
  });

  it("arket: tiden stor, var den kommer ifrån i ord, ±15 min/±1 h, tillbaka till förslaget — Spara skriver timmar med två decimaler", async () => {
    medLossning();
    await oppnaFakturering();
    await klicka(tidRad("u8")!);
    expect(dlg()!.getAttribute("aria-label")).toBe("Tid att fakturera");
    expect(dlg()!.querySelector("[data-tid-tal]")!.textContent).toBe("4 h 3 min");
    expect(dlg()!.querySelector("[data-tid-varifran]")!.textContent).toBe("Från 15:52 – bilen åkteTill 19:55 – bilen var tillbaka");
    await klicka(knapp(/^\+15 min$/, dlg()!));
    expect(dlg()!.querySelector("[data-tid-tal]")!.textContent).toBe("4 h 18 min");
    expect(knapp(/Tillbaka till appens förslag \(4 h 3 min\)/, dlg()!)).toBeTruthy();
    await klicka(dlg()!.querySelector("[data-tid-spara]") as HTMLElement);
    expect(mock.skrivningar.at(-1)).toEqual({ tabell: "fakturaunderlag_flytt", varden: { traillertimmar: 4.3 } });
    expect(dlg()).toBeNull();
    await vantaTills(() => tidRad("u8")?.textContent === "Tid 4 h 18 minchevron_right");
    expect(tidRad("u8")!.textContent).toBe("Tid 4 h 18 minchevron_right");
  });

  it("Godkänn sparar förslaget med samma tryck, och Ångra tar bort både godkännandet och tiden", async () => {
    medLossning();
    mock.extraUnderlag = [U("og-t", "2026-10-06", 53, "PONS20SDJAA270231", "o-vallust", "o-bagskytte", { ...OGODKAND, flytt_id: "b1" })];
    await oppnaFakturering();
    expect(tidRad("og-t")!.textContent).toBe("Tid 4 h 3 min · sparas när du godkännerchevron_right");
    const rad = document.querySelector('[data-underlag="og-t"]') as HTMLElement;
    await klicka(knapp(/^Godkänn$/, rad));
    const godk = mock.skrivningar.at(-1)!;
    expect(godk.varden.traillertimmar).toBe(4.05);                                  // 243 min
    expect(godk.varden.godkand_av).toBeTruthy();
    expect(text()).toContain("Godkänd · Giant · 4 h 3 min");
    await klicka(knapp(/^Ångra$/));
    expect(mock.skrivningar.at(-1)!.varden).toEqual({ godkand_tid: null, godkand_av: null, traillertimmar: null });
  });

  it("utan lossningstid, eller om rundan inte går att läsa, säger raden varför — och arket låter dig ställa in tiden själv", async () => {
    await oppnaFakturering();                                                       // fixturens flyttar saknar lossningstid
    expect(tidRad("u8")!.textContent).toBe("Tid saknas · en flytt i rundan saknar lossningstidchevron_right");
    await klicka(tidRad("u8")!);
    expect(dlg()!.querySelector("[data-tid-saknas]")!.textContent).toContain("Ställ in den själv");
    expect(dlg()!.querySelector("[data-tid-tal]")!.textContent).toBe("Ingen tid");
    expect((dlg()!.querySelector("[data-tid-spara]") as HTMLButtonElement).disabled).toBe(true);
    await klicka(knapp(/^\+1 h$/, dlg()!));
    await klicka(knapp(/^\+1 h$/, dlg()!));
    expect(dlg()!.querySelector("[data-tid-spara]")!.textContent).toBe("Spara 2 h");
    await act(async () => { rot?.unmount(); }); rot = null;
    mock.rundorFel = true;
    await oppnaFakturering();
    expect(tidRad("u8")!.textContent).toBe("Tid saknas · kunde inte läsa rundanchevron_right");
  });

  it("en flytt under 3 mil har ingen tidrad (den har fast pris)", async () => {
    mock.extraUnderlag = [U("kort", "2026-10-06", 25, "PONS20SDJAA270231", "o-vallust", "o-bagskytte", { flytt_id: "b1" })];
    await oppnaFakturering();
    expect(document.querySelector('[data-underlag="kort"]')).not.toBeNull();
    expect(tidRad("kort")).toBeNull();
  });
});

// ── Fakturasidan börjar med det DU ska göra (Martin 2026-10-24: "vad gör man på denna sidan?") ───────────────────
describe("Vad ska du göra? — en knapp som går igenom det en flytt i taget", () => {
  const dlg = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
  const gora = () => document.querySelector("[data-gora]") as HTMLElement | null;
  const medLossning = () => {
    mock.flyttar = mock.flyttar.map(b => (b.id === "b1" ? { ...b, sluttid: "2026-10-06T14:10:00Z" } : b.id === "b2" ? { ...b, sluttid: "2026-10-05T06:30:00Z" } : b));
  };

  it("sidan börjar med frågan: 'Vad ska du göra?' står FÖRE summan, i ord, med EN knapp", async () => {
    medLossning();
    await oppnaFakturering();
    expect(gora()!.querySelector("h3")!.textContent).toBe("Vad ska du göra?");
    expect(gora()!.querySelector("[data-gora-tid]")!.textContent).toBe("2 flyttar saknar tid");
    expect(gora()!.querySelector("[data-gora-godkann]")).toBeNull();
    expect(gora()!.compareDocumentPosition(remsa()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gora()!.querySelectorAll("button")).toHaveLength(1);
  });

  it("Gå igenom: en flytt i taget — 'Spara och nästa' sparar och går vidare, 'Hoppa över' lämnar den, sist ett kvitto", async () => {
    medLossning();
    await oppnaFakturering();
    await klicka(knapp(/^Gå igenom$/));
    expect(dlg()!.querySelector("[data-steg]")!.textContent).toBe("1 av 2");
    expect(dlg()!.textContent).toContain("Giant till Bågskyttebanan RP J-Hus- 25");
    expect(dlg()!.querySelector("[data-tid-tal]")!.textContent).toBe("4 h 3 min");
    await klicka(dlg()!.querySelector("[data-tid-spara]") as HTMLElement);
    expect(mock.skrivningar.at(-1)).toEqual({ tabell: "fakturaunderlag_flytt", varden: { traillertimmar: 4.05 } });
    await vantaTills(() => dlg()?.querySelector("[data-steg]")?.textContent === "2 av 2");
    expect(dlg()!.textContent).toContain("Elefant 26 till Östra-Hoka 1:7 A-C -25");
    await klicka(dlg()!.querySelector("[data-hoppa-over]") as HTMLElement);
    expect(dlg()).toBeNull();
    expect(text()).toContain("Klart! Du har gått igenom allt.");
    expect(mock.skrivningar).toHaveLength(1);                                       // den överhoppade rördes inte
  });

  it("en flytt att godkänna kommer först: 'Stämmer flytten?' — Ja, godkänn sparar flytten OCH tiden; Nej öppnar flyttens ark", async () => {
    medLossning();
    mock.extraUnderlag = [U("og-t", "2026-10-06", 53, "PONS20SDJAA270231", "o-vallust", "o-bagskytte", { ...OGODKAND, flytt_id: "b1" })];
    await oppnaFakturering();
    expect(gora()!.querySelector("[data-gora-godkann]")!.textContent).toBe("1 flytt ska godkännas");
    await klicka(knapp(/^Gå igenom$/));
    expect(dlg()!.getAttribute("aria-label")).toBe("Stämmer flytten?");
    expect(dlg()!.querySelector("[data-steg]")!.textContent).toBe("1 av 3");
    expect(Array.from(dlg()!.querySelectorAll("[data-godkann-tid]")).map(e => e.textContent)).toEqual(["Tid 4 h 3 min · sparas när du godkänner", "Från 15:52 till 19:55"]);
    await klicka(dlg()!.querySelector("[data-godkann-ja]") as HTMLElement);
    expect(mock.skrivningar.at(-1)!.varden.traillertimmar).toBe(4.05);
    expect(mock.skrivningar.at(-1)!.varden.godkand_av).toBeTruthy();
    await vantaTills(() => dlg()?.querySelector("[data-steg]")?.textContent === "2 av 3");
    await klicka(knapp(/^Avbryt$/, dlg()!));
    expect(dlg()).toBeNull();
    await act(async () => { rot?.unmount(); }); rot = null;
    mock.extraUnderlag = [U("og-n", "2026-10-06", 53, "PONS20SDJAA270231", "o-vallust", "o-bagskytte", { ...OGODKAND, flytt_id: "b1" })];
    await oppnaFakturering();
    await klicka(knapp(/^Gå igenom$/));
    await klicka(dlg()!.querySelector("[data-godkann-nej]") as HTMLElement);
    await vantaTills(() => dlg()?.getAttribute("aria-label") !== "Stämmer flytten?");
    expect(dlg()!.getAttribute("aria-label")).not.toBe("Stämmer flytten?");      // flyttens eget ark ("Flytten") har tagit över
  });

  it("inget att göra: 'Allt är klart' med en länk till fakturaunderlaget — ingen knapp att trycka", async () => {
    mock.underlag = mock.underlag.map(r => ({ ...r, traillertimmar: 3.5 }));
    await oppnaFakturering();
    expect(gora()).toBeNull();
    const klart = document.querySelector("[data-klart]") as HTMLElement;
    expect(klart.textContent).toContain("Allt är klart");
    expect(klart.textContent).toContain("Faktureringen tar det härifrån.");
    expect(klart.querySelector("a")!.getAttribute("href")).toBe("/ekonomi/fakturaunderlag");
  });
});
