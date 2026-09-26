import { describe, it, expect } from "vitest";
import { klassificeraPeriod, passKrockarMedPerioder, passKrockText } from "./dagsegment";

// Perioddagen (Joacim): inget pass → varje period är extra_tid, och passet får
// aldrig i efterhand läggas över dem (dubbelräkning arbetad_min + extra_tid).

describe("klassificeraPeriod utan pass", () => {
  it("klassar en period på en dag utan klockslag som ingen_pass (→ extra_tid)", () => {
    expect(klassificeraPeriod({ start: "07:00", slut: "12:00" }, { start_tid: null, slut_tid: null })).toBe("ingen_pass");
  });
});

describe("passKrockarMedPerioder", () => {
  const perioder = [
    { start_tid: "07:00:00", slut_tid: "12:00:00" },
    { start_tid: "13:00:00", slut_tid: "16:00:00" },
  ];

  it("tomt klockslag = inget pass = ingen krock", () => {
    expect(passKrockarMedPerioder({ start: "", slut: "" }, perioder)).toBeNull();
    expect(passKrockarMedPerioder({ start: null, slut: "16:00" }, perioder)).toBeNull();
  });

  it("pass som täcker en period krockar — första i listan rapporteras", () => {
    expect(passKrockarMedPerioder({ start: "06:00", slut: "17:00" }, perioder)).toEqual({ start_tid: "07:00:00", slut_tid: "12:00:00" });
  });

  it("pass som delvis överlappar krockar", () => {
    expect(passKrockarMedPerioder({ start: "11:00", slut: "12:30" }, perioder)).toEqual({ start_tid: "07:00:00", slut_tid: "12:00:00" });
    expect(passKrockarMedPerioder({ start: "15:59", slut: "18:00" }, perioder)).toEqual({ start_tid: "13:00:00", slut_tid: "16:00:00" });
  });

  it("pass i luckan mellan perioder krockar inte (kant mot kant är tillåtet)", () => {
    expect(passKrockarMedPerioder({ start: "12:00", slut: "13:00" }, perioder)).toBeNull();
  });

  it("pass helt före eller efter krockar inte", () => {
    expect(passKrockarMedPerioder({ start: "05:00", slut: "07:00" }, perioder)).toBeNull();
    expect(passKrockarMedPerioder({ start: "16:00", slut: "19:00" }, perioder)).toBeNull();
  });

  it("öppna perioder (sluttid saknas) räknas inte", () => {
    expect(passKrockarMedPerioder({ start: "06:00", slut: "17:00" }, [{ start_tid: "07:00:00", slut_tid: null }])).toBeNull();
  });

  it("negativt eller nollpass krockar inte (fångas av passOrimlighet, inte här)", () => {
    expect(passKrockarMedPerioder({ start: "12:00", slut: "12:00" }, perioder)).toBeNull();
  });

  it("feltexten nämner klockslagen i HH:MM", () => {
    expect(passKrockText({ start_tid: "07:00:00", slut_tid: "12:00:00" })).toContain("07:00–12:00");
  });
});
