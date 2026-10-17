import { describe, it, expect } from "vitest";
import { arbetsManadText, arbetsManadForLoneperiod, loneperiodForArbetsManad, utbetalningText, manadNamn, manadRubrik } from "./lonemanad";

describe("arbetsmånaden är huvudnamnet, vilken månad lönen kommer står bredvid", () => {
  it("augusti → 'Augusti · lön i september' (ingen dag: lönen betalas inte en fast dag)", () => {
    expect(arbetsManadText("2026-08")).toBe("augusti 2026");
    expect(utbetalningText("2026-08")).toBe("lön i september");
    expect(manadRubrik("2026-08", 2026)).toBe("Augusti · lön i september");
    expect(manadRubrik("2026-08", 2026)).not.toMatch(/\d/);
  });
  it("december betalas i januari nästa år (månadsnamnet är det som visas)", () => {
    expect(arbetsManadText("2025-12")).toBe("december 2025");
    expect(utbetalningText("2025-12")).toBe("lön i januari");
  });
  it("året står med bara när det inte är innevarande år", () => {
    expect(manadNamn("2026-08", 2026)).toBe("Augusti");
    expect(manadNamn("2025-12", 2026)).toBe("December 2025");
    expect(manadRubrik("2025-12", 2026)).toBe("December 2025 · lön i januari");
  });
  it("löneperiod och arbetsmånad är varandras motsats, över årsskiftet också", () => {
    expect(loneperiodForArbetsManad("2026-08")).toBe("2026-09");
    expect(arbetsManadForLoneperiod("2026-09")).toBe("2026-08");
    expect(loneperiodForArbetsManad("2025-12")).toBe("2026-01");
    expect(arbetsManadForLoneperiod("2026-01")).toBe("2025-12");
  });
  it("löneperioden är aldrig ett visat namn: perioden 2026-09 visas som augusti", () => {
    expect(arbetsManadText(arbetsManadForLoneperiod("2026-09"))).toBe("augusti 2026");
    expect(manadNamn(arbetsManadForLoneperiod("2026-09"), 2026)).toBe("Augusti");
  });
});
