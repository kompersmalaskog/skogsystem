import { describe, it, expect } from "vitest";
import { klamZoom, rullEfterZoom, ritSkala, zoomEfterDubbeltryck, arDubbeltryck, MAX_CANVAS_PX, ZOOM_DUBBEL } from "./pdfZoom";

describe("PDF-läsarens zoom", () => {
  it("håller sig mellan 1 och 4", () => {
    expect(klamZoom(0.5)).toBe(1);
    expect(klamZoom(9)).toBe(4);
    expect(klamZoom(2)).toBe(2);
  });
  it("dubbeltryck går in och ut", () => {
    expect(zoomEfterDubbeltryck(1)).toBe(ZOOM_DUBBEL);
    expect(zoomEfterDubbeltryck(2)).toBe(1);
  });
  it("punkten under fingrarna stannar kvar", () => {
    // Fingrarna 100 px in, ingen rullning, utfyllnad 12: innehållspunkten 88 hamnar 100 px in igen vid 2×.
    const rull = rullEfterZoom(0, 100, 1, 2, 12);
    expect((rull + 100 - 12) / 2).toBeCloseTo(88);
    expect(rullEfterZoom(0, 5, 1, 1, 12)).toBe(0); // aldrig negativ
  });
  it("ritar skarpt men aldrig över gränsen för en canvas", () => {
    const s = ritSkala(595, 842, 366, 2.5, 2); // A4, telefon, 2,5×
    expect(s).toBeCloseTo((366 * 2.5 * 2) / 595);
    const stor = ritSkala(595, 842, 900, 4, 2);
    expect(595 * 842 * stor * stor).toBeLessThanOrEqual(MAX_CANVAS_PX + 1);
  });
  it("två tryck nära i tid och plats är ett dubbeltryck", () => {
    expect(arDubbeltryck({ t: 0, x: 10, y: 10 }, { t: 250, x: 20, y: 15 })).toBe(true);
    expect(arDubbeltryck({ t: 0, x: 10, y: 10 }, { t: 400, x: 10, y: 10 })).toBe(false);
    expect(arDubbeltryck({ t: 0, x: 10, y: 10 }, { t: 100, x: 80, y: 10 })).toBe(false);
    expect(arDubbeltryck(null, { t: 0, x: 0, y: 0 })).toBe(false);
  });
});
