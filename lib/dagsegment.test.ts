import { describe, it, expect } from "vitest";
import { klassificeraPeriod, passKrockarMedPerioder, passKrockText, perioderPerObjekt, perioddagSpann } from "./dagsegment";
import { medPerioddagSpann } from "./vilobrott";

describe("perioderPerObjekt — det man skriver under på en perioddag", () => {
  const dag = [
    { start_tid: "07:00:00", slut_tid: "10:00:00", objekt_id: "A", aktivitet_typ: "planering", minuter: 180 },
    { start_tid: "10:00:00", slut_tid: "11:00:00", objekt_id: null, aktivitet_typ: "restid", minuter: 60 },
    { start_tid: "11:00:00", slut_tid: "13:00:00", objekt_id: "B", aktivitet_typ: "manuellt", minuter: 120 },
    { start_tid: "14:00:00", slut_tid: "15:00:00", objekt_id: "A", aktivitet_typ: "planering", minuter: 60 },
  ];
  it("summerar per objekt och aktivitet i dagens ordning", () => {
    expect(perioderPerObjekt(dag)).toEqual([
      { objektId: "A", aktivitetTyp: "planering", minuter: 240, forstaStart: "07:00" },
      { objektId: null, aktivitetTyp: "restid", minuter: 60, forstaStart: "10:00" },
      { objektId: "B", aktivitetTyp: "manuellt", minuter: 120, forstaStart: "11:00" },
    ]);
  });
  it("segment utan minuter räknas ur klockslagen; öppna perioder hoppas över", () => {
    expect(perioderPerObjekt([
      { start_tid: "08:00", slut_tid: "09:30", objekt_id: "A", aktivitet_typ: "markagare" },
      { start_tid: "12:00", slut_tid: null, objekt_id: "A", aktivitet_typ: "markagare" },
    ])).toEqual([{ objektId: "A", aktivitetTyp: "markagare", minuter: 90, forstaStart: "08:00" }]);
  });
});

describe("perioddagSpann + medPerioddagSpann — perioddagen i vilotiden", () => {
  it("spannet är första start → SISTA slut; glappet 12–15 är inte vila", () => {
    expect(perioddagSpann([
      { start_tid: "15:00:00", slut_tid: "18:00:00" },
      { start_tid: "07:00:00", slut_tid: "12:00:00" },
    ])).toEqual({ start_tid: "07:00:00", slut_tid: "18:00:00" });
    expect(perioddagSpann([{ start_tid: "07:00:00", slut_tid: null }])).toBeNull();
  });
  it("en rad utan klockslag får spannet; en maskindag rörs inte; perioder utan rad blir egen dag", () => {
    const dagar = [
      { datum: "2026-09-21", start_tid: null, slut_tid: null },
      { datum: "2026-09-22", start_tid: "06:00:00", slut_tid: "15:00:00" },
    ];
    const perioder = [
      { datum: "2026-09-21", start_tid: "07:00:00", slut_tid: "19:00:00" },
      { datum: "2026-09-22", start_tid: "16:00:00", slut_tid: "20:00:00" }, // kvällsperiod på maskindag — passet är passet
      { datum: "2026-09-23", start_tid: "08:00:00", slut_tid: "17:00:00" }, // ingen rad alls
    ];
    const ut = medPerioddagSpann(dagar, perioder);
    expect(ut).toEqual([
      { datum: "2026-09-21", start_tid: "07:00:00", slut_tid: "19:00:00" },
      { datum: "2026-09-22", start_tid: "06:00:00", slut_tid: "15:00:00" },
      { datum: "2026-09-23", start_tid: "08:00:00", slut_tid: "17:00:00" },
    ]);
  });
  it("tolv timmar om dagen sju dagar i rad upptäcks nu — veckovila saknas", async () => {
    const { analyseraVilobrott } = await import("./vilobrott");
    const perioder = Array.from({ length: 8 }, (_, i) => ({ datum: `2026-09-${String(14 + i).padStart(2, "0")}`, start_tid: "06:00:00", slut_tid: "18:00:00" }));
    const trosklar = { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };
    expect(analyseraVilobrott([], trosklar)).toEqual([]);
    const brott = analyseraVilobrott(medPerioddagSpann([], perioder), trosklar);
    expect(brott.some(b => b.typ === "veckovila")).toBe(true);
  });
});

// Perioddagen (Joacim): inget pass → varje period är extra_tid, och passet får
// aldrig i efterhand läggas över dem (dubbelräkning arbetad_min + extra_tid).

describe("klassificeraPeriod utan pass", () => {
  it("klassar en period på en dag utan klockslag som ingen_pass (→ extra_tid)", () => {
    expect(klassificeraPeriod({ start: "07:00", slut: "12:00" }, { start_tid: null, slut_tid: null })).toBe("ingen_pass");
  });
});

describe("passKrockarMedPerioder", () => {
  const perioder = [
    { start_tid: "07:00:00", slut_tid: "12:00:00" },
    { start_tid: "13:00:00", slut_tid: "16:00:00" },
  ];

  it("tomt klockslag = inget pass = ingen krock", () => {
    expect(passKrockarMedPerioder({ start: "", slut: "" }, perioder)).toBeNull();
    expect(passKrockarMedPerioder({ start: null, slut: "16:00" }, perioder)).toBeNull();
  });

  it("pass som täcker en period krockar — första i listan rapporteras", () => {
    expect(passKrockarMedPerioder({ start: "06:00", slut: "17:00" }, perioder)).toEqual({ start_tid: "07:00:00", slut_tid: "12:00:00" });
  });

  it("pass som delvis överlappar krockar", () => {
    expect(passKrockarMedPerioder({ start: "11:00", slut: "12:30" }, perioder)).toEqual({ start_tid: "07:00:00", slut_tid: "12:00:00" });
    expect(passKrockarMedPerioder({ start: "15:59", slut: "18:00" }, perioder)).toEqual({ start_tid: "13:00:00", slut_tid: "16:00:00" });
  });

  it("pass i luckan mellan perioder krockar inte (kant mot kant är tillåtet)", () => {
    expect(passKrockarMedPerioder({ start: "12:00", slut: "13:00" }, perioder)).toBeNull();
  });

  it("pass helt före eller efter krockar inte", () => {
    expect(passKrockarMedPerioder({ start: "05:00", slut: "07:00" }, perioder)).toBeNull();
    expect(passKrockarMedPerioder({ start: "16:00", slut: "19:00" }, perioder)).toBeNull();
  });

  it("öppna perioder (sluttid saknas) räknas inte", () => {
    expect(passKrockarMedPerioder({ start: "06:00", slut: "17:00" }, [{ start_tid: "07:00:00", slut_tid: null }])).toBeNull();
  });

  it("negativt eller nollpass krockar inte (fångas av passOrimlighet, inte här)", () => {
    expect(passKrockarMedPerioder({ start: "12:00", slut: "12:00" }, perioder)).toBeNull();
  });

  it("feltexten nämner klockslagen i HH:MM", () => {
    expect(passKrockText({ start_tid: "07:00:00", slut_tid: "12:00:00" })).toContain("07:00–12:00");
  });
});

import { harOppenPeriod } from "@/lib/dagsegment"
describe("harOppenPeriod — en dag med pågående period kan inte bekräftas", () => {
  const rader = [
    { datum: "2026-10-02", start_tid: "07:00:00", slut_tid: null },
    { datum: "2026-10-01", start_tid: "07:00:00", slut_tid: "10:00:00" },
  ]
  it("sant bara för dagen med start men utan slut", () => {
    expect(harOppenPeriod(rader, "2026-10-02")).toBe(true)
    expect(harOppenPeriod(rader, "2026-10-01")).toBe(false)
    expect(harOppenPeriod(rader, "2026-09-30")).toBe(false)
  })
  it("tål tomt och null", () => {
    expect(harOppenPeriod(null, "2026-10-02")).toBe(false)
    expect(harOppenPeriod([], "2026-10-02")).toBe(false)
  })
})
