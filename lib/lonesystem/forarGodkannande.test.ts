// Vem som får skickas och vad Admin ser på förarkortet (Väntar på föraren / Godkänd av föraren / Skickad).
import { describe, it, expect } from "vitest";
import { arGodkandStatus, godkannandeAv, arSandbar, vantandeForare, forarStatus, FORAR_STATUS_TEXT } from "./forarGodkannande";

const m = (o: any = {}) => ({ medarbetare_id: "a", namn: "Anna", status: "utkast", godkannande: "godkand", foretagsledare: false, ...o });

describe("godkännande ur loneunderlag.status", () => {
  it("godkand_av_forare och äldre inskickat är godkänt; NULL, tom och okänt är det inte", () => {
    expect(arGodkandStatus("godkand_av_forare")).toBe(true);
    expect(arGodkandStatus("inskickat")).toBe(true);
    for (const s of [null, undefined, "", "utkast", "nollstalld", "GODKAND_AV_FORARE"]) expect(arGodkandStatus(s), String(s)).toBe(false);
    expect(godkannandeAv("godkand_av_forare")).toBe("godkand");
    expect(godkannandeAv(null)).toBe("vantar");
  });
});

describe("arSandbar", () => {
  it("godkänd och ej skickad → ja", () => expect(arSandbar(m())).toBe(true));
  it("väntar → nej, om inte admin uttryckligen valt det", () => {
    expect(arSandbar(m({ godkannande: "vantar" }))).toBe(false);
    expect(arSandbar(m({ godkannande: "vantar" }), true)).toBe(true);
  });
  it("saknat godkännande-fält räknas som väntar", () => expect(arSandbar(m({ godkannande: undefined }))).toBe(false));
  it("redan skickad skickas aldrig om, inte ens med uttryckligt val", () => {
    expect(arSandbar(m({ status: "skickat" }))).toBe(false);
    expect(arSandbar(m({ status: "skickat", godkannande: "vantar" }), true)).toBe(false);
  });
  it("företagsledare skickas aldrig, inte ens med uttryckligt val", () => {
    expect(arSandbar(m({ foretagsledare: true }))).toBe(false);
    expect(arSandbar(m({ foretagsledare: true, godkannande: "vantar" }), true)).toBe(false);
  });
});

describe("vantandeForare", () => {
  it("bara de som väntar — inte godkända, skickade eller företagsledare", () => {
    expect(vantandeForare([
      m({ medarbetare_id: "a", namn: "Anna", godkannande: "vantar" }),
      m({ medarbetare_id: "b", namn: "Bo" }),
      m({ medarbetare_id: "c", namn: "Cia", godkannande: "vantar", status: "skickat" }),
      m({ medarbetare_id: "d", namn: "Dan", godkannande: "vantar", foretagsledare: true }),
    ])).toEqual([{ medarbetare_id: "a", namn: "Anna" }]);
  });
});

describe("forarStatus (förarkortet)", () => {
  it("Väntar på föraren / Godkänd av föraren / Skickad — och ingen status alls för en företagsledare", () => {
    expect(forarStatus(m({ godkannande: "vantar" }))).toBe("vantar");
    expect(forarStatus(m())).toBe("godkand");
    expect(forarStatus(m({ status: "skickat", godkannande: "vantar" }))).toBe("skickad");
    expect(forarStatus(m({ foretagsledare: true }))).toBeNull();
    expect(FORAR_STATUS_TEXT).toEqual({ vantar: "Väntar på föraren", godkand: "Godkänd av föraren", skickad: "Skickad" });
  });
});
