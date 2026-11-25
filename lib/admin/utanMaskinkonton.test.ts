import { describe, it, expect } from "vitest";
import { utanMaskinkonton } from "./utanMaskinkonton";
describe("utanMaskinkonton", () => {
  it("tar bort maskinkontona men behåller personer, också utan roll", () => {
    const r = utanMaskinkonton([{ id: "1", roll: "forare" }, { id: "2", roll: "maskin" }, { id: "3", roll: null }, { id: "4" }]);
    expect(r.map(x => x.id)).toEqual(["1", "3", "4"]);
  });
  it("tomt svar ger tom lista", () => { expect(utanMaskinkonton(null)).toEqual([]); });
});
