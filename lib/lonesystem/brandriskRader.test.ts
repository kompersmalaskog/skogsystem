// Brandrisk-OB i förarens Min månad och PDF: raden står bland specens rader när lönearten har kod; annars en post med timmarna. EN rad (inget nattillägg).
import { describe, it, expect } from "vitest";
import { brandriskUtanRad } from "./brandriskRader";

const spec = (ob_min: number, skickas: string[] = []) => ({
  brandrisk: { ob_min, dagar: [] },
  lonerader: skickas.map(loneart => ({ loneart, status: "skickas" })),
});

describe("brandriskUtanRad", () => {
  it("utan kod: OB som post med fulla timmar (618 min = 10,30 tim), och ingen annan post", () => {
    const p = brandriskUtanRad(spec(618));
    expect(p.map(x => [x.loneart, x.label, x.timmar.toFixed(2)])).toEqual([["brandrisk_ob", "Brandrisk – OB", "10.30"]]);
  });
  it("en rad som skickas står redan bland specens rader och visas inte en gång till", () => {
    expect(brandriskUtanRad(spec(618, ["brandrisk_ob"]))).toEqual([]);
  });
  it("OB-posten finns kvar som 0 när månaden saknar beordrade morgnar (som förr)", () => {
    expect(brandriskUtanRad(spec(0)).map(x => [x.loneart, x.timmar])).toEqual([["brandrisk_ob", 0]]);
  });
  it("äldre svar utan `brandrisk` faller tillbaka på ob.timmar", () => {
    expect(brandriskUtanRad({ ob: { timmar: 2.5, dagar: 1, obesvarade: 0 }, lonerader: [] }).map(x => [x.loneart, x.timmar])).toEqual([["brandrisk_ob", 2.5]]);
    expect(brandriskUtanRad({})).toEqual([{ loneart: "brandrisk_ob", label: "Brandrisk – OB", timmar: 0, skickas: false }]);
  });
});
