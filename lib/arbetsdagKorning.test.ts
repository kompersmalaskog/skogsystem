import { describe, it, expect } from "vitest";
import { delaKorning, korningDelarText } from "./arbetsdagKorning";

describe("delaKorning", () => {
  it("två ben: morgon + kväll, ingen flytt", () => {
    expect(delaKorning([{ km: 33 }, { km: 33 }])).toEqual({ morgon: 33, kvall: 33, flytt: 0 });
  });
  it("tre ben: mittenbenet är flytt och ingår inte i morgon/kväll", () => {
    expect(delaKorning([{ km: 33 }, { km: 20 }, { km: 33 }])).toEqual({ morgon: 33, kvall: 33, flytt: 20 });
  });
  it("flera flytt-ben summeras (avrundat per ben först)", () => {
    expect(delaKorning([{ km: 10.4 }, { km: 5.4 }, { km: 5.4 }, { km: 10.4 }])).toEqual({ morgon: 10, kvall: 10, flytt: 10 });
  });
  it("färre än två ben, null eller tomt: inget att dela", () => {
    expect(delaKorning(null)).toBeNull();
    expect(delaKorning([])).toBeNull();
    expect(delaKorning([{ km: 5 }])).toBeNull();
  });
  it("texten innehåller bara det som ingår i Körning-talet", () => {
    expect(korningDelarText({ morgon: 33, kvall: 33, flytt: 20 })).toBe("Morgon 33 · Kväll 33");
  });
});
