// @vitest-environment jsdom
/**
 * Punkt 6: objektnamn, maskinnamn och färskhetstext på Översiktskartans markörer visas som TEXT, aldrig tolkade som HTML.
 * Ett namn som `<img src=x onerror=…>` kunde köra kod i adminens webbläsare (objekt.namn kan ändras av alla inloggade).
 * Markörerna byggs som DOM-element av tre funktioner; här bygger vi dem med ett fientligt namn och granskar träden.
 */
import { describe, it, expect, vi } from "vitest";
import { buildGrotMarkerEl, buildMaskinMarkerEl, buildMarkerEl } from "./OversiktKarta";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const ILLA = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
const ILLA2 = `</div><svg onload="window.__xss=3">`;

const faror = (el: HTMLElement) => ({
  img: el.querySelectorAll("img").length,
  script: el.querySelectorAll("script").length,
  svgMedHandler: Array.from(el.querySelectorAll("svg")).filter(s => s.hasAttribute("onload")).length,
  handlers: Array.from(el.querySelectorAll("*")).filter(e => e.getAttributeNames().some(n => n.startsWith("on"))).length,
});
const harInga = (el: HTMLElement) => expect(faror(el)).toEqual({ img: 0, script: 0, svgMedHandler: 0, handlers: 0 });

describe("Översiktskartans markörer: namn är text, inte HTML", () => {
  it("objektmarkör (cirkel/fyrkant): namnet i etiketten", () => {
    const el = buildMarkerEl("circle", "square", "pagaende", [], { isSelected: false, label: ILLA, volym: 120, onClick: () => {} });
    harInga(el);
    expect(el.textContent).toContain(ILLA);
    const el2 = buildMarkerEl("circle", "circle", "planerad", [], { isSelected: true, label: ILLA2, onClick: () => {} });
    harInga(el2);
    expect(el2.textContent).toContain(ILLA2);
  });
  it("objektmarkör: maskinnamn/chips ovanför", () => {
    const el = buildMarkerEl("circle", "circle", "pagaende", [], { isSelected: false, label: "Objekt", sublabels: [ILLA, "Giant"], onClick: () => {} });
    harInga(el);
    expect(el.textContent).toContain(ILLA);
    expect(el.textContent).toContain("Giant");
  });
  it("maskinmarkör: namn och färskhetstext", () => {
    const el = buildMaskinMarkerEl(ILLA, ILLA2, false, () => {});
    harInga(el);
    expect(el.textContent).toContain(ILLA);
    expect(el.textContent).toContain(ILLA2);
  });
  it("GROT-markör: objektnamnet", () => {
    const el = buildGrotMarkerEl({ id: "1", namn: ILLA, typ: "gallring", status: "pagaende", grot_deadline: "2020-01-01" } as any, false, () => {});
    harInga(el);
    expect(el.textContent).toContain(ILLA);
  });
  it("ett vanligt namn visas som förut (inga &amp;-spår)", () => {
    const el = buildMarkerEl("circle", "circle", "planerad", [], { isSelected: false, label: "Östra-Höka & Co", volym: 12.4, onClick: () => {} });
    expect(el.textContent).toContain("Östra-Höka & Co (12 m³)");
  });
});
