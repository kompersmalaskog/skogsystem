import { describe, it, expect } from "vitest";
import { byggAvtalGrupper, avtalsperiod, avtalDatum, helglonLista, SAKNAS } from "./avtalVy";
import { GS_AVTAL_KOLUMNER, type GsAvtal } from "./gs-avtal";

// Raden som den ser ut i prod (2026-10-14).
const PROD: GsAvtal = {
  id: "f5b40c12", namn: "Skogsavtalet 2025-2027", giltigt_fran: "2025-04-01", giltigt_till: "2027-03-31",
  ordinarie_vecka_h: 40, overtid_vardag_pct: 50, overtid_helg_pct: 100, overtid_faktor: 1.5, max_overtid_ar_h: 250,
  overtid_vardag_kr: 54.94, overtid_helg_kr: 54.94, ob_kvall_kr: 43.77, ob_natt_kr: 56.82, ob_helg_kr: 68.95, ob_sondag_kr: 103.38,
  skift_tillagg_kr: 8, bortovaro_12h_kr: 8.03, km_grans_per_dag: 60, km_fri_pendling: 60, km_ersattning_kr: 2.75,
  fardmedel_kr_per_mil: 27.5, fardtid_kr_per_mil: 10.49, traktamente_hel_kr: 300, traktamente_halv_kr: 150,
  atk_procent: 3.62, atk_procent_nasta: 3.92, atk_ledig_tid_h: 65.2, pension_tillagg_pct: 20, sjuklon_pct: 80,
  semester_dagar_ar: 25, semester_ersattning_pct: 13,
  helglon_dagar: "Nyårsdagen,Trettondagen,Långfredagen,Annandag påsk,1 maj,Kristi himmelsfärd,Nationaldagen,Midsommarafton,Julafton,Juldagen,Annandag jul,Nyårsafton",
  dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14,
};

const platt = (a: GsAvtal | null | undefined) => Object.fromEntries(byggAvtalGrupper(a).flatMap(g => g.rader.map(([l, v]) => [`${g.rubrik}/${l}`, v])));
const allaVarden = (a: GsAvtal | null | undefined) => Object.values(platt(a));

describe("Mitt avtal — värdena ur raden", () => {
  it("prod-raden ger exakt de värden som står i avtalet, från riktiga kolumner", () => {
    expect(platt(PROD)).toEqual({
      "Avtalsperiod/Avtal": "Skogsavtalet 2025-2027",
      "Avtalsperiod/Gäller": "1 apr 2025 – 31 mar 2027",
      "Övertid/Max övertid": "250 tim/år",
      "Färdmedel & färdtid/Km-gräns": "60 km/dag",
      "ATK/Avsättning": "3,62%",
      "ATK/Nästa period": "3,92%",
      "ATK/Ledig tid": "65,2 tim/år",
      "ATK/Pension-tillägg": "+20%",
      "Sjuklön/Ersättning efter karens": "80% av lön",
      "Semester/Semesterdagar": "25 dagar/år",
      "Semester/Ersättning tidsbegränsad": "13%",
      "Helglön (timavlönade)/Dagar": "Nyårsdagen, Trettondagen, Långfredagen, Annandag påsk, 1 maj, Kristi himmelsfärd, Nationaldagen, Midsommarafton, Julafton, Juldagen, Annandag jul, Nyårsafton",
      "Övriga tillägg/Skifttillägg": "8 kr/tim",
      "Övriga tillägg/Bortovaro >12h": "8,03 kr/tim",
    });
  });

  it("ett annat avtal följer med: inget av de gamla reservvärdena (65,2 · 8 · 8,03 · 3,62 · 250 · 1 apr 2025) lever kvar", () => {
    const annat: GsAvtal = { ...PROD, namn: "Skogsavtalet 2027-2029", giltigt_fran: "2027-04-01", giltigt_till: null, max_overtid_ar_h: 200,
      km_grans_per_dag: 70, atk_procent: 4.1, atk_procent_nasta: 4.4, atk_ledig_tid_h: 70.5, pension_tillagg_pct: 21, sjuklon_pct: 75,
      semester_dagar_ar: 30, semester_ersattning_pct: 12, skift_tillagg_kr: 9.5, bortovaro_12h_kr: 9, helglon_dagar: "Nyårsdagen,1 maj" };
    expect(platt(annat)).toMatchObject({
      "Avtalsperiod/Avtal": "Skogsavtalet 2027-2029",
      "Avtalsperiod/Gäller": "Från 1 apr 2027, löpande",
      "Övertid/Max övertid": "200 tim/år", "Färdmedel & färdtid/Km-gräns": "70 km/dag",
      "ATK/Avsättning": "4,1%", "ATK/Nästa period": "4,4%", "ATK/Ledig tid": "70,5 tim/år", "ATK/Pension-tillägg": "+21%",
      "Sjuklön/Ersättning efter karens": "75% av lön", "Semester/Semesterdagar": "30 dagar/år", "Semester/Ersättning tidsbegränsad": "12%",
      "Helglön (timavlönade)/Dagar": "Nyårsdagen, 1 maj", "Övriga tillägg/Skifttillägg": "9,5 kr/tim", "Övriga tillägg/Bortovaro >12h": "9 kr/tim",
    });
    const text = allaVarden(annat).join(" | ");
    for (const gammalt of ["65,2", "8,03", "3,62", "250", "2025", "25 dagar", "+20%", "80%"]) expect(text).not.toContain(gammalt);
  });

  it("raden kunde inte läsas (null): ALLA värden är –, inget namn och ingen period påhittas", () => {
    for (const a of [null, undefined]) {
      expect(allaVarden(a)).toEqual(Array(14).fill(SAKNAS));
    }
  });

  it("varje fält för sig: null i en kolumn ger – på just den raden (aldrig en reserv, aldrig 'null' eller 'NaN')", () => {
    const rad: [keyof GsAvtal, string][] = [
      ["namn", "Avtalsperiod/Avtal"], ["giltigt_fran", "Avtalsperiod/Gäller"], ["max_overtid_ar_h", "Övertid/Max övertid"],
      ["km_grans_per_dag", "Färdmedel & färdtid/Km-gräns"], ["atk_procent", "ATK/Avsättning"], ["atk_procent_nasta", "ATK/Nästa period"],
      ["atk_ledig_tid_h", "ATK/Ledig tid"], ["pension_tillagg_pct", "ATK/Pension-tillägg"], ["sjuklon_pct", "Sjuklön/Ersättning efter karens"],
      ["semester_dagar_ar", "Semester/Semesterdagar"], ["semester_ersattning_pct", "Semester/Ersättning tidsbegränsad"],
      ["helglon_dagar", "Helglön (timavlönade)/Dagar"], ["skift_tillagg_kr", "Övriga tillägg/Skifttillägg"], ["bortovaro_12h_kr", "Övriga tillägg/Bortovaro >12h"],
    ];
    for (const [kolumn, nyckel] of rad) {
      const v = platt({ ...PROD, [kolumn]: null });
      expect(v[nyckel], String(kolumn)).toBe(SAKNAS);
      // övriga rader rörs inte
      const ovriga = platt(PROD);
      for (const k of Object.keys(ovriga)) if (k !== nyckel) expect(v[k], `${String(kolumn)} → ${k}`).toBe(ovriga[k]);
    }
    for (const v of allaVarden({ ...PROD, atk_procent: NaN as any, max_overtid_ar_h: "x" as any })) expect(v).not.toMatch(/NaN|null|undefined/);
  });

  it("kolumner som INTE finns ger aldrig ett värde: de gamla felnamnen läses inte (atk_ledig_tim, skifttillagg_kr, bortovaro_kr, atk_period)", () => {
    const fel = { ...PROD, atk_ledig_tid_h: null, skift_tillagg_kr: null, bortovaro_12h_kr: null, atk_ledig_tim: 99, skifttillagg_kr: 99, bortovaro_kr: 99, atk_period: "2099-2100", timlon_kr: 99 } as any;
    const v = platt(fel);
    expect(v["ATK/Ledig tid"]).toBe(SAKNAS);
    expect(v["Övriga tillägg/Skifttillägg"]).toBe(SAKNAS);
    expect(v["Övriga tillägg/Bortovaro >12h"]).toBe(SAKNAS);
    expect(Object.values(v).join(" ")).not.toMatch(/99|2099/);
  });

  it("kr-satser (övertid, OB, färdmedel, färdtid, traktamente) visas inte i vyn — satserna ägs av lönesystemet", () => {
    const text = allaVarden(PROD).join(" | ");
    for (const sats of ["54,94", "43,77", "56,82", "68,95", "103,38", "27,5", "10,49", "300", "150", "2,75"]) expect(text).not.toContain(sats);
  });

  it("rubrikerna är oförändrade och i samma ordning (layouten rörs inte)", () => {
    expect(byggAvtalGrupper(PROD).map(g => g.rubrik)).toEqual(["Avtalsperiod", "Övertid", "Färdmedel & färdtid", "ATK", "Sjuklön", "Semester", "Helglön (timavlönade)", "Övriga tillägg"]);
  });
});

describe("avtalsperiod och datum", () => {
  it("från giltigt_fran/giltigt_till, med månad i förkortning och utan nollor", () => {
    expect(avtalsperiod("2025-04-01", "2027-03-31")).toBe("1 apr 2025 – 31 mar 2027");
    expect(avtalsperiod("2026-12-09", "2028-01-02")).toBe("9 dec 2026 – 2 jan 2028");
  });
  it("utan slutdatum: löpande. Utan startdatum eller med skräp: –", () => {
    expect(avtalsperiod("2025-04-01", null)).toBe("Från 1 apr 2025, löpande");
    expect(avtalsperiod("2025-04-01", undefined)).toBe("Från 1 apr 2025, löpande");
    expect(avtalsperiod(null, "2027-03-31")).toBe(SAKNAS);
    expect(avtalsperiod("", "")).toBe(SAKNAS);
    expect(avtalsperiod("inte-ett-datum", "2027-03-31")).toBe(SAKNAS);
  });
  it("ett ogiltigt slutdatum behandlas som saknat, inte som 'NaN'", () => {
    expect(avtalsperiod("2025-04-01", "2027-13-45")).toBe("Från 1 apr 2025, löpande");
    expect(avtalDatum("2025-00-10")).toBeNull();
  });
  it("tidsstämpel med klockslag funkar (de tio första tecknen gäller)", () => {
    expect(avtalDatum("2025-04-01T00:00:00+00:00")).toBe("1 apr 2025");
  });
});

describe("helglonLista", () => {
  it("kommaseparerat → ', '; tomt, null och bara komman → –", () => {
    expect(helglonLista("A,B , C")).toBe("A, B, C");
    expect(helglonLista("")).toBe(SAKNAS);
    expect(helglonLista(null)).toBe(SAKNAS);
    expect(helglonLista(" , ,")).toBe(SAKNAS);
  });
});

describe("GS_AVTAL_KOLUMNER", () => {
  it("varje kolumn vyn läser finns i listan över prod-kolumner", () => {
    for (const k of ["namn", "giltigt_fran", "giltigt_till", "max_overtid_ar_h", "km_grans_per_dag", "atk_procent", "atk_procent_nasta", "atk_ledig_tid_h", "pension_tillagg_pct", "sjuklon_pct", "semester_dagar_ar", "semester_ersattning_pct", "helglon_dagar", "skift_tillagg_kr", "bortovaro_12h_kr"]) {
      expect((GS_AVTAL_KOLUMNER as readonly string[]).includes(k), k).toBe(true);
    }
  });
  it("och de felnamn som funnits finns inte", () => {
    for (const k of ["timlon_kr", "ob_lordag_kr", "fardtid_kr", "atk_period", "atk_ledig_tim", "atk_faktor", "skifttillagg_kr", "bortovaro_kr"]) {
      expect((GS_AVTAL_KOLUMNER as readonly string[]).includes(k), k).toBe(false);
    }
  });
});
