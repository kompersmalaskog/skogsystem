import { describe, it, expect } from "vitest";
import { tuProcent, arOklassatAvbrott, g15Sek, arKortPaus, G15_GRANS_SEK, TU_BRANSCHSNITT } from "./g15";

const H = 3600;

describe("TU — teknisk utnyttjandegrad (Skogforsk)", () => {
  it("(P+T) / (P+T + avbrott); rast är inte med", () => {
    // 900 h arbete, 100 h avbrott → 90 %. Rasten finns inte i formeln.
    expect(tuProcent(900 * H, 0, 0, 100 * H)).toBe(90);
  });
  it("korta avbrott (< 15 min) hör till G15 och höjer TU", () => {
    // 354,4 h arbete, 31,1 h avbrott varav 3 h korta → (354,4+3)/(354,4+31,1) = 92,7 %
    expect(tuProcent(354.4 * H, 0, 3 * H, 31.1 * H)).toBe(92.7);
  });
  it("övrigt arbete ligger bara i nämnaren", () => {
    // 90 h arbete, 10 h övrigt arbete, 0 avbrott → 90/100 = 90 %
    expect(tuProcent(90 * H, 10 * H, 0, 0)).toBe(90);
  });
  it("flytt bokförd som other_work eller som avbrott ger samma TU", () => {
    // Elefanten: 10 h flytt i OW. Scorpion: 10 h flytt som Trailer transportation (avbrott).
    expect(tuProcent(90 * H, 10 * H, 0, 0)).toBe(tuProcent(90 * H, 0, 0, 10 * H));
  });
  it("ingen tid → null, inte 0 eller 100", () => {
    expect(tuProcent(0, 0, 0, 0)).toBeNull();
  });
  it("bara övrigt arbete → 0 %, inte null", () => {
    expect(tuProcent(0, 5 * H, 0, 0)).toBe(0);
  });
  it("en decimal", () => {
    expect(tuProcent(86.4, 0, 0, 13.6)).toBe(86.4);
  });
  it("oklassat avbrott = Default eller tom kod; valda standardkoder räknas inte", () => {
    expect(arOklassatAvbrott("Default")).toBe(true);
    expect(arOklassatAvbrott(null)).toBe(true);
    expect(arOklassatAvbrott("")).toBe(true);
    expect(arOklassatAvbrott("Other")).toBe(false);
    expect(arOklassatAvbrott("Unproductive terrain work")).toBe(false);
    expect(arOklassatAvbrott("Trailer transportation")).toBe(false);
  });
  it("gränsen och G15 är oförändrade", () => {
    expect(G15_GRANS_SEK).toBe(900);
    expect(arKortPaus(899)).toBe(true);
    expect(arKortPaus(900)).toBe(false);
    expect(g15Sek(10, 20, 30)).toBe(60);
    expect(TU_BRANSCHSNITT).toEqual({ skordare: 85, skotare: 90 });
  });
});
