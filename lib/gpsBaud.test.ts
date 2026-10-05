import { describe, it, expect, afterEach, vi } from "vitest";
import {
  BAUDRATER, BAUD_STANDARD, BAUD_PROVORDNING, BAUD_NYCKEL, BAUD_HITTAD_NYCKEL,
  tolkaBaudVal, tolkaHittadBaud, baudAttOppnaMed, hamtaBaudVal, sattBaudVal, hamtaHittadBaud, sattHittadBaud, effektivBaud,
} from "./gpsBaud";

afterEach(() => { vi.unstubAllGlobals(); });
const lagring = (start: Record<string, string> = {}) => {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, _m: m };
};

describe("baudraterna", () => {
  it("fyra val, standard 4800 (som före), och Auto provar HÖGST FÖRST", () => {
    expect([...BAUDRATER]).toEqual([4800, 9600, 38400, 115200]);
    expect(BAUD_STANDARD).toBe(4800);
    expect([...BAUD_PROVORDNING]).toEqual([115200, 38400, 9600, 4800]);
  });
});

describe("tolka sparade värden — ogiltigt ger aldrig en konstig baudrate", () => {
  it("giltiga val", () => {
    for (const b of BAUDRATER) expect(tolkaBaudVal(String(b))).toBe(b);
    expect(tolkaBaudVal("auto")).toBe("auto");
  });
  it("saknas/skräp → auto (nya portval provar automatiskt)", () => {
    for (const r of [null, undefined, "", "12345", "abc", "0", "-4800", "4800.5"]) expect(tolkaBaudVal(r as any)).toBe("auto");
  });
  it("hittad baudrate: bara de fyra giltiga, annars null", () => {
    expect(tolkaHittadBaud("38400")).toBe(38400);
    for (const r of [null, undefined, "", "999", "auto", "x"]) expect(tolkaHittadBaud(r as any)).toBeNull();
  });
});

describe("baudAttOppnaMed", () => {
  it("fast val vinner över allt", () => {
    expect(baudAttOppnaMed(38400, 115200)).toBe(38400);
    expect(baudAttOppnaMed(4800, null)).toBe(4800);
  });
  it("Auto → den hittade; utan hittad → 4800 (dagens beteende för en enhet som inte valt om port)", () => {
    expect(baudAttOppnaMed("auto", 115200)).toBe(115200);
    expect(baudAttOppnaMed("auto", null)).toBe(4800);
  });
});

describe("lagring per enhet (localStorage)", () => {
  it("sätt → hämta, och effektivBaud följer valet", () => {
    vi.stubGlobal("localStorage", lagring());
    expect(hamtaBaudVal()).toBe("auto");
    expect(effektivBaud()).toBe(4800);
    sattBaudVal(38400);
    expect(localStorage.getItem(BAUD_NYCKEL)).toBe("38400");
    expect(effektivBaud()).toBe(38400);
    sattBaudVal("auto"); sattHittadBaud(115200);
    expect(localStorage.getItem(BAUD_HITTAD_NYCKEL)).toBe("115200");
    expect(hamtaHittadBaud()).toBe(115200);
    expect(effektivBaud()).toBe(115200);
    sattHittadBaud(null);
    expect(hamtaHittadBaud()).toBeNull();
    expect(effektivBaud()).toBe(4800);
  });
  it("blockerad localStorage → standardvärden, kastar aldrig", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blockerad"); }, setItem: () => { throw new Error("blockerad"); }, removeItem: () => { throw new Error("blockerad"); } });
    expect(hamtaBaudVal()).toBe("auto");
    expect(hamtaHittadBaud()).toBeNull();
    expect(effektivBaud()).toBe(4800);
    expect(() => sattBaudVal(9600)).not.toThrow();
    expect(() => sattHittadBaud(9600)).not.toThrow();
  });
  it("ingen localStorage alls (server) → standardvärden", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(effektivBaud()).toBe(4800);
  });
});
