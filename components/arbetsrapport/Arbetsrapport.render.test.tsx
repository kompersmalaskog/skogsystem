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
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: "PONS20SDJAA270231", user_id: "u-1", hemadress: "" };
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

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsolFel: string[] = [];

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsolFel = [];
  AVTAL.rad = null; STORAGE.signerade = []; STORAGE.signFel = null;
  vi.spyOn(console, "error").mockImplementation((...a: any[]) => { konsolFel.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  window.history.replaceState({}, "", "/arbetsrapport");
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function montera(url = "/arbetsrapport") {
  window.history.replaceState({}, "", url);
  const { default: Arbetsrapport } = await import("./Arbetsrapport");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Arbetsrapport />); });
  // Låt inläsningen (medarbetare null → inläst) och efterföljande effekter landa.
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}

const hookFel = () => konsolFel.filter(m => /Rendered (more|fewer) hooks|change in the order of Hooks|Minified React error #310|#310/i.test(m));

describe("Arbetsrapport renderas utan hook-fel", () => {
  it("morgonvyn: ingen medarbetare → inläst förare, utan krasch", async () => {
    await montera("/arbetsrapport");
    expect(hookFel()).toEqual([]);
    expect(behallare!.textContent).not.toMatch(/Något gick fel/);
    expect(behallare!.textContent!.length).toBeGreaterThan(20);
  });
});


// ── Mitt avtal (Inställningar → Mitt avtal): värdena ur gs_avtal-raden, eller – ──
async function oppnaMittAvtal() {
  await montera("/arbetsrapport");
  const text = () => behallare!.textContent || "";
  const nav = Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes("Inställningar"))!;
  await act(async () => { nav.click(); });
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  const kort = Array.from(behallare!.querySelectorAll<HTMLElement>("div")).find(d => (d.textContent || "").trim().startsWith("Mitt avtal") && d.style.cursor === "pointer")!;
  await act(async () => { kort.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  // Värdet på en rad: etiketten och värdet är syskon i en flex-rad.
  const varde = (etikett: string) => {
    const e = Array.from(behallare!.querySelectorAll("span")).find(sp => (sp.textContent || "").trim() === etikett);
    return (e?.nextElementSibling?.textContent || "").trim();
  };
  return { text, varde };
}

describe("Mitt avtal visar avtalet — eller –, aldrig en gissning", () => {
  it("prod-raden: perioden ur giltigt_fran/giltigt_till och värdena ur riktiga kolumner", async () => {
    AVTAL.rad = PROD_AVTAL;
    const { text, varde } = await oppnaMittAvtal();
    expect(text()).toContain("Mitt avtal");
    expect(varde("Gäller")).toBe("1 apr 2025 – 31 mar 2027");
    expect(varde("Ledig tid")).toBe("65,2 tim/år");
    expect(varde("Skifttillägg")).toBe("8 kr/tim");
    expect(varde("Bortovaro >12h")).toBe("8,03 kr/tim");
    expect(varde("Avsättning")).toBe("3,62%");
    expect(varde("Nästa period")).toBe("3,92%");
    expect(varde("Max övertid")).toBe("250 tim/år");
    expect(varde("Km-gräns")).toBe("60 km/dag");
    expect(text()).toContain("Kristi himmelsfärd");
    expect(text()).not.toContain("kunde inte läsas");
  });

  it("ett annat avtal i databasen syns: inga gamla reservvärden (65,2 · 8,03 · 2025–2027 · uttagsår) står kvar", async () => {
    AVTAL.rad = { ...PROD_AVTAL, namn: "Skogsavtalet 2027-2029", giltigt_fran: "2027-04-01", giltigt_till: null, atk_ledig_tid_h: 70.5, skift_tillagg_kr: 9.5, bortovaro_12h_kr: null, atk_procent_nasta: null, helglon_dagar: null, max_overtid_ar_h: 200, km_grans_per_dag: 70 };
    const { text, varde } = await oppnaMittAvtal();
    expect(varde("Avtal")).toBe("Skogsavtalet 2027-2029");
    expect(varde("Gäller")).toBe("Från 1 apr 2027, löpande");
    expect(varde("Ledig tid")).toBe("70,5 tim/år");
    expect(varde("Skifttillägg")).toBe("9,5 kr/tim");
    expect(varde("Bortovaro >12h")).toBe("–");
    expect(varde("Nästa period")).toBe("–");
    expect(varde("Dagar")).toBe("–");
    expect(varde("Max övertid")).toBe("200 tim/år");
    expect(varde("Km-gräns")).toBe("70 km/dag");
    for (const gammalt of ["65,2", "65.2", "8,03", "8.03", "uttagsår", "Intjäningsår", "2025-2026", "31 mar 2027", "Skogsavtalet 2025-2027"]) expect(text(), gammalt).not.toContain(gammalt);
  });

  it("raden går inte att läsa (förare utan läsrätt får 0 rader): – överallt, inget avtalsnamn, och en rad som säger det", async () => {
    AVTAL.rad = null;
    const { text, varde } = await oppnaMittAvtal();
    expect(text()).toContain("Mitt avtal");
    for (const e of ["Avtal", "Gäller", "Max övertid", "Km-gräns", "Avsättning", "Nästa period", "Ledig tid", "Pension-tillägg", "Ersättning efter karens", "Semesterdagar", "Ersättning tidsbegränsad", "Dagar", "Skifttillägg", "Bortovaro >12h"]) {
      expect(varde(e), e).toBe("–");
    }
    expect(text()).toContain("Avtalet kunde inte läsas");
    for (const hittat of ["Skogsavtalet 2025-2027", "GS-avtalet", "65,2", "8,03", "1 apr 2025", "250 tim", "25 dagar", "+20%", "80%"]) expect(text(), hittat).not.toContain(hittat);
  });
});

// ── Läs hela avtalet: signerad länk ur den privata bucketen, aldrig en 404 ──
describe("Läs hela avtalet", () => {
  const knapp = () => Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes("Läs hela avtalet") || (b.textContent || "").includes("Öppnar"))!;
  const klickaKnapp = async () => {
    await act(async () => { knapp().dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  };
  const fakeFlik = () => ({ location: { href: "" }, close: vi.fn() });

  it("avtalet är uppladdat: en signerad länk (60 s) för sökvägen på avtalsraden öppnas i fliken som öppnades i klicket", async () => {
    AVTAL.rad = { ...PROD_AVTAL, avtal_pdf_path: "f5b40c12.pdf" };
    const flik = fakeFlik();
    const oppna = vi.spyOn(window, "open").mockImplementation(() => flik as any);
    const { text } = await oppnaMittAvtal();
    expect(knapp().disabled).toBe(false);
    expect(text()).not.toContain("Avtalet är inte uppladdat än");
    await klickaKnapp();
    expect(oppna).toHaveBeenCalledWith("", "_blank");
    expect(STORAGE.signerade).toEqual([{ bucket: "avtal", path: "f5b40c12.pdf", sek: 60 }]);
    expect(flik.location.href).toBe("https://signerad.example/avtal/f5b40c12.pdf?t=1");
    expect(flik.close).not.toHaveBeenCalled();
  });

  it("ett annat avtal = en annan fil, utan kodändring: sökvägen ur raden styr", async () => {
    AVTAL.rad = { ...PROD_AVTAL, namn: "Skogsavtalet 2027-2029", avtal_pdf_path: "ett-annat-id.pdf" };
    vi.spyOn(window, "open").mockImplementation(() => fakeFlik() as any);
    await oppnaMittAvtal();
    await klickaKnapp();
    expect(STORAGE.signerade.map(x => x.path)).toEqual(["ett-annat-id.pdf"]);
  });

  it("ingen fil uppladdad (sökvägen saknas): knappen är inaktiv, det står 'Avtalet är inte uppladdat än', och inget anrop görs", async () => {
    AVTAL.rad = { ...PROD_AVTAL, avtal_pdf_path: null };
    const oppna = vi.spyOn(window, "open").mockImplementation(() => fakeFlik() as any);
    const { text } = await oppnaMittAvtal();
    expect(text()).toContain("Avtalet är inte uppladdat än");
    expect(knapp().disabled).toBe(true);
    await klickaKnapp();
    expect(STORAGE.signerade).toEqual([]);
    expect(oppna).not.toHaveBeenCalled();
  });

  it("kolumnen finns inte än (raden saknar avtal_pdf_path): samma sak — 'inte uppladdat än', ingen 404", async () => {
    AVTAL.rad = PROD_AVTAL;   // ingen avtal_pdf_path-nyckel alls
    const { text } = await oppnaMittAvtal();
    expect(text()).toContain("Avtalet är inte uppladdat än");
    expect(knapp().disabled).toBe(true);
  });

  it("sökvägen finns men filen saknas i bucketen: meddelandet står i sidan och den tomma fliken stängs", async () => {
    AVTAL.rad = { ...PROD_AVTAL, avtal_pdf_path: "borta.pdf" };
    STORAGE.signFel = { message: "Object not found", statusCode: "404" };
    const flik = fakeFlik();
    vi.spyOn(window, "open").mockImplementation(() => flik as any);
    const { text } = await oppnaMittAvtal();
    expect(text()).not.toContain("Avtalet är inte uppladdat än");
    await klickaKnapp();
    expect(text()).toContain("Avtalet är inte uppladdat än");
    expect(flik.close).toHaveBeenCalled();
    expect(flik.location.href).toBe("");
  });

  it("ett annat fel (nät, session) säger att man kan försöka igen — och påstår inte att filen saknas", async () => {
    AVTAL.rad = { ...PROD_AVTAL, avtal_pdf_path: "f5b40c12.pdf" };
    STORAGE.signFel = { message: "Failed to fetch" };
    vi.spyOn(window, "open").mockImplementation(() => fakeFlik() as any);
    const { text } = await oppnaMittAvtal();
    await klickaKnapp();
    expect(text()).toContain("Kunde inte öppna avtalet just nu. Försök igen om en stund.");
    expect(text()).not.toContain("inte uppladdat");
    expect(knapp().disabled).toBe(false);   // går att försöka igen
  });

  it("raden går inte att läsa: knappen är inaktiv men sidan påstår inte att avtalet 'inte är uppladdat' (den säger att avtalet inte kunde läsas)", async () => {
    AVTAL.rad = null;
    const { text } = await oppnaMittAvtal();
    expect(knapp().disabled).toBe(true);
    expect(text()).not.toContain("Avtalet är inte uppladdat än");
    expect(text()).toContain("Avtalet kunde inte läsas");
  });
});
