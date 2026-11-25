import { describe, it, expect } from "vitest";
import { atkLage, byggAtkVy, valDetalj } from "./atkVy";

const P = [
  { id: "a", namn: "Anna" }, { id: "b", namn: "Bo" }, { id: "c", namn: "Cecilia" },
  { id: "m", namn: "H8E -26", roll: "maskin", aktiv: false },
  { id: "f", namn: "Martin", foretagsledare: true },
  { id: "s", namn: "Slutat", aktiv: false },
];
const maj = new Date(2026, 4, 5);

describe("atkLage", () => {
  it("1–15 maj är öppet", () => {
    expect(atkLage(2026, new Date(2026, 3, 30))).toBe("fore");
    expect(atkLage(2026, new Date(2026, 4, 1))).toBe("oppen");
    expect(atkLage(2026, new Date(2026, 4, 15, 22))).toBe("oppen");
    expect(atkLage(2026, new Date(2026, 4, 16))).toBe("stangd");
  });
});

describe("byggAtkVy", () => {
  it("maskinkonto, företagsledare och den som slutat utan val står inte med", () => {
    const vy = byggAtkVy(2026, maj, P, {});
    expect(vy.inteValt.map(p => p.id)).toEqual(["a", "b", "c"]);
    expect(vy.svar).toBe("3 har inte valt");
    expect(vy.under).toEqual(["Valet stänger 15 maj"]);
    expect(vy.kanPaminna).toBe(true);
    expect(vy.kraverDig).toBe(true);
  });
  it("pengar som väntar på godkännande ligger under 'Väntar på dig'; ledig tid är valt direkt", () => {
    const vy = byggAtkVy(2026, maj, P, {
      a: { id: "1", medarbetare_id: "a", val: "kontant", timmar: null, belopp: 12000, status: null },
      b: { id: "2", medarbetare_id: "b", val: "ledig", timmar: 65.2, belopp: null, status: null },
    });
    expect(vy.vantar.map(v => v.person.id)).toEqual(["a"]);
    expect(vy.valt.map(v => v.person.id)).toEqual(["b"]);
    expect(vy.svar).toBe("1 har inte valt");
    expect(vy.under).toContain("1 väntar på dig");
  });
  it("alla har valt → ingen påminnelse; stängt → ingen påminnelse", () => {
    const alla = Object.fromEntries(["a", "b", "c"].map(id => [id, { medarbetare_id: id, val: "ledig", timmar: 1, belopp: null, status: null }]));
    expect(byggAtkVy(2026, maj, P, alla).svar).toBe("Alla har valt");
    expect(byggAtkVy(2026, maj, P, alla).kanPaminna).toBe(false);
    const stangd = byggAtkVy(2026, new Date(2026, 10, 25), P, {});
    expect(stangd.svar).toBe("Ingen gjorde ATK-val");
    expect(stangd.kanPaminna).toBe(false);
    expect(stangd.kraverDig).toBe(false);
  });
  it("den som slutat men hann välja står kvar", () => {
    const vy = byggAtkVy(2026, maj, P, { s: { medarbetare_id: "s", val: "ledig", timmar: 8, belopp: null, status: null } });
    expect(vy.valt.map(v => v.person.id)).toEqual(["s"]);
  });
  it("valDetalj: decimalkomma och kronor", () => {
    expect(valDetalj({ medarbetare_id: "a", val: "ledig", timmar: 65.2, belopp: null, status: null })).toBe("Ledig tid · 65,2 tim");
    expect(valDetalj({ medarbetare_id: "a", val: "kontant", timmar: null, belopp: 12000, status: null })).toMatch(/^Pengar · 12\s000 kr$/);
  });
});
