import { describe, it, expect } from "vitest";
import { byggAllaObjekt, byggOversikt, manadFor, manader, smaText, HOGT_PCT, SMA_M3 } from "./oversikt";
import type { ObjektKort } from "./types";

const NU = new Date("2026-10-21T12:00:00Z");
let n = 0;
function k(namn: string, fil: string, bedomd: number, fel: number | null, extra: Partial<ObjektKort> = {}): ObjektKort {
  return {
    objectKey: `K${n++}`, objektNamn: namn, status: "completed", lastFileAt: fil, dagarSedanFil: 30,
    lage: 2, gradePct: 80, volymM3: bedomd, mening: null, headline: null, trend: null,
    utanforM3: fel, bedomdM3: bedomd, ...extra,
  };
}

describe("manadFor", () => {
  it("är svensk månad, inte UTC: 31 okt 23:30 UTC är 1 november i Sverige", () => {
    expect(manadFor("2026-10-31T23:30:00Z")).toBe("2026-11");
    expect(manadFor("2026-07-24T08:00:00+02:00")).toBe("2026-07");
    expect(manadFor(null)).toBeNull();
  });
});

describe("manader", () => {
  it("månaden är sista filens, inte avslutets; summan är summan av rundade rader", () => {
    const kort = [
      k("Brokamåla", "2026-07-24T10:00:00Z", 1146.4, 128.4), // fil juli (avslutad i oktober)
      k("Mölleryd", "2026-10-21T08:00:00Z", 466.6, 70.6),
      k("Vällust", "2026-10-05T08:00:00Z", 222.4, 39.6),
    ];
    const m = manader(kort);
    expect(m.map((x) => x.manad)).toEqual(["2026-10", "2026-07"]);
    // rundat per rad först: 71 + 40 = 111 (inte 110,2) av 467 + 222 = 689 → 16 %
    expect(m[0]).toEqual({ manad: "2026-10", utanforM3: 111, volymM3: 689, pct: 16 });
  });
  it("pågående och tysta objekt räknas inte in i månaden; objekt utan fel räknas inte", () => {
    const m = manader([
      k("Pågår", "2026-10-20T08:00:00Z", 100, 50, { status: "active", dagarSedanFil: 1 }),
      k("Tyst", "2026-10-01T08:00:00Z", 100, 50, { status: "active", dagarSedanFil: 20 }),
      k("Utan grad", "2026-10-02T08:00:00Z", 100, null),
      k("Klar", "2026-10-03T08:00:00Z", 100, 10),
    ]);
    expect(m).toEqual([{ manad: "2026-10", utanforM3: 10, volymM3: 100, pct: 10 }]);
  });
});

describe("byggOversikt", () => {
  const sep = k("S", "2026-09-10T08:00:00Z", 100, 16);
  const aug = k("A", "2026-08-10T08:00:00Z", 100, 17);

  it("talet är senaste månaden; staplarna börjar vid första månaden med data", () => {
    const o = byggOversikt([k("O", "2026-10-10T08:00:00Z", 100, 13), sep, aug], NU);
    expect(o.senaste).toMatchObject({ manad: "2026-10", utanforM3: 13, pct: 13 });
    expect(o.staplar).toEqual([{ manad: "2026-08", pct: 17 }, { manad: "2026-09", pct: 16 }, { manad: "2026-10", pct: 13 }]);
  });
  it("tom månad mitt i får en tom stapel (null), inte 0", () => {
    const o = byggOversikt([k("O", "2026-10-10T08:00:00Z", 100, 13), aug], NU);
    expect(o.staplar.map((s) => s.pct)).toEqual([17, null, 13]);
  });
  it("höjdpunkt BÄTTRE när senaste är minst 2 enheter under de två föregående", () => {
    const o = byggOversikt([k("O", "2026-10-10T08:00:00Z", 100, 13), sep, aug], NU);
    expect(o.hojdpunkt).toEqual({ riktning: "battre", mening: "Ni kapar rätt oftare i oktober än i augusti och september.", under: "13 % utanför mot 16–17 %" });
  });
  it("höjdpunkt SÄMRE åt andra hållet", () => {
    const o = byggOversikt([k("O", "2026-10-10T08:00:00Z", 100, 20), sep, aug], NU);
    expect(o.hojdpunkt?.riktning).toBe("samre");
    expect(o.hojdpunkt?.mening).toBe("Mer utanför beställt i oktober än i augusti och september.");
  });
  it("ingen höjdpunkt när skillnaden är under 2 enheter, eller utan tidigare månad", () => {
    expect(byggOversikt([k("O", "2026-10-10T08:00:00Z", 100, 15), sep, aug], NU).hojdpunkt).toBeNull();
    expect(byggOversikt([k("O", "2026-10-10T08:00:00Z", 100, 15)], NU).hojdpunkt).toBeNull();
  });
  it("utan data: inget tal, inga staplar, ingen höjdpunkt", () => {
    expect(byggOversikt([], NU)).toEqual({ senaste: null, staplar: [], hojdpunkt: null });
  });
});

describe("byggAllaObjekt", () => {
  const kort = [
    k("Skälviken", "2026-10-21T08:00:00Z", 16, 3, { status: "active", dagarSedanFil: 0 }),
    k("Tjuvön", "2026-07-29T08:00:00Z", 393, 62, { status: "active", dagarSedanFil: 84 }),
    k("Bågskyttebanan", "2026-10-13T08:00:00Z", 849, 102),
    k("Mölleryd", "2026-10-21T07:00:00Z", 467, 71),
    k("Hallaslätt", "2026-09-14T08:00:00Z", 47, 10),
    k("Älmehult gallring", "2026-10-05T08:00:00Z", 2, 1),
    k("Utan mål", "2026-10-06T08:00:00Z", 50, null),
  ];
  const l = byggAllaObjekt(kort);

  it("pågår och tysta ligger utanför månaderna", () => {
    expect(l.pagar.map((r) => r.namn)).toEqual(["Skälviken"]);
    expect(l.tysta.map((r) => [r.namn, r.dagarSedanFil])).toEqual([["Tjuvön", 84]]);
    expect(l.manader.flatMap((m) => [...m.rader, ...m.sma]).map((r) => r.namn)).not.toContain("Tjuvön");
  });
  it("nyast först inom månaden; små och objekt utan grad samlas för sig", () => {
    expect(l.manader.map((m) => m.manad)).toEqual(["2026-10", "2026-09"]);
    expect(l.manader[0].rader.map((r) => r.namn)).toEqual(["Mölleryd", "Bågskyttebanan"]);
    expect(l.manader[0].sma.map((r) => r.namn)).toEqual(["Utan mål", "Älmehult gallring"]);
  });
  it(`"högt" från ${HOGT_PCT} % men bara på objekt som bedöms (≥ ${SMA_M3} m³)`, () => {
    const hall = l.manader[1].rader[0];
    expect(hall).toMatchObject({ namn: "Hallaslätt", pct: 21, hogt: true });
    expect(l.manader[0].rader.find((r) => r.namn === "Mölleryd")).toMatchObject({ pct: 15, hogt: false });
    expect(l.manader[0].sma.find((r) => r.namn === "Älmehult gallring")).toMatchObject({ pct: 50, hogt: false });
  });
  it("sök filtrerar raderna men månadens tal gäller hela månaden", () => {
    const s = byggAllaObjekt(kort, "mölle");
    expect(s.manader).toHaveLength(1);
    expect(s.manader[0].rader.map((r) => r.namn)).toEqual(["Mölleryd"]);
    expect(s.manader[0].pct).toBe(l.manader[0].pct);
    expect(s.pagar).toEqual([]);
  });
  it("smaText", () => {
    expect(smaText(1)).toBe("1 liten trakt");
    expect(smaText(6)).toBe("6 små trakter");
  });
});

describe("maskinens egna kap är underlaget", () => {
  it("procenten räknas på maskinens volym, raden visar traktens volym", () => {
    const l = byggAllaObjekt([k("Mölleryd", "2026-10-21T08:00:00Z", 412, 68, { volymM3: 467 })]);
    const r = l.manader[0].rader[0];
    expect(r.volymM3).toBe(467);   // traktens volym under namnet
    expect(r.bedomdM3).toBe(412);  // maskinens egna kap
    expect(r.pct).toBe(17);        // 68 / 412, inte 68 / 467 (15)
    expect(l.manader[0].volymM3).toBe(412);
  });
  it("liten trakt avgörs av maskinens volym, inte traktens", () => {
    const l = byggAllaObjekt([k("Gallring", "2026-10-05T08:00:00Z", 20, 4, { volymM3: 300 })]);
    expect(l.manader[0].sma).toHaveLength(1);
  });
});
