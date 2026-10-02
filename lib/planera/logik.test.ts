import { describe, it, expect } from "vitest";
import {
  timText, relativDag, datumKort, plusDagar, lokalISO, veckoSpann, veckoDagar, senasteTrakter,
  forslagFranIgar, foreslagenStart, periodMinuter, debFor, type PeriodRad,
} from "./logik";

const p = (o: Partial<PeriodRad> & { datum: string; start_tid: string; slut_tid: string }): PeriodRad => ({
  id: Math.random().toString(36).slice(2), minuter: null, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, ...o,
});
// 2026-10-02 är en fredag
const IDAG = "2026-10-02";

describe("datum och tid", () => {
  it("plusDagar passerar månadsgräns utan UTC-fel", () => {
    expect(plusDagar("2026-10-01", -1)).toBe("2026-09-30");
    expect(plusDagar("2026-12-31", 1)).toBe("2027-01-01");
    expect(lokalISO(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
  it("relativDag och datumKort", () => {
    expect(relativDag(IDAG, IDAG)).toBe("idag");
    expect(relativDag("2026-10-01", IDAG)).toBe("i går");
    expect(relativDag("2026-09-30", IDAG)).toBe("i förrgår");
    expect(relativDag("2026-09-29", IDAG)).toBe("tis 29 sep");
    expect(datumKort("2026-10-02")).toBe("fre 2 okt");
  });
  it("timText i människoord", () => {
    expect(timText(180)).toBe("3 tim");
    expect(timText(90)).toBe("1 tim 30 min");
    expect(timText(45)).toBe("45 min");
    expect(timText(0)).toBe("0 min");
  });
  it("periodMinuter", () => {
    expect(periodMinuter("07:00", "10:00")).toBe(180);
    expect(periodMinuter("", "10:00")).toBe(0);
  });
});

describe("veckan", () => {
  it("måndag–söndag runt en fredag", () => {
    expect(veckoSpann(IDAG)).toEqual({ start: "2026-09-28", slut: "2026-10-04" });
    expect(veckoSpann("2026-10-04")).toEqual({ start: "2026-09-28", slut: "2026-10-04" }); // söndag
    expect(veckoSpann("2026-09-28")).toEqual({ start: "2026-09-28", slut: "2026-10-04" }); // måndag
  });
  it("grupperar per dag, senaste överst, summerar, och tar bara Planera-typer med slut", () => {
    const ps = [
      p({ datum: "2026-09-29", start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180 }),
      p({ datum: "2026-10-01", start_tid: "13:00:00", slut_tid: "14:30:00", minuter: 90, aktivitet_typ: "manuellt" }),
      p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120 }),
      p({ datum: "2026-09-27", start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180 }), // förra veckan
      p({ datum: "2026-10-02", start_tid: "08:00:00", slut_tid: "09:00:00", minuter: 60, aktivitet_typ: "reparation" }), // annan typ
      p({ datum: "2026-10-02", start_tid: "09:00:00", slut_tid: null as any, minuter: 0 }), // öppen
    ];
    const v = veckoDagar(ps, IDAG);
    expect(v.dagar.map(d => d.datum)).toEqual(["2026-10-01", "2026-09-29"]);
    expect(v.dagar[0].perioder.map(x => x.start_tid)).toEqual(["07:00:00", "13:00:00"]);
    expect(v.dagar[0].summaMin).toBe(210);
    expect(v.summaMin).toBe(390);
  });
});

describe("senaste trakter", () => {
  it("senast använd överst, minuter = den senaste dagen, max 5", () => {
    const ps = [
      p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "10:00:00", minuter: 180, objekt_id: "A" }),
      p({ datum: "2026-10-01", start_tid: "11:00:00", slut_tid: "12:00:00", minuter: 60, objekt_id: "A" }),
      p({ datum: "2026-09-29", start_tid: "07:00:00", slut_tid: "09:00:00", minuter: 120, objekt_id: "B" }),
      p({ datum: "2026-09-25", start_tid: "07:00:00", slut_tid: "08:00:00", minuter: 60, objekt_id: "A" }), // äldre dag på A
      p({ datum: "2026-10-02", start_tid: "07:00:00", slut_tid: "08:00:00", minuter: 60, objekt_id: null }), // utan trakt
    ];
    const s = senasteTrakter(ps);
    expect(s.map(x => x.objektId)).toEqual(["A", "B"]);
    expect(s[0]).toEqual({ objektId: "A", datum: "2026-10-01", minuter: 240 });
    expect(senasteTrakter(ps, 1)).toHaveLength(1);
  });
});

describe("förslag: samma som i går", () => {
  const igar = [
    p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "10:00:00", objekt_id: "T1" }),
    p({ datum: "2026-10-01", start_tid: "10:00:00", slut_tid: "11:00:00", objekt_id: "T2", aktivitet_typ: "manuellt" }), // inte planering
    p({ datum: "2026-10-01", start_tid: "12:00:00", slut_tid: "13:00:00", objekt_id: null }), // utan trakt
  ];
  it("kopierar gårdagens planering med trakt, kalla 'igar', datum igår", () => {
    const f = forslagFranIgar(igar, IDAG)!;
    expect(f.kalla).toBe("igar");
    expect(f.datum).toBe("2026-10-01");
    expect(f.perioder).toEqual([{ start: "07:00", slut: "10:00", typ: "planering", objektId: "T1", deb: true }]);
  });
  it("inget förslag utan planering i går eller när idag redan har planering", () => {
    expect(forslagFranIgar([], IDAG)).toBeNull();
    expect(forslagFranIgar([...igar, p({ datum: IDAG, start_tid: "07:00:00", slut_tid: "08:00:00" })], IDAG)).toBeNull();
  });
});

describe("förifylld starttid", () => {
  it("07:00 utan perioder, annars slutet på dagens senaste", () => {
    expect(foreslagenStart([], IDAG)).toBe("07:00");
    expect(foreslagenStart([p({ datum: IDAG, start_tid: "07:00:00", slut_tid: "09:30:00" }), p({ datum: IDAG, start_tid: "10:00:00", slut_tid: "11:00:00" })], IDAG)).toBe("11:00");
    expect(foreslagenStart([p({ datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "15:00:00" })], IDAG)).toBe("07:00");
  });
  it("fakturering följer aktivitetens default", () => {
    expect(debFor("planering")).toBe(true);
    expect(debFor("manuellt")).toBe(true);
    expect(debFor("restid")).toBe(false);
    expect(debFor("mote")).toBe(false);
  });
});
