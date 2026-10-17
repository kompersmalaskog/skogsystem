import { describe, it, expect } from "vitest";
import { arbetsManadText, arbetsManadForLoneperiod, loneperiodForArbetsManad, utbetalningText } from "./lonemanad";

describe("arbetsmånaden är huvudnamnet, utbetalningen står i liten text", () => {
  it("augusti → 'augusti 2026' och 'lön betalas 25 september'", () => {
    expect(arbetsManadText("2026-08")).toBe("augusti 2026");
    expect(utbetalningText("2026-08")).toBe("lön betalas 25 september");
  });
  it("december betalas i januari nästa år (månadsnamnet är det som visas)", () => {
    expect(arbetsManadText("2025-12")).toBe("december 2025");
    expect(utbetalningText("2025-12")).toBe("lön betalas 25 januari");
  });
  it("löneperiod och arbetsmånad är varandras motsats, över årsskiftet också", () => {
    expect(loneperiodForArbetsManad("2026-08")).toBe("2026-09");
    expect(arbetsManadForLoneperiod("2026-09")).toBe("2026-08");
    expect(loneperiodForArbetsManad("2025-12")).toBe("2026-01");
    expect(arbetsManadForLoneperiod("2026-01")).toBe("2025-12");
  });
  it("löneperioden är aldrig ett visat namn: perioden 2026-09 visas som augusti", () => {
    expect(arbetsManadText(arbetsManadForLoneperiod("2026-09"))).toBe("augusti 2026");
  });
});
