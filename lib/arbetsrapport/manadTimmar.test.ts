import { describe, it, expect } from "vitest";
import { manadTimmar } from "./manadTimmar";

describe("manadTimmar — Min tids månadsrad", () => {
  it("företagsledare: arbetad tid, inte lönens nolla", () => {
    // Martin nov 2026: inga lönerader (timlön 0, övertid 0) men 49 tim 50 min arbetat.
    const m = { timlon_h: 0, overtid_h: 0, arbetat: { maskin_min: 2870, extra_min: 120, kortpass_min: 0, hemskickad_min: 0 } };
    expect(manadTimmar(m)).toBeCloseTo(2990 / 60, 6);
  });
  it("förare: samma tal som timlön + övertid", () => {
    const m = { timlon_h: 160, overtid_h: 6.5, arbetat: { maskin_min: 9690, extra_min: 240, kortpass_min: 30, hemskickad_min: 30 } };
    expect(manadTimmar(m)).toBeCloseTo(166.5, 6);
  });
  it("äldre svar utan arbetat: timlön + övertid", () => {
    expect(manadTimmar({ timlon_h: 10, overtid_h: 2 })).toBe(12);
  });
  it("ingen rad: null, aldrig 0", () => {
    expect(manadTimmar(null)).toBeNull();
    expect(manadTimmar(undefined)).toBeNull();
  });
});
