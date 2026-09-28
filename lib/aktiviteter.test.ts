import { describe, it, expect } from "vitest";
import { faktureringsEtikett, AKTIVITETER, EXTRA_ARBETE_TYPER } from "./aktiviteter";

// Faktureringen i TEXT på periodraden; orange bara för det OVÄNTADE.
describe("faktureringsEtikett", () => {
  it("planering utan kryss är oväntat — orange 'faktureras inte'", () => {
    expect(faktureringsEtikett("planering", false, true)).toEqual({ text: "faktureras inte", varna: true });
    expect(faktureringsEtikett("manuellt", false, true)).toEqual({ text: "faktureras inte", varna: true });
  });
  it("service utan kryss är normalt — grått", () => {
    expect(faktureringsEtikett("service", false, true)).toEqual({ text: "faktureras inte", varna: false });
  });
  it("faktureras med objekt är grått", () => {
    expect(faktureringsEtikett("planering", true, true)).toEqual({ text: "faktureras", varna: false });
  });
  it("restid har inget objekt och ska inte debiteras — 'inget objekt', grått", () => {
    expect(faktureringsEtikett("restid", false, false)).toEqual({ text: "inget objekt", varna: false });
    expect(faktureringsEtikett("restid", true, false)).toEqual({ text: "inget objekt", varna: false });
  });
  it("faktureras utan objekt går inte att fakturera — orange", () => {
    expect(faktureringsEtikett("planering", true, false)).toEqual({ text: "faktureras · inget objekt", varna: true });
  });
  it("alla valbara typer finns i listan", () => {
    for (const t of EXTRA_ARBETE_TYPER) expect(AKTIVITETER.some(a => a.typ === t)).toBe(true);
  });
});
