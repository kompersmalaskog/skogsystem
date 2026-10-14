import { describe, it, expect } from "vitest";
import { merAttSeAtHoger } from "./schemaMatt";

describe("merAttSeAtHoger — tonas högerkanten ut?", () => {
  it("mer innehåll åt höger → ja (telefon: 21 dagar à 34 px bakom en smal ruta)", () => {
    expect(merAttSeAtHoger(0, 358, 110 + 21 * 34)).toBe(true);
  });
  it("svept till slutet → nej", () => {
    const sw = 110 + 21 * 34; const cw = 358;
    expect(merAttSeAtHoger(sw - cw, cw, sw)).toBe(false);
  });
  it("allt ryms (iPad/dator) → nej", () => {
    expect(merAttSeAtHoger(0, 1120, 1120)).toBe(false);
  });
  it("1 px avrundning räknas inte som 'mer att se'", () => {
    expect(merAttSeAtHoger(100, 358, 459)).toBe(false); // 1 px kvar
    expect(merAttSeAtHoger(100, 358, 460)).toBe(true);  // 2 px kvar
    expect(merAttSeAtHoger(100, 358, 461)).toBe(true);
  });
});
