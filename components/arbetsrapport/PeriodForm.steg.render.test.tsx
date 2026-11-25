// @vitest-environment jsdom
// Extra arbete i steg (Martin 2026-11-25): Vad gjorde du? → Ska det faktureras?
// → (Vilken trakt?) → översikt. Faktureringen har INGET förval.
import { describe, it, expect, afterEach } from "vitest";
import React, { useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PeriodForm, { type PeriodVarden, periodKanSparas, traktFragas } from "./PeriodForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null; let el: HTMLElement | null = null;
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; el = null; });
const render = (x: React.ReactElement) => { el = document.createElement("div"); document.body.appendChild(el); rot = createRoot(el); act(() => rot!.render(x)); };
const hitta = (t: string) => {
  const n = Array.from(document.querySelectorAll<HTMLElement>("button, h1, h2, h3, p, span, div")).filter(x => x.textContent?.trim() === t);
  if (!n.length) throw new Error("hittar inte: " + t);
  return n[n.length - 1];
};
const klick = (n: HTMLElement) => act(() => { (n.closest("button") || n).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const screen = { getByText: hitta, getByTestId: (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement };
const fireEvent = { click: (n: HTMLElement) => klick(n) };

function Rigg({ start, objekt = null }: { start: PeriodVarden; objekt?: string | null }) {
  const [v, setV] = useState<PeriodVarden>({ ...start, objektId: objekt ?? start.objektId });
  return (
    <>
      <PeriodForm rubrik="Extra arbete" varden={v} onAndra={setV} startSteg="vad" klassificera
        pass={{ start_tid: "06:00:00", slut_tid: "15:00:00" }}
        onSpara={() => {}} onAvbryt={() => {}} objektNamn={objekt ? "Bondeskog" : null}
        renderObjektValjare={() => <div data-testid="valjare" />} />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  );
}
const tom: PeriodVarden = { start: "05:00", slut: "06:00", typ: "annat", deb: null, kommentar: "", objektId: null };
const varden = () => JSON.parse(screen.getByTestId("v").textContent || "{}");
const steg = () => document.querySelector("[data-steg]")?.getAttribute("data-steg");

describe("Extra arbete i steg", () => {
  it("börjar på 'Vad gjorde du?' med 13 val, två per rad", () => {
    render(<Rigg start={tom} />);
    expect(screen.getByText("Vad gjorde du?")).toBeTruthy();
    expect(document.querySelectorAll("[data-val]").length).toBe(13);
    expect(screen.getByText("Rotben och travbrickor")).toBeTruthy();
    expect(screen.getByText("Hämtade grejer")).toBeTruthy();
  });

  it("Service + Nej → ingen trakt-fråga, översikten direkt; inget förval på fakturan", () => {
    render(<Rigg start={tom} />);
    fireEvent.click(screen.getByText("Service"));
    expect(steg()).toBe("fakt");
    expect(varden().deb).toBeNull();
    fireEvent.click(screen.getByText("Nej"));
    expect(steg()).toBe("oversikt");
    expect(varden()).toMatchObject({ typ: "service", deb: false });
  });

  it("Ja → frågar vilken trakt, dagens trakt först", () => {
    render(<Rigg start={tom} objekt="11271849" />);
    fireEvent.click(screen.getByText("Service"));
    fireEvent.click(screen.getByText("Ja"));
    expect(steg()).toBe("trakt");
    expect(screen.getByText("Vilken trakt?")).toBeTruthy();
  });

  it("Planering frågar trakt även vid Nej", () => {
    expect(traktFragas({ typ: "planering", deb: false })).toBe(true);
    expect(traktFragas({ typ: "service", deb: false })).toBe(false);
  });

  it("utan val av fakturering går det inte att spara", () => {
    expect(periodKanSparas({ ...tom, typ: "service", deb: null })).toBe(false);
    expect(periodKanSparas({ ...tom, typ: "service", deb: false })).toBe(true);
  });

  it("Möte har 'Hela dagen'", () => {
    render(<Rigg start={tom} />);
    fireEvent.click(screen.getByText("Möte"));
    fireEvent.click(screen.getByText("Nej"));
    const knapp = document.querySelector("[data-hela-dagen]") as HTMLElement;
    expect(knapp).toBeTruthy();
    fireEvent.click(knapp);
    expect(varden()).toMatchObject({ start: "06:00", slut: "15:00" });
  });
});
