// @vitest-environment jsdom
/**
 * Arbetsrapport i Kolumnen (granskning 2026-10-14, docs/arbetsrapport-granskning/GRANSKNING.md):
 *  - varje vys rot är kolumnen (smal 640 + marginaler = 672; Kalender bred 1120 + marginaler = 1152), aldrig kant till kant;
 *  - rotens minsta höjd är skärmen MINUS toppfältet (förut 100vh rakt av: 56 px för hög på alla bredder, även telefon);
 *  - bottennavets flikar ligger i kolumnen, ark är KOLUMN.ark (520);
 *  - tryckytor ≥ 44 px i Min tid → Vila, Redigeras rubrikrad och objektväljarens sökfält;
 *  - decimalkomma ("4,8 dagar", inte "4.8").
 *
 * Renderingen (jsdom) läser inline-stilen som React skrev. jsdom tappar värden den inte förstår (`env()`, nästlad
 * `calc`, `max()`), så rotens minHeight och navets padding vaktas på KÄLLAN och tokens, inte på computed style.
 */
import React, { act } from "react";
import fs from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KOLUMN, AVSTAND, TRAFFYTA, kolumnRot, ROT_MIN_HOJD, KOLUMN_CSS } from "@/lib/design/tokens";

const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: "PONS20SDJAA270231", user_id: "u-1", hemadress: "" };

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    let enkel = false;
    const svar = () => {
      const rad = tabell === "medarbetare" ? FORARE : null;
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
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: "n/a" } }) }) },
      rpc: () => kedja("rpc"),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
const kalla = fs.readFileSync(path.resolve(__dirname, "Arbetsrapport.tsx"), "utf8");

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const json = String(url).includes("employee-details")
      ? { ok: true, semester: { betalda: 25, obetalda: 0, sparade: 5, uttagna: 12, kvar: 18 }, atk: { saldo_kr: 6840, timmar: 38.4 }, lon: { timlon: 180 } }
      : {};
    return { ok: true, status: 200, json: async () => json, text: async () => "" };
  }));
  window.history.replaceState({}, "", "/arbetsrapport");
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const stilla = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
async function montera() {
  const { default: Arbetsrapport } = await import("./Arbetsrapport");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Arbetsrapport />); });
  await stilla(8);
}
const knapp = (t: string, exakt = false) => Array.from(behallare!.querySelectorAll("button")).find(b => exakt ? (b.textContent || "").trim() === t : (b.textContent || "").includes(t));
async function klicka(t: string, exakt = false) {
  const k = knapp(t, exakt);
  if (!k) throw new Error(`hittar ingen knapp: ${t} — sidan säger: ${(behallare!.textContent || "").slice(0, 200)}`);
  await act(async () => { k.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await stilla();
}
/** Vyns rot: det första elementet i behållaren som bär kolumnstilen. */
const rotStil = () => (behallare!.firstElementChild as HTMLElement | null)?.style;
const px = (v: string | undefined) => Number(String(v || "").replace("px", ""));

describe("Kolumnen: tokens", () => {
  it("kolumnRot: smal = 640 + 2×16, bred = 1120 + 2×16, centrerad, full bredd under maxbredden", () => {
    const smal = kolumnRot(), bred = kolumnRot("bred");
    expect(smal.maxWidth).toBe(KOLUMN.smal + 2 * AVSTAND.sidmarginal);
    expect(smal.maxWidth).toBe(672);
    expect(bred.maxWidth).toBe(1152);
    expect([smal.width, smal.marginLeft, smal.marginRight, smal.boxSizing]).toEqual(["100%", "auto", "auto", "border-box"]);
  });
  it("rotens höjd är skärmen minus toppfältet (samma mått som layoutens paddingTop) — inte 100vh rakt av", () => {
    expect(ROT_MIN_HOJD).toBe("calc(100vh - calc(56px + env(safe-area-inset-top)))");
    expect(KOLUMN_CSS).toBe("body{background:#000000}");
  });
});

describe("Kolumnen: varje vys rot är kolumnen", () => {
  it("Dag: 672 px", async () => {
    await montera();
    expect(px(rotStil()?.maxWidth)).toBe(672);
    expect(rotStil()?.marginLeft).toBe("auto");
    expect(rotStil()?.marginRight).toBe("auto");
  });
  it("Min tid (alla tre flikar), Inställningar och Mitt avtal: 672 px", async () => {
    await montera();
    await klicka("Min tid");
    for (const f of ["Översikt", "Saldon", "Vila"]) { await klicka(f, true); expect(px(rotStil()?.maxWidth)).toBe(672); }
    await klicka("Saldon", true); await klicka("Mitt avtal");
    expect(px(rotStil()?.maxWidth)).toBe(672);
    await act(async () => { behallare!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await stilla();
    await klicka("Inställningar");
    expect(px(rotStil()?.maxWidth)).toBe(672);
  });
  it("Kalender: bred, 1152 px", async () => {
    await montera();
    await klicka("Kalender");
    expect(px(rotStil()?.maxWidth)).toBe(1152);
  });
  it("Lön: 672 px (översikten var 448)", async () => {
    await montera();
    await klicka("Lön");
    expect(px(rotStil()?.maxWidth)).toBe(672);
  });
});

describe("Kolumnen: källvakter (rötter, nav, ark)", () => {
  it("ingen rot har kvar 100vh; alla går via ROT_MIN_HOJD + kolumnRot", () => {
    expect(kalla).not.toMatch(/minHeight\s*:\s*"100vh"/);
    expect((kalla.match(/minHeight:ROT_MIN_HOJD,\.\.\.kolumnRot\(/g) || []).length).toBe(7);   // shell + 6 rötter
    expect((kalla.match(/kolumnRot\("bred"\)/g) || []).length).toBe(1);                         // bara Kalender
  });
  it("bottennavets flikar ligger i kolumnen: bakgrunden full bredd, paddingen räknas ur KOLUMN.smal", () => {
    const nav = kalla.slice(kalla.indexOf("function BottomNavBar"), kalla.indexOf("function BottomNavBar") + 900);
    expect(nav).toContain("max(${AVSTAND.l}px, calc((100% - ${KOLUMN.smal}px) / 2))");
    expect(nav).toMatch(/position:"fixed"[^}]*width:"100%"/);
  });
  it("ark är KOLUMN.ark — inga egna 500/520/560", () => {
    expect(kalla).not.toMatch(/maxWidth\s*:\s*(500|520|560)\b/);
    expect((kalla.match(/maxWidth:KOLUMN\.ark/g) || []).length).toBeGreaterThanOrEqual(12);
  });
  it("Lön har inga egna innerbredder (448 / 640) utan roten är kolumnen", () => {
    expect(kalla).not.toMatch(/maxWidth\s*:\s*448\b/);
    expect(kalla).not.toMatch(/maxWidth\s*:\s*640\b/);
  });
  it("body är svart medan vyn är monterad (annars syns sidans bakgrund bredvid kolumnen)", () => {
    expect(kalla).toContain("${KOLUMN_CSS}");
    expect(kalla).toContain("<style>{designCss}{KOLUMN_CSS}</style>");
  });
});

describe("Tryckytor ≥ 44 px", () => {
  it("Min tid → Vila: segmenten, 'Se alla nätter →' och månadspilarna", async () => {
    await montera();
    await klicka("Min tid"); await klicka("Vila", true);
    for (const t of ["7 dagar", "30 dagar", "Månad", "År"]) expect(knapp(t, true)?.style.minHeight, t).toBe(`${TRAFFYTA.min}px`);
    const alla = knapp("Se alla nätter");
    if (alla) expect(alla.style.minHeight).toBe(`${TRAFFYTA.min}px`);
    await klicka("Månad", true);
    const pilar = Array.from(behallare!.querySelectorAll("button")).filter(b => /^chevron_(left|right)$/.test((b.textContent || "").trim()));
    expect(pilar.length).toBe(2);
    for (const b of pilar) expect([b.style.width, b.style.height]).toEqual([`${TRAFFYTA.min}px`, `${TRAFFYTA.min}px`]);
  });
  it("Redigeras länkar ('Åkte hem …', 'Byt mot ledig dag') ligger på egen rad, vänsterställda, utan minHeight:0", () => {
    for (const text of ["Åkte hem sjuk, VAB eller föräldraledig?", "Byt mot ledig dag"]) {
      const i = kalla.indexOf(`>${text}</button>`);
      expect(i, text).toBeGreaterThan(0);
      const stil = kalla.slice(kalla.lastIndexOf("<button", i), i);
      expect(stil, text).toContain("...KNAPP.lank");
      expect(stil, text).toContain('display:"flex"');
      expect(stil, text).toContain('justifyContent:"flex-start"');
      expect(stil, text).not.toMatch(/minHeight:\s*0/);
    }
  });
  it("objektväljarens sökfält: hela fältet är träffytan (44 px), inte bara texten (23 px)", () => {
    const i = kalla.indexOf('placeholder="Sök objekt…"');
    expect(kalla.slice(i, i + 260)).toContain("minHeight:TRAFFYTA.min");
  });
  it("Inställningars valrader (30 min, 3 tim …): klassen valj-rad bär 44 px, stilraden med literalerna är orörd", () => {
    expect(kalla).toContain('<button key={o.l} className="valj-rad" onClick={()=>onPick(o.v)}');
    expect(kalla).toContain(".valj-rad { min-height: ${TRAFFYTA.min}px; }");
  });
});

describe("Decimalkomma", () => {
  it("Saldon: ATK '38,4h (4,8 dagar)' — aldrig '38.4h (4.8 dagar)'", async () => {
    await montera();
    await klicka("Min tid"); await klicka("Saldon", true);
    await stilla(6);
    const t = behallare!.textContent || "";
    expect(t).toContain("38,4h (4,8 dagar)");
    expect(t).not.toMatch(/\d\.\d+ dagar/);
    expect(t).not.toContain("38.4h");
  });
  it("inga råa JavaScript-decimaler i texterna (ATK-dagar, Kort dygnsvila)", () => {
    expect(kalla).not.toMatch(/\$\{atkDagar\}/);
    expect(kalla).not.toMatch(/\{atkTimmar\}h/);
    expect(kalla).not.toMatch(/\$\{Math\.round\(vilaTim\*10\)\/10\}h/);
  });
});
