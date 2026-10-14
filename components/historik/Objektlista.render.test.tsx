// @vitest-environment jsdom
/**
 * RENDERINGSTEST för märkningen "utanför normalområdet" i objektlistan (steg 20). Fake-supabase med Hästhagen-raden som den såg ut när
 * vy_hist_objekt_index flaggade den (medelstam 0,075, index 57,3) plus ett vanligt objekt i slutavverkning och ett i gallring. I prod är inget objekt
 * flaggat sedan steg 21 (Hästhagen och de tre andra ligger under special), så testet prövar mekanismen: skyddsnätet finns kvar för nästa objekt som hamnar utanför.
 * Indexet visas alltid; texten är grå och står efter ordet "index".
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const g = globalThis as unknown as { __tabeller: Record<string, unknown[]> };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (tabell: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "range", "eq"]) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: g.__tabeller[tabell] ?? [], error: null }).then(res);
      return q;
    },
  },
}));

import HistorikClient from "./HistorikClient";

const ar = (o: Record<string, unknown>) => ({
  maskin: "Rottne H8E Logmax", typ: "skördare", atgard: "slutavverkning", ar: 2025, urval: "namn", antal_objekt: 2, antal_med_g15: 2, volym_m3fub: 700, g15_h: 160,
  m3_per_g15: 5, stammar_per_g15: 100, medelstam: 0.1, antal_med_index: 2, viktat_index: 60, ...o,
});
const objekt = (o: Record<string, unknown>) => ({
  sha256: "x", maskin: "Rottne H8E Logmax", typ: "skördare", ar: 2025, atgard: "slutavverkning", atgard_kalla: "objektnamn", urval: "namn", objekt: "Objekt",
  startdatum: "2025-06-01", slutdatum: "2025-06-19", rapportdatum: "2025-06-19", stammar: 1000, volym_m3fub: 700, g15_h: 100, medelstam: 0.3, m3_per_g15: 7,
  forvantad_m3_per_g15: 7, index: 100, forare: "Oskar Nilsson", forare_andel: 1, forare_andel_kalla: "g15", avbrott_registrerade: "ja", volym_kvalitet: null,
  storage_path: null, filtyp: null, format: null, filnamn: null, mejldatum: null, antal_andra_utskrifter: 0, utanfor_normalomrade: false, ...o,
});

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(hash: string) {
  window.location.hash = hash;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root!.render(<HistorikClient />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
}
const vanlig = (t: string | null | undefined) => (t || "").replace(/ /g, " ");
const sida = () => vanlig(cont.textContent);
/** Raden som innehåller objektets namn: de flesta tecknen i radens kolumner (namn, meta, siffra, enhet, fotnot). */
const rad = (namn: string) => {
  const titel = Array.from(cont.querySelectorAll("div")).find((d) => d.children.length === 0 && d.textContent === namn)!;
  return titel.parentElement!.parentElement as HTMLElement; // namn → vänsterkolumnen → raden
};

beforeEach(() => {
  g.__tabeller = {
    vy_hist_maskin_ar: [ar({ atgard: "slutavverkning" }), ar({ atgard: "slutavverkning", ar: null })].flatMap((r) => [r, { ...r, urval: "alla" }]),
    vy_hist_normkurva: [],
    vy_hist_objekt_lista: [
      objekt({ sha256: "h", objekt: "Martin Sallnäs Au Hästhagen", medelstam: 0.075, index: 57.3, utanfor_normalomrade: true }),
      objekt({ sha256: "v", objekt: "Ett vanligt objekt", index: 104.2 }),
      objekt({ sha256: "u", objekt: "Utan index", index: null, g15_h: 1, utanfor_normalomrade: false }),
    ],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); document.body.innerHTML = ""; root = null; vi.restoreAllMocks(); });

describe("objektlistan: utanför normalområdet", () => {
  it("ett flaggat objekt visar indexet och, i grått efter 'index', texten 'utanför normalområdet'", async () => {
    await monter("#s=slutavverkning&m=Rottne%20H8E%20Logmax&a=slutavverkning&y=2025&v=ar");
    const r = rad("Martin Sallnäs Au Hästhagen");
    expect(r, "raden hittas").toBeTruthy();
    const kolumn = vanlig(r.lastElementChild?.textContent);
    expect(kolumn).toBe("57indexutanför normalområdet");
    const text = Array.from(r.querySelectorAll("div")).find((d) => d.textContent === "utanför normalområdet")!;
    expect(text).toBeTruthy();
    expect(text.style.color).not.toBe(""); // dämpad färg, samma token som övrig grå text
  });
  it("ett vanligt objekt har ingen märkning", async () => {
    await monter("#s=slutavverkning&m=Rottne%20H8E%20Logmax&a=slutavverkning&y=2025&v=ar");
    expect(vanlig(rad("Ett vanligt objekt").lastElementChild?.textContent)).toBe("104index");
    expect(sida().split("utanför normalområdet")).toHaveLength(2); // bara Hästhagen
  });
  it("utan index finns ingen märkning (flaggan är bara satt där indexet finns), och 'index saknas' står som förut", async () => {
    await monter("#s=slutavverkning&m=Rottne%20H8E%20Logmax&a=slutavverkning&y=2025&v=ar");
    expect(vanlig(rad("Utan index").lastElementChild?.textContent)).toBe("–index saknas");
  });
  it("gallring: ingen märkning, inte ens om flaggan skulle komma med", async () => {
    g.__tabeller.vy_hist_objekt_lista = [objekt({ sha256: "g", atgard: "gallring", objekt: "En gallring", index: 99, utanfor_normalomrade: false })];
    g.__tabeller.vy_hist_maskin_ar = [ar({ atgard: "gallring" }), ar({ atgard: "gallring", ar: null })].flatMap((r) => [r, { ...r, urval: "alla" }]);
    await monter("#s=gallring&m=Rottne%20H8E%20Logmax&a=gallring&y=2025&v=ar");
    expect(sida()).toContain("En gallring");
    expect(sida()).not.toContain("utanför normalområdet");
  });
});
