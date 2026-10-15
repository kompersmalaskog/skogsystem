// @vitest-environment jsdom
/**
 * Sheeten i panelram (SheetLageContext = "panel"): samma komponent, annan container — fast till höger, 380 px, stängknapp, Escape.
 * Utan provider (eller med "ark") är bladet underifrån som förut. Bara en panel öppen åt gången avgörs av vyn (usePanelVal), se PanelVal.test.tsx.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Sheet, SheetLageContext, type SheetLage } from "./Sheet";

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(lage: SheetLage | null, onClose: () => void, open = true) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  const sheet = <Sheet open={open} onClose={onClose} title="Per bolag"><p>Innehåll</p></Sheet>;
  await act(async () => { root!.render(lage ? <SheetLageContext.Provider value={lage}>{sheet}</SheetLageContext.Provider> : sheet); });
}
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); root = null; });

describe("Sheet i panelram", () => {
  it("renderar en fast panel till höger med titel, innehåll och stängknapp — inget mörkt lager och ingen 'Klar'", async () => {
    await monter("panel", vi.fn());
    const p = document.querySelector("aside[role=dialog]") as HTMLElement;
    expect(p).not.toBeNull();
    expect(p.getAttribute("aria-label")).toBe("Per bolag");
    expect(p.style.position).toBe("fixed");
    expect(p.style.right).toBe("0px");
    expect(p.style.width).toBe("380px");
    expect(p.textContent).toContain("Innehåll");
    expect(document.querySelector("button[aria-label=Stäng]")).not.toBeNull();
    expect(p.textContent).not.toContain("Klar");
    expect(document.querySelector("[data-sheet-grepp]")).toBeNull();
  });
  it("stängknappen och Escape stänger", async () => {
    const stang = vi.fn();
    await monter("panel", stang);
    await act(async () => { (document.querySelector("button[aria-label=Stäng]") as HTMLElement).click(); });
    expect(stang).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(stang).toHaveBeenCalledTimes(2);
  });
  it("Escape lyssnas bara medan panelen är öppen", async () => {
    const stang = vi.fn();
    await monter("panel", stang, false);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(stang).not.toHaveBeenCalled();
    expect(document.querySelector("aside")).toBeNull();
  });
  it("utan provider och med 'ark' är bladet underifrån som förut (Klar, ingen aside)", async () => {
    await monter(null, vi.fn());
    expect(document.querySelector("aside")).toBeNull();
    expect(document.body.textContent).toContain("Klar");
    await act(async () => { root?.unmount(); }); cont.remove();
    await monter("ark", vi.fn());
    expect(document.querySelector("aside")).toBeNull();
    expect(document.body.textContent).toContain("Klar");
  });
});
