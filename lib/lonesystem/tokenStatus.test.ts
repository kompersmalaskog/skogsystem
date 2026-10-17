import { describe, it, expect } from "vitest";
import { relativTid, relativDatum, tokenGarUtSnart, TOKEN_VARNING_DAGAR } from "./tokenStatus";

const NU = new Date(2026, 9, 17, 12, 0); // 17 okt 2026 12:00 (lokal tid)

describe("senast synkad: idag, igår eller datum — aldrig en tidsstämpel med sekunder", () => {
  it("idag och igår", () => {
    expect(relativTid("2026-10-17T08:05:00", NU)).toBe("idag 08:05");
    expect(relativTid("2026-10-16T23:10:00", NU)).toBe("igår 23:10");
  });
  it("äldre: dag och månad", () => {
    expect(relativTid("2026-10-12T07:30:00", NU)).toBe("12 okt 07:30");
    expect(relativTid("2025-12-31T07:30:00", NU)).toBe("31 dec 07:30");
  });
  it("sekunder visas aldrig", () => {
    expect(relativTid("2026-10-16T23:10:59", NU)).not.toMatch(/:\d\d:\d\d/);
  });
  it("ett datum som inte går att läsa står som det är, inte som 'NaN'", () => {
    expect(relativTid("skräp", NU)).toBe("skräp");
    expect(relativDatum("skräp")).toBe("skräp");
  });
  it("relativDatum: dag och månad", () => {
    expect(relativDatum("2026-10-24T10:00:00")).toBe("24 okt");
  });
});

describe("token-datumet visas bara när det går ut snart", () => {
  it(`långt kvar (mer än ${TOKEN_VARNING_DAGAR} dagar): inget att göra, ingen rad`, () => {
    expect(tokenGarUtSnart("2026-12-01T01:00:00", NU)).toBeNull();
    expect(tokenGarUtSnart("2026-11-02T12:00:00", NU)).toBeNull(); // 16 dagar kvar
  });
  it("snart: en rad (Förnya)", () => {
    expect(tokenGarUtSnart("2026-10-24T12:00:00", NU)).toEqual({ utgangen: false });
    expect(tokenGarUtSnart("2026-10-31T12:00:00", NU)).toEqual({ utgangen: false }); // exakt 14 dagar
  });
  it("redan utgången: en rad, märkt utgången", () => {
    expect(tokenGarUtSnart("2026-10-10T12:00:00", NU)).toEqual({ utgangen: true });
  });
  it("saknas eller går inte att läsa: ingen rad", () => {
    expect(tokenGarUtSnart(null, NU)).toBeNull();
    expect(tokenGarUtSnart("skräp", NU)).toBeNull();
  });
});
