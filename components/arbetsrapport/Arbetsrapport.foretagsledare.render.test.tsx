// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL: monterar hela Arbetsrapport och låter den gå igenom
 * samma tillståndsövergångar som i webbläsaren (ingen medarbetare → inläst).
 *
 * Varför: 2026-10-02 kraschade hela arbetsrapporten (React #310, "hooks i olika
 * ordning") eftersom en useEffect lagts EFTER `if(!medarbetare) return`. tsc,
 * design-lint och alla tester var gröna — hook-ordning fångas bara av en
 * rendering. Den här testen är den renderingen. Kör den för varje ändring som
 * lägger till hooks eller nya lägen i Arbetsrapport.
 *
 * Supabase är en kedjebar fake (ingen nätverkstrafik, ingen inloggning):
 * första renderingen har medarbetare = null, sedan läses en förare in. Alla
 * andra tabeller svarar tomt.
 */
import { manadRubrik, utbetalningText } from "@/lib/lonesystem/lonemanad";
import React, { act } from "react";
import fs from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const FORARE: any = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: "PONS20SDJAA270231", user_id: "u-1", hemadress: "" };
// gs_avtal-raden som databasen svarar med. null = ingen läsbar rad (en förare som inte får läsa tabellen får 0 rader utan fel).
const AVTAL: { rad: any } = { rad: null };
// Storage: signerade länkar registreras; signFel styr felvägen.
const STORAGE: { signerade: { bucket: string; path: string; sek: number }[]; signFel: any } = { signerade: [], signFel: null };
// Raden som den ser ut i prod (2026-10-14).
const PROD_AVTAL = { id: "f5b40c12", namn: "Skogsavtalet 2025-2027", giltigt_fran: "2025-04-01", giltigt_till: "2027-03-31", max_overtid_ar_h: 250, km_grans_per_dag: 60, atk_procent: 3.62, atk_procent_nasta: 3.92, atk_ledig_tid_h: 65.2, pension_tillagg_pct: 20, sjuklon_pct: 80, semester_dagar_ar: 25, semester_ersattning_pct: 13, skift_tillagg_kr: 8, bortovaro_12h_kr: 8.03, helglon_dagar: "Nyårsdagen,Trettondagen,Långfredagen,Annandag påsk,1 maj,Kristi himmelsfärd,Nationaldagen,Midsommarafton,Julafton,Juldagen,Annandag jul,Nyårsafton", dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    let enkel = false;
    const svar = () => {
      const rad = tabell === "medarbetare" ? FORARE : tabell === "gs_avtal" ? AVTAL.rad : null;
      return { data: enkel ? rad : rad ? [rad] : [], error: null, count: 0 };
    };
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") return (res: any, rej: any) => Promise.resolve(svar()).then(res, rej);
        if (prop === "single" || prop === "maybeSingle") return () => { enkel = true; return p; };
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => kedja(t),
      auth: {
        getUser: async () => ({ data: { user: { id: "u-1", email: FORARE.epost } } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      storage: { from: (bucket: string) => ({ createSignedUrl: async (path: string, sek: number) => {
        STORAGE.signerade.push({ bucket, path, sek });
        return STORAGE.signFel ? { data: null, error: STORAGE.signFel } : { data: { signedUrl: `https://signerad.example/${bucket}/${path}?t=1` }, error: null };
      } }) },
      rpc: () => kedja("rpc"),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

// En obesvarad dygnsvila i går. Mockad i lagret så både Dag-vyn och Min tid › Vila läser samma brott.
const igar = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const BROTT = { id: "v-1", medarbetare_id: "m-1", datum: igar, typ: "dygnsvila", vila_h: 8, krav_h: 11, besvarat_av_forare: false, orsak: null, orsak_fritext: null, kompensation_h: null, kompensation_uttagen: false };
vi.mock("@/lib/vilobrott-storage", async (orig) => ({
  ...(await orig<any>()),
  stadaVilobrott: async () => {},
  hamtaAktuellaVilobrott: async () => [BROTT],
  hamtaVilobrottForPeriod: async () => [BROTT],
  omanalyseraVilobrott: async () => {},
  raknaOmVilobrottEfterAndring: async () => {},
}));

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  window.history.replaceState({}, "", "/arbetsrapport");
  behallare = document.createElement("div"); document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null; delete FORARE.foretagsledare;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function montera() {
  const { default: Arbetsrapport } = await import("./Arbetsrapport");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Arbetsrapport />); });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}

// Företagsledare omfattas inte av arbetstidslagens vilokrav (Martin 2026-10-25): ingen vilorad, ingen fråga.
describe("vilofrågan och företagsledare", () => {
  it("en förare ser sitt obesvarade vilobrott på Dag", async () => {
    await montera();
    expect(behallare!.textContent).toContain("Dygnsvila 8 tim av 11");
  });
  it("en företagsledare ser det inte", async () => {
    FORARE.foretagsledare = true;
    await montera();
    expect(behallare!.textContent!.length).toBeGreaterThan(20);
    expect(behallare!.textContent).not.toContain("Dygnsvila 8 tim");
  });
  it("källvakt: Bekräftas vilokontroll hoppar över företagsledare", () => {
    const k = fs.readFileSync(path.resolve(__dirname, "Arbetsrapport.tsx"), "utf8");
    expect(k).toContain("if (medarbetare?.id && trosklar && !arForetagsledare)");
    expect(k).toContain("(arForetagsledare ? [] : (periodVilobrott || []))");
  });
});
