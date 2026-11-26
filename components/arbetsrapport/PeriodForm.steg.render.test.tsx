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

let sparat: PeriodVarden[] = [];
afterEach(() => { sparat = []; try { localStorage.clear(); } catch {} });

function Rigg({ start, objekt = null }: { start: PeriodVarden; objekt?: string | null }) {
  const [v, setV] = useState<PeriodVarden>({ ...start, objektId: objekt ?? start.objektId });
  return (
    <>
      <PeriodForm rubrik="Extra arbete" varden={v} onAndra={setV} startSteg="vad" klassificera
        pass={{ start_tid: "06:00:00", slut_tid: "15:00:00" }}
        onSpara={sv => { if (sv) sparat.push(sv); }} onAvbryt={() => {}} objektNamn={objekt ? "Bondeskog" : null}
        renderObjektValjare={(_id, onValj) => <button data-testid="valjare" onClick={() => onValj("999")}>Annan</button>} />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  );
}
const tom: PeriodVarden = { start: "05:00", slut: "06:00", typ: "annat", deb: null, kommentar: "", objektId: null };
const utanTid: PeriodVarden = { ...tom, start: "", slut: "" };
const varden = () => JSON.parse(screen.getByTestId("v").textContent || "{}");
const steg = () => document.querySelector("[data-steg]")?.getAttribute("data-steg");

describe("Snabbt: tiden känd = två tryck och sparat", () => {
  it("börjar på 'Vad gjorde du?' med alla 13 val första gången", () => {
    render(<Rigg start={tom} />);
    expect(screen.getByText("Vad gjorde du?")).toBeTruthy();
    expect(document.querySelectorAll("[data-val]").length).toBe(13);
    expect(screen.getByText("Rotben och travbrickor")).toBeTruthy();
    expect(screen.getByText("Hämtade grejer")).toBeTruthy();
  });

  it("Service + Nej → sparat direkt, ingen översikt; inget förval på fakturan", () => {
    render(<Rigg start={tom} />);
    fireEvent.click(screen.getByText("Service"));
    expect(steg()).toBe("fakt");
    expect(varden().deb).toBeNull();
    expect(sparat).toHaveLength(0);
    fireEvent.click(screen.getByText("Nej"));
    expect(sparat).toEqual([expect.objectContaining({ typ: "service", deb: false, start: "05:00", slut: "06:00" })]);
  });

  it("Ja med dagens trakt → sparat direkt, ingen trakt-fråga", () => {
    render(<Rigg start={tom} objekt="11271849" />);
    fireEvent.click(screen.getByText("Service"));
    fireEvent.click(screen.getByText("Ja"));
    expect(sparat).toEqual([expect.objectContaining({ deb: true, objektId: "11271849" })]);
  });

  it("Ja utan trakt på dagen → 'Vilken trakt?', valet sparar", () => {
    render(<Rigg start={tom} />);
    fireEvent.click(screen.getByText("Service"));
    fireEvent.click(screen.getByText("Ja"));
    expect(steg()).toBe("trakt");
    expect(sparat).toHaveLength(0);
    fireEvent.click(screen.getByTestId("valjare"));
    expect(sparat).toEqual([expect.objectContaining({ deb: true, objektId: "999" })]);
  });

  it("Annat → översikten (kommentaren säger vad det var), inget sparas av sig självt", () => {
    render(<Rigg start={tom} />);
    fireEvent.click(screen.getByText("Annat"));
    fireEvent.click(screen.getByText("Nej"));
    expect(steg()).toBe("oversikt");
    expect(sparat).toHaveLength(0);
  });
});

describe("Föraren lägger till själv: tiden frågas", () => {
  it("Vad → När? → Faktureras → sparat", () => {
    render(<Rigg start={utanTid} />);
    fireEvent.click(screen.getByText("Service"));
    expect(steg()).toBe("tid");
    expect(screen.getByText("När?")).toBeTruthy();
    const nasta = document.querySelector("[data-nasta]") as HTMLElement;
    fireEvent.click(nasta);
    expect(steg()).toBe("tid"); // utan tid går det inte vidare
  });

  it("Möte har 'Hela dagen' i När?", () => {
    render(<Rigg start={utanTid} />);
    fireEvent.click(screen.getByText("Möte"));
    fireEvent.click(document.querySelector("[data-hela-dagen]") as HTMLElement);
    expect(varden()).toMatchObject({ start: "06:00", slut: "15:00" });
    fireEvent.click(document.querySelector("[data-nasta]") as HTMLElement);
    expect(steg()).toBe("fakt");
    fireEvent.click(screen.getByText("Nej"));
    expect(sparat).toEqual([expect.objectContaining({ typ: "mote", start: "06:00", slut: "15:00", deb: false })]);
  });
});

describe("Mest använda först", () => {
  it("efter användning: sex val + Fler, Fler visar alla", () => {
    localStorage.setItem("extra_arbete_mest_v1", JSON.stringify({ service: 3, rotben: 1 }));
    render(<Rigg start={tom} />);
    expect(document.querySelectorAll("[data-val]:not([data-val=fler])").length).toBe(6);
    expect(screen.getByText("Rotben och travbrickor")).toBeTruthy();
    fireEvent.click(screen.getByText("Fler"));
    expect(document.querySelectorAll("[data-val]").length).toBe(13);
  });
});

describe("regler", () => {
  it("Planering frågar trakt även vid Nej", () => {
    expect(traktFragas({ typ: "planering", deb: false })).toBe(true);
    expect(traktFragas({ typ: "service", deb: false })).toBe(false);
  });
  it("utan val av fakturering går det inte att spara", () => {
    expect(periodKanSparas({ ...tom, typ: "service", deb: null })).toBe(false);
    expect(periodKanSparas({ ...tom, typ: "service", deb: false })).toBe(true);
  });
});
