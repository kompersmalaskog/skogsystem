// @vitest-environment jsdom
/**
 * Lön › Vilobrott: tryck på ett brott → arket med förarens svar och admins "hanterat". Admin svarar aldrig åt föraren:
 * arket har inget svarsfält, bara "Vad gjordes?". Läsning och skrivning är mockade; listan läses om efter en sparning.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const g = globalThis as any;

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/admin/vilobrottLista", () => ({ laddaVilobrottLista: vi.fn(async () => g.__lista) }));
vi.mock("@/lib/admin/vilobrottHanterat", async (orig) => {
  const riktig: any = await orig();
  return { ...riktig, markeraHanterat: vi.fn(async (b: any, t: string) => { g.__sparat.push([b.datum, t]); if (g.__sparaFel) throw new Error(g.__sparaFel); }),
    angraHanterat: vi.fn(async (b: any) => { g.__angrat.push(b.datum); }) };
});

import VilobrottUnderflik from "./VilobrottUnderflik";
import { laddaVilobrottLista } from "@/lib/admin/vilobrottLista";

const brott = (o: any = {}) => ({
  typ: "dygnsvila", datum: "2026-10-12", vecka: 42, år: 2026, vila_h: 8.5, krav_h: 11, beskrivning: "8,5 h vila mellan passen",
  medarbetare_id: "s", namn: "Stefan Andersson", svar: "Oförutsedd händelse", dagar: null, hanterat: null, ...o,
});

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>;
const tick = async () => { await act(async () => { await new Promise(res => setTimeout(res, 0)); }); };
const knapp = (text: string) => Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const skriv = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
};

beforeEach(async () => {
  g.__lista = [brott()]; g.__sparat = []; g.__angrat = []; g.__sparaFel = null;
  rot = document.createElement("div"); document.body.appendChild(rot);
  r = createRoot(rot);
  await act(async () => { r.render(<VilobrottUnderflik />); });
  await tick();
});
afterEach(() => { act(() => r.unmount()); rot.remove(); document.body.innerHTML = ""; vi.clearAllMocks(); });

const oppna = async () => {
  const rad = document.querySelector('[data-vilobrott-rad="dygnsvila-2026-10-12"] button') as HTMLButtonElement;
  expect(rad).toBeTruthy();
  await act(async () => { rad.click(); });
};

describe("Lön › Vilobrott: hanterat", () => {
  it("arket visar förarens svar och 'Vad gjordes?'; knappen är grå tills något är skrivet; inget svarsfält åt föraren", async () => {
    await oppna();
    const ark = document.querySelector("[data-vilobrott-hanterat-ark]")!;
    expect(ark.textContent).toContain("Oförutsedd händelse");
    expect(ark.textContent).toContain("Vad gjordes?");
    expect(ark.textContent).not.toMatch(/Varför bröts vilan/);
    expect(knapp("Markera som hanterat")!.disabled).toBe(true);
    await skriv(document.getElementById("vilobrott-hanterat-text") as HTMLInputElement, "Kompledigt 3 h 14 okt");
    expect(knapp("Markera som hanterat")!.disabled).toBe(false);
  });

  it("spara → anteckningen skickas, listan läses om och raden säger vem som hanterade", async () => {
    await oppna();
    await skriv(document.getElementById("vilobrott-hanterat-text") as HTMLInputElement, "Kompledigt 3 h 14 okt");
    g.__lista = [brott({ hanterat: { tid: "2026-10-25T09:00:00Z", av: "Martin Lindqvist", anteckning: "Kompledigt 3 h 14 okt" } })];
    await act(async () => { knapp("Markera som hanterat")!.click(); });
    await tick();
    expect(g.__sparat).toEqual([["2026-10-12", "Kompledigt 3 h 14 okt"]]);
    expect((laddaVilobrottLista as any).mock.calls.length).toBe(2);
    expect(document.querySelector("[data-hanterat]")!.textContent).toContain("Hanterat av Martin 25 okt");
    expect(document.querySelector('[data-vilobrott-rad="dygnsvila-2026-10-12"]')!.textContent).toContain("Hanterat av Martin 25 okt: Kompledigt 3 h 14 okt");
  });

  it("ett fel vid sparning sägs i arket, listan läses inte om", async () => {
    await oppna();
    await skriv(document.getElementById("vilobrott-hanterat-text") as HTMLInputElement, "Kompledigt");
    g.__sparaFel = "Kunde inte spara: migrationen är inte körd.";
    await act(async () => { knapp("Markera som hanterat")!.click(); });
    await tick();
    expect(document.querySelector("[data-vilobrott-hanterat-ark]")!.textContent).toContain("migrationen är inte körd");
    expect((laddaVilobrottLista as any).mock.calls.length).toBe(1);
  });

  it("obesvarat och redan hanterat: svaret står som obesvarat, markeringen går att ta bort", async () => {
    g.__lista = [brott({ svar: null, hanterat: { tid: "2026-10-25T09:00:00Z", av: "Martin Lindqvist", anteckning: "Kompledigt" } })];
    await act(async () => { r.render(<VilobrottUnderflik key="om" />); });
    await tick();
    await oppna();
    expect(document.querySelector("[data-vila-svar]")!.textContent).toContain("Obesvarat");
    expect(knapp("Markera som hanterat")).toBeUndefined();
    await act(async () => { knapp("Ta bort markeringen")!.click(); });
    await tick();
    expect(g.__angrat).toEqual(["2026-10-12"]);
  });
});
