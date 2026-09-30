import { describe, it, expect } from "vitest";
import { tuProcent, g15Sek, arKortPaus, G15_GRANS_SEK, TU_BRANSCHSNITT } from "./g15";

describe("TU — teknisk utnyttjandegrad", () => {
  it("G15 / (G15 + avbrott); rast är inte med", () => {
    // 900 h G15, 100 h avbrott → 90 %. Rasten påverkar inte.
    expect(tuProcent(900 * 3600, 0, 100 * 3600)).toBe(90);
  });
  it("korta avbrott (< 15 min) hör till G15 och höjer TU", () => {
    // 354,4 h G15, 31,1 h DOWN varav 3 h korta → (354,4+3)/(354,4+31,1) = 92,7 %
    expect(tuProcent(354.4 * 3600, 3 * 3600, 31.1 * 3600)).toBe(92.7);
  });
  it("ingen tid → null, inte 0 eller 100", () => {
    expect(tuProcent(0, 0, 0)).toBeNull();
  });
  it("en decimal", () => {
    expect(tuProcent(86.4, 0, 13.6)).toBe(86.4);
  });
  it("gränsen och G15 är oförändrade", () => {
    expect(G15_GRANS_SEK).toBe(900);
    expect(arKortPaus(899)).toBe(true);
    expect(arKortPaus(900)).toBe(false);
    expect(g15Sek(10, 20, 30)).toBe(60);
    expect(TU_BRANSCHSNITT).toEqual({ skordare: 85, skotare: 90 });
  });
});
