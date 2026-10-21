// Listan bakom Översiktens rad "Vilobrott": en rad per person med obesvarade vilobrott, flest först.
import { describe, it, expect } from "vitest";
import { vilobrottPerPerson } from "./vilobrottArkVy";

const b = (medarbetare_id: string, namn: string, datum: string, svar: string | null = null) =>
  ({ medarbetare_id, namn, typ: "dygnsvila", datum, vila_h: 8.5, krav_h: 11, svar, vecka: 40, år: 2026, beskrivning: "" }) as any;

describe("vilobrottPerPerson", () => {
  it("en rad per person, antalet i ord (1 obesvarat / N obesvarade)", () => {
    const r = vilobrottPerPerson([b("a", "Anna", "2026-09-01"), b("a", "Anna", "2026-09-02"), b("b", "Bertil", "2026-09-03")]);
    expect(r).toEqual([
      { medarbetare_id: "a", namn: "Anna", antal: 2, text: "2 obesvarade" },
      { medarbetare_id: "b", namn: "Bertil", antal: 1, text: "1 obesvarat" },
    ]);
  });
  it("besvarade brott räknas inte, och en person med bara besvarade finns inte i listan", () => {
    const r = vilobrottPerPerson([b("a", "Anna", "2026-09-01", "Akut"), b("b", "Bertil", "2026-09-03"), b("b", "Bertil", "2026-09-04", "Planerat")]);
    expect(r.map(x => x.medarbetare_id)).toEqual(["b"]);
    expect(r[0].antal).toBe(1);
  });
  it("flest först, sedan namn (svensk sortering: Å/Ä/Ö sist)", () => {
    const r = vilobrottPerPerson([b("o", "Östen", "2026-09-01"), b("a", "Anna", "2026-09-01"), b("z", "Zeb", "2026-09-01"), b("x", "Xenia", "2026-09-01"), b("x", "Xenia", "2026-09-02")]);
    expect(r.map(x => x.namn)).toEqual(["Xenia", "Anna", "Zeb", "Östen"]);
  });
  it("inga obesvarade → tom lista", () => { expect(vilobrottPerPerson([])).toEqual([]); });
});
