import { describe, it, expect } from "vitest";
import { tidsFragor, vilaSvarText } from "./dagFragor";

describe("tidsFragor", () => {
  it("vanlig dag: inga frågor", () => {
    expect(tidsFragor(30, 534)).toEqual([]);
    expect(tidsFragor(60, 534)).toEqual([]); // gränsen är ÖVER 60
  });
  it("rast över gränsen", () => {
    const f = tidsFragor(95, 534);
    expect(f.map(x => x.id)).toEqual(["rast"]);
    expect(f[0].titel).toBe("Rast 95 min");
    expect(f[0].rubrik).toBe("Rast 95 min — stämmer det?");
  });
  it("pass över 16 tim", () => {
    const f = tidsFragor(30, 17 * 60);
    expect(f.map(x => x.id)).toEqual(["lang"]);
    expect(f[0].titel).toMatch(/^Passet är 17 tim/);
  });
  it("negativ tid (rast längre än passet)", () => {
    expect(tidsFragor(30, -10).map(x => x.id)).toEqual(["negativ"]);
  });
  it("lång dag och lång rast samtidigt: två frågor, pass först", () => {
    expect(tidsFragor(95, 17 * 60).map(x => x.id)).toEqual(["lang", "rast"]);
  });
  it("okänd passlängd (perioddag): bara rasten bedöms", () => {
    expect(tidsFragor(0, null)).toEqual([]);
  });
});

describe("vilaSvarText", () => {
  it("kort text per orsak", () => {
    expect(vilaSvarText("akut_jour")).toBe("Akut situation");
    expect(vilaSvarText("oforutsedd")).toBe("Oförutsedd händelse");
    expect(vilaSvarText("planerad_avtal")).toBe("Planerat enligt avtal");
  });
  it("annat visar fritexten", () => {
    expect(vilaSvarText("annat", "  röjde väg ")).toBe("Annat: röjde väg");
    expect(vilaSvarText("annat", "")).toBe("Annat");
  });
  it("okänd orsak", () => {
    expect(vilaSvarText(null)).toBe("Besvarat");
  });
});
