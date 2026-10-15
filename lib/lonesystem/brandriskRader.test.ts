// Brandrisk-OB i förarens Min månad och PDF: raderna står bland specens rader när lönearten har kod; annars en post med timmarna.
import { describe, it, expect } from "vitest";
import { brandriskUtanRad } from "./brandriskRader";

const spec = (ob_min: number, natt_min: number, skickas: string[] = []) => ({
  brandrisk: { ob_min, natt_min, dagar: [] },
  lonerader: skickas.map(loneart => ({ loneart, status: "skickas" })),
});

describe("brandriskUtanRad", () => {
  it("utan koder: OB och nattillägg som poster med fulla timmar (618 min = 10,30 tim, 348 min = 5,80 tim)", () => {
    const p = brandriskUtanRad(spec(618, 348));
    expect(p.map(x => [x.loneart, x.label, x.timmar.toFixed(2)])).toEqual([
      ["brandrisk_ob", "Brandrisk – OB", "10.30"], ["brandrisk_nattillagg", "Brandrisk – nattillägg", "5.80"],
    ]);
  });
  it("en rad som skickas står redan bland specens rader och visas inte en gång till", () => {
    expect(brandriskUtanRad(spec(618, 348, ["brandrisk_ob"])).map(x => x.loneart)).toEqual(["brandrisk_nattillagg"]);
    expect(brandriskUtanRad(spec(618, 348, ["brandrisk_ob", "brandrisk_nattillagg"]))).toEqual([]);
  });
  it("OB-posten finns kvar som 0 när månaden saknar beordrade morgnar (som förr); nattillägget visas bara när det finns", () => {
    const p = brandriskUtanRad(spec(0, 0));
    expect(p.map(x => [x.loneart, x.timmar])).toEqual([["brandrisk_ob", 0]]);
  });
  it("äldre svar utan `brandrisk` faller tillbaka på ob.timmar (bara OB)", () => {
    const p = brandriskUtanRad({ ob: { timmar: 2.5, dagar: 1, obesvarade: 0 }, lonerader: [] });
    expect(p.map(x => [x.loneart, x.timmar])).toEqual([["brandrisk_ob", 2.5]]);
    expect(brandriskUtanRad({})).toEqual([{ loneart: "brandrisk_ob", label: "Brandrisk – OB", timmar: 0, skickas: false }]);
  });
});
