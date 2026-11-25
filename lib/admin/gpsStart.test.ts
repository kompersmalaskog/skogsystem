import { describe, expect, it } from "vitest";
import { gpsStartForPass, gpsStartText, gpsStartAvvikelse, GPS_SENARE_GRANS_MIN, GPS_SEN_MAX_MIN } from "./gpsStart";

describe("gpsStartForPass", () => {
  it("Max 13 nov: Opti 07:30, GPS 08:05 (svensk vintertid) → 35 min senare, markerad", () => {
    const g = gpsStartForPass("2026-11-13", "07:30:00", ["2026-11-13T07:05:33Z"])!;
    expect(g).toEqual({ tid: "08:05", senareMin: 35, markerad: true, sent: false });
    expect(gpsStartText(g)).toBe("Appen i hytten startade 08:05 · 35 min efter starttiden");
    expect(gpsStartAvvikelse(g)).toBe("appen startade 35 min sent");
  });

  it("Martin 27 okt (sommartid): 07:07 mot GPS 07:08 → inte markerad", () => {
    const g = gpsStartForPass("2026-10-27", "07:07:00", ["2026-10-27T06:08:28Z"])!;
    expect(g).toEqual({ tid: "07:08", senareMin: 1, markerad: false, sent: false });
    expect(gpsStartText(g)).toBe("Appen i hytten startade 07:08");
    expect(gpsStartAvvikelse(g)).toBeNull();
  });

  it("precis på gränsen markeras inte, en minut över gör det", () => {
    expect(gpsStartForPass("2026-11-13", "07:00", ["2026-11-13T06:10:00Z"])!.markerad).toBe(false);
    expect(gpsStartForPass("2026-11-13", "07:00", ["2026-11-13T06:11:00Z"])!.markerad).toBe(true);
    expect(GPS_SENARE_GRANS_MIN).toBe(10);
  });

  it("GPS före starttiden (Giants klocka) ger negativt och ingen markering", () => {
    const g = gpsStartForPass("2026-11-17", "05:59", ["2026-11-17T04:54:00Z"])!;
    expect(g.senareMin).toBe(-5);
    expect(g.markerad).toBe(false);
  });

  it("en tidigare förares start samma dag hoppas över", () => {
    const g = gpsStartForPass("2026-11-18", "16:14", ["2026-11-18T06:34:00Z", "2026-11-18T15:15:00Z"])!;
    expect(g.tid).toBe("16:15");
  });

  it("ingen starttid, inga starter eller ingen start efter passet → null", () => {
    expect(gpsStartForPass("2026-11-13", null, ["2026-11-13T07:05:33Z"])).toBeNull();
    expect(gpsStartForPass("2026-11-13", "07:30", [])).toBeNull();
    expect(gpsStartForPass("2026-11-13", "16:00", ["2026-11-13T06:00:00Z"])).toBeNull();
  });

  it("över en timme sent är appen startad sent, ingen avvikelse (Stefan 6 okt: första punkten 18:32)", () => {
    const g = gpsStartForPass("2026-10-06", "06:12", ["2026-10-06T16:32:00Z"])!;
    expect(g).toEqual({ tid: "18:32", senareMin: 740, markerad: false, sent: true });
    expect(gpsStartAvvikelse(g)).toBeNull();
    expect(gpsStartText(g)).toBe("Appen i hytten startade först 18:32 – säger inget om starttiden");
    expect(GPS_SEN_MAX_MIN).toBe(60);
    // Precis 60 är fortfarande en avvikelse, 61 inte.
    expect(gpsStartForPass("2026-11-13", "07:00", ["2026-11-13T07:00:00Z"])!.markerad).toBe(true);
    expect(gpsStartForPass("2026-11-13", "07:00", ["2026-11-13T07:01:00Z"])!.sent).toBe(true);
  });
});
