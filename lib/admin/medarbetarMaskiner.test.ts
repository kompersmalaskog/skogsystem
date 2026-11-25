import { describe, it, expect } from "vitest";
import { maskinerIDrift, maskinRadText, maskinVal, operatorDetalj } from "./medarbetarMaskiner";

const NAMN = { R64428: "H8E -26", R64101: "H8E -23", A110148: "Elefant AF", A130743: "Elefant 26", A030353: "Wisent" };
const RADER = [
  { maskin_id: "R64428", aktiv_till: null }, { maskin_id: "R64101", aktiv_till: "2026-03-11" },
  { maskin_id: "A110148", aktiv_till: "2026-07-08" }, { maskin_id: "A130743", aktiv_till: null }, { maskin_id: "A030353", aktiv_till: null },
];
const IDAG = "2026-11-25";

describe("maskiner i drift", () => {
  it("utan slutdatum, eller slutdatum idag eller senare, är i drift", () => {
    expect([...maskinerIDrift(RADER, IDAG)].sort()).toEqual(["A030353", "A130743", "R64428"]);
    expect(maskinerIDrift([{ maskin_id: "X", aktiv_till: "2026-11-25" }], IDAG).has("X")).toBe(true);
    expect(maskinerIDrift([{ maskin_id: "X", aktiv_till: "2026-11-24" }], IDAG).has("X")).toBe(false);
  });
});

describe("personens rad", () => {
  const drift = maskinerIDrift(RADER, IDAG);
  it("en såld maskin står inte på raden (Daniel: Elefant AF, Elefant 26 → Elefant 26)", () => {
    expect(maskinRadText(["A110148", "A130743"], NAMN, drift)).toBe("Elefant 26");
  });
  it("alla maskiner i drift → 'Alla maskiner' (Martin)", () => {
    expect(maskinRadText(["A030353", "R64428", "R64101", "A110148", "A130743"], NAMN, drift)).toBe("Alla maskiner");
  });
  it("bara sålda maskiner → tomt; flera i drift sorteras på namn", () => {
    expect(maskinRadText(["R64101"], NAMN, drift)).toBe("");
    expect(maskinRadText(["R64428", "A030353"], NAMN, drift)).toBe("H8E -26, Wisent");
  });
  it("en enda maskin i drift är aldrig 'Alla maskiner'", () => {
    expect(maskinRadText(["R64428"], NAMN, new Set(["R64428"]))).toBe("H8E -26");
  });
});

describe("maskinvalet", () => {
  const drift = maskinerIDrift(RADER, IDAG);
  it("bara namn, bara maskiner i drift, Ingen maskin först", () => {
    expect(maskinVal(NAMN, drift, "").map(o => o.label)).toEqual(["Ingen maskin", "Elefant 26", "H8E -26", "Wisent"]);
  });
  it("den valda står kvar även om den gått ur drift — ett sparat val försvinner aldrig", () => {
    expect(maskinVal(NAMN, drift, "A110148").map(o => o.label)).toContain("Elefant AF (ur drift)");
  });
});

describe("operatören", () => {
  it("maskin och profil, aldrig rått id", () => {
    expect(operatorDetalj("A110148_3", "Elefant AF")).toBe("Elefant AF · profil 3");
    expect(operatorDetalj("SYN_x", "H8E -26")).toBe("H8E -26");
    expect(operatorDetalj("A110148_1", null)).toBe("profil 1");
  });
});
