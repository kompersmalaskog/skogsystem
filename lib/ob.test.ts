// Brandrisk-OB (lib/ob): enda OB appen räknar. Beordrad tidig start en vardagsmorgon → OB start–06:30, och av de timmarna de som ligger
// 00:00–05:00 som nattillägg (Skogsavtalet § 8 mom 1, bilaga 4; nattillägget "utöver ordinarie ob" enligt anmärkningen).
import { describe, it, expect } from "vitest";
import { obMinuter, nattillaggMinuter, brandriskSumma, minTillTimmar, type ObDag } from "./ob";

// 2026-08-12 är en onsdag, 2026-08-15 en lördag, 2026-08-16 en söndag.
const dag = (datum: string, start_tid: string | null, brandrisk_beordrad: boolean | null = true): ObDag => ({ datum, start_tid, brandrisk_beordrad });

describe("obMinuter: bara beordrad vardagsmorgon, start → 06:30", () => {
  it("Stefans tre morgnar (12–14 aug): 205 + 210 + 203 min", () => {
    expect(obMinuter(dag("2026-08-12", "03:05:00"))).toBe(205);
    expect(obMinuter(dag("2026-08-13", "03:00:00"))).toBe(210);
    expect(obMinuter(dag("2026-08-14", "03:07:00"))).toBe(203);
  });
  it("inget svar eller 'nej' (eget val) ger ingen OB oavsett klockslag", () => {
    expect(obMinuter(dag("2026-08-12", "03:05:00", null))).toBe(0);
    expect(obMinuter(dag("2026-08-12", "03:05:00", false))).toBe(0);
    expect(obMinuter(dag("2026-08-12", "05:45:00", false))).toBe(0);
  });
  it("lördag och söndag ger aldrig OB, även om svaret är ja (helg byggs inte)", () => {
    expect(obMinuter(dag("2026-08-15", "03:00:00"))).toBe(0);
    expect(obMinuter(dag("2026-08-16", "03:00:00"))).toBe(0);
  });
  it("start vid eller efter 06:30 ger 0 (aldrig negativt); saknad start ger 0", () => {
    expect(obMinuter(dag("2026-08-12", "06:30:00"))).toBe(0);
    expect(obMinuter(dag("2026-08-12", "07:15:00"))).toBe(0);
    expect(obMinuter(dag("2026-08-12", null))).toBe(0);
  });
});

describe("nattillaggMinuter: de beordrade minuterna som ligger 00:00–05:00, utöver OB", () => {
  it("Stefans tre morgnar: 03:05 → 115, 03:00 → 120, 03:07 → 113 min", () => {
    expect(nattillaggMinuter(dag("2026-08-12", "03:05:00"))).toBe(115);
    expect(nattillaggMinuter(dag("2026-08-13", "03:00:00"))).toBe(120);
    expect(nattillaggMinuter(dag("2026-08-14", "03:07:00"))).toBe(113);
  });
  it("start 04:30 → 30 min natt (och 120 min OB); start 05:00 och senare → ingen natt, men OB", () => {
    expect(nattillaggMinuter(dag("2026-08-12", "04:30:00"))).toBe(30);
    expect(obMinuter(dag("2026-08-12", "04:30:00"))).toBe(120);
    expect(nattillaggMinuter(dag("2026-08-12", "05:00:00"))).toBe(0);
    expect(nattillaggMinuter(dag("2026-08-12", "05:45:00"))).toBe(0);
    expect(obMinuter(dag("2026-08-12", "05:45:00"))).toBe(45);
  });
  it("samma villkor som OB: nej/obesvarad/helg/ingen start → 0, och nattillägget överstiger aldrig OB", () => {
    expect(nattillaggMinuter(dag("2026-08-12", "03:05:00", false))).toBe(0);
    expect(nattillaggMinuter(dag("2026-08-12", "03:05:00", null))).toBe(0);
    expect(nattillaggMinuter(dag("2026-08-15", "03:05:00"))).toBe(0);
    expect(nattillaggMinuter(dag("2026-08-12", null))).toBe(0);
    for (let m = 0; m < 24 * 60; m += 7) {
      const d = dag("2026-08-12", `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
      expect(nattillaggMinuter(d)).toBeLessThanOrEqual(obMinuter(d));
    }
  });
});

describe("brandriskSumma: månadens minuter och dagarna bakom dem", () => {
  const augusti = [
    dag("2026-08-03", "05:58:00", null),    // eget val: ingen OB
    dag("2026-08-04", "05:48:00", false),
    dag("2026-08-14", "03:07:00"),          // osorterat på avsikt
    dag("2026-08-12", "03:05:00"),
    dag("2026-08-13", "03:00:00"),
    dag("2026-08-15", "03:00:00"),          // lördag: aldrig
    dag("2026-08-31", "06:21:00", null),
  ];
  it("Stefan augusti: 618 min OB (10,30 tim) och 348 min nattillägg (5,80 tim), tre dagar i datumordning", () => {
    const s = brandriskSumma(augusti);
    expect(s.ob_min).toBe(618);
    expect(s.natt_min).toBe(348);
    expect(s.dagar.map(d => [d.datum, d.start_tid, d.ob_min, d.natt_min])).toEqual([
      ["2026-08-12", "03:05", 205, 115], ["2026-08-13", "03:00", 210, 120], ["2026-08-14", "03:07", 203, 113],
    ]);
  });
  it("en månad utan beordrade morgnar ger nollor och inga dagar", () => {
    expect(brandriskSumma([dag("2026-09-01", "06:04:00", null), dag("2026-09-02", "05:54:00", false)])).toEqual({ ob_min: 0, natt_min: 0, dagar: [] });
    expect(brandriskSumma([])).toEqual({ ob_min: 0, natt_min: 0, dagar: [] });
  });
});

describe("minTillTimmar: exakta timmar med två decimaler, avrundas först vid slutsumman", () => {
  it("618 min = 10.30, 348 min = 5.80 (inte 10.20: facit 10,2 var handavrundat)", () => {
    expect(minTillTimmar(618)).toBe("10.30");
    expect(minTillTimmar(348)).toBe("5.80");
  });
  it("enstaka dagar avrundas inte i förväg: 205 + 210 + 203 summerar till 10.30, men per dag blir det 3.42 + 3.50 + 3.38", () => {
    expect(minTillTimmar(205 + 210 + 203)).toBe("10.30");
    expect(minTillTimmar(205)).toBe("3.42");
    expect(minTillTimmar(203)).toBe("3.38");
    expect(minTillTimmar(1)).toBe("0.02");
    expect(minTillTimmar(0)).toBe("0.00");
  });
});
