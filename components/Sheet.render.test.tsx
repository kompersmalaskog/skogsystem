// @vitest-environment jsdom
/**
 * Bottenbladet (components/Sheet): stängs med tryck utanför och "Klar", och — när `dragNedStanger` är på — med drag nedåt i greppet.
 * Utan egenskapen är bladet oförändrat (alla andra sheets i appen): drag gör ingenting.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Sheet } from "./Sheet";

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(props: { dragNedStanger?: boolean }, onClose: () => void) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root!.render(<Sheet open onClose={onClose} title="Titel" {...props}><p>Innehåll</p></Sheet>); });
}
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); root = null; });

// jsdom saknar PointerEvent; React lyssnar på händelsenamnet, så en MouseEvent med pekartyp duger.
const peka = async (el: Element, typ: "pointerdown" | "pointermove" | "pointerup", clientY: number) => {
  await act(async () => { el.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientY })); });
};
const grepp = () => document.querySelector("[data-sheet-grepp]") as HTMLElement;
const panel = () => grepp().parentElement as HTMLElement;

describe("Sheet", () => {
  it("drag nedåt förbi tröskeln stänger (med dragNedStanger), och bladet följer fingret på vägen", async () => {
    const stang = vi.fn();
    await monter({ dragNedStanger: true }, stang);
    await peka(grepp(), "pointerdown", 100);
    await peka(grepp(), "pointermove", 160);
    expect(panel().style.transform).toBe("translateY(60px)");
    await peka(grepp(), "pointermove", 260);
    await peka(grepp(), "pointerup", 260);
    expect(stang).toHaveBeenCalledTimes(1);
  });
  it("ett kort drag stänger inte, och bladet går tillbaka", async () => {
    const stang = vi.fn();
    await monter({ dragNedStanger: true }, stang);
    await peka(grepp(), "pointerdown", 100);
    await peka(grepp(), "pointermove", 140);
    await peka(grepp(), "pointerup", 140);
    expect(stang).not.toHaveBeenCalled();
    expect(panel().style.transform).toBe("");
  });
  it("drag uppåt eller ett tryck utan rörelse stänger inte", async () => {
    const stang = vi.fn();
    await monter({ dragNedStanger: true }, stang);
    await peka(grepp(), "pointerdown", 300);
    await peka(grepp(), "pointermove", 100);
    await peka(grepp(), "pointerup", 100);
    await peka(grepp(), "pointerdown", 100);
    await peka(grepp(), "pointerup", 100);
    expect(stang).not.toHaveBeenCalled();
  });
  it("utan dragNedStanger gör drag ingenting (övriga sheets i appen är oförändrade)", async () => {
    const stang = vi.fn();
    await monter({}, stang);
    expect(grepp()).toBeNull();
    const f = document.querySelector("h2")!.parentElement!;
    await peka(f, "pointerdown", 100);
    await peka(f, "pointermove", 400);
    await peka(f, "pointerup", 400);
    expect(stang).not.toHaveBeenCalled();
  });
  it("tryck utanför och Klar stänger som förut", async () => {
    const stang = vi.fn();
    await monter({ dragNedStanger: true }, stang);
    const bakgrund = panel().previousElementSibling as HTMLElement;
    await act(async () => { bakgrund.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(stang).toHaveBeenCalledTimes(1);
    await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="Stäng"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(stang).toHaveBeenCalledTimes(2);
  });
});
