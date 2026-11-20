// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Sheet, Lista, Kort, ARK_DRA_STANG_PX } from "./ui";
import { FARG } from "@/lib/design/tokens";

let root: Root | null = null; let cont: HTMLDivElement | null = null;
async function visa(onStang: () => void) {
  cont = document.createElement("div"); document.body.appendChild(cont); root = createRoot(cont);
  await act(async () => { root!.render(<Sheet titel="Stefan" onStang={onStang}><button>knapp</button></Sheet>); });
}
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); root = null; });
// jsdom saknar PointerEvent; React lyssnar på händelsenamnet, så en MouseEvent duger.
const peka = async (el: Element, typ: string, clientY: number) => { await act(async () => { el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientY })); }); };
const dra = async (el: Element, dy: number) => { await peka(el, "pointerdown", 100); await peka(el, "pointermove", 100 + dy); await peka(el, "pointerup", 100 + dy); };

describe("admin-arket som iOS-ark", () => {
  it("Esc stänger arket", async () => {
    const stang = vi.fn(); await visa(stang);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(stang).toHaveBeenCalledTimes(1);
  });
  it("telefonläget fäster arket nederst, rundat bara upptill, med grepp", async () => {
    await visa(() => {});
    expect(document.querySelector("[data-ark-grepp]")).not.toBeNull();
    const css = Array.from(document.querySelectorAll("style")).map(s => s.textContent).join("");
    expect(css).toMatch(/max-width: 759px/);
    expect(css).toMatch(/\.ark-overlay \{ align-items: flex-end !important/);
    expect(css).toMatch(/border-radius: \d+px \d+px 0 0 !important/);
  });
  it("dra ned på telefon: kort drag fjädrar tillbaka, långt stänger", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    const stang = vi.fn(); await visa(stang);
    const g = document.querySelector("[data-ark-grepp]")!;
    await dra(g, ARK_DRA_STANG_PX - 10); expect(stang).not.toHaveBeenCalled();
    await dra(g, ARK_DRA_STANG_PX + 10); expect(stang).toHaveBeenCalledTimes(1);
  });
  it("på bred skärm gör draget ingenting", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    const stang = vi.fn(); await visa(stang);
    await dra(document.querySelector("[data-ark-rubrik]")!, 300); expect(stang).not.toHaveBeenCalled();
  });
  it("en lista och ett kort INNE i arket lyfts ett steg (FARG.upphojt) — i arkets egen färg syntes de inte; utanför är de som förut", async () => {
    const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
    cont = document.createElement("div"); document.body.appendChild(cont); root = createRoot(cont);
    await act(async () => { root!.render(<><Lista><span data-ute="">ute</span></Lista><Sheet titel="Anna" onStang={() => {}}><Lista><span data-inne="">inne</span></Lista><Kort><span data-kort="">k</span></Kort></Sheet></>); });
    const bg = (sel: string) => (document.querySelector(sel)!.parentElement as HTMLElement).style.background;
    expect(bg("[data-inne]")).toBe(rgb(FARG.upphojt));
    expect(bg("[data-kort]")).toBe(rgb(FARG.upphojt));
    expect(bg("[data-ute]")).toBe(rgb(FARG.kort));
  });
});
