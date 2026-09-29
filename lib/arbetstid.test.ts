import { describe, it, expect } from "vitest";
import { schemaTimmar, arbetadTidInklExtra } from "./arbetstid";

const ingenRod = () => false;

describe("schemaTimmar — veckans 'av 40' och årsvyns markering", () => {
  it("en hel vecka mån–sön = 5 vardagar × 8", () => {
    expect(schemaTimmar("2026-09-28", "2026-10-04", ingenRod)).toBe(40);
  });
  it("röd dag räknas bort", () => {
    // Kristi himmelsfärd 2026-05-14 (torsdag)
    expect(schemaTimmar("2026-05-11", "2026-05-17", d => d === "2026-05-14")).toBe(32);
  });
  it("september 2026 = 22 vardagar = 176 tim", () => {
    expect(schemaTimmar("2026-09-01", "2026-09-30", ingenRod)).toBe(176);
  });
  it("timmar per dag följer avtalet om det skickas in", () => {
    expect(schemaTimmar("2026-09-28", "2026-10-02", ingenRod, 7.5)).toBe(37.5);
  });
  it("tom period (fran efter till) = 0", () => {
    expect(schemaTimmar("2026-10-02", "2026-10-01", ingenRod)).toBe(0);
  });
});

describe("arbetadTidInklExtra — månadens stapel", () => {
  it("maskintid + extra tid, perioddag utan maskintid räknas", () => {
    expect(arbetadTidInklExtra([{ datum: "2026-09-01", arbetad_min: 450 }, { datum: "2026-09-02", arbetad_min: null }], [{ datum: "2026-09-02", minuter: 360 }]))
      .toEqual({ totalMin: 810, maskinMin: 450, extraMin: 360 });
  });
});
