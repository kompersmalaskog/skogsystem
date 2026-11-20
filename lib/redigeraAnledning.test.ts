import { describe, it, expect } from "vitest";
import { anledningGiltig, ANLEDNING_MIN_TECKEN } from "./redigeraAnledning";

// Redigera godtog "." som anledning (11 av 84 redigerade dagar i prod, alla sedan 2026-09-08). Regeln: minst 3 tecken efter
// trim och minst en bokstav eller siffra.
describe("anledningGiltig", () => {
  it("minst 3 tecken", () => { expect(ANLEDNING_MIN_TECKEN).toBe(3); });

  it.each([
    ["Flytt", true], ["fel", true], ["Brandvakt", true], ["810E", true], ["Service och flytt", true], ["åäö", true], ["Rast 35", true],
  ])("%s → %s", (s, ok) => { expect(anledningGiltig(s)).toBe(ok); });

  it.each([
    [""], ["."], [".."], ["..."], ["   "], ["  .  "], ["ab"], [" a "], ["!!!"], ["---"], ["- - -"], ["  ?  "],
  ])("%j är ingen anledning", (s) => { expect(anledningGiltig(s)).toBe(false); });

  it("blanksteg runt räknas inte: ' ab ' är två tecken", () => { expect(anledningGiltig(" ab ")).toBe(false); expect(anledningGiltig(" abc ")).toBe(true); });
  it("tre tecken räcker även om ett är skiljetecken, bara en bokstav eller siffra finns: 'a..' → ja", () => { expect(anledningGiltig("a..")).toBe(true); });
  it("null och undefined är ogiltiga", () => { expect(anledningGiltig(null)).toBe(false); expect(anledningGiltig(undefined)).toBe(false); });
});
