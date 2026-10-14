// @vitest-environment jsdom
/**
 * RENDERINGSTEST för index-förklaringen: ⓘ efter ordet Index på alla ställen index visas (startlistan, maskinsidan, årslistan, jämförelsen),
 * ett och samma blad, med texten i rätt ordning och tabellen/exemplet räknade ur vy_hist_normkurva (fake-supabase med kurvans riktiga a, b, n).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data: unknown; error: { code?: string; message: string } | null };
const g = globalThis as unknown as { __tabeller: Record<string, unknown[]>; __normkurvaFel: Svar["error"] };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (tabell: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "range", "eq"]) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(tabell === "vy_hist_normkurva" && g.__normkurvaFel ? { data: null, error: g.__normkurvaFel } : { data: g.__tabeller[tabell] ?? [], error: null }).then(res);
      return q;
    },
  },
}));

import HistorikClient from "./HistorikClient";
import JamforClient from "./JamforClient";

const KURVOR = [
  { atgard: "gallring", variant: "g15-viktad", a: 3.75895561541139, b: 0.736407612446492, n: 679 },
  { atgard: "slutavverkning", variant: "g15-viktad", a: 4.01736406793956, b: 0.77799640669071, n: 896 },
];
const ar = (o: Record<string, unknown>) => ({
  maskin: "R64101", typ: "skördare", atgard: "gallring", ar: null, urval: "namn", antal_objekt: 20, antal_med_g15: 20, volym_m3fub: 12000, g15_h: 1500,
  m3_per_g15: 8, stammar_per_g15: 100, medelstam: 0.1, antal_med_index: 20, viktat_index: 105, ...o,
});
// vyn har en rad per urval: 'namn' (åtgärd ur namn) och 'alla' (med antagna)
const MASKINER = [
  ar({}), ar({ ar: 2023 }), ar({ ar: 2024 }),
  ar({ atgard: null }),
  ar({ maskin: "R64428" }), ar({ maskin: "R64428", ar: 2024, viktat_index: 98 }),
].flatMap((r) => [r, { ...r, urval: "alla" }]);

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(el: React.ReactElement, hash = "") {
  window.location.hash = hash;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root!.render(el); });
  await vantaa();
}
const vantaa = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
// NBSP (tal + enhet hålls ihop) läses som vanligt blanksteg
const vanlig = (t: string | null | undefined) => (t || "").replace(/\u00a0/g, " ");
const sida = () => vanlig(cont.textContent);
// bladets egen text (panelen runt greppet), inte sidan bakom
const blad = () => vanlig(document.body.querySelector("[data-sheet-grepp]")?.parentElement?.textContent);
const infoKnappar = () => Array.from(cont.querySelectorAll<HTMLButtonElement>('button[aria-label="Vad är index?"]'));
async function klick(el: Element) { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await vantaa(); }

beforeEach(() => {
  g.__tabeller = { vy_hist_maskin_ar: MASKINER, vy_hist_normkurva: KURVOR, vy_hist_objekt_lista: [] };
  g.__normkurvaFel = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); document.body.innerHTML = ""; root = null; vi.restoreAllMocks(); });

const ordning = (t: string, ...delar: string[]) => {
  let pos = -1;
  for (const d of delar) { const i = t.indexOf(d, pos + 1); expect(i, `"${d}" ska komma efter föregående`).toBeGreaterThan(pos); pos = i; }
};

describe("normalvärdena kan inte hämtas", () => {
  it("bladet öppnas ändå, med förklaringen, och säger att normalvärdena inte gick att hämta (utan databasens text); nästa öppning försöker igen", async () => {
    g.__normkurvaFel = { code: "57014", message: "canceling statement due to statement timeout" };
    await monter(<HistorikClient />, "#s=gallring");
    await klick(infoKnappar()[0]);
    expect(blad()).toContain("Vad är index?");
    expect(blad()).toContain("Index visar hur mycket maskinen producerade");
    expect(blad()).toContain("Det tog för lång tid att hämta normalvärdena. Försök igen om en stund.");
    expect(blad()).not.toContain("canceling statement");
    expect(blad()).not.toContain("Exempel");
    // felet cachas inte: stäng, åtgärda, öppna igen
    await klick(document.body.querySelector('button[aria-label="Stäng"]')!);
    expect(blad()).toBe("");
    g.__normkurvaFel = null;
    await klick(infoKnappar()[0]);
    expect(blad()).toContain("Exempel");
    expect(blad()).toContain("Normalt 9 m³/G15");
  });
});

describe("startlistan", () => {
  it("ⓘ efter Index i raden under rubriken; bladet visar bara gallring när gallring är vald", async () => {
    await monter(<HistorikClient />, "#s=gallring");
    expect(infoKnappar()).toHaveLength(1);
    await klick(infoKnappar()[0]);
    ordning(blad(), "Vad är index?", "Normalt m³/G15", "Exempel");
    expect(blad()).toContain("Gallring");
    expect(blad()).not.toContain("Slutavverkning");
  });
  it("Skada och special: bladet visar båda åtgärderna", async () => {
    await monter(<HistorikClient />, "#s=skadaspecial");
    await klick(infoKnappar()[0]);
    expect(blad()).toContain("Gallring");
    expect(blad()).toContain("Slutavverkning");
  });
});

describe("maskinsidan", () => {
  it("ⓘ efter 'viktat index' i rubriken År för år; slutavverkning för en maskin i slutavverkning", async () => {
    g.__tabeller.vy_hist_maskin_ar = MASKINER.map((r) => ({ ...r, atgard: r.atgard === "gallring" ? "slutavverkning" : r.atgard }));
    await monter(<HistorikClient />, "#s=slutavverkning&m=R64101&a=slutavverkning");
    const rubrik = Array.from(cont.querySelectorAll("h2")).find((h) => /År för år/.test(h.textContent || ""))!;
    expect(rubrik.textContent).toMatch(/viktat index/);
    const knapp = rubrik.querySelector<HTMLButtonElement>('button[aria-label="Vad är index?"]');
    expect(knapp).not.toBeNull();
    await klick(knapp!);
    ordning(blad(), "Vad är index?", "Slutavverkning", "Medelstam", "Exempel", "Tänk på");
    expect(blad()).not.toContain("Gallring");
    expect(blad()).toContain("Medelstam 0,40 m³. Normalt 27 m³/G15. Maskinen gjorde 29,7 → index 110.");
  });
});

describe("årslistan", () => {
  it("ⓘ i raden under årtalet, och bladet visar åtgärden man står i", async () => {
    await monter(<HistorikClient />, "#s=gallring&m=R64101&a=gallring&y=2024&v=ar");
    expect(infoKnappar()).toHaveLength(1);
    expect(sida()).toMatch(/gallring · .*index/i);
    await klick(infoKnappar()[0]);
    expect(blad()).toContain("Medelstam 0,12 m³. Normalt 9 m³/G15. Maskinen gjorde 9,9 → index 110.");
    expect(blad()).not.toContain("Slutavverkning");
  });
});

describe("jämförelsen", () => {
  it("ⓘ i förklaringsraden och vid rubriken 'Viktat index år för år'; bladet visar båda åtgärderna", async () => {
    await monter(<JamforClient />, "#t=skordare&g=gallring&m=R64101|R64428");
    expect(infoKnappar().length).toBeGreaterThanOrEqual(2);
    await klick(infoKnappar()[0]);
    expect(blad()).toContain("Gallring");
    expect(blad()).toContain("Slutavverkning");
    expect(blad()).toContain("Medelstam 0,12 m³. Normalt 9 m³/G15. Maskinen gjorde 9,9 → index 110.");
    expect(blad()).toContain("Medelstam 0,40 m³. Normalt 27 m³/G15. Maskinen gjorde 29,7 → index 110.");
  });
});

describe("bladets innehåll", () => {
  it("texten i den ordning och med de ord som önskats, tabellen räknad ur kurvan, siffrorna i grått sist", async () => {
    await monter(<JamforClient />, "#t=skordare&g=gallring&m=R64101|R64428");
    await klick(infoKnappar()[0]);
    const t = blad();
    ordning(
      t,
      "Vad är index?",
      "Index visar hur mycket maskinen producerade jämfört med vad som är normalt för den trädstorleken.",
      "100 = normalt. 110 betyder 10 % mer än normalt. 90 betyder 10 % mindre.",
      "Varför inte bara m³/G15?",
      "Grova träd ger alltid fler m³ per timme än klena. Index räknar bort trädstorleken. Då kan en gallring i klen skog jämföras rättvist med en slutavverkning i grov.",
      "Vad är normalt?",
      "Räknat från våra egna objekt där åtgärden är känd: 679 i gallring och 896 i slutavverkning. Så här mycket gör en maskin normalt per G15-timme:",
      "Medelstam", "Normalt m³/G15", "0,08 m³", "0,12 m³", "0,16 m³", "0,25 m³", "0,40 m³", "0,60 m³",
      "Exempel",
      "Tänk på",
      "Index tar bara hänsyn till trädstorleken. Föraren, terrängen och hur ofta maskinen står still (se TU) påverkar också. Jämför därför alltid index och TU tillsammans.",
      "Index finns bara för gallring och slutavverkning. Vindfällor, skada och special har för olika förutsättningar för att jämföras.",
      "Skotare får inget index, eftersom medelstammen kommer från skördaren.",
    );
    const rader = Array.from(document.body.querySelectorAll('[role="row"]')).map((r) => Array.from(r.querySelectorAll('[role="cell"]')).map((c) => vanlig(c.textContent)));
    expect(rader.filter((r) => r.length)).toEqual([
      ["0,08 m³", "7"], ["0,12 m³", "9"], ["0,16 m³", "11"],
      ["0,25 m³", "19"], ["0,40 m³", "27"], ["0,60 m³", "37"],
    ]);
    // inga ord som förklaringen ska vara fri från
    expect(t).not.toMatch(/regression|logaritm|r²|formel/i);
  });
});
